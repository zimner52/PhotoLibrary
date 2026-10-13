import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
// 本文件就在应用根目录（package.json 同级），Vite 的 root 取 cwd，所以
// `npm run dev:front` 必须在 src/ 里跑；产物仍是 src/dist，与 backend/main.js
// 里的 loadFile('../dist/index.html') 对上。
export default defineConfig({
  plugins: [vue()],
  base: './',
  // 静态资源统一放项目根的 assets/（原来是 src/public/）：会被【原样】复制到 dist 根，
  // 不做哈希也不压缩。注意别和 Vite 里「被 import 的 assets」混为一谈——那种会带哈希。
  publicDir: fileURLToPath(new URL('../assets', import.meta.url)),
  resolve: {
    alias: {
      // 前端源码在 frontend/（原 src/）；backend/ 不参与打包
      '@': fileURLToPath(new URL('./frontend', import.meta.url)),
    },
  },
})
