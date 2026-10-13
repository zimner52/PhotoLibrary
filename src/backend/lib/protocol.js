/*
 * gallery:// 自定义协议。
 *
 * 渲染进程只拼 URL（gallery://thumb/<id>、gallery://ori/<id>），由主进程把文件字节流
 * 交给 Chromium——于是它自己能流式读取、懒解码、回收滚出视口的位图，
 * 不必再把每张图读成 base64 塞进 JS。
 *
 * 注意：scheme 必须在 app ready 之前注册为 privileged，否则协议不生效。
 */
const fs = require('fs')
const { protocol, net } = require('electron')
const { pathToFileURL } = require('url')
const { GALLERY_SCHEME } = require('./constants')
const { getItem } = require('./db')
const { thumbPathFor } = require('./folders/img-folders')
const { writeThumb } = require('./image-config/images')

// 在 main.js 顶部（app ready 之前）调用
const registerGalleryScheme = () => {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: GALLERY_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
    },
  ])
}

// 在 app ready 之后调用
const registerGalleryProtocol = () => {
  protocol.handle(GALLERY_SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      const kind = url.hostname // thumb | ori
      const id = decodeURIComponent(url.pathname.replace(/^\//, ''))
      if (!id) return new Response('', { status: 400 })

      const item = getItem(id) // 内存索引，不读 db.json
      if (!item) return new Response('', { status: 404 })

      if (kind === 'ori') {
        if (!item.src || !fs.existsSync(item.src)) return new Response('', { status: 404 })
        return net.fetch(pathToFileURL(item.src).toString())
      }

      // 缩略图不存在就现场生成（老库迁移过来的、或 Thumb 被手动删过的）
      const thumbPath = thumbPathFor(item)
      if (!fs.existsSync(thumbPath)) {
        if (!item.src || !fs.existsSync(item.src)) return new Response('', { status: 404 })
        await writeThumb(item.src, thumbPath)
      }
      return net.fetch(pathToFileURL(thumbPath).toString())
    } catch (err) {
      console.error('[protocol] 请求失败:', request.url, err.message)
      return new Response('', { status: 500 })
    }
  })
}

module.exports = { registerGalleryScheme, registerGalleryProtocol }
