<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { useLibrary } from '@/composables/useLibrary'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:modelValue', 'confirm'])

// 左侧插图。assets/ 是 Vite 的 publicDir，构建后原样落在 dist/ 根下；
// 用 BASE_URL 拼：dev 下是 './'，打包后仍是相对 index.html 的 './'，两种都对。
const artSrc = `${import.meta.env.BASE_URL}background/bg2.png`

const { folders, folderCounts, folderFilter } = useLibrary()

// 可勾选项：各文件夹 + 「未分类」。'' 与 db 里的 item.folder 约定一致
const options = computed(() => [
  { name: '', label: '未分类', count: folderCounts.value.none },
  ...folders.value.map((name) => ({ name, label: name, count: folderCounts.value[name] ?? 0 })),
])

const selected = ref([]) // 选中的文件夹名，'' 表示未分类

const isChecked = (name) => selected.value.includes(name)

const toggle = (name) => {
  const index = selected.value.indexOf(name)
  if (index >= 0) selected.value.splice(index, 1)
  else selected.value.push(name)
}

const allChecked = computed(
  () => options.value.length > 0 && selected.value.length === options.value.length,
)

const toggleAll = () => {
  selected.value = allChecked.value ? [] : options.value.map((option) => option.name)
}

// 已选中的图片总数
const selectedTotal = computed(() =>
  options.value.reduce((sum, option) => (isChecked(option.name) ? sum + option.count : sum), 0),
)

// 打开时按侧边栏当前的筛选预勾；已经不存在的文件夹会被过滤掉
const prefill = () => {
  const names = options.value.map((option) => option.name)
  if (folderFilter.value === 'all') return names
  if (folderFilter.value === '__none__') return ['']
  return folderFilter.value && names.includes(folderFilter.value) ? [folderFilter.value] : names
}

const close = () => emit('update:modelValue', false)

const confirm = () => {
  if (!selected.value.length) return
  emit('confirm', [...selected.value])
}

const onKeydown = (event) => {
  if (event.key === 'Escape') close()
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      selected.value = prefill()
      window.addEventListener('keydown', onKeydown)
    } else {
      window.removeEventListener('keydown', onKeydown)
    }
  },
)

onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="modelValue" class="overlay" @click.self="close">
        <div class="dialog" role="dialog" aria-modal="true" aria-label="打包图片">
          <!-- 插图：绝对定位在面板左下角，沉底 -->
          <img class="art-image" :src="artSrc" alt="" aria-hidden="true" />

          <!-- 文件夹选区 -->
          <section class="main">
            <header class="head">
              <h2 class="title">打包</h2>
              <p class="subtitle">打包图片 · 选择要放进压缩包的文件夹</p>
            </header>

            <div class="section-bar">
              <div class="section-label">
                <span class="en">Folders</span>
                <span class="cn">文件夹</span>
              </div>
              <button class="link" @click="toggleAll">
                {{ allChecked ? '取消全选' : '全选' }}
              </button>
            </div>

            <div class="columns">
              <span class="col-name">名称</span>
              <span class="col-count">张数</span>
            </div>

            <ul class="list">
              <li v-for="option in options" :key="option.name || '__none__'">
                <button
                  class="row"
                  role="checkbox"
                  :aria-checked="isChecked(option.name)"
                  :class="{ checked: isChecked(option.name) }"
                  @click="toggle(option.name)"
                >
                  <span class="box" aria-hidden="true"></span>
                  <span class="name">{{ option.label }}</span>
                  <span class="count">{{ option.count }}</span>
                </button>
              </li>
            </ul>

            <!-- ③ 操作条 -->
            <footer class="actions">
              <span class="picked">已选 {{ selected.length }} 项 · {{ selectedTotal }} 张</span>
              <button class="btn ghost" @click="close">取消</button>
              <button class="btn primary" :disabled="!selected.length" @click="confirm">
                开始打包
              </button>
            </footer>
          </section>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* 遮罩层：固定定位覆盖全屏 */
.overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(31, 29, 27, 0.3);
  backdrop-filter: blur(2px);
}

/* 面板：单栏，左侧留出一条给绝对定位的插图 */
.dialog {
  /* 插图尺寸与它占掉的高度。
     --art-gap 是插图底边离面板底部的距离，正好让开操作条；
     --art-h   是整块插图区的高度，列表的 margin-bottom 用的就是它。 */
  --art-w: clamp(110px, 30vw, 170px);
  --art-gap: 30px;
  --art-h: var(--art-w);

  position: relative;
  display: flex;
  flex-direction: column;
  width: min(660px, 92vw);
  height: min(820px, 90vh);
  overflow: hidden;
  border: 1px solid #ddd4c4;
  border-radius: 3px;
  background: #f8f5ef;
  box-shadow: 0 30px 80px rgba(31, 29, 27, 0.22);
}

