/*
 * 按「图片库索引.json」批量重新下载图片。
 * 与「打包图片」（image-config/zip.js）构成一次往返：那边导出 name + sourceUrl + referer，
 * 这边照着把图捞回来。典型用途是换机器、或图库被删之后照索引重建。
 *
 * ⚠️ 索引 json 是**不可信输入**（谁都能手改），所以每一项校验都必须在
 * 「把请求发出去」之前做完——见 downloadWithReferer 里的顺序。
 */
const fs = require('fs')
const path = require('path')
const { app, session } = require('electron')
const { readDB, writeDB } = require('../db')
const { importImageFile } = require('../image-config/images')

// 判断私有地址
const isPrivateHost = (hostname) => {
  const h = hostname.toLowerCase()
  if (h === 'localhost' || h.endsWith('.localhost') || h === '::1') return true
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (!m) return false
  const [a, b] = [Number(m[1]), Number(m[2])]
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  )
}

// 导入索引
const readManifest = async (manifestPath) => {
  let data
  try {
    data = JSON.parse(await fs.promises.readFile(manifestPath, 'utf-8'))
  } catch (err) {
    throw new Error(`不是合法的索引文件：${err.message}`)
  }
  if (!Array.isArray(data?.images)) throw new Error('这不是图片库索引文件')

  const images = []
  const skipped = []
  for (const entry of data.images) {
    if (entry.sourceUrl) {
      images.push({ name: entry.name, sourceUrl: entry.sourceUrl, referer: entry.referer })
    } else {
      skipped.push({ name: entry.name, reason: '没有来源链接' })
    }
  }

  return { exportedAt: data.exportedAt, images, skipped }
}

// 从网页中获取图片
const downloadWithReferer = async (url, referrer, destDir) => {
  const headers = {}
  const u = new URL(url)

  // 白名单必须在发请求之前：先 fetch 再判断，等于门已经开了才上锁。
  // file:// 尤其要紧——session.fetch 是真能把它读出内容的（实测能走到 res.ok）。
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('只支持 HTTP/HTTPS')
  if (isPrivateHost(u.hostname)) throw new Error('不允许访问私有地址')

  // ↓ 调试用：暂时不发 Referer，看防盗链那边的错误码会不会变
  // if (referrer) headers.Referer = referrer

  const res = await session.defaultSession.fetch(url, {
    headers,
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const type = res.headers.get('content-type') || ''
  const length = res.headers.get('content-length')
  if (!type.startsWith('image/')) {
    throw new Error(`返回的不是图片（${type || '未知类型'}）`)
  } else if (length && parseInt(length, 10) > 50 * 1024 * 1024) {
    throw new Error('文件太大了')
  }

  const sub = (type.split(';')[0].split('/')[1] || 'jpg').replace(/[^a-z0-9]/gi, '') || 'jpg'
  const fileName = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${sub}`
  const destPath = path.join(destDir, fileName)
  await fs.promises.writeFile(destPath, Buffer.from(await res.arrayBuffer()))
  return destPath
}

// 结束后导入图片
const importFromManifest = async (manifestPath, onProgress) => {
  const db = readDB()
  let imported = 0
  const { images, skipped } = await readManifest(manifestPath)
  const tmpDir = path.join(app.getPath('temp'), `dl_${Date.now()}`)
  fs.mkdirSync(tmpDir, { recursive: true })
  const failed = []
  for (const [i, entry] of images.entries()) {
    onProgress({ index: i + 1, total: images.length, name: entry.name, phase: 'downloading' })
    try {
      const file = await downloadWithReferer(entry.sourceUrl, entry.referer, tmpDir)
      onProgress({ index: i + 1, total: images.length, name: entry.name, phase: 'importing' })
      db.push(
        await importImageFile(file, {
          name: entry.name,
          sourceUrl: entry.sourceUrl,
          referrerUrl: entry.referer,
        }),
      )
      imported++
    } catch (err) {
      // 弹窗里只有图片名（常常就是「1」「2」这种），看不出是哪个地址挂了，
      // 所以把完整地址打到终端：npm start 那个窗口里能看到
      console.warn('[download] 下载失败:', entry.sourceUrl, '→', err.message)
      failed.push({ name: entry.name, error: err.message })
    }
  }
  // 先落盘再清临时目录：清理失败也不能把这一批的成果丢掉
  writeDB(db)
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  } catch (err) {
    console.warn('[download] 临时目录清理失败:', tmpDir, err.message)
  }
  return { imported, skipped, failed }
}

module.exports = { readManifest, downloadWithReferer, importFromManifest }
