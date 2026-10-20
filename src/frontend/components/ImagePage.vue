<script setup>
import { computed, onMounted } from 'vue'
import DetailPanel from '@/components/DetailPanel.vue'
import ImageCard from '@/components/ImageCard.vue'
import WatchSettings from '@/components/WatchSettings.vue'
import { useLibrary } from '@/composables/useLibrary'

const {
  images,
  loading,
  folderFilter,
  selectedTag,
  selectedId,
  selectedItem,
  visibleImages,
  stats,
  load,
  loadFolders,
  loadRoot,
  exporting,
  importManifest,
  downloadProgress,
  subscribe,
  openDetail,
} = useLibrary()

const emit = defineEmits(['handleExport'])


const heading = computed(() => {
  if (selectedTag.value) {
    return {
      title: `标签：${selectedTag.value}`,
      sub: `共 ${visibleImages.value.length} 张带此标签的图片`,
    }
  }
  if (folderFilter.value === '__none__') {
    return { title: '未分类', sub: `${visibleImages.value.length} 张还没有归入文件夹` }
  }
  if (folderFilter.value !== 'all') {
    return { title: folderFilter.value, sub: `文件夹内共 ${visibleImages.value.length} 张图片` }
  }
  return { title: '全部图片', sub: `图库共 ${stats.value.total} 张图片` }
})

const emptyTitle = computed(() => {
  if (!images.value.length) return '图库还是空的'
  if (selectedTag.value) return '该标签下暂无图片'
  if (folderFilter.value === '__none__') return '没有未分类的图片'
  if (folderFilter.value !== 'all') return '该文件夹下暂无图片'
  return '没有匹配的图片'
})

// （避免同一批数据被读两遍；取消选择 / 全部导入失败时不会推送）
const handleAdd = () => window.electronAPI.addImages()

const handleExport = () => emit('handleExport', true)

/* ------------------------------ 下载图片 ------------------------------ */

const handleDownload = async () => {
  if (downloadProgress.value) return

  try {
    const res = await importManifest()
    if (res.canceled) return
    if (!res.ok) {
      window.alert(res.error)
      return
    }

    const names = (list, key) =>
      list
        .slice(0, 3)
        .map((entry) => (key ? `${entry.name}（${entry[key]}）` : entry.name))
        .join('、') + (list.length > 3 ? ' 等' : '')

    const lines = [`成功 ${res.imported} 张`]
    if (res.skipped.length) lines.push(`跳过 ${res.skipped.length} 张：${names(res.skipped, 'reason')}`)
    if (res.failed.length) lines.push(`失败 ${res.failed.length} 张：${names(res.failed, 'error')}`)
    window.alert(lines.join('\n'))
  } finally {
    downloadProgress.value = null
  }
}

/* ------------------------------ 背景装饰 ------------------------------ */
/* 右下角的咖啡杯：垫在内容之下（z-index: 0）、不吃点击 */

// assets/ 是 Vite 的 publicDir（见 vite.config.js），构建后原样落在 dist/ 根下。
// 用 BASE_URL 拼：dev 下是 './'（相对站点根）、打包后仍是 './'（相对 index.html），两种都对。
const coffeeSrc = `${import.meta.env.BASE_URL}background/咖啡.png`

onMounted(() => {
  load()
  loadFolders()
  loadRoot()
  subscribe() // 下载目录自动导入后刷新画廊
})
</script>

<template>
  <main class="content">
    <img class="coffee" :src="coffeeSrc" alt="" aria-hidden="true" />

    <header class="head">
      <div class="head-text">
        <h1 class="title">{{ heading.title }}</h1>
        <p class="sub">{{ heading.sub }}</p>
      </div>
      <div class="head-actions">
        <button class="btn-ghost" :disabled="!!downloadProgress" @click="handleDownload">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M12 3v12" />
            <path d="m7 11 5 5 5-5" />
            <path d="M4 20h16" />
          </svg>
          <template v-if="downloadProgress">
            下载中 {{ downloadProgress.index }}/{{ downloadProgress.total }}
          </template>
          <template v-else>下载图片</template>
        </button>

        <button class="btn-ghost" :disabled="exporting" @click="handleExport">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path
              d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"
            />
            <path d="M3.3 7 12 12l8.7-5" />
            <path d="M12 22V12" />
          </svg>
          {{ exporting ? '打包中…' : '打包图片' }}
        </button>

        <button class="btn-primary" @click="handleAdd">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          添加图片
        </button>
      </div>
    </header>

    <WatchSettings class="settings-layer" />

    <div class="scroll">
      <div v-if="visibleImages.length" class="grid">
        <ImageCard
          v-for="item in visibleImages"
          :key="item.id"
          :item="item"
          :active="item.id === selectedId"
          @open="openDetail"
        />
      </div>

      <div v-else-if="loading" class="grid">
        <div v-for="n in 8" :key="n" class="skeleton"></div>
      </div>

      <div v-else class="empty">
        <span class="empty-icon">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="4.5" />
            <circle cx="8.5" cy="8.5" r="1.6" />
            <path d="M21 15.5 16.5 11 5 21" />
          </svg>
        </span>
        <p class="empty-title">{{ emptyTitle }}</p>
        <p class="empty-sub">
          {{
            images.length
              ? '换个文件夹或标签看看，或再添加一些图片。'
              : '点右上角「添加图片」手动选择，或直接用浏览器下载一张图片——会自动出现在这里。'
          }}
        </p>
      </div>
    </div>

    <!-- 右侧详情抽屉 -->
    <Transition name="drawer">
      <DetailPanel v-if="selectedItem" />
    </Transition>
  </main>
