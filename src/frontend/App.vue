<script setup>
import ImagePage from '@/components/ImagePage.vue'
import TabPage from '@/components/TabPage.vue'
import ExportDialog from '@/components/ExportDialog.vue'
import { ref } from 'vue'
import { useLibrary } from '@/composables/useLibrary'

const { exportImages } = useLibrary()

// 控制打包窗口
const showExport = ref(false)

const handleExportConfirm = async (folders) => {
  showExport.value = false
  await exportImages(folders)
}
</script>

<template>
  <ExportDialog v-model="showExport" @confirm="handleExportConfirm" />
  <div class="app">
    <TabPage />
    <ImagePage @handleExport="showExport = true" />
  </div>
</template>

<style scoped>
.app {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background-color: #efeae1;
}
</style>
