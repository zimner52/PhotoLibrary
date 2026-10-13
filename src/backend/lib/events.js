/*
 * 主进程 → 渲染进程的推送：
 *   images-updated         图库整体变动 → 重载列表
 *   image-source-updated   补抓到来源 → 只改一条
 *   download-progress      批量下载进度 → 只更新按钮上的文字
 */
const { BrowserWindow } = require('electron')

// 自动导入 / 扫描导入完成 → 界面重新拉一次列表
const notifyImagesUpdated = (payload = {}) => {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('images-updated', payload)
  }
}

// 后台补抓到下载来源
const notifyImageSourceUpdated = (payload) => {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('image-source-updated', payload)
  }
}

// 按索引批量下载的进度：{ index, total, name, phase }
const notifyDownloadProgress = (payload) => {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('download-progress', payload)
  }
}

module.exports = { notifyImagesUpdated, notifyImageSourceUpdated, notifyDownloadProgress }
