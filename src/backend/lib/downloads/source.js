/*
 * 下载来源（Mark of the Web）。
 * 获取下载图片时的HostUrl
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
