/*
 * 目录布局迁移（一次性）。
 * 旧布局：<root>/<id>.webp、<root>/<文件夹>/<id>.webp
 * 新布局：<root>/Ori/... + <root>/Thumb/...
 * 只做改名、不重新编码；缩略图全部留给 gallery:// 协议按需生成，所以迁移是秒级的。
 */
const fs = require('fs')
const path = require('path')
const { ORI_DIR_NAME, THUMB_DIR_NAME } = require('../constants')
const { readDB, writeDB } = require('../db')
const { oriDir, ensureImagesRoot } = require('./img-folders')

const migrateLayout = () => {
  const root = ensureImagesRoot()
  const ori = oriDir()

  let moved = 0
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === ORI_DIR_NAME || entry.name === THUMB_DIR_NAME) continue
    const from = path.join(root, entry.name)
    const to = path.join(ori, entry.name)
    if (fs.existsSync(to)) continue // 目标已有同名，保守跳过
    try {
      fs.renameSync(from, to)
      moved++
    } catch (err) {
      console.error('[migrate] 搬移失败:', from, err.message)
    }
  }

  const db = readDB()
  let changed = 0
  for (const item of db) {
    if (!item.src) continue
    const rel = path.relative(root, item.src)
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) continue
    if (rel === ORI_DIR_NAME || rel.startsWith(ORI_DIR_NAME + path.sep)) continue // 已经是新布局
    const next = path.join(ori, rel)
    if (fs.existsSync(next)) {
      item.src = next
      changed++
    }
  }
  if (changed) writeDB(db)
  if (moved || changed) console.log(`[migrate] 布局已更新：搬移 ${moved} 项、改写 ${changed} 条记录`)
}

module.exports = { migrateLayout }