</template>

<style scoped>
.content {
  position: relative; /* 详情抽屉的定位参照 */
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  padding: 22px 26px 0;
  /* 纯色浅米底（试过「横格纸」底，线条太抢眼，撤掉了） */
  background-color: #f8f5ef;
}

/* 内容的三块抬到装饰层（咖啡杯）之上；详情抽屉自己的 z-index: 5 仍然最高 */
.head,
.scroll,
.settings-layer {
  position: relative;
  z-index: 1;
}
.coffee {
  position: absolute;
  right: 20px;
  bottom: 0;
  z-index: 0;
  width: 200px;
  height: auto;
  opacity: 0.22; /* 当水印用；想让杯子更明显就往 0.5、1 调 */
  /* 图标是白底的话，正片叠底会把白底吃掉、只留深灰与金色，不会出现一个白方块；
     本来就是透明底也无副作用 */
  mix-blend-mode: multiply;
  pointer-events: none; /* 只是装饰，不挡点击 */
  user-select: none;
}
.head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}
.title {
  font-size: 23px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: #1f1d1b;
}
.sub {
  margin-top: 4px;
  font-size: 12.5px;
  color: #8a827a;
}
.head-actions {
  display: flex;
  flex-shrink: 0;
  gap: 10px;
  align-items: center;
}
.btn-ghost {
  display: inline-flex;
  flex-shrink: 0;
  gap: 7px;
  align-items: center;
  padding: 10px 18px;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.06em;
  color: #3a3733;
  background: #fff;
  border: 1px solid #dfd7d0;
  border-radius: 999px;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s;
}
.btn-ghost:hover:not(:disabled) {
  color: #1f1d1b;
  background: #f4f0ec;
  border-color: #cfc5bd;
}
.btn-ghost:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
.btn-ghost svg {
  width: 14px;
  height: 14px;
}
.btn-primary {
  display: inline-flex;
  flex-shrink: 0;
  gap: 7px;
  align-items: center;
  padding: 10px 20px;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.06em;
  color: #fff;
  background: #1f1d1b; /* 深灰胶囊按钮 */
  border: none;
  border-radius: 999px;
  box-shadow: 0 6px 18px rgba(31, 29, 27, 0.22);
  cursor: pointer;
  transition:
    transform 0.15s,
    background 0.15s,
    box-shadow 0.15s;
}
.btn-primary:hover {
  background: #33302c;
  transform: translateY(-1px);
  box-shadow: 0 10px 24px rgba(31, 29, 27, 0.26);
}
.btn-primary:active {
  transform: translateY(0);
}
.btn-primary svg {
  width: 14px;
  height: 14px;
}
.scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-bottom: 24px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); /* 竖版缩略图 → 列宽收窄 */
  align-content: start;
  gap: 16px;
}
.skeleton {
  aspect-ratio: 9 / 16; /* 与卡片缩略图保持一致 */
  background: linear-gradient(90deg, #d5ccc6 25%, #e4ddd7 37%, #d5ccc6 63%);
  background-size: 400% 100%;
  border-radius: 12px;
  animation: shimmer 1.4s ease infinite;
}
@keyframes shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: 0 0;
  }
}
.empty {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  justify-content: center;
  padding: 70px 0;
  text-align: center;
}
.empty-icon {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  margin-bottom: 8px;
  color: #a89f96;
  background: #fff;
  border: 1px solid rgba(31, 29, 27, 0.07);
  border-radius: 20px;
  box-shadow: 0 10px 22px rgba(31, 29, 27, 0.1);
}
.empty-icon svg {
  width: 30px;
  height: 30px;
}
.empty-title {
  font-size: 15px;
  font-weight: 600;
  color: #2a2724;
}
.empty-sub {
  max-width: 380px;
  font-size: 12.5px;
  line-height: 1.8;
  color: #8a827a;
}
/* 详情抽屉滑入 / 滑出 */
.drawer-enter-active,
.drawer-leave-active {
  transition:
    transform 0.24s ease,
    opacity 0.24s ease;
}
.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
  transform: translateX(104%);
}
</style>
