<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useLibrary } from '@/composables/useLibrary'

const {
  selectedItem,
  closeDetail,
  updateTags,
  folders,
  createFolder,
  setFolder,
  removeImage,
  oriUrl,
} = useLibrary()

const adding = ref(false)
const draft = ref('')
const inputRef = ref(null)

const deleting = ref(false)
const previewFailed = ref(false) // 大图取不到时的占位

const picking = ref(false)
const creatingFolder = ref(false)
const newFolderName = ref('')
const newFolderInput = ref(null)
const setNewFolderRef = (el) => (newFolderInput.value = el)

const tags = computed(() => selectedItem.value?.tags ?? [])
const folderLabel = computed(() => selectedItem.value?.folder || '未分类')

const importedAt = computed(() => {
  const ts = selectedItem.value?.importedAt
  if (!ts) return '入库时间未知'
  return `入库于 ${new Date(ts).toLocaleString('zh-CN', { hour12: false })}`
})

// 下载来源
const sourceHost = computed(() => {
  const url = selectedItem.value?.sourceUrl
  if (!url) return ''
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
})

const noSourceHint =
  '无法获取下载链接'

const openSource = () => {
  const url = selectedItem.value?.sourceUrl
  if (url) window.electronAPI.openExternal(url)
}

// 换一张图时收起所有输入，并重置大图的失败状态
watch(selectedItem, () => {
  adding.value = false
  draft.value = ''
  picking.value = false
  creatingFolder.value = false
  newFolderName.value = ''
  previewFailed.value = false
})

/* -------------------------------- 标签 -------------------------------- */

// 支持空格 / 逗号 / 顿号分隔的连续输入
const parseTags = (text) =>
  text
    .split(/[\s,，、]+/)
    .map((name) => name.trim().slice(0, 20))
    .filter(Boolean)

const toggleAdding = async () => {
  adding.value = !adding.value
  if (adding.value) {
    await nextTick()
    inputRef.value?.focus()
  }
}

// 提交tag
const commitTag = async () => {
  if (!selectedItem.value) return
  const names = parseTags(draft.value)
  if (!names.length) return

  const next = [...tags.value]
  for (const name of names) if (!next.includes(name)) next.push(name)
  if (next.length !== tags.value.length) await updateTags(selectedItem.value.id, next)

  draft.value = ''
  await nextTick()
  inputRef.value?.focus()
}

const removeTag = async (name) => {
  if (!selectedItem.value) return
  await updateTags(
    selectedItem.value.id,
    tags.value.filter((tag) => tag !== name),
  )
}

/* ------------------------------ 所属文件夹 ------------------------------ */

const togglePicker = () => {
  picking.value = !picking.value
  if (!picking.value) creatingFolder.value = false
}

const pick = async (folder) => {
  if (!selectedItem.value) return
  await setFolder(selectedItem.value.id, folder)
  picking.value = false
  creatingFolder.value = false
}

const startNewFolder = async () => {
  creatingFolder.value = true
  await nextTick()
  newFolderInput.value?.focus()
}

const cancelNewFolder = () => {
  newFolderName.value = '' // 先清空，避免随后的 blur 又提交一次
  creatingFolder.value = false
}

const confirmNewFolder = async () => {
  const name = newFolderName.value.trim()
  if (!name || !selectedItem.value) {
    creatingFolder.value = false
    return
  }
  const res = await createFolder(name)
  if (!res.ok) {
    window.alert(res.error)
    return
  }
  await setFolder(selectedItem.value.id, name)
  newFolderName.value = ''
  creatingFolder.value = false
  picking.value = false
}

/* ------------------------------ 查看原图 ------------------------------ */

const openOriginal = async () => {
  const item = selectedItem.value
  if (!item) return
  const err = await window.electronAPI.openImage({ src: item.src })
  if (err) window.alert(`打开失败：${err}`)
}

/* -------------------------------- 删除 -------------------------------- */

