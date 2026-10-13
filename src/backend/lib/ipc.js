/*
 * 所有 ipcMain.handle 的注册集中在这里。
 * 这一层只做「参数校验 + 串起各模块」，不自己实现文件操作细节。
 */
const fs = require('fs')
const path = require('path')
const { ipcMain, dialog, shell, app, BrowserWindow } = require('electron')

const { DIALOG_EXTS } = require('./constants')
const { writeConfig, imagesRoot } = require('./config')
const { readDB, writeDB } = require('./db')
const {
  oriDir,
  folderPath,
  thumbFolderPath,
  thumbPathFor,
  moveFile,
  moveTree,
} = require('./folders/img-folders')
const {
  normalizeFolderName,
  validateFolderName,
  readFolders,
  findFolder,
} = require('./folders/folders')
const { importImageFile } = require('./image-config/images')
const { readManifest, importFromManifest } = require('./downloads/downloader')
const {
  configView,
  startWatcher,
  stopWatcher,
  scanWatchDir,
  scheduleSourceRetry,
} = require('./downloads/watcher')
const { writeManifest, buildZip2 } = require('./image-config/zip')
const { notifyImagesUpdated, notifyDownloadProgress } = require('./events')

// 弹原生对话框（打开 / 保存 / 消息框）时优先挂在当前聚焦的窗口上。
// 原来是 lib/utils.js：全项目只有这一层用得到，就近内联了。
// （lib 里的模块不能反过来 require main.js —— 循环 require 会拿到还没赋值完的 exports）
const focusedWindow = () =>
  BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null

