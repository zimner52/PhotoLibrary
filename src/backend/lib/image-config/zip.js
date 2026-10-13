/*
 * 打包 ZIP。
 * 未做 zip64，单文件与整包都需小于 4GB。
 */
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const { readDB } = require('../db')
const { uniquePath } = require('../folders/img-folders')

/* --------------------------------- CRC32 -------------------------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let i = 0; i < 256; i++) {
    let code = i
    for (let bit = 0; bit < 8; bit++) code = code & 1 ? 0xedb88320 ^ (code >>> 1) : code >>> 1
    table[i] = code
  }
  return table
})()

const crc32 = (buffer) => {
  let crc = -1
  for (let i = 0; i < buffer.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buffer[i]) & 0xff]
  return (crc ^ -1) >>> 0
}

/* --------------------------------- 打包 --------------------------------- */

// 递归收集根目录下的条目（目录项以 / 结尾）
const collectZipEntries = (rootDir, prefix = '', options = {}) => {
  const { include = '/Thumb' } = options
  const entries = []
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const fullPath = path.join(rootDir, entry.name)
    const name = prefix + entry.name

    if (include.includes(entry.name)) continue //排除该目录

    if (entry.isDirectory()) {
      entries.push({ name: name + '/', dir: true })
      entries.push(...collectZipEntries(fullPath, name + '/'))
    } else if (entry.isFile()) {
      entries.push({ name, dir: false, fullPath })
    }
  }
  return entries
}

const buildZip = (entries) => {
  const now = new Date()
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()

  const localParts = []
  const centralParts = []
  let offset = 0

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, 'utf8')
    const raw = entry.dir ? Buffer.alloc(0) : fs.readFileSync(entry.fullPath)
    const body = entry.dir ? Buffer.alloc(0) : zlib.deflateRawSync(raw)
    const crc = entry.dir ? 0 : crc32(raw)
    const method = entry.dir ? 0 : 8 // 目录用 store，文件用 deflate

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0) // 本地文件头签名
    local.writeUInt16LE(20, 4) // 解压所需版本
    local.writeUInt16LE(0x0800, 6) // 标志位：文件名为 UTF-8
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(dosTime, 10)
    local.writeUInt16LE(dosDate, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(body.length, 18) // 压缩后大小
    local.writeUInt32LE(raw.length, 22) // 原始大小
    local.writeUInt16LE(nameBuffer.length, 26)
    local.writeUInt16LE(0, 28) // 扩展字段长度
    localParts.push(local, nameBuffer, body)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0) // 中央目录签名
    central.writeUInt16LE(20, 4) // 创建版本
    central.writeUInt16LE(20, 6) // 解压所需版本
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt16LE(dosTime, 12)
    central.writeUInt16LE(dosDate, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(body.length, 20)
    central.writeUInt32LE(raw.length, 24)
    central.writeUInt16LE(nameBuffer.length, 28)
    central.writeUInt16LE(0, 30) // 扩展字段
    central.writeUInt16LE(0, 32) // 注释
    central.writeUInt16LE(0, 34) // 起始磁盘号
    central.writeUInt16LE(0, 36) // 内部属性
    central.writeUInt32LE(entry.dir ? 0x10 : 0, 38) // 外部属性：0x10 = 目录
    central.writeUInt32LE(offset, 42) // 本地文件头偏移
    centralParts.push(central, nameBuffer)

    offset += local.length + nameBuffer.length + body.length
  }

  const centralBuffer = Buffer.concat(centralParts)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0) // EOCD 签名
  end.writeUInt16LE(0, 4) // 当前磁盘号
  end.writeUInt16LE(0, 6) // 中央目录起始磁盘号
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralBuffer.length, 12)
  end.writeUInt32LE(offset, 16) // 中央目录偏移
  end.writeUInt16LE(0, 20) // 注释长度

  return Buffer.concat([...localParts, centralBuffer, end])
}

/* ------------------------------ 临时索引 json ------------------------------ */

const MANIFEST_NAME = '图片库索引.json'

const writeManifest = (rootDir) => {
  const images = readDB().map((item) => ({
    name: item.name || '',
    sourceUrl: item.sourceUrl || null,
    referer: item.referrerUrl || null, // 对应 db.json 里的 referrerUrl
  }))

  const manifest = {
    exportedAt: new Date().toISOString(),
    total: images.length,
    images,
  }

  const target = uniquePath(path.join(rootDir, MANIFEST_NAME))
  fs.writeFileSync(target, JSON.stringify(manifest, null, 2), 'utf8')
  return target
}

module.exports = { collectZipEntries, buildZip, writeManifest }
