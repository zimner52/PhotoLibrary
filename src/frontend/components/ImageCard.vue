<script setup>
import { ref } from 'vue'
import { useLibrary } from '@/composables/useLibrary'

const { thumbUrl } = useLibrary()

defineProps({
  item: { type: Object, required: true },
  active: { type: Boolean, default: false }, // 详情面板正在展示这一张
})

const emit = defineEmits(['open'])

const failed = ref(false) // 缩略图取不到时显示占位
</script>

<template>
  <article class="card" :class="{ active }" @click="emit('open', item)">
    <div class="thumb">
      <img
        v-if="!failed"
        :src="thumbUrl(item.id)"
        :alt="item.name"
        loading="lazy"
        decoding="async"
        @error="failed = true"
      />
      <div v-else class="broken">图片不可用</div>
      <span v-if="item.folder" class="badge" :title="`文件夹：${item.folder}`">
        {{ item.folder }}
      </span>
      <span v-if="item.tags?.length" class="tag-flag">{{ item.tags.length }} 标签</span>
      <span class="open-hint" title="查看详情">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11.2v5M12 7.7h.01" />
        </svg>
      </span>
      <div class="caption">
        <span class="name selectable" :title="item.name">{{ item.name }}</span>
      </div>
    </div>
  </article>
</template>

<style scoped>
.card {
  cursor: pointer;
  transition: transform 0.18s ease;
}
.card:hover {
  transform: translateY(-3px);
}
.thumb {
  position: relative;
  aspect-ratio: 9 / 16; /* 竖屏 16:9 */
  overflow: hidden;
  background: #f1ece7;
  border-radius: 12px; /* 四边圆角 */
  box-shadow:
    0 4px 14px rgba(31, 29, 27, 0.16),
    0 0 0 1px rgba(31, 29, 27, 0.06); /* 1px 描边环 */
  transition: box-shadow 0.18s ease;
}
.card:hover .thumb {
  box-shadow:
    0 12px 26px rgba(31, 29, 27, 0.22),
    0 0 0 1px rgba(31, 29, 27, 0.08);
}
/* 详情面板正在展示这一张 */
.card.active .thumb {
  box-shadow:
    0 12px 26px rgba(31, 29, 27, 0.22),
    0 0 0 2px #1f1d1b;
}
.thumb img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.35s ease;
}
.card:hover .thumb img {
  transform: scale(1.05);
}
.broken {
  display: grid;
  place-items: center;
  height: 100%;
  font-size: 12px;
  color: #a89f96;
}
/* 归属的文件夹名 */
.badge {
  position: absolute;
  top: 8px;
  left: 8px;
  max-width: calc(100% - 44px);
  overflow: hidden;
  padding: 2px 9px;
  font-size: 11px;
  line-height: 1.6;
  letter-spacing: 0.02em;
  color: #3a3733;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: rgba(255, 255, 255, 0.88);
  border-radius: 999px;
  backdrop-filter: blur(6px);
}
/* 已打标签的图片，在名字上方露出提示 */
.tag-flag {
  position: absolute;
  right: 8px;
  bottom: 46px;
  padding: 2px 8px;
  font-size: 10.5px;
  color: #fff;
  background: rgba(78, 143, 107, 0.9);
  border-radius: 999px;
  backdrop-filter: blur(4px);
}
/* 悬停时右上角浮出「查看详情」提示 */
.open-hint {
  position: absolute;
  top: 8px;
  right: 8px;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  color: #fff;
  background: rgba(20, 18, 16, 0.55);
  border-radius: 50%;
  opacity: 0;
  transform: scale(0.85);
  backdrop-filter: blur(4px);
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}
.card:hover .open-hint {
  opacity: 1;
  transform: scale(1);
}
.open-hint svg {
  width: 13px;
  height: 13px;
}
/* 名字压在图片底部：白色加粗 + 深色渐变遮罩，保证任何底图上都能读清 */
.caption {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  padding: 24px 10px 9px;
  background: linear-gradient(
    to top,
    rgba(20, 18, 16, 0.85) 0%,
    rgba(20, 18, 16, 0.45) 45%,
    rgba(20, 18, 16, 0) 100%
  );
}
.name {
  display: block;
  overflow: hidden;
  font-size: 12.5px;
  font-weight: 600; /* 加粗 */
  color: #fff;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
}
</style>