const handleDelete = async () => {
  const item = selectedItem.value
  if (!item || deleting.value) return

  const ok = await window.electronAPI.confirm({
    title: '删除图片',
    message: `确定要删除「${item.name}」吗？`,
    confirmText: '删除',
    type: 'warning',
  })
  if (!ok) return

  deleting.value = true
  try {
    const res = await removeImage(item.id)
    if (!res.ok) window.alert(res.error)
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <aside class="panel">
    <header class="head">
      <span class="head-title">图片详情</span>
      <button class="close" title="关闭" @click="closeDetail">✕</button>
    </header>

    <div class="body">
      <div class="preview">
        <img
          v-if="!previewFailed"
          :src="oriUrl(selectedItem.id)"
          :alt="selectedItem.name"
          decoding="async"
          @error="previewFailed = true"
        />
        <span v-else class="preview-broken">图片不可用</span>
      </div>

      <h2 class="name selectable" :title="selectedItem.name">{{ selectedItem.name }}</h2>
      <p class="time">{{ importedAt }}</p>

      <p class="source">
        <span class="source-label">来源</span>
        <template v-if="selectedItem.sourceUrl">
          <span class="source-host selectable" :title="selectedItem.sourceUrl">{{ sourceHost }}</span>
          <button class="link-btn" @click="openSource">打开</button>
        </template>
        <span v-else class="source-none" :title="noSourceHint">未记录</span>
      </p>

      <section class="field">
        <div class="field-head">
          <span class="field-title">所属文件夹</span>
          <button class="add-toggle" @click="togglePicker">
            {{ picking ? '收起' : '添加到…' }}
          </button>
        </div>

        <div class="field-row">
          <span class="folder-chip" :class="{ none: !selectedItem.folder }">{{ folderLabel }}</span>
        </div>

        <div v-if="picking" class="folder-picker">
          <button class="folder-option" :class="{ active: !selectedItem.folder }" @click="pick('')">
            未分类
          </button>
          <button
            v-for="folder in folders"
            :key="folder"
            class="folder-option"
            :class="{ active: selectedItem.folder === folder }"
            @click="pick(folder)"
          >
            {{ folder }}
          </button>
          <button v-if="!creatingFolder" class="folder-option new" @click="startNewFolder">
            + 新建文件夹…
          </button>
          <input
            v-else
            :ref="setNewFolderRef"
            v-model="newFolderName"
            class="folder-input"
            type="text"
            maxlength="40"
            placeholder="文件夹名，回车确认"
            @keyup.enter="confirmNewFolder"
            @keyup.esc="cancelNewFolder"
            @blur="confirmNewFolder"
          />
        </div>
      </section>

      <section class="field">
        <div class="field-head">
          <span class="field-title">标签</span>
          <button class="add-toggle" @click="toggleAdding">
            {{ adding ? '收起' : '+ 添加标签' }}
          </button>
        </div>

        <div class="tag-list">
          <span v-for="tag in tags" :key="tag" class="tag">
            <span class="tag-text">{{ tag }}</span>
            <button class="tag-remove" :title="`移除「${tag}」`" @click="removeTag(tag)">✕</button>
          </span>
          <span v-if="!tags.length && !adding" class="tag-empty">还没有标签</span>
        </div>

        <input
          v-if="adding"
          ref="inputRef"
          v-model="draft"
          class="tag-input"
          type="text"
          placeholder="空格分隔，回车确认，可连续输入"
          @keydown.enter="commitTag"
          @keyup.esc="adding = false"
        />
      </section>
    </div>

    <footer class="foot">
      <button class="btn-delete" :disabled="deleting" @click="handleDelete">
        {{ deleting ? '删除中…' : '删除' }}
      </button>
      <button class="btn-open" @click="openOriginal">点击查看原图</button>
    </footer>
  </aside>
</template>

<style scoped>
.panel {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  width: 320px;
  /* 与 TabPage 同一个色：比内容区深一档的纯色 */
  background: #efeae1;
  box-shadow: -14px 0 32px rgba(31, 29, 27, 0.12);
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px 12px;
  border-bottom: 1px solid #f2ede8;
}
.head-title {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: #1f1d1b;
}
.close {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  font-size: 12px;
  color: #8a827a;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition:
    color 0.15s,
    background 0.15s;
}
.close:hover {
  color: #1f1d1b;
  background: #f1ece7;
}
.body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 18px 18px;
}
.preview {
  display: grid;
  place-items: center;
  padding: 10px;
  /* 抽屉主体已经是 #efeae1 了，这里改用比它浅一档的 #f8f5ef（也就是内容区那个色），
     不然预览块会糊进背景里 */
  background: #f8f5ef;
  border-radius: 12px;
}
.preview img {
  display: block;
  max-width: 100%;
  max-height: 32vh;
  border-radius: 8px;
}
.preview-broken {
  padding: 40px 0;
  font-size: 12px;
  color: #8a827a;
}
.name {
  margin-top: 14px;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.5;
  color: #1f1d1b;
  word-break: break-all;
}
.time {
  margin-top: 5px;
  font-size: 11.5px;
  color: #8a827a;
}
.source {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-top: 5px;
  font-size: 11.5px;
}
.source-label {
  flex-shrink: 0;
  color: #8a827a;
}
.source-host {
  overflow: hidden;
  max-width: 158px;
  color: #3a3733;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.source-none {
  color: #8a827a;
  cursor: help;
}
.link-btn {
  flex-shrink: 0;
  padding: 0;
  font-size: 11.5px;
  color: #1f1d1b;
  background: transparent;
  border: none;
  border-bottom: 1px solid #cfc5bd;
  cursor: pointer;
  transition: border-color 0.15s;
}
.link-btn:hover {
  border-bottom-color: #1f1d1b;
}
.field {
  margin-top: 20px;
}
.field-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.field-title {
  font-size: 12.5px;
  color: #8a827a;
}
.field-row {
  margin-top: 10px;
}
.add-toggle {
  font-size: 12px;
  color: #1f1d1b;
  background: transparent;
  border: none;
  cursor: pointer;
}
.add-toggle:hover {
  text-decoration: underline;
}
.folder-chip {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  overflow: hidden;
  padding: 4px 11px;
  font-size: 12px;
  color: #fff;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: #1f1d1b;
  border-radius: 999px;
}
.folder-chip.none {
  color: #3a3733;
  background: #f1ece7;
}
.folder-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
  padding: 10px;
  background: #faf8f6;
  border: 1px solid #f0ebe6;
  border-radius: 10px;
}
.folder-option {
  max-width: 100%;
  overflow: hidden;
  padding: 4px 11px;
  font-size: 12px;
  color: #3a3733;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid #ddd5ce;
  border-radius: 999px;
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s,
    border-color 0.15s;
}
.folder-option:hover {
  color: #1f1d1b;
  background: #fff;
  border-color: #cfc5bd;
}
.folder-option.active {
  color: #fff;
  background: #1f1d1b;
  border-color: #1f1d1b;
}
.folder-option.new {
  color: #2e6b4a;
  border-style: dashed;
}
.folder-input {
  width: 100%;
  padding: 6px 10px;
  font-size: 12.5px;
  color: #1f1d1b;
  background: #fff;
  border: 1px solid #cfc5bd;
  border-radius: 8px;
  outline: none;
}
.folder-input::placeholder {
  color: #8a827a;
}
.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.tag {
  display: inline-flex;
  gap: 3px;
  align-items: center;
  padding: 3px 5px 3px 10px;
  font-size: 12px;
  color: #3a3733; /* 与侧边栏标签一致 */
  background: rgba(255, 255, 255, 0.72); /* 与侧边栏标签一致 */
  border: 1px solid #ddd5ce; /* 与侧边栏标签一致 */
  border-radius: 999px;
}
.tag-remove {
  display: grid;
  place-items: center;
  width: 15px;
  height: 15px;
  font-size: 9px;
  color: #8a827a;
  background: transparent;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition:
    color 0.15s,
    background 0.15s;
}
.tag-remove:hover {
  color: #fff;
  background: #1f1d1b;
}
.tag-empty {
  font-size: 12px;
  color: #8a827a;
}
.tag-input {
  width: 100%;
  margin-top: 10px;
  padding: 7px 10px;
  font-size: 12.5px;
  color: #1f1d1b;
  background: #f4f0ec;
  border: 1px solid #e4ddd7;
  border-radius: 8px;
  outline: none;
  transition: border-color 0.15s;
}
.tag-input::placeholder {
  color: #8a827a;
}
.tag-input:focus {
  border-color: #cfc5bd;
}
.foot {
  display: flex;
  gap: 8px;
  padding: 12px 18px 16px;
  border-top: 1px solid #f2ede8;
}
.btn-delete {
  flex-shrink: 0;
  padding: 11px 16px;
  font-size: 13px;
  font-weight: 500;
  color: #a4442f;
  background: #fff;
  border: 1px solid #e7d3cb;
  border-radius: 999px;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s;
}
.btn-delete:hover:not(:disabled) {
  color: #8c3521;
  background: #fbeee9;
  border-color: #d9b3a6;
}
.btn-delete:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
.btn-open {
  flex: 1;
  padding: 11px 16px;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.06em;
  color: #fff;
  background: #1f1d1b;
  border: none;
  border-radius: 999px;
  box-shadow: 0 6px 18px rgba(31, 29, 27, 0.22);
  cursor: pointer;
  transition:
    background 0.15s,
    box-shadow 0.15s,
    transform 0.15s;
}
.btn-open:hover {
  background: #33302c;
  transform: translateY(-1px);
  box-shadow: 0 10px 24px rgba(31, 29, 27, 0.26);
}
.btn-open:active {
  transform: translateY(0);
}
</style>
