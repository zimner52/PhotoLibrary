<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'

const config = ref({ watchDir: '', watchEnabled: false, watching: false })
const busy = ref(false)
const message = ref('')
let flashTimer = null
let unsubscribe = null

const statusText = computed(() => {
  if (config.value.watching) return '监听中'
  if (config.value.watchEnabled) return '未生效'
  return '已关闭'
})

const statusClass = computed(() => {
  if (config.value.watching) return 'live'
  if (config.value.watchEnabled) return 'idle'
  return 'off'
})

const flash = (text, duration = 5000) => {
  message.value = text
  clearTimeout(flashTimer)
  flashTimer = setTimeout(() => (message.value = ''), duration)
}

const load = async () => {
  config.value = await window.electronAPI.getConfig()
}

const toggle = async () => {
  busy.value = true
  try {
    config.value = await window.electronAPI.setWatchEnabled(!config.value.watchEnabled)
  } finally {
    busy.value = false
  }
}

const chooseDir = async () => {
  busy.value = true
  const before = config.value.watchDir
  try {
    const next = await window.electronAPI.chooseWatchDir()
    config.value = next
    if (next.watchDir !== before) flash('已更新监听目录')
  } finally {
    busy.value = false
  }
}

const openDir = () => {
  if (config.value.watchDir) window.electronAPI.openPath(config.value.watchDir)
}

const rescan = async () => {
  busy.value = true
  flash('正在扫描…', 60000)
  try {
    const res = await window.electronAPI.rescanWatchDir()
    if (res.error) flash(res.error)
    else flash(`扫描完成：新增 ${res.imported} 张，跳过 ${res.skipped} 张`)
  } finally {
    busy.value = false
  }
}

onMounted(async () => {
  await load()
  // 主进程自动导入成功后推送到界面
  unsubscribe = window.electronAPI.onImagesUpdated((payload) => {
    if (payload?.type === 'auto-import') flash(`已自动导入「${payload.item.name}」`)
    else if (payload?.type === 'scan') flash(`扫描完成：新增 ${payload.count} 张`)
  })
})

onUnmounted(() => {
  clearTimeout(flashTimer)
  if (unsubscribe) unsubscribe()
})
</script>

<template>
  <section class="panel">
    <div class="row">
      <span class="label">自动导入</span>
      <button
        class="switch"
        :class="{ on: config.watchEnabled }"
        :disabled="busy"
        :aria-pressed="config.watchEnabled"
        @click="toggle"
      >
        <span class="knob"></span>
      </button>
      <span class="pill" :class="statusClass">{{ statusText }}</span>
      <span v-if="message" class="message">{{ message }}</span>
    </div>

    <div class="row">
      <span class="label">下载目录</span>
      <span class="path selectable" :title="config.watchDir">{{ config.watchDir || '未设置' }}</span>
      <button class="btn" :disabled="busy" @click="chooseDir">更改</button>
      <button class="btn" :disabled="busy" @click="openDir">打开</button>
      <button class="btn" :disabled="busy" @click="rescan">扫描目录图片</button>
    </div>

    <p class="hint">
      下载目录即被监视的目录，当该目录新增图片时，应用会自动导入该图片
    </p>
  </section>
</template>

<style scoped>
.panel {
  padding: 14px 18px;
  background: #fff;
  border: 1px solid rgba(31, 29, 27, 0.07);
  border-radius: 12px;
  box-shadow: 0 2px 10px rgba(31, 29, 27, 0.06);
}
.row {
  display: flex;
  gap: 10px;
  align-items: center;
  min-height: 30px;
}
.row + .row {
  margin-top: 8px;
}
.label {
  flex-shrink: 0;
  width: 62px;
  font-size: 12.5px;
  color: #8a827a;
}
.switch {
  position: relative;
  flex-shrink: 0;
  width: 40px;
  height: 22px;
  padding: 0;
  background: #cfc5bd;
  border: none;
  border-radius: 11px;
  cursor: pointer;
  transition: background 0.2s;
}
.switch.on {
  background: #1f1d1b; /* 深灰 */
}
.switch:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
.knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  background: #fff;
  border-radius: 50%;
  box-shadow: 0 1px 3px rgba(31, 29, 27, 0.3);
  transition: transform 0.2s;
}
.switch.on .knob {
  transform: translateX(18px);
}
.pill {
  flex-shrink: 0;
  padding: 2px 9px;
  font-size: 11.5px;
  border-radius: 999px;
}
.pill.live {
  color: #2e6b4a;
  background: #e4ede6;
}
.pill.idle {
  color: #8a6a2f;
  background: #f2e9d8;
}
.pill.off {
  color: #7c746c;
  background: #efeae5;
}
.message {
  flex: 1;
  overflow: hidden;
  font-size: 12px;
  color: #3a3733;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  padding: 5px 10px;
  font-family: Consolas, Menlo, monospace;
  font-size: 12px;
  color: #4a443e;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: #f4f0ec;
  border: 1px solid #e4ddd7;
  border-radius: 8px;
}
.btn {
  flex-shrink: 0;
  padding: 6px 12px;
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
.btn:hover:not(:disabled) {
  color: #1f1d1b;
  background: #f4f0ec;
  border-color: #cfc5bd;
}
.btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.hint {
  margin-top: 10px;
  padding-left: 10px;
  font-size: 12px;
  line-height: 1.7;
  color: #8a827a;
  border-left: 2px solid #e4ddd7;
}
</style>
