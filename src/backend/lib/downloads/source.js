/*
 * 下载来源（Mark of the Web）。
 *
 * Windows 给网络下载的文件挂了一个 NTFS 备用数据流 Zone.Identifier，形如：
 *   [ZoneTransfer]
 *   ZoneId=3
 *   ReferrerUrl=https://example.com/page
 *   HostUrl=https://cdn.example.com/photo.jpg      ← 文件真实下载地址
 * 只有 Chromium 系浏览器会写，Firefox 默认不写；非 NTFS 磁盘 / 手动「解除锁定」也会丢。
 *
 * 这里是**叶子模块**：只负责把那个流读出来，不写库、不通知界面。
 * 拿到来源之后怎么用，分在别处：
 *   · 延迟补抓  → downloads/watcher.js（导入时没抓到就隔几个时间点再试）
 *   · 启动回填  → main.js（给「缺来源、原文件还在」的旧记录补一次）
 *
 * ⚠️ 依赖方向：image-config/images.js 和 downloads/watcher.js 都 require 这里，
 * 所以本文件**只能** require 内置模块。一旦它去 require 依赖 images.js 的模块，
 * 就会出现 images.js → 本文件 → images.js 的环。
 */
const fs = require('fs')
const { execFile } = require('child_process')

const runPowerShell = (args) =>
  new Promise((resolve) => {
    execFile('powershell.exe', args, { windowsHide: true, timeout: 5000 }, (err, stdout) =>
      resolve(err ? '' : String(stdout || '')),
    )
  })

const readZoneByShell = async (filePath) => {
  const quoted = `'${String(filePath).replace(/'/g, "''")}'`
  return runPowerShell([
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-Content -LiteralPath ${quoted} -Stream Zone.Identifier -Raw -ErrorAction SilentlyContinue`,
  ])
}

// null = 还没探测过；true = Node 读不到 ADS，之后一律走 PowerShell
let zoneStreamNeedsShell = null

const readZoneStream = async (filePath) => {
  const readDirect = () => {
    const buffer = fs.readFileSync(`${filePath}:Zone.Identifier`)
    if (!buffer.length) return ''
    // 可能是 UTF-16LE（带 BOM）或 UTF-8 / ANSI
    return buffer[0] === 0xff && buffer[1] === 0xfe
      ? buffer.toString('utf16le')
      : buffer.toString('utf8')
  }

  if (zoneStreamNeedsShell !== true) {
    try {
      const text = readDirect()
      if (text.trim()) zoneStreamNeedsShell = false
      return text
    } catch (err) {
      if (err.code !== 'ENOENT') {
        zoneStreamNeedsShell = true // 路径语法不被支持，改用 PowerShell
      } else if (zoneStreamNeedsShell === null) {
        // 第一次碰到 ENOENT：用 PowerShell 复核一次，判断是「真没有流」还是「Node 读不到流」
        const shellText = await readZoneByShell(filePath)
        zoneStreamNeedsShell = shellText.trim() ? true : false
        return shellText
      } else {
        return ''
      }
    }
  }

  return readZoneByShell(filePath)
}

const parseZoneInfo = (text) => {
  const info = {}
  for (const line of String(text).split(/\r?\n/)) {
    const index = line.indexOf('=')
    if (index <= 0) continue
    const key = line.slice(0, index).trim()
    if (key) info[key] = line.slice(index + 1).trim()
  }
  return info
}

// 读取来源信息（只读一次，读不到就交给 watcher 的 scheduleSourceRetry 去补）
const readSourceInfo = async (filePath) => {
  if (process.platform !== 'win32') return {}
  if (!filePath || !fs.existsSync(filePath)) return {} // 原文件可能已被清理

  const text = await readZoneStream(filePath)
  if (!text.trim()) return {}

  const info = parseZoneInfo(text)
  return {
    sourceUrl: info.HostUrl || '', // 文件真实下载地址
    referrerUrl: info.ReferrerUrl || '', // 来源页面
    zoneId: info.ZoneId || '',
  }
}

module.exports = { readSourceInfo }
