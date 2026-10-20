/*
 * 下载目录监听：浏览器下载完图片后自动入库。
 * 只监听所选目录的第一层。
 *
 * 同时负责「**延迟补抓下载来源**」：浏览器是在下载完成之后才写 Zone.Identifier 的，
 */
const fs = require('fs')
const path = require('path')
const { IMAGE_EXTS, TEMP_EXTS } = require('../constants')
const { readConfig, imagesRoot } = require('../config')
const { readDB, writeDB } = require('../db')
const { importImageFile } = require('../image-config/images')
const { readSourceInfo } = require('./source')
const { notifyImagesUpdated, notifyImageSourceUpdated } = require('../events')

// 原来在 utils.js 里，删掉那个文件后就近放在唯一的使用者这里
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

let watcher = null
let watchedDir = null
const handledFiles = new Set() // 已处理过的绝对路径，避免重复导入
let importQueue = Promise.resolve() // 串行化导入，避免多文件同时压缩

const isImageFile = (name) => IMAGE_EXTS.includes(path.extname(name).toLowerCase())
const isTempFile = (name) => TEMP_EXTS.some((ext) => name.toLowerCase().endsWith(ext))

// config.json + 当前监听状态，返回给渲染进程
const configView = () => {
  const cfg = readConfig()
  return { ...cfg, watching: !!watcher, watchedDir, imagesDir: imagesRoot() }
}

const stopWatcher = () => {
  if (watcher) {
    watcher.close()
    watcher = null
  }
  watchedDir = null
}

// 等待文件写入结束：浏览器边下边写，体积稳定后才算下载完成
const waitForFileReady = async (filePath, timeout = 20000) => {
  const deadline = Date.now() + timeout
  let lastSize = -1
  while (Date.now() < deadline) {
    let stat
    try {
      stat = fs.statSync(filePath)
    } catch {
      return false // 文件已被移走或删除
    }
    if (!stat.isFile()) return false
    if (stat.size > 0 && stat.size === lastSize) return true
    lastSize = stat.size
    await sleep(300)
  }
  return false
}

const importFromWatchDir = async (fileName) => {
  if (!watchedDir || !fileName) return
  if (isTempFile(fileName) || !isImageFile(fileName)) return

  const filePath = path.join(watchedDir, fileName)
  if (handledFiles.has(filePath)) return
  handledFiles.add(filePath) // 先占位，防止 fs.watch 重复触发

  try {
    if (!(await waitForFileReady(filePath))) {
      handledFiles.delete(filePath)
      return
    }
    const item = await importImageFile(filePath)
    const db = readDB()
    db.push(item)
    writeDB(db)
    console.log('[watch] 已自动导入:', filePath)
    // item 留着给 WatchSettings 显示名字，items 给图库做增量追加
    notifyImagesUpdated({ op: 'add', type: 'auto-import', items: [item], item })
    scheduleSourceRetry(item) // 没抓到来源的话，后台再补几次
  } catch (err) {
    handledFiles.delete(filePath) // 失败后允许下次重试
    console.error('[watch] 自动导入失败:', filePath, err.message)
  }
}

const enqueueImport = (fileName) => {
  importQueue = importQueue.then(() => importFromWatchDir(fileName)).catch(() => {})
  return importQueue
}

const startWatcher = (dir) => {
  stopWatcher()
  if (!dir) return
  if (!fs.existsSync(dir)) {
    console.warn('[watch] 目录不存在，无法监听:', dir)
    return
  }

  // 以当前目录内容为基线，避免开启监听时把历史下载全部导入
  handledFiles.clear()
  for (const name of fs.readdirSync(dir)) {
    if (isImageFile(name) && !isTempFile(name)) handledFiles.add(path.join(dir, name))
  }

  try {
    watcher = fs.watch(dir, { persistent: true }, (eventType, fileName) => {
      if (fileName) enqueueImport(fileName.toString())
    })
    watcher.on('error', (err) => {
      console.error('[watch] 监听出错:', err.message)
      stopWatcher()
    })
    watchedDir = dir
    console.log('[watch] 开始监听:', dir)
  } catch (err) {
    watcher = null
    watchedDir = null
    console.error('[watch] 无法监听目录:', dir, err.message)
  }
}

// 手动扫描：导入监听目录中尚未入库的图片
const scanWatchDir = async () => {
  const dir = readConfig().watchDir
  if (!dir) return { imported: 0, skipped: 0, error: '尚未设置下载目录' }
  if (!fs.existsSync(dir)) return { imported: 0, skipped: 0, error: '目录不存在：' + dir }

  const db = readDB()
  const knownPath = new Set(db.map((i) => i.sourcePath))
  const added = []
  let imported = 0
  let skipped = 0

  const names = fs.readdirSync(dir)
  for (const name of names) {
    if (isTempFile(name) || !isImageFile(name)) continue
    const filePath = path.join(dir, name)
    const baseName = path.basename(name, path.extname(name))

    if (knownPath.has(filePath)) {
      handledFiles.add(filePath)
      skipped++
      continue
    }

    handledFiles.add(filePath)
    try {
      const item = await importImageFile(filePath)
      db.push(item)
      added.push(item)
      imported++
    } catch (err) {
      handledFiles.delete(filePath)
      console.error('[watch] 扫描导入失败:', filePath, err.message)
    }
  }

  if (imported > 0) {
    writeDB(db)
    notifyImagesUpdated({ op: 'add', type: 'scan', items: added, count: imported })
    added.forEach(scheduleSourceRetry) // 没抓到来源的，后台再补几次
  }
  return { imported, skipped }
}

/* ------------------------------ 延迟补抓来源 ------------------------------ */

const SOURCE_RETRY_DELAYS = [1500, 3000, 6000] // 毫秒，累加约 1.5s / 4.5s / 10.5s
const pendingSourceChecks = new Set()

// 把补抓到的来源写回记录，并通知界面就地更新
const applySource = (id, source) => {
  const db = readDB()
  const target = db.find((entry) => entry.id === id)
  if (!target || target.sourceUrl) return

  target.sourceUrl = source.sourceUrl
  target.referrerUrl = source.referrerUrl || ''
  writeDB(db)
  console.log('[source] 补抓到下载来源:', id, source.sourceUrl)
  notifyImageSourceUpdated({
    id,
    sourceUrl: target.sourceUrl,
    referrerUrl: target.referrerUrl,
  })
}

// 导入时没抓到来源的，排队在后台重试
const scheduleSourceRetry = (item) => {
  if (!item?.id || !item.sourcePath || item.sourceUrl) return
  if (pendingSourceChecks.has(item.id)) return
  pendingSourceChecks.add(item.id)

  const attempt = async (index) => {
    try {
      const source = await readSourceInfo(item.sourcePath)
      if (source.sourceUrl) {
        pendingSourceChecks.delete(item.id)
        applySource(item.id, source)
        return
      }
    } catch (err) {
      console.error('[source] 延迟抓取失败:', item.sourcePath, err.message)
    }

    if (index + 1 >= SOURCE_RETRY_DELAYS.length) {
      pendingSourceChecks.delete(item.id)
      return
    }
    setTimeout(() => attempt(index + 1), SOURCE_RETRY_DELAYS[index + 1]).unref()
  }

  setTimeout(() => attempt(0), SOURCE_RETRY_DELAYS[0]).unref()
}

module.exports = { startWatcher, stopWatcher, scanWatchDir, configView, scheduleSourceRetry }
