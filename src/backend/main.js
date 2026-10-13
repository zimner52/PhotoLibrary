/*
 * Electron 主进程入口：生命周期 + 组装 + 启动回填。
 *
 * backend/lib/ 的分工（依赖单向、无环，箭头指向被依赖者）：
 *
 *   constants.js ────────────── 常量与图片参数（依赖图的根，不 require 任何本项目模块）
 *   events.js ──────────────── 主进程 → 渲染进程的三条推送
 *   config.js ──→ constants    config.json 读写
 *   db.js ──────→ constants    db.json 整表读写 + 协议用的 id 索引
 *   folders/img-folders.js ──→ constants, config        Ori/Thumb 目录计算与文件搬移
 *   folders/folders.js ──────→ config, img-folders      用户文件夹：校验、清单、查找
 *   folders/migrate.js ──────→ constants, db, img-folders  旧布局迁移
 *   downloads/source.js ─────  读 Zone.Identifier（**叶子**：只 require 内置模块）
 *   image-config/images.js ──→ constants, img-folders, source   导入管线：大图 + 缩略图
 *   image-config/zip.js ─────→ db, img-folders          打包 ZIP + 临时索引
 *   downloads/downloader.js ─→ db, images               按索引批量重新下载
 *   downloads/watcher.js ────→ constants, config, db, images, source, events
 *                                                       下载目录监听、手动扫描、延迟补抓
 *   protocol.js ─────────────→ constants, db, img-folders, images   gallery:// 协议
 *   ipc.js ──────────────────→ 上面全部（唯一把各模块串起来的一层）
 *
 * 注意两点（都踩过）：
 *   · 本文件是入口，lib 里的模块**不能**反过来 require 它：CommonJS 的循环 require
 *     会拿到尚未赋值完的 exports，而且入口的模块级副作用会被重复执行。
 *   · downloads/source.js 必须保持叶子身份，否则 images.js ←→ downloads 会成环。
 */
const fs = require('fs')
const path = require('path')
const { app, BrowserWindow } = require('electron')

const { readDB, writeDB } = require('./lib/db')
const { readConfig } = require('./lib/config')
const { ensureImagesRoot } = require('./lib/folders/img-folders')
const { migrateLayout } = require('./lib/folders/migrate')
const { registerGalleryScheme, registerGalleryProtocol } = require('./lib/protocol')
const { registerIpc } = require('./lib/ipc')
const { startWatcher, stopWatcher } = require('./lib/downloads/watcher')
const { readSourceInfo } = require('./lib/downloads/source')
const { notifyImageSourceUpdated } = require('./lib/events')

const isDev = !app.isPackaged // 是否开发模式

registerGalleryScheme()

/* --------------------------------- 窗口 --------------------------------- */

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1000,
    height: 1000,
    icon: path.join(__dirname, '../../assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    // 相对深度没变（backend/ 和过去的 electron/ 都在 Vite 根下一层）
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

/* ------------------------------ 启动回填来源 ------------------------------ */

// 启动时给「缺来源、但原文件还在」的旧记录补一次
// （顺带兜住「延迟补抓还没跑完就关了应用」的情况）
const backfillSources = async () => {
  const db = readDB()
  const targets = db.filter(
    (item) => !item.sourceUrl && item.sourcePath && fs.existsSync(item.sourcePath),
  )
  if (!targets.length) return

  let changed = 0
  for (const item of targets) {
    try {
      const source = await readSourceInfo(item.sourcePath)
      if (!source.sourceUrl) continue
      item.sourceUrl = source.sourceUrl
      item.referrerUrl = source.referrerUrl || ''
      changed++
    } catch {
      /* 单条失败不影响其它 */
    }
  }
  if (!changed) return

  writeDB(db)
  console.log(`[source] 启动补抓到 ${changed} 条下载来源`)
  for (const item of targets) {
    if (!item.sourceUrl) continue
    notifyImageSourceUpdated({
      id: item.id,
      sourceUrl: item.sourceUrl,
      referrerUrl: item.referrerUrl,
    })
  }
}

/* ------------------------------- 生命周期 ------------------------------- */

app.whenReady().then(() => {
  ensureImagesRoot() // 根目录可能被改过，启动时确保 Ori/Thumb 都在
  migrateLayout() // 老库从「根目录平铺」搬到 Ori/Thumb，只做改名
  readDB() // 预热 gallery:// 协议用的内存索引
  registerGalleryProtocol()
  registerIpc()
  createWindow()

  const cfg = readConfig()
  if (cfg.watchEnabled) startWatcher(cfg.watchDir)

  // 后台给旧记录补下载来源，不阻塞启动
  backfillSources().catch((err) => console.error('[source] 启动补抓失败:', err.message))
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopWatcher()
})
