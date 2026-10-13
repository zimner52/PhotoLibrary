/* db.json：图片元数据的读写 */
const fs = require('fs')
const { DB_PATH } = require('./constants')

// id → 记录 的内存索引。gallery:// 协议每张图都要查一次，不能每次读磁盘。
let dbIndex = new Map()


// 整表缓存
let cache = null

const setIndex = (data) => {
  dbIndex = new Map(data.map((item) => [item.id, item]))
  return data
}

const readDB = (force = false) => {
  let stat
  try {
    stat = fs.statSync(DB_PATH)
  } catch {
    cache = null // 文件不存在（被删了）：当空库
    return setIndex([])
  }

  if (!force && cache && cache.mtimeMs === stat.mtimeMs && cache.size === stat.size) {
    return cache.data
  }

  try {
    const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'))
    cache = { mtimeMs: stat.mtimeMs, size: stat.size, data }
    return setIndex(data)
  } catch (err) {
    console.error('读取 db.json 失败，按空库处理:', err.message)
    cache = null
    return setIndex([])
  }
}

// 写入数据库（顺便刷新内存索引与缓存）
const writeDB = (data) => {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2))
  setIndex(data)
  try {
    const stat = fs.statSync(DB_PATH)
    cache = { mtimeMs: stat.mtimeMs, size: stat.size, data }
  } catch {
    cache = null
  }
}

// 按 id 取记录。索引内容来自最近一次 readDB / writeDB，调用前请确保已经读过库。
const getItem = (id) => dbIndex.get(id)

module.exports = { readDB, writeDB, getItem }
