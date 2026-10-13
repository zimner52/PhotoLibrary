/*
 * 图片导入方法和写入数据库格式定义
 * 图片导入：一次产出大图（Ori）+ 缩略图（Thumb）
 */
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const { ORI_QUALITY, ORI_EFFORT, THUMB_SIZE, THUMB_QUALITY, THUMB_EFFORT } = require('../constants')
const { oriDir, thumbDir } = require('../folders/img-folders')
const { readSourceInfo } = require('../downloads/source')

sharp.cache({ files: 0 })

/* -------------------------------- 缩略图 -------------------------------- */
/* Thumb/ 是可再生的派生产物，缺失时由 gallery:// 协议现场重建。 */

// 从大图生成缩略图（从大图而不是原图：保证两者内容一致，也不依赖原图还在）
const writeThumb = async (oriPath, thumbPath) => {
  fs.mkdirSync(path.dirname(thumbPath), { recursive: true })
  await sharp(oriPath)
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: THUMB_QUALITY, effort: THUMB_EFFORT })
    .toFile(thumbPath)
  return thumbPath
}

/* --------------------------------- 导入 --------------------------------- */

// 返回一条元数据（不写库，由调用方决定何时落盘）
const importImageFile = async (srcPath, meta = {}) => {
  const info = meta || {}
  const ext = path.extname(srcPath)
  const id = Date.now() + '_' + Math.random().toString(36).slice(2, 8)
  const fileName = id + '.webp'
  const oriPath = path.join(oriDir(), fileName)
  const thumbPath = path.join(thumbDir(), fileName)

  // 获取下载来源（Mark of the Web）
  let source = {}
  try {
    source = await readSourceInfo(srcPath)
  } catch (err) {
    console.error('[source] 读取下载来源失败:', srcPath, err.message)
  }

  fs.mkdirSync(oriDir(), { recursive: true })
  // 想给「解压炸弹」设上限的话，上限加在这里：
  //   sharp(srcPath, { limitInputPixels: 50_000_000 })
  // 注意 sharp 默认上限约 268MP，压到 50MP 会拒掉一部分合法大图（10000×7000 就超了），
  // 而 Ori 的定位恰恰是「原图不缩放」，值要按你的图源定。
  await sharp(srcPath)
    // 不 resize：Ori 就是原图，保留原始分辨率，只做一次轻压缩
    .webp({ quality: ORI_QUALITY, effort: ORI_EFFORT })
    .toFile(oriPath)

  // 缩略图从刚生成的大图来，保证和展示内容一致；失败不阻断导入
  try {
    await writeThumb(oriPath, thumbPath)
  } catch (err) {
    console.error('[thumb] 缩略图生成失败，稍后按需重试:', oriPath, err.message)
  }

  return {
    id,
    name: info.name || path.basename(srcPath, ext),
    src: oriPath, // 原图：给「查看原图」用，也是缩略图路径的推导依据
    tags: [], // 用户标签（可多个）
    folder: '', // 所属文件夹，空字符串表示未分类
    sourcePath: srcPath, // 来源文件的绝对路径。
    sourceUrl: info.sourceUrl || source.sourceUrl || '', // 下载地址
    referrerUrl: info.referrerUrl || source.referrerUrl || '', // 来源页面
    importedAt: Date.now(),
  }
}

module.exports = { importImageFile, writeThumb }
