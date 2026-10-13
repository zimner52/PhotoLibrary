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
  background-color: #efeae1;
}
</style>
