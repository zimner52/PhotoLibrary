/*
 * 打包 ZIP。
 *
 * 包内结构固定为 Ori/<文件夹>/<文件> + 图片库索引.json。
 * 打包子集时只是 Ori 下的一个子集，层级不变 —— 以后做「导入 ZIP」只需要一套解析。
 * ZIP 里放什么、索引里写什么，都由 selectItems 的返回决定，两条路不可能漂移。
 */
const fs = require('fs')
const path = require('path')
const { readDB } = require('../db')
const { uniquePath } = require('../folders/img-folders')
const archiver = require('archiver')

/* --------------------------------- 选择项目 --------------------------------- */
const selectItems = (folders) => {
  const wanted = new Set(folders) // 含 ''
  return readDB().filter(
    (item) => wanted.has(item.folder || '') && item.src && fs.existsSync(item.src),
  )
}

// 包内路径：始终带 Ori/ 前缀，文件夹层级原样保留
const entryName = (item) =>
  `Ori/${item.folder ? item.folder + '/' : ''}${path.basename(item.src)}`

/* --------------------------------- 打包 --------------------------------- */

// items 与 manifestPath 必须来自同一份选中集合（见 selectItems）
const buildZip = async (outPath, items, manifestPath) => {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outPath)
    const archive = archiver('zip', { zlib: { level: 1 } })

    output.on('close', () => resolve(archive.pointer()))
    output.on('error', reject)
    archive.on('error', reject)
    archive.on('warning', (err) => {
      if (err.code === 'ENOENT') console.warn('[zip] 跳过:', err.message)
      else reject(err)
    })

    archive.pipe(output)
    // 逐条按 db 记录入包
    items.forEach((item) => archive.file(item.src, entryName(item)))

    archive.file(manifestPath, path.basename(manifestPath))
    archive.finalize().catch(reject)
  })
}

/* ------------------------------ 临时索引 json ------------------------------ */

const MANIFEST_NAME = '图片库索引.json'

const writeManifest = (rootDir, items) => {
  const images = items.map((item) => ({
    name: item.name || '',
    sourceUrl: item.sourceUrl || null,
    referer: item.referrerUrl || null,
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

module.exports = { selectItems, writeManifest, buildZip }
