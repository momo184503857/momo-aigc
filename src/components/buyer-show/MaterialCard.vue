<script setup lang="ts">
/**
 * MaterialCard — 素材展示卡片（纯展示 + 事件）。
 * 网格/列表两种布局由 CSS 控制；选择/预览/复制/编辑/删除交由父组件处理。
 */
import { Check, Copy, Pencil, Trash2 } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { BuyerShowMaterial } from '@/services/buyerShowApi'

defineProps<{
  material: BuyerShowMaterial
  viewMode: 'grid' | 'list'
  selected: boolean
  isAdmin: boolean
}>()

defineEmits<{
  toggleSelect: []
  preview: []
  copy: []
  edit: []
  delete: []
}>()
</script>

<template>
  <div class="material-card" :class="[viewMode, { selected }]" @click="$emit('preview')">
    <!-- 选择圆圈 -->
    <div class="select-circle" :class="{ checked: selected }" @click.stop="$emit('toggleSelect')">
      <Check v-if="selected" class="size-3.5 text-(--momo-color-text-inverse)" />
    </div>

    <!-- 缩略图 -->
    <div class="material-thumb" @click.stop="$emit('preview')">
      <img :src="material.public_url" :alt="material.prompt" loading="lazy" />
    </div>

    <!-- 主体：提示词 + 标签 -->
    <div class="material-body">
      <div class="material-prompt" :title="`点击复制：${material.prompt}`" @click.stop="$emit('copy')">
        {{ material.prompt }}
      </div>
      <div v-if="material.tags && material.tags.length > 0" class="material-tags">
        <Badge v-for="tag in material.tags" :key="tag.id" variant="secondary">{{ tag.name }}</Badge>
      </div>
    </div>

    <!-- 操作 -->
    <div class="material-actions" @click.stop>
      <Button variant="outline" size="sm" @click="$emit('copy')"><Copy />复制</Button>
      <template v-if="isAdmin">
        <Button variant="outline" size="sm" @click="$emit('edit')"><Pencil />编辑</Button>
        <Button variant="destructive" size="sm" @click="$emit('delete')"><Trash2 />删除</Button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.material-card {
  background: var(--momo-color-bg-soft);
  border-radius: var(--momo-radius-md);
  overflow: hidden;
  border: 1px solid var(--momo-color-border-soft);
  transition: box-shadow 0.2s, border-color 0.2s;
  position: relative;
}
.material-card:hover { box-shadow: var(--momo-shadow-sm); }
.material-card.selected {
  border-color: var(--momo-color-brand);
  box-shadow: 0 0 0 2px var(--momo-color-brand-border);
}

/* 选择圆圈 */
.select-circle {
  position: absolute; top: 10px; left: 10px; z-index: 2;
  width: 24px; height: 24px; border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.9);
  background: var(--momo-color-overlay);
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s ease;
  cursor: pointer;
}
.select-circle.checked {
  background: var(--momo-color-brand);
  border-color: var(--momo-color-brand);
}

/* 提示词 */
.material-prompt {
  font-size: var(--momo-font-size-sm);
  color: var(--momo-color-text);
  line-height: 1.5;
  cursor: pointer;
  transition: color 0.15s;
}
.material-prompt:hover { color: var(--momo-color-brand); }

.material-tags {
  display: flex; flex-wrap: wrap; gap: 4px;
}

.material-actions {
  display: flex; gap: 4px; flex-shrink: 0;
}

/* ───── 网格布局 ───── */
.material-card.grid {
  display: flex;
  flex-direction: column;
}
.material-card.grid .material-thumb {
  aspect-ratio: 1;
  overflow: hidden;
  background: var(--momo-color-bg-muted);
  cursor: zoom-in;
}
.material-card.grid .material-thumb img {
  width: 100%; height: 100%; object-fit: cover;
  transition: transform 0.3s;
}
.material-card.grid .material-thumb:hover img { transform: scale(1.05); }
.material-card.grid .material-body {
  padding: 10px 12px;
  flex: 1;
}
.material-card.grid .material-prompt {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-bottom: 8px;
  min-height: 42px;
}
.material-card.grid .material-actions {
  padding: 0 12px 10px;
  flex-wrap: wrap;
}

/* ───── 列表布局 ───── */
.material-card.list {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px 10px 44px;
}
.material-card.list .select-circle {
  top: 50%;
  left: 12px;
  transform: translateY(-50%);
}
.material-card.list .material-thumb {
  width: 64px;
  height: 64px;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: var(--momo-radius-sm);
  background: var(--momo-color-bg-muted);
  cursor: zoom-in;
}
.material-card.list .material-thumb img {
  width: 100%; height: 100%; object-fit: cover;
}
.material-card.list .material-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.material-card.list .material-prompt {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
