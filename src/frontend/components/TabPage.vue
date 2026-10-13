<script setup>
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useLibrary } from '@/composables/useLibrary'

const {
  folders,
  folderFilter,
  folderCounts,
  stats,
  tagKeyword,
  selectedTag,
  allTags,
  tagOptions,
  toggleTag,
  clearTagFilter,
  createFolder,
  renameFolder,
  deleteFolder,
  imagesDir,
  changeRoot,
} = useLibrary()

/* --------------------------- 左下角的小动画 --------------------------- */

// 8 张单帧（assets/background/1.png … 8.png）。assets/ 是 Vite 的 publicDir，
// 构建后原样落在 dist/ 根下；用 BASE_URL 拼，dev 与打包（file://）两种路径都对。
const petFrames = Array.from(
  { length: 8 },
  (_, i) => `${import.meta.env.BASE_URL}background/sprite/${i + 1}.png`,
)

/* ------------------------------ 右键菜单 ------------------------------ */

const menu = ref({ open: false, x: 0, y: 0, folder: '' })

const openMenu = (event, folder = '') => {
  menu.value = { open: true, x: event.clientX, y: event.clientY, folder }
}

const closeMenu = () => {
  menu.value = { ...menu.value, open: false }
}

/* ---------------------------- 新建 / 重命名 ---------------------------- */

const creating = ref(false)
const createDraft = ref('')
const createInput = ref(null)

const renaming = ref('')
const renameDraft = ref('')
const renameInput = ref(null)

const setCreateRef = (el) => (createInput.value = el)
const setRenameRef = (el) => (renameInput.value = el)

// 输入框是条件渲染的，等 DOM 出来再聚焦
const focusInput = async (input) => {
  await nextTick()
  input.value?.focus()
  input.value?.select()
}

const startCreate = async () => {
  closeMenu()
  renaming.value = ''
  createDraft.value = ''
  creating.value = true
  await focusInput(createInput)
}

const cancelCreate = () => {
  createDraft.value = '' // 先清空，避免随后的 blur 又把它提交上去
  creating.value = false
}

const confirmCreate = async () => {
  const name = createDraft.value.trim()
  if (!name) {
    creating.value = false
    return
  }
  const res = await createFolder(name)
  if (!res.ok) {
    window.alert(res.error)
    return
  }
  creating.value = false
  createDraft.value = ''
  folderFilter.value = name // 建完直接切过去，方便马上往里放图
}

const startRename = async (name) => {
  closeMenu()
  creating.value = false
  renaming.value = name
  renameDraft.value = name
  await focusInput(renameInput)
}

const cancelRename = () => {
  renameDraft.value = ''
  renaming.value = ''
}

const confirmRename = async () => {
  const from = renaming.value
  const to = renameDraft.value.trim()
  if (!from) return
  if (!to || to === from) {
    renaming.value = ''
    return
  }
  const res = await renameFolder(from, to)
  if (!res.ok) {
    window.alert(res.error)
    return
  }
  renaming.value = ''
}

const confirmDelete = async (name) => {
  closeMenu()
  const ok = await window.electronAPI.confirm({
    title: '删除文件夹',
    message: `确定要删除文件夹「${name}」吗？`,
    detail: '里面的图片会被搬回根目录（变回「未分类」），文件本身不会被删除。',
    confirmText: '删除',
    type: 'warning',
  })
  if (!ok) return
  const res = await deleteFolder(name)
  if (!res.ok) window.alert(res.error)
}

/* ------------------------------ 保存目录 ------------------------------ */

const changingRoot = ref(false)

const openRoot = () => {
  if (imagesDir.value) window.electronAPI.openPath(imagesDir.value).catch(console.error)
}

const handleChangeRoot = async () => {
  if (changingRoot.value) return
  const ok = await window.electronAPI.confirm({
    title: '更改保存目录',
    message: '确定要更改保存目录吗？',
    detail: '会把当前目录下的所有图片和文件夹移动到新目录，并重写图库索引。',
    confirmText: '继续',
    type: 'warning',
  })
  if (!ok) return

  changingRoot.value = true
  try {
    const res = await changeRoot()
    if (!res.ok && !res.canceled) window.alert(res.error)
  } finally {
    changingRoot.value = false
  }
}

