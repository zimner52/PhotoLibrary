/*
 * Electron 主进程入口：生命周期 + 组装 + 启动回填。
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
    icon: path.join(__dirname, '../../assets/build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

/* ------------------------------ 启动回填来源 ------------------------------ */

// 启动时给「缺来源、但原文件还在」的旧记录补一次
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
  ensureImagesRoot() // 启动时确保 Ori/Thumb 都在
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
