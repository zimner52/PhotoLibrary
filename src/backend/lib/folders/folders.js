/*
 * 用户文件夹。
 * 文件夹是磁盘上的真实目录：清单直接读 Ori/ 的子目录，Thumb/ 下保持同名镜像。
 */
const fs = require('fs')
const path = require('path')
const { readConfig, writeConfig } = require('../config')
const { oriDir, folderPath, thumbFolderPath, ensureImagesRoot } = require('./img-folders')

const INVALID_FOLDER_CHARS = /[\\/:*?"<>|]/

const normalizeFolderName = (name) => String(name ?? '').trim().slice(0, 40)

// 校验并返回安全的文件夹名；不合法时返回 { error }
const validateFolderName = (name) => {
  const folder = normalizeFolderName(name)
  if (!folder) return { error: '文件夹名不能为空' }
  if (INVALID_FOLDER_CHARS.test(folder)) return { error: '名称不能包含 \\ / : * ? " < > |' }
  if (folder === '.' || folder === '..') return { error: '名称不合法' }
  if (/[. ]$/.test(folder)) return { error: '名称不能以点或空格结尾' }
  return { folder }
}

// 文件夹清单 = Ori 下的子目录
const readFolders = () => {
  // 兼容更早的版本：文件夹名曾存在 config.json 的 folders 字段里
  const legacy = readConfig().folders
  if (Array.isArray(legacy) && legacy.length) {
    for (const name of legacy) {
      const checked = validateFolderName(name)
      if (checked.error) continue
      fs.mkdirSync(folderPath(checked.folder), { recursive: true })
      fs.mkdirSync(thumbFolderPath(checked.folder), { recursive: true })
    }
    writeConfig({ folders: [] })
  }

  ensureImagesRoot()
  return fs
    .readdirSync(oriDir(), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'zh'))
}

// 按名字找文件夹（Windows 文件系统不区分大小写）
const findFolder = (name) => {
  const target = normalizeFolderName(name).toLowerCase()
  if (!target) return ''
  return readFolders().find((folder) => folder.toLowerCase() === target) ?? ''
}

module.exports = { normalizeFolderName, validateFolderName, readFolders, findFolder }
