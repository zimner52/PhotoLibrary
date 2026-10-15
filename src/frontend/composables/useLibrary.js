import { computed, ref } from 'vue'

/**
 * 图库共享状态。
 * 模块级 ref 天然是单例，侧边栏、画廊、详情面板各自 import 后拿到同一份数据，无需引入 Pinia。
 */

const images = ref([]) // 全部图片（含 tags、folder）
const folders = ref([]) // 文件夹名称列表（读自 Ori 下的子目录）
const loading = ref(true) // 首次进入时先显示骨架屏
const folderFilter = ref('all') // 'all' | '__none__'（未分类） | 文件夹名
const tagKeyword = ref('') // 标签搜索框内容
const selectedTag = ref('') // 已选中的标签（空字符串 = 不按标签筛选）
const selectedId = ref(null) // 详情面板当前展示的图片 id

let unsubscribe = null

// 图片由主进程的 gallery:// 协议提供，这里只拼 URL：
// 交给 Chromium 自己流式读取、懒解码、回收离屏位图，不再把 base64 塞进 JS。
const galleryUrl = (kind, id) => `gallery://${kind}/${encodeURIComponent(id)}`
const thumbUrl = (id) => galleryUrl('thumb', id) // 240px 缩略图，列表用
const oriUrl = (id) => galleryUrl('ori', id) // 800px 大图，详情面板用

// 兼容旧的单标签字段：tag: 'x' → tags: ['x']
const normalizeTags = (item) => {
  if (Array.isArray(item.tags)) return item.tags
  return item.tag ? [item.tag] : []
}

// 只拉元数据，不碰图片文件
const load = async () => {
  loading.value = true
  try {
    const list = await window.electronAPI.getImageList()
    images.value = list.map((item) => ({
      ...item,
      tags: normalizeTags(item),
      folder: typeof item.folder === 'string' ? item.folder : '',
    }))
  } finally {
    loading.value = false
  }
}

const loadFolders = async () => {
  folders.value = await window.electronAPI.getFolders()
}

// 批量下载的进度：{ index, total, name, phase }，没有任务时为 null
const downloadProgress = ref(null)

// 订阅主进程的推送
const subscribe = () => {
  if (unsubscribe) return  // 防重复监听
  unsubscribe = window.electronAPI.onImagesUpdated(() => load())

  window.electronAPI.onImageSourceUpdated((payload) => {
    const target = images.value.find((item) => item.id === payload.id)
    if (!target) return
    target.sourceUrl = payload.sourceUrl
    target.referrerUrl = payload.referrerUrl
  })

  // 批量下载进度 → 只更新按钮上的文字，不重载列表
  window.electronAPI.onDownloadProgress((payload) => {
    downloadProgress.value = payload
  })
}

const visibleImages = computed(() => {
  let list = images.value
  if (folderFilter.value === '__none__') list = list.filter((item) => !item.folder)
  else if (folderFilter.value !== 'all') list = list.filter((item) => item.folder === folderFilter.value)
  if (selectedTag.value) list = list.filter((item) => item.tags.includes(selectedTag.value))
  return list
})

const stats = computed(() => ({ total: images.value.length }))

// 每个文件夹的图片数量（'none' = 未分类）
const folderCounts = computed(() => {
  const counts = { none: 0 }
  for (const name of folders.value) counts[name] = 0
  for (const item of images.value) {
    if (item.folder) counts[item.folder] = (counts[item.folder] ?? 0) + 1
    else counts.none += 1
  }
  return counts
})

// 全量标签（带使用次数）
const allTags = computed(() => {
  const counter = new Map()
  for (const item of images.value) {
    for (const name of item.tags) counter.set(name, (counter.get(name) ?? 0) + 1)
  }
  return [...counter.entries()].map(([name, count]) => ({ name, count }))
})

// 搜索框过滤后的标签列表
const tagOptions = computed(() => {
  const keyword = tagKeyword.value.trim().toLowerCase()
  if (!keyword) return allTags.value
  return allTags.value.filter((tag) => tag.name.toLowerCase().includes(keyword))
})

const toggleTag = (name) => {
  selectedTag.value = selectedTag.value === name ? '' : name
}

const clearTagFilter = () => {
  selectedTag.value = ''
}

// ---------------- 文件夹 ----------------

const createFolder = async (name) => {
  const res = await window.electronAPI.createFolder(name)
  if (res.ok) folders.value = res.folders
  return res
}

const renameFolder = async (from, to) => {
  const res = await window.electronAPI.renameFolder({ from, to })
  if (res.ok) {
    folders.value = res.folders
    if (folderFilter.value === from) folderFilter.value = to
    await load()
  }
  return res
}

const deleteFolder = async (name) => {
  const res = await window.electronAPI.deleteFolder(name)
  if (res.folders) folders.value = res.folders
  if (res.ok && folderFilter.value === name) folderFilter.value = 'all'
  await load()
  return res
}

// 把图片归入文件夹（空字符串 = 未分类）
const setFolder = async (id, folder) => {
  await window.electronAPI.setImageFolder({ id, folder })
  await load()
}

// ---------------- 保存目录 / 打包 ----------------

const imagesDir = ref('') // 当前图库根目录

const loadRoot = async () => {
  imagesDir.value = await window.electronAPI.getImageRoot()
}

// 换根目录
const changeRoot = async () => {
  const res = await window.electronAPI.changeImageRoot()
  if (res.imagesDir) imagesDir.value = res.imagesDir
  if (res.ok) await Promise.all([load(), loadFolders()])
  return res
}

const exportZip = () => window.electronAPI.exportZip()

// ---------------- 详情面板 ----------------

// 按照id查询图片
const selectedItem = computed(
  () => images.value.find((item) => item.id === selectedId.value) ?? null,
)

const openDetail = (item) => {
  selectedId.value = item?.id ?? null
}

const closeDetail = () => {
  selectedId.value = null
}

// 保存标签
const updateTags = async (id, tags) => {
  await window.electronAPI.updateImageTags({ id, tags })
  const target = images.value.find((img) => img.id === id)
  if (target) target.tags = tags
}

// 删除图片
const removeImage = async (id) => {
  const res = await window.electronAPI.deleteImage(id)
  if (!res.ok) return res
  if (selectedId.value === id) closeDetail()
  await load()
  return res
}

// 下载图片：选一个「图片库索引.json」，按里面的 url + referer 批量重新下载入库
// 返回 { ok, imported?, failed?, skipped?, errors?, canceled?, error? }
const importManifest = () => window.electronAPI.importManifest()

export const useLibrary = () => ({
  images,
  folders,
  loading,
  folderFilter,
  tagKeyword,
  selectedTag,
  selectedId,
  selectedItem,
  visibleImages,
  stats,
  folderCounts,
  allTags,
  tagOptions,
  imagesDir,
  thumbUrl,
  oriUrl,
  load,
  loadFolders,
  loadRoot,
  changeRoot,
  exportZip,
  subscribe,
  toggleTag,
  clearTagFilter,
  createFolder,
  renameFolder,
  deleteFolder,
  setFolder,
  openDetail,
  closeDetail,
  updateTags,
  removeImage,
  importManifest,
  downloadProgress,
})
