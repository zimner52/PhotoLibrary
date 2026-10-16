/* 用户可配置项的设置 */
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
  let raw = null

  try {
    raw = fs.readFileSync(CONFIG_PATH, 'utf-8')
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('[config] 读取配置失败，用默认值:', err.message)
  }

  if (raw != null) {
    let parsed = null
    try {
      parsed = JSON.parse(raw)
    } catch (err) {
      try {
        fs.renameSync(CONFIG_PATH, `${CONFIG_PATH}.corrupt-${Date.now()}`)
        console.error('[config] 配置损坏，已留档为 .corrupt:', err.message)
      } catch (e) {
        console.error('[config] 配置损坏，留档失败（继续用默认值）:', e.message)
      }
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) saved = parsed
  }

  return {
    watchDir: defaultWatchDir(),
    watchEnabled: true,
    imagesDir: DEFAULT_IMG_DIR, // 图库根目录
    folders: [],
    ...saved,
  }
}

// 写入新配置
const writeConfig = (patch) => {
  const next = { ...readConfig(), ...patch }
  if (next.imagesDir === DEFAULT_IMG_DIR) next.imagesDir = ''

  const json = JSON.stringify(next, null, 2)
  const tmp = CONFIG_PATH + '.tmp'
  const fw = fs.openSync(tmp, 'w')

  // 写入临时文件
  try {
    fs.writeFileSync(fw, json)
    fs.fsyncSync(fw)
  } finally {
    fs.closeSync(fw)
  }

  try {
    fs.renameSync(tmp, CONFIG_PATH)
  } catch (err) {
    if (err.code !== 'EPERM' && err.code !== 'EBUSY') throw err
    try {
      fs.copyFileSync(tmp, CONFIG_PATH)
    } finally {
      fs.unlinkSync(tmp)
    }
    console.warn('更改配置失败', err.message)
  }
  return next
}

// 图库根目录（用户可改），读到空值或非法值时回落到默认值
const imagesRoot = () => {
  const dir = readConfig().imagesDir
  return typeof dir === 'string' && dir.trim() ? dir : DEFAULT_IMG_DIR
}

module.exports = { readConfig, writeConfig, imagesRoot }
