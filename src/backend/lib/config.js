/* config.json：自动导入设置 + 当前图库根目录 */
const fs = require('fs')
const { app } = require('electron')
const { CONFIG_PATH, DEFAULT_IMG_DIR } = require('./constants')

// 默认监听系统下载目录（浏览器默认下载位置）
const defaultWatchDir = () => {
  try {
    return app.getPath('downloads')
  } catch {
    return app.getPath('home')
  }
}

const readConfig = () => {
  let saved = {}
  try {
    if (fs.existsSync(CONFIG_PATH)) saved = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
  } catch (err) {
    console.error('读取配置失败，使用默认配置:', err.message)
  }
  return {
    watchDir: defaultWatchDir(),
    watchEnabled: true,
    imagesDir: DEFAULT_IMG_DIR, // 图库根目录
    folders: [],
    ...saved,
  }
}

// 写入新目录
const writeConfig = (patch) => {
  const next = { ...readConfig(), ...patch }
  if (next.imagesDir === DEFAULT_IMG_DIR) next.imagesDir = ''
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2))
  return next
}

// 图库根目录（用户可改），读到空值或非法值时回落到默认值
const imagesRoot = () => {
  const dir = readConfig().imagesDir
  return typeof dir === 'string' && dir.trim() ? dir : DEFAULT_IMG_DIR
}

module.exports = { readConfig, writeConfig, imagesRoot }
