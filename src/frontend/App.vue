<script setup>
import ImagePage from '@/components/ImagePage.vue'
import TabPage from '@/components/TabPage.vue'
</script>

<template>
  <div class="app">
    <TabPage />
    <ImagePage />
  </div>
</template>

<style scoped>
.app {
  display: flex;
  height: 100vh;
  overflow: hidden;
  /* 兜底底色。真正的「横格纸」画在 ImagePage 的 .content 上，
     这样那条 79px 的竖向页边线才会落在内容区里（画在这层会被侧边栏盖住） */
  background-color: #efeae1;
}
</style>