/* 插图：绝对定位，贴左下角沉底。
   铅笔稿是白底，multiply 让白底直接融进面板背景，只剩线条。
   用 contain 不用 cover —— 又窄又高的位置里 cover 会把脸裁掉。 */
.art-image {
  position: absolute;
  left: 0;
  bottom: var(--art-gap);
  z-index: 0;
  width: var(--art-w);
  max-height: 100%;
  object-fit: contain;
  object-position: bottom center;
  mix-blend-mode: multiply;
  transform: rotate(20deg);
  transform-origin: bottom center;
  pointer-events: none;
  user-select: none;
}

/* 内容压在插图之上 */
.main {
  position: relative;
  z-index: 1;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.head {
  padding: 34px 30px 0;
}

.title {
  margin: 0;
  font-size: 40px;
  font-weight: 600;
  text-align: center;
  line-height: 1;
  letter-spacing: -0.035em;
  color: #1f1d1b;
}

.subtitle {
  margin: 10px 0 0;
  font-size: 12.5px;
  letter-spacing: 0.02em;
  text-align: center;
  color: #8a8074;
}

/* 分区标题 */
.section-bar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin: 26px 30px 0;
  padding-bottom: 10px;
  border-bottom: 1px solid #1f1d1b;
}

.section-label .en {
  display: block;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #1f1d1b;
}

.section-label .cn {
  display: block;
  margin-top: 3px;
  font-size: 12px;
  letter-spacing: 0.1em;
  color: #8a8074;
}

.link {
  padding: 0 0 2px;
  border: 0;
  border-bottom: 1px solid transparent;
  background: none;
  font-size: 12px;
  letter-spacing: 0.06em;
  color: #a06a3c;
  cursor: pointer;
}

.link:hover {
  border-bottom-color: #a06a3c;
}

/* 列头：对应菜单里的 HOT / ICED */
.columns {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  padding: 12px 30px 6px;
  font-size: 10.5px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #a89e8e;
}

.columns .col-count {
  padding-right: 2px;
}

.list {
  flex: 1;
  min-height: 0;
  /* 底部让出整块插图区：列表再长也压不到图上 */
  margin: 0 0 var(--art-h);
  padding: 0 30px;
  overflow-y: auto;
  list-style: none;
}

.row {
  display: grid;
  grid-template-columns: 16px 1fr auto;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 11px 0;
  border: 0;
  border-bottom: 1px solid #eae2d5;
  background: none;
  font: inherit;
  text-align: left;
  color: #2b2723;
  cursor: pointer;
}

.row:hover {
  background: #f3eee3;
}

.row .name {
  overflow: hidden;
  font-size: 14px;
  letter-spacing: 0.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row .count {
  padding-right: 2px;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: #6b6257;
}

.row.checked .name {
  font-weight: 600;
  color: #1f1d1b;
}

.row.checked .count {
  font-weight: 600;
  color: #1f1d1b;
}

/* 自绘勾选框：原生控件太"系统"，和这套排版不搭 */
.box {
  position: relative;
  width: 15px;
  height: 15px;
  border: 1px solid #c9bfae;
  border-radius: 2px;
  background: #fffdf9;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;
}

.row.checked .box {
  border-color: #1f1d1b;
  background: #1f1d1b;
}

.row.checked .box::after {
  content: '';
  position: absolute;
  top: 1px;
  left: 4px;
  width: 5px;
  height: 9px;
  border: solid #f8f5ef;
  border-width: 0 1.5px 1.5px 0;
  transform: rotate(42deg);
}

/* ③ 操作条 */
.actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
  padding: 16px 30px 18px;
}

.picked {
  font-size: 11.5px;
  text-align: right;
  letter-spacing: 0.04em;
  color: #a89e8e;
}

.btn {
  padding: 10px 22px;
  border: 1px solid transparent;
  border-radius: 2px;
  font-size: 13px;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.btn.ghost {
  border-color: #d8cfc0;
  background: transparent;
  color: #4a443c;
}

.btn.ghost:hover {
  background: #efeae1;
}

.btn.primary {
  background: #1f1d1b;
  color: #f8f5ef;
}

.btn.primary:hover:not(:disabled) {
  background: #35302a;
}

.btn.primary:disabled {
  background: #cfc6b7;
  cursor: not-allowed;
}

/* 淡入 + 轻微上浮 */
.dialog-enter-active,
.dialog-leave-active {
  transition: opacity 0.18s ease;
}

.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}

.dialog-enter-active .dialog,
.dialog-leave-active .dialog {
  transition: transform 0.18s ease;
}

.dialog-enter-from .dialog,
.dialog-leave-to .dialog {
  transform: translateY(6px) scale(0.99);
}
</style>
