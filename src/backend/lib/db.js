/* db.json：图片元数据的读写 */
const fs = require('fs')
const { DB_PATH } = require('./constants')

let dbIndex = new Map()  // id → 记录 的内存索引
let cache = null  // 整表缓存

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

  // 验证缓存
  if (!force && cache && cache.mtimeMs === stat.mtimeMs && cache.size === stat.size) {
    return setIndex(cache.data)
  }

  try {
    const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'))
    cache = { mtimeMs: stat.mtimeMs, size: stat.size, data }
    return setIndex(data)
  } catch (err) {
    try {
      fs.renameSync(DB_PATH, `${DB_PATH}.corrupt-${Date.now()}`)
      console.error(`读取 db.json 失败，原文件已重命名并保存:`, err.message)
    } catch(err) {
      console.error('重命名 db.json 失败，文件可能已损坏:', err.message)
    }
    cache = null
    return setIndex([])
  }
}

// 写入数据库（顺便刷新内存索引与缓存）
const writeDB = (data) => {
  const json = JSON.stringify(data, null, 2)
  const tmp = DB_PATH + '.tmp'
  const fw = fs.openSync(tmp, 'w')

  // 写入临时文件
  try {
    fs.writeFileSync(fw, json)
    fs.fsyncSync(fw)
  } finally {
    fs.closeSync(fw)
  }

  // 替换原文件
  try {
    fs.renameSync(tmp, DB_PATH)
  } catch (err) {
    if (err.code !== 'EPERM' && err.code !== 'EBUSY') throw err
    try {
      fs.copyFileSync(tmp, DB_PATH)
    } finally {
      fs.unlinkSync(tmp)
    }
    console.warn('插入数据失败，使用备份文件:', err.message)
  }

  // 刷新缓存
  try {
    const stat = fs.statSync(DB_PATH)
    cache = { mtimeMs: stat.mtimeMs, size: stat.size, data }
  } catch {
    cache = null
  }
  setIndex(data)
}

// 按 id 取记录。索引内容来自最近一次 readDB / writeDB，调用前请确保已经读过库。
const getItem = (id) => dbIndex.get(id)

module.exports = { readDB, writeDB, getItem }