onMounted(() => document.addEventListener('click', closeMenu))
onUnmounted(() => document.removeEventListener('click', closeMenu))
</script>

<template>
  <aside class="sidebar" @contextmenu.prevent="openMenu($event)">
    <div class="brand">
      <span class="logo">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <rect x="3" y="3" width="18" height="18" rx="4.5" />
          <circle cx="8.5" cy="8.5" r="1.6" />
          <path d="M21 15.5 16.5 11 5 21" />
        </svg>
      </span>
      <span class="brand-text">
        <span class="brand-name">图片库</span>
      </span>
    </div>

    <!-- 内容区可滚动，文件夹多了也不会把侧边栏撑破 -->
    <div class="sidebar-body">
      <section class="tag-search">
        <div class="section-head">
          <span class="section-title">按标签查询</span>
          <button v-if="selectedTag" class="clear" @click="clearTagFilter">清除</button>
        </div>

        <input
          v-model="tagKeyword"
          class="tag-input"
          type="text"
          placeholder="搜索标签…"
          aria-label="按标签查询"
        />

        <div class="tag-list">
          <button
            v-for="tag in tagOptions"
            :key="tag.name"
            class="tag-chip"
            :class="{ active: selectedTag === tag.name }"
            :title="selectedTag === tag.name ? '点击取消筛选' : `筛选「${tag.name}」`"
            @click="toggleTag(tag.name)"
          >
            <span class="tag-name">{{ tag.name }}</span>
            <span class="tag-count">{{ tag.count }}</span>
          </button>
          <p v-if="!tagOptions.length" class="tag-empty">
            {{ allTags.length ? '没有匹配的标签' : '还没有标签' }}
          </p>
        </div>
      </section>

      <section class="folders">
        <div class="section-head">
          <span class="section-title">文件夹</span>
          <button
            class="section-add"
            title="新建文件夹（也可在空白处点右键）"
            @click.stop="startCreate"
          >
            +
          </button>
        </div>

        <nav class="nav">
          <button
            class="nav-item"
            :class="{ active: folderFilter === 'all' }"
            @click="folderFilter = 'all'"
          >
            <span class="nav-label">全部图片</span>
            <span class="nav-count">{{ stats.total }}</span>
          </button>

          <button
            class="nav-item"
            :class="{ active: folderFilter === '__none__' }"
            @click="folderFilter = '__none__'"
          >
            <span class="nav-label">未分类</span>
            <span class="nav-count">{{ folderCounts.none }}</span>
          </button>

          <template v-for="folder in folders" :key="folder">
            <input
              v-if="renaming === folder"
              :ref="setRenameRef"
              v-model="renameDraft"
              class="folder-input"
              type="text"
              maxlength="40"
              @keyup.enter="confirmRename"
              @keyup.esc="cancelRename"
              @blur="confirmRename"
              @click.stop
            />
            <button
              v-else
              class="nav-item"
              :class="{ active: folderFilter === folder }"
              :title="`${folder}　（右键可重命名 / 删除）`"
              @click="folderFilter = folder"
              @contextmenu.prevent.stop="openMenu($event, folder)"
            >
              <span class="nav-label">{{ folder }}</span>
              <span class="nav-count">{{ folderCounts[folder] ?? 0 }}</span>
            </button>
          </template>

          <input
            v-if="creating"
            :ref="setCreateRef"
            v-model="createDraft"
            class="folder-input"
            type="text"
            maxlength="40"
            placeholder="文件夹名，回车确认"
            @keyup.enter="confirmCreate"
            @keyup.esc="cancelCreate"
            @blur="confirmCreate"
            @click.stop
          />
        </nav>
      </section>

      <section class="root-section">
        <div class="section-head">
          <span class="section-title">保存目录</span>
          <button class="clear" @click="openRoot">打开</button>
        </div>

        <p class="root-path selectable" :title="imagesDir">{{ imagesDir || '未设置' }}</p>

        <button class="root-change" :disabled="changingRoot" @click="handleChangeRoot">
          {{ changingRoot ? '正在移动…' : '更改保存目录' }}
        </button>
      </section>
    </div>

    <!-- 像素动画：8 张单帧叠在一起，靠 CSS 依次显隐（不写 JS，也不会换图闪白） -->
    <span class="pet" aria-hidden="true">
      <img v-for="src in petFrames" :key="src" :src="src" alt="" />
    </span>


    <!-- 右键菜单 -->
    <div v-if="menu.open" class="ctx-menu" :style="{ left: menu.x + 'px', top: menu.y + 'px' }">
      <button v-if="menu.folder" class="ctx-item" @click="startRename(menu.folder)">重命名</button>
      <button v-if="menu.folder" class="ctx-item danger" @click="confirmDelete(menu.folder)">
        删除
      </button>
      <button v-else class="ctx-item" @click="startCreate">新建文件夹</button>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  width: 232px;
  padding: 20px 14px 1px;
  color: #1f1d1b;
  /* 比内容区（#f8f5ef）深一档的纯色，靠色阶差形成边界，不画线 */
  background: #efeae1;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 8px 20px;
}
.logo {
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 36px;
  height: 36px;
  color: #efeae1;
  background: #1f1d1b; /* 深灰方块，与主按钮呼应 */
  border-radius: 10px;
}
.logo svg {
  width: 20px;
  height: 20px;
}
.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}
.brand-name {
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: #1f1d1b;
}
.brand-sub {
  font-size: 10.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #8a827a;
}
.sidebar-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
}
.section-title {
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: #1f1d1b;
}
.section-add {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  font-size: 14px;
  line-height: 1;
  color: #3a3733;
  background: transparent;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s;
}
.section-add:hover {
  color: #1f1d1b;
  background: rgba(31, 29, 27, 0.08);
}
/* ---------------- 按标签查询 ---------------- */
.tag-search {
  padding-bottom: 16px;
  border-bottom: 1px solid #d8cfc7; /* 与下方文件夹区隔开 */
}
.clear {
  font-size: 11.5px;
  color: #2e6b4a;
  background: transparent;
  border: none;
  cursor: pointer;
}
.clear:hover {
  text-decoration: underline;
}
.tag-input {
  width: 100%;
  margin-top: 9px;
  padding: 7px 10px;
  font-size: 12.5px;
  color: #1f1d1b;
  background: #fff;
  border: 1px solid #d8cfc7;
  border-radius: 8px;
  outline: none;
  transition: border-color 0.15s;
}
.tag-input::placeholder {
  color: #8a827a;
}
.tag-input:focus {
  border-color: #8a827a;
}
.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 132px;
  margin-top: 10px;
  padding: 0 2px;
  overflow-y: auto;
}
.tag-chip {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  padding: 4px 9px 4px 11px;
  font-size: 12px;
  color: #3a3733;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid #ddd5ce;
  border-radius: 999px;
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s,
    border-color 0.15s;
}
.tag-chip:hover {
  color: #1f1d1b;
  background: #fff;
  border-color: #cfc5bd;
}
.tag-chip.active {
  color: #fff;
  background: #1f1d1b;
  border-color: #1f1d1b;
}
.tag-count {
  font-size: 10.5px;
  color: #8a827a;
}
.tag-chip.active .tag-count {
  color: rgba(255, 255, 255, 0.72);
}
.tag-empty {
  padding: 2px;
  font-size: 11.5px;
  color: #8a827a;
}
/* ---------------- 文件夹 ---------------- */
.folders {
  padding-top: 16px;
}
.nav {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 9px;
}
.nav-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 12px;
  font-size: 13.5px;
  color: #3a3733;
  text-align: left;
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s;
}
.nav-item:hover {
  color: #1f1d1b;
  background: rgba(31, 29, 27, 0.05);
}
.nav-item.active {
  color: #fff;
  background: #1f1d1b; /* 选中态用深灰，保住「米 + 深灰」的对撞 */
}
.nav-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.nav-count {
  flex-shrink: 0;
  min-width: 22px;
  padding: 1px 7px;
  font-size: 11.5px;
  color: #3a3733;
  text-align: center;
  background: rgba(31, 29, 27, 0.07);
  border-radius: 999px;
}
.nav-item.active .nav-count {
  color: #fff;
  background: rgba(255, 255, 255, 0.18);
}
.folder-input {
  width: 100%;
  padding: 7px 10px;
  font-size: 13px;
  color: #1f1d1b;
  background: #fff;
  border: 1px solid #cfc5bd;
  border-radius: 8px;
  outline: none;
}
.folder-input::placeholder {
  color: #8a827a;
}
/* ---------------- 保存目录 ---------------- */
.root-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #d8cfc7;
}
.root-path {
  overflow: hidden;
  margin-top: 9px;
  padding: 6px 10px;
  font-family: Consolas, Menlo, monospace;
  font-size: 11px;
  line-height: 1.5;
  color: #3a3733;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid #ddd5ce;
  border-radius: 8px;
}
.root-change {
  width: 100%;
  margin-top: 8px;
  padding: 7px 12px;
  font-size: 12.5px;
  color: #3a3733;
  background: #fff;
  border: 1px solid #dfd7d0;
  border-radius: 8px;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s;
}
.root-change:hover:not(:disabled) {
  color: #1f1d1b;
  background: #f4f0ec;
  border-color: #cfc5bd;
}
.root-change:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
/* ---------------- 右键菜单 ---------------- */
.ctx-menu {
  position: fixed;
  z-index: 50;
  min-width: 132px;
  padding: 4px;
  background: #fff;
  border: 1px solid #e4ddd7;
  border-radius: 9px;
  box-shadow: 0 12px 28px rgba(31, 29, 27, 0.18);
}
.ctx-item {
  display: block;
  width: 100%;
  padding: 7px 12px;
  font-size: 12.5px;
  color: #3a3733;
  text-align: left;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
.ctx-item:hover {
  background: #f1ece7;
}
.ctx-item.danger {
  color: #a4442f;
}
.ctx-item.danger:hover {
  background: #fbeee9;
}
/* 8 张单帧（assets/background/1.png … 8.png，每张 184×232）叠在一起，
   靠「每张只亮 1/8 时间」的 opacity 动画轮流显示：
   · 每张的可见窗口 = 2.4s / 8 = 0.3s，用负的 animation-delay 依次错开
   · steps(1, end) 让它在自己那一格里「保持不动再跳」，而不是淡入淡出
   这比定时换 <img src> 稳：8 张一次性加载，切换时不会闪白。 */
.pet {
  --pet-w: 131px; /* 显示宽度（用在 width 这种长写属性里，安全） */

  position: relative;
  display: block;
  flex-shrink: 0;
  width: var(--pet-w);
  aspect-ratio: 184 / 232; /* 原图一帧的比例，高度自动跟着宽度走 */
  margin: 14px auto 0;
}
.pet img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  /* contain + 底对齐：万一某帧尺寸差一两像素也不会被拉伸，坐着的人物也能对齐脚下 */
  object-fit: contain;
  object-position: center bottom;
  opacity: 0;
  /* 131 / 184 不是整数倍，最近邻会把像素抽花，所以这里用平滑缩放。
     想「像素点绝对锐利」就把 --pet-w 改成 184（1:1）或 92（正好一半），
     再把下面这行换成 pixelated */
  image-rendering: auto;
  /* 时长/函数一律写字面量：var() 放进 animation 这种简写属性，一旦解析不出来
     整条声明都会作废（invalid at computed-value time），动画直接没了 */
  animation: pet-show 2.4s steps(1, end) infinite;
}
/* 8 帧各错开 0.3s（= 2.4s / 8），负延迟让第 1 帧从 0 秒就开始。 */
.pet img:nth-child(1) {
  animation-delay: 0s;
}
.pet img:nth-child(2) {
  animation-delay: -0.3s;
}
.pet img:nth-child(3) {
  animation-delay: -0.6s;
}
.pet img:nth-child(4) {
  animation-delay: -0.9s;
}
.pet img:nth-child(5) {
  animation-delay: -1.2s;
}
.pet img:nth-child(6) {
  animation-delay: -1.5s;
}
.pet img:nth-child(7) {
  animation-delay: -1.8s;
}
.pet img:nth-child(8) {
  animation-delay: -2.1s;
}

@keyframes pet-show {
  0% {
    opacity: 1;
  }
  12.5% {
    opacity: 0;
  }
  100% {
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  /* 不动的时候就只留第一帧 */
  .pet img {
    animation: none;
  }
  .pet img:not(:first-child) {
    display: none;
  }
  .pet img:first-child {
    opacity: 1;
  }
}
</style>
