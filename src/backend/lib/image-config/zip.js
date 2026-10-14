/*
 * 打包 ZIP。
 */
const fs = require('fs')
const path = require('path')
const { readDB } = require('../db')
const { uniquePath } = require('../folders/img-folders')
const archiver = require('archiver')

/* --------------------------------- 打包 --------------------------------- */

const buildZip = async (srcPath, outPath) => {

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
    archive.glob('**/*', { cwd: srcPath, ignore: ['Thumb/**'] })
    archive.finalize().catch(reject)
  })
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

module.exports = { writeManifest, buildZip }