const registerIpc = () => {
  /* ------------------------------- 图库读写 ------------------------------- */

  // 获取图片列表
  ipcMain.handle('get-image-list', () => readDB())

  // 添加图片（手动选择文件）
  ipcMain.handle('add-images', async () => {
    const win = focusedWindow()
    const options = {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: DIALOG_EXTS }],
    }
    const { filePaths } = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    if (!filePaths || filePaths.length === 0) return []

    const db = readDB()
    const added = []

    for (const srcPath of filePaths) {
      try {
        const item = await importImageFile(srcPath)
        db.push(item)
        added.push(item)
      } catch (err) {
        console.error('[add] 导入失败:', srcPath, err.message)
      }
    }

    writeDB(db)
    added.forEach(scheduleSourceRetry)
    return added
  })

  // 下载图片
  ipcMain.handle('import-manifest', async () => {
    const win = focusedWindow()
    const options = {
      title: '选择图片库索引.json',
      properties: ['openFile'],
      filters: [{ name: '图片库索引', extensions: ['json'] }],
    }
    const { canceled, filePaths } = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    if (canceled || !filePaths.length) return { ok: false, canceled: true }

    const manifestPath = filePaths[0]

    let manifest
    try {
      manifest = await readManifest(manifestPath)
    } catch (err) {
      return { ok: false, error: err.message }
    }

    const showBox = (box) =>
      win ? dialog.showMessageBox(win, box) : dialog.showMessageBox(box)

    if (!manifest.images.length) {
      await showBox({
        type: 'info',
        title: '下载图片',
        message: '这份索引里没有可以下载的图片',
        detail: manifest.skipped.length
          ? `里面的 ${manifest.skipped.length} 条记录都没有来源链接，无法重新下载。`
          : '索引的 images 是空的。',
        buttons: ['知道了'],
        noLink: true,
      })
      return { ok: false, canceled: true }
    }

    const exported = manifest.exportedAt ? new Date(manifest.exportedAt) : null
    const exportedNote =
      exported && !Number.isNaN(exported.getTime())
        ? `来源文件：${path.basename(manifestPath)}（导出于 ${exported.toLocaleString('zh-CN', { hour12: false })}）`
        : `来源文件：${path.basename(manifestPath)}`

    const { response } = await showBox({
      type: 'question',
      title: '下载图片',
      message: `即将重新下载 ${manifest.images.length} 张图片`,
      detail: [
        exportedNote,
        manifest.skipped.length
          ? `另有 ${manifest.skipped.length} 张没有来源链接，会被跳过。`
          : '',
        '下载耗时取决于网络，过程中按钮上会显示进度。',
      ]
        .filter(Boolean)
        .join('\n'),
      buttons: ['开始下载', '取消'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    })
    if (response !== 0) return { ok: false, canceled: true }

    try {
      const res = await importFromManifest(manifestPath, notifyDownloadProgress)
      notifyImagesUpdated({ type: 'manifest-import', count: res.imported })
      return { ok: true, ...res }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  // 打开图片：优先打开原图（全画质）
  ipcMain.handle('open-image', async (event, target = {}) => {
    if (fs.existsSync(target.src)) {
      const err = await shell.openPath(target.src)
      return err || ''
    }
    return '文件已不存在'
  })

  // 更新图片标签（整表替换）
  ipcMain.handle('update-image-tags', (event, payload = {}) => {
    const { id, tags } = payload
    const db = readDB()
    const item = db.find((entry) => entry.id === id)
    if (!item) return { ok: false, error: '图片不存在' }

    item.tags = Array.isArray(tags) ? tags.map((tag) => String(tag).trim()).filter(Boolean) : []
    delete item.tag // 迁移到多标签后不再使用单标签字段
    writeDB(db)
    return { ok: true, tags: item.tags }
  })

  // 删除图片：只删图库里的两份副本（Ori 大图 + Thumb 缩略图）+ db.json 里那条记录，
  // 下载目录里的原文件（sourcePath）保持不动
  ipcMain.handle('delete-image', (event, id) => {
    const db = readDB()
    const index = db.findIndex((entry) => entry.id === id)
    if (index === -1) return { ok: false, error: '图片不存在' }

    const [item] = db.splice(index, 1) // 副本可能在 Ori 根，也可能在某个文件夹里
    const thumbPath = thumbPathFor(item)

    if (item.src && fs.existsSync(item.src)) {
      try {
        fs.unlinkSync(item.src)
      } catch (err) {
        // 文件删不掉（被占用等）就把记录放回去，避免出现「记录没了、文件还占着盘」
        db.splice(index, 0, item)
        return { ok: false, error: '删除文件失败：' + err.message }
      }
    }

    // 缩略图删不掉不算失败——它随时可以重建
    try {
      if (thumbPath && fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath)
    } catch (err) {
      console.error('[delete] 缩略图删除失败（不影响使用）:', err.message)
    }

    writeDB(db)
    console.log('[delete] 已移除:', item.src)
    return { ok: true, name: item.name || '' }
  })

  /* -------------------------------- 文件夹 -------------------------------- */

  ipcMain.handle('get-folders', () => readFolders())

  // 新建文件夹 → Ori 与 Thumb 下各建一个同名目录
  ipcMain.handle('create-folder', (event, name) => {
    const checked = validateFolderName(name)
    if (checked.error) return { ok: false, error: checked.error }
    if (findFolder(checked.folder)) return { ok: false, error: '同名文件夹已存在' }

    try {
      fs.mkdirSync(folderPath(checked.folder), { recursive: true })
      fs.mkdirSync(thumbFolderPath(checked.folder), { recursive: true })
    } catch (err) {
      return { ok: false, error: '创建目录失败：' + err.message }
    }
    return { ok: true, folders: readFolders() }
  })

  // 重命名文件夹 → 两边目录一起改名，并同步图片记录里的路径与归类
  ipcMain.handle('rename-folder', async (event, payload = {}) => {
    const from = findFolder(payload.from)
    if (!from) return { ok: false, error: '文件夹不存在' }

    const checked = validateFolderName(payload.to)
    if (checked.error) return { ok: false, error: checked.error }
    const to = checked.folder
    if (to === from) return { ok: true, folders: readFolders(), changed: 0 }
    if (findFolder(to)) return { ok: false, error: '同名文件夹已存在' }

    try {
      fs.renameSync(folderPath(from), folderPath(to))
    } catch (err) {
      return { ok: false, error: '重命名目录失败：' + err.message }
    }
    // 缩略图目录是可再生的，改名失败不影响正确性（缺失时会按需重建）
    try {
      fs.renameSync(thumbFolderPath(from), thumbFolderPath(to))
    } catch (err) {
      console.error('[folder] 缩略图目录改名失败（不影响使用）:', err.message)
    }

    const db = readDB()
    let changed = 0
    for (const item of db) {
      if (item.folder !== from) continue
      item.folder = to
      if (item.src) item.src = path.join(folderPath(to), path.basename(item.src)) // 文件跟着目录走
      changed++
    }
    if (changed) writeDB(db)
    return { ok: true, folders: readFolders(), changed }
  })

  // 删除文件夹 → 里面的图片搬回 Ori 根（= 未分类），不删文件；Thumb 侧直接丢掉重建
  ipcMain.handle('delete-folder', (event, name) => {
    const folder = findFolder(name)
    if (!folder) return { ok: false, error: '文件夹不存在' }

    const dir = folderPath(folder)
    const entries = fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : []
    if (entries.some((entry) => entry.isDirectory())) {
      return { ok: false, error: '文件夹里还有子目录，请先手动清理' }
    }

    const db = readDB()
    const root = oriDir()
    let changed = 0
    for (const item of db) {
      if (item.folder !== folder) continue
      if (item.src && fs.existsSync(item.src)) {
        try {
          item.src = moveFile(item.src, path.join(root, path.basename(item.src)))
        } catch (err) {
          console.error('[folder] 移出文件失败:', item.src, err.message)
        }
      }
      item.folder = ''
      changed++
    }
    if (changed) writeDB(db)

    // 目录里可能还有不属于图库的文件，一并搬回 Ori 根后再删空目录
    for (const entry of entries) {
      if (!entry.isFile()) continue
      const src = path.join(dir, entry.name)
      if (!fs.existsSync(src)) continue // 已被上面的图库记录搬走了
      try {
        moveFile(src, path.join(root, entry.name))
      } catch (err) {
        console.error('[folder] 移出文件失败:', entry.name, err.message)
      }
    }

    // 缩略图是派生产物，整目录删掉即可，下次显示会按需重建
    try {
      fs.rmSync(thumbFolderPath(folder), { recursive: true, force: true })
    } catch (err) {
      console.error('[folder] 清理缩略图目录失败（不影响使用）:', err.message)
    }

    try {
      fs.rmdirSync(dir)
    } catch (err) {
      return {
        ok: false,
        error: '目录非空，未能删除：' + err.message,
        folders: readFolders(),
        changed,
      }
    }
    return { ok: true, folders: readFolders(), changed }
  })

  // 把图片归入文件夹 → 大图和缩略图都真的搬进 / 搬出子目录
  ipcMain.handle('set-image-folder', (event, payload = {}) => {
    const db = readDB()
    const item = db.find((entry) => entry.id === payload.id)
    if (!item) return { ok: false, error: '图片不存在' }

    const wanted = normalizeFolderName(payload.folder)
    const folder = wanted ? findFolder(wanted) : ''
    if (wanted && !folder) return { ok: false, error: '文件夹不存在' }

    const oldThumb = thumbPathFor(item)
    const dir = folderPath(folder)
    if (item.src && fs.existsSync(item.src)) {
      const dest = path.join(dir, path.basename(item.src))
      if (path.resolve(dest) !== path.resolve(item.src)) {
        try {
          fs.mkdirSync(dir, { recursive: true })
          item.src = moveFile(item.src, dest)
        } catch (err) {
          return { ok: false, error: '移动文件失败：' + err.message }
        }
      }
    }

    item.folder = folder
    writeDB(db)

    // 缩略图跟着搬（同盘只是改名）；搬不动就算了，缺失时会按需重建
    const newThumb = thumbPathFor(item)
    if (oldThumb !== newThumb && fs.existsSync(oldThumb)) {
      try {
        fs.mkdirSync(path.dirname(newThumb), { recursive: true })
        fs.renameSync(oldThumb, newThumb)
      } catch (err) {
        console.error('[thumb] 搬移缩略图失败（会按需重建）:', err.message)
      }
    }

    return { ok: true, folder, src: item.src }
  })

  /* ------------------------------ 系统集成 ------------------------------- */

  // 打开目录
  ipcMain.handle('open-path', (event, target) => {
    return shell.openPath(target)
  })

  // 打开图片来源链接
  ipcMain.handle('open-external', (event, target) => {
    return shell.openExternal(target)
  })

  // 通用确认框：window.confirm 的标题取自页面标题，改不了；走原生对话框才能自己定标题与按钮文字
  ipcMain.handle('confirm', async (event, options = {}) => {
    const win = focusedWindow()
    const box = {
      type: options.type || 'question',
      title: options.title || '图片库',
      message: options.message || '',
      detail: options.detail || '',
      buttons: [options.confirmText || '确定', options.cancelText || '取消'],
      defaultId: 0,
      cancelId: 1,
      noLink: true, // Windows 上强制用普通按钮，不要命令链接样式
    }
    const { response } = win
      ? await dialog.showMessageBox(win, box)
      : await dialog.showMessageBox(box)
    return response === 0
  })

  /* ---------------------------- 保存目录（根目录） ---------------------------- */

  ipcMain.handle('get-image-root', () => imagesRoot())

  // 更改保存目录：选目录 → 把旧根目录下的一切搬过去 → 改写 db 里的 src
  ipcMain.handle('change-image-root', async () => {
    const currentRoot = imagesRoot()
    const win = focusedWindow()
    const options = {
      title: '选择新的保存目录（图库根目录）',
      defaultPath: path.dirname(currentRoot),
      properties: ['openDirectory', 'createDirectory'],
    }
    const { canceled, filePaths } = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    if (canceled || !filePaths.length) return { ok: false, canceled: true, imagesDir: currentRoot }

    const nextRoot = filePaths[0]
    const withSep = (dir) => path.resolve(dir) + path.sep

    if (path.resolve(nextRoot) === path.resolve(currentRoot)) {
      return { ok: false, error: '新目录与当前保存目录相同', imagesDir: currentRoot }
    }
    // 互相包含会导致「把目录搬进自己」，直接拒绝
    if (
      withSep(nextRoot).startsWith(withSep(currentRoot)) ||
      withSep(currentRoot).startsWith(withSep(nextRoot))
    ) {
      return { ok: false, error: '新旧目录不能互相包含', imagesDir: currentRoot }
    }

    try {
      fs.mkdirSync(nextRoot, { recursive: true })
      const moved = moveTree(currentRoot, nextRoot)

      // 只把「确实搬过去了」的记录指向新路径，没搬成功的保留旧路径，避免出现打不开的图
      const db = readDB()
      let changed = 0
      for (const item of db) {
        if (!item.src) continue
        const rel = path.relative(currentRoot, item.src)
        if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) continue
        const next = path.join(nextRoot, rel)
        if (fs.existsSync(next)) {
          item.src = next
          changed++
        }
      }
      if (changed) writeDB(db)

      try {
        if (fs.existsSync(currentRoot) && !fs.readdirSync(currentRoot).length) fs.rmdirSync(currentRoot)
      } catch {
        /* 旧目录还有残留就留着 */
      }

      writeConfig({ imagesDir: nextRoot })
      return { ok: true, imagesDir: nextRoot, moved, changed }
    } catch (err) {
      return { ok: false, error: '更改保存目录失败：' + err.message, imagesDir: currentRoot }
    }
  })

  /* ------------------------------- 打包 ZIP ------------------------------- */

  // 把根目录整个打包成 ZIP（过程中会在根目录临时放一个索引 json）
  ipcMain.handle('export-zip', async () => {
    const root = imagesRoot()
    if (!fs.existsSync(root)) return { ok: false, error: '保存目录不存在：' + root }

    const pad = (n) => String(n).padStart(2, '0')
    const now = new Date()
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`

    const win = focusedWindow()
    const options = {
      title: '打包图片',
      defaultPath: path.join(app.getPath('downloads'), `图片库-${stamp}.zip`),
      filters: [{ name: 'ZIP 压缩包', extensions: ['zip'] }],
    }
    const { canceled, filePath } = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options)
    if (canceled || !filePath) return { ok: false, canceled: true }

    // 压缩包存进根目录的话，下次打包会把它自己也打进去，越滚越大
    if ((path.resolve(filePath) + path.sep).startsWith(path.resolve(root) + path.sep)) {
      return { ok: false, error: '请不要把压缩包保存在图库根目录里，换个位置吧' }
    }

    let manifestPath = ''
    try {
      manifestPath = writeManifest(root) // 1. 根目录先新增索引 json（下面整目录打包时会一起收进去）
      const size = await buildZip2(root, filePath)
      shell.showItemInFolder(filePath)

      return {
        ok: true,
        path: filePath,
        size,
        manifest: path.basename(manifestPath),
      }
    } catch (err) {
      return { ok: false, error: '打包失败：' + err.message }
    } finally {
      // 3. 不管成没成，都只删自己刚写的那个临时索引
      if (manifestPath) {
        try {
          if (fs.existsSync(manifestPath)) fs.unlinkSync(manifestPath)
        } catch (err) {
          console.error('[zip] 临时索引删除失败:', manifestPath, err.message)
        }
      }
    }
  })

  /* ----------------------------- 自动导入设置 ----------------------------- */

  // 读取配置 + 监听状态
  ipcMain.handle('get-config', () => configView())

  // 选择要监听的目录
  ipcMain.handle('choose-watch-dir', async () => {
    const win = focusedWindow()
    const options = {
      title: '选择要自动导入图片的目录',
      properties: ['openDirectory', 'createDirectory'],
    }
    const { canceled, filePaths } = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    if (canceled || filePaths.length === 0) return configView()

    const cfg = writeConfig({ watchDir: filePaths[0] })
    if (cfg.watchEnabled) startWatcher(cfg.watchDir)
    return configView()
  })

  // 开启 / 关闭自动导入
  ipcMain.handle('set-watch-enabled', (event, enabled) => {
    const cfg = writeConfig({ watchEnabled: !!enabled })
    if (cfg.watchEnabled) startWatcher(cfg.watchDir)
    else stopWatcher()
    return configView()
  })

  // 立即扫描目录中已有的图片
  ipcMain.handle('rescan-watch-dir', () => scanWatchDir())
}

module.exports = { registerIpc }
