/* db.json：图片元数据的读写 */
const fs = require('fs')
const { DB_PATH } = require('./constants')

// id → 记录 的内存索引。gallery:// 协议每张图都要查一次，不能每次读磁盘。
let dbIndex = new Map()

const readDB = () => {
  if (!fs.existsSync(DB_PATH)) {
    dbIndex = new Map()
    return []
  }
  try {
    const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'))
    dbIndex = new Map(data.map((item) => [item.id, item]))
    return data
  } catch (err) {
    console.error('读取 db.json 失败，按空库处理:', err.message)
    dbIndex = new Map()
    return []
  }
}

// 写入数据库（顺便刷新内存索引）
const writeDB = (data) => {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2))
  dbIndex = new Map(data.map((item) => [item.id, item]))
}

// 按 id 取记录。索引内容来自最近一次 readDB / writeDB，调用前请确保已经读过库。
const getItem = (id) => dbIndex.get(id)

module.exports = { readDB, writeDB, getItem }
