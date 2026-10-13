/*
 * 图库的目录计算与地址
 */
const fs = require('fs')
const path = require('path')
const { ORI_DIR_NAME, THUMB_DIR_NAME } = require('../constants')
const { imagesRoot } = require('../config')

const oriDir = () => path.join(imagesRoot(), ORI_DIR_NAME)
const thumbDir = () => path.join(imagesRoot(), THUMB_DIR_NAME)

// 根目录 + Ori + Thumb 都确保存在
const ensureImagesRoot = () => {
  const dir = imagesRoot()
  fs.mkdirSync(path.join(dir, ORI_DIR_NAME), { recursive: true })
  fs.mkdirSync(path.join(dir, THUMB_DIR_NAME), { recursive: true })
  return dir
}

// 用户文件夹在 Ori 下的实体目录；传空名就是 Ori 根
const folderPath = (name) => (name ? path.join(oriDir(), name) : oriDir())
const thumbFolderPath = (name) => (name ? path.join(thumbDir(), name) : thumbDir())

// 缩略图路径完全由「大图路径 + 所属文件夹」推导，所以不入库，也不存在两份路径不同步
const thumbPathFor = (item) => {
  const name = item.src ? path.basename(item.src) : `${item.id}.webp`
  return path.join(thumbFolderPath(item.folder || ''), name)
}

// 文件名冲突处理
const uniquePath = (target) => {
  if (!fs.existsSync(target)) return target
  const dir = path.dirname(target)
  const ext = path.extname(target)
  const base = path.basename(target, ext)
  let index = 1
  let candidate = path.join(dir, `${base} (${index})${ext}`)
  while (fs.existsSync(candidate)) {
    index++
    candidate = path.join(dir, `${base} (${index})${ext}`)
  }
  return candidate
}

// 同一分区内直接 rename；跨盘符（EXDEV）退化成复制 + 删除
const moveFile = (src, dest) => {
  const target = uniquePath(dest)
  try {
    fs.renameSync(src, target)
  } catch (err) {
    if (err.code !== 'EXDEV') throw err
    fs.copyFileSync(src, target)
    fs.unlinkSync(src)
  }
  return target
}

// 把 srcDir 下的所有内容递归搬进 destDir，同名时改名避让，最后删掉空掉的旧目录
const moveTree = (srcDir, destDir) => {
  let moved = 0
  if (!fs.existsSync(srcDir)) return moved
  fs.mkdirSync(destDir, { recursive: true })

  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name)
    if (entry.isDirectory()) {
      moved += moveTree(src, path.join(destDir, entry.name))
      try {
        fs.rmdirSync(src) // 子目录搬空后删掉
      } catch {
        /* 还有残留就留着 */
      }
      continue
    }
    try {
      moveFile(src, path.join(destDir, entry.name))
      moved++
    } catch (err) {
      console.error('[root] 移动文件失败:', src, err.message)
    }
  }
  return moved
}

module.exports = {
  oriDir,
  thumbDir,
  ensureImagesRoot,
  folderPath,
  thumbFolderPath,
  thumbPathFor,
  uniquePath,
  moveFile,
  moveTree,
}
