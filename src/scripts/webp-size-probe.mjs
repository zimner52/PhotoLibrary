/*
 * 实测「尺寸 × 质量 → WebP 文件大小」。
 * 估算表只能给量级，真实数值强依赖图片内容（截图/纯色图远小于噪点多的照片），
 * 所以涉及磁盘规划时以这个脚本的输出为准。
 *
 *   npm run probe:webp -- "C:\Users\你\Downloads\一张图.jpg"
 *   npm run probe:webp -- "C:\Users\你\Downloads" 10      # 目录里采样 10 张取平均
 *
 * 当前存储规则见 backend/lib/constants.js：
 *   Ori   = **原尺寸不缩放**，quality 90   → 看下面「原始」那一行
 *   Thumb = 最长边 320，quality 75         → 看 320 那一行
 */
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const SIZES = [320, 800, 1600, 0] // 0 = 不缩放，即 Ori 现在的做法
const QUALITIES = [20, 30, 40, 50, 60, 70, 75, 80, 85, 90]
const EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.avif'])

const label = (size) => (size ? String(size) : '原始')

const target = process.argv[2]
const sampleLimit = Number(process.argv[3] || 6)

if (!target) {
  console.error('用法: node scripts/webp-size-probe.mjs <图片路径或目录> [采样张数]')
  process.exit(1)
}

const listImages = (input) => {
  const stat = fs.statSync(input)
  if (stat.isFile()) return [input]
  return fs
    .readdirSync(input)
    .map((name) => path.join(input, name))
    .filter((file) => {
      try {
        return fs.statSync(file).isFile() && EXTS.has(path.extname(file).toLowerCase())
      } catch {
        return false
      }
    })
    .slice(0, sampleLimit)
}

const files = listImages(target)
if (!files.length) {
  console.error('没找到可用的图片')
  process.exit(1)
}
console.log(`采样 ${files.length} 张，${SIZES.length} 种尺寸 × ${QUALITIES.length} 种质量\n`)

const totals = SIZES.map(() => QUALITIES.map(() => 0))

for (const file of files) {
  const input = fs.readFileSync(file)
  for (let si = 0; si < SIZES.length; si++) {
    for (let qi = 0; qi < QUALITIES.length; qi++) {
      const pipeline = sharp(input)
      const resized = SIZES[si]
        ? pipeline.resize(SIZES[si], SIZES[si], { fit: 'inside', withoutEnlargement: true })
        : pipeline // 0：不缩放，跟 Ori 的导入路径完全一致
      const buf = await resized.webp({ quality: QUALITIES[qi], effort: 6 }).toBuffer()
      totals[si][qi] += buf.length
    }
  }
  process.stdout.write('·')
}
console.log('\n')

const count = files.length
const avgKb = (bytes) => bytes / count / 1024
const cell = (kb) => (kb >= 1024 ? `${(kb / 1024).toFixed(2)}M` : `${kb.toFixed(1)}K`)
const head = 'px'.padEnd(8) + QUALITIES.map((q) => `q${q}`.padStart(9)).join('')

console.log('【单张平均大小】')
console.log(head)
for (let si = 0; si < SIZES.length; si++) {
  console.log(
    label(SIZES[si]).padEnd(8) +
      totals[si].map((total) => cell(avgKb(total)).padStart(9)).join(''),
  )
}

console.log('\n【1000 张合计】')
console.log(head)
for (let si = 0; si < SIZES.length; si++) {
  console.log(
    label(SIZES[si]).padEnd(8) +
      totals[si]
        .map((total) => `${((avgKb(total) * 1000) / 1024 / 1024).toFixed(2)}G`.padStart(9))
        .join(''),
  )
}

console.log('\n【卡片内存占用（解码后位图，与码率无关）】')
for (const size of SIZES.filter((s) => s)) {
  const px = size * Math.round(size / 1.5)
  const per = (px * 4) / 1024 / 1024
  console.log(
    `${label(size).padEnd(8)}${per.toFixed(2)}M/张 → 1000 张 ${((per * 1000) / 1024).toFixed(2)}G`,
  )
}
console.log('原始     取决于图片自身：W×H×4 字节（4000×3000 约 46M/张）')
