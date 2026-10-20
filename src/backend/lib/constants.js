/*
 * 全项目共用的常量与路径。
 * 这里不再 require 任何本项目的其它模块，是整个依赖图的根。
 */
const path = require('path')
const { app } = require('electron')

/* --------------------------------- 路径 --------------------------------- */

const USER_DATA = app.getPath('userData')
const DEFAULT_IMG_DIR = path.join(USER_DATA, 'images') // 默认图库根目录，可在界面上改
const DB_PATH = path.join(USER_DATA, 'db.json')
const CONFIG_PATH = path.join(USER_DATA, 'config.json')

/* ------------------------------- 目录结构 ------------------------------- */
/*
 * <root>/Ori/<id>.webp              → 未分类大图
 * <root>/Ori/<文件夹名>/<id>.webp    → 已归类大图
 * <root>/Thumb/...                  → 与 Ori 同构的缩略图（可再生）
 */

const ORI_DIR_NAME = 'Ori'
const THUMB_DIR_NAME = 'Thumb'

/* ------------------------------- 图片参数 ------------------------------- */

const ORI_QUALITY = 80
const ORI_EFFORT = 1

const THUMB_SIZE = 320 // 缩略图最长边
const THUMB_QUALITY = 75
const THUMB_EFFORT = 2

/* ------------------------------ 自定义协议 ------------------------------ */

// 渲染进程用 gallery://thumb/<id>、gallery://ori/<id> 直接引用图片
const GALLERY_SCHEME = 'gallery'

/* --------------------------------- 格式 --------------------------------- */

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.bmp', '.tiff', '.svg']

// 文件对话框用的扩展名列表（不带点）
const DIALOG_EXTS = IMAGE_EXTS.map((ext) => ext.slice(1))

// 浏览器下载中的临时文件后缀
// Chrome/Edge: .crdownload　Firefox: .part　Opera: .opdownload
const TEMP_EXTS = ['.crdownload', '.part', '.partial', '.download', '.opdownload', '.tmp', '.temp']

module.exports = {
  DEFAULT_IMG_DIR,
  DB_PATH,
  CONFIG_PATH,
  ORI_DIR_NAME,
  THUMB_DIR_NAME,
  ORI_QUALITY,
  ORI_EFFORT,
  THUMB_SIZE,
  THUMB_QUALITY,
  THUMB_EFFORT,
  GALLERY_SCHEME,
  IMAGE_EXTS,
  DIALOG_EXTS,
  TEMP_EXTS,
}
