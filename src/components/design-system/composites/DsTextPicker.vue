<script setup lang="ts">
import { Search, Star, LoaderCircle } from '@lucide/vue'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../primitives/dialog'
import { Input } from '../primitives/input'
import { Switch } from '../primitives/switch'
import { Badge } from '../primitives/badge'
import { UiEmptyState, UiPagination } from '../primitives'
export interface TextPickerItem { id: string; title: string; content: string; tags: string[]; starred?: boolean | number }
withDefaults(defineProps<{ items: TextPickerItem[]; tags: string[]; loading?: boolean; empty?: boolean; total: number; pageSize: number; title?: string; searchPlaceholder?: string; emptyText?: string }>(), {
  title: '选择内容', searchPlaceholder: '搜索标题和正文', emptyText: '暂无内容',
})
const open = defineModel<boolean>('open', { default: false })
const keyword = defineModel<string>('keyword', { default: '' })
const onlyFavorites = defineModel<boolean>('onlyFavorites', { default: false })
const activeTag = defineModel<string>('activeTag')
const page = defineModel<number>('page', { default: 1 })
const emit = defineEmits<{ select: [id: string]; favorite: [id: string]; closeAutoFocus: [event: Event] }>()
</script>
<template>
      <Dialog :open="open" @update:open="(v: boolean) => (open = v)">
        <DialogContent class="ds-picker-dialog" @pointer-down-outside.prevent @close-auto-focus="(event: Event) => emit('closeAutoFocus', event)">
          <DialogHeader>
            <DialogTitle>{{ title }}</DialogTitle>
          </DialogHeader>

          <!-- 筛选容器：模糊搜索 + 仅看收藏 -->
          <div class="ds-picker-filters">
            <div class="ds-picker-search">
              <Search class="ds-picker-search-icon" />
              <Input v-model="keyword" :placeholder="searchPlaceholder" class="ds-picker-search-input" />
            </div>
            <div class="ds-picker-favorite-filter">
              <span class="ds-picker-description">仅看收藏</span>
              <Switch v-model="onlyFavorites" />
            </div>
          </div>

          <!-- Tag filter -->
          <div v-if="tags.length > 0" class="ds-picker-tags">
            <Badge
              :variant="!activeTag ? 'default' : 'secondary'"
              class="ds-picker-chip"
              @click="activeTag = undefined"
            >
              全部
            </Badge>
            <Badge
              v-for="tag in tags"
              :key="tag"
              :variant="activeTag === tag ? 'default' : 'secondary'"
              class="ds-picker-chip"
              @click="activeTag = tag"
            >
              {{ tag }}
            </Badge>
          </div>

          <div v-if="loading" class="ds-picker-loading">
            <LoaderCircle class="ds-picker-spinner" />
            <p class="ds-caption">加载中...</p>
          </div>
          <template v-else-if="items.length === 0">
            <UiEmptyState v-if="empty" :title="emptyText" />
            <UiEmptyState v-else title="没有匹配的内容" />
          </template>
          <div v-else class="ds-picker-list">
            <div
              v-for="item in items"
              :key="item.id"
              class="ds-picker-item"
              @click="emit('select', item.id)"
            >
              <Star
                class="ds-picker-star"
                :data-starred="item.starred"
                @click.stop="emit('favorite', item.id)"
              />
              <div class="ds-picker-body">
                <div class="ds-picker-title">{{ item.title }}</div>
                <div class="ds-picker-excerpt">{{ item.content }}</div>
                <div v-if="item.tags.length > 0" class="ds-picker-item-tags">
                  <Badge v-for="tag in item.tags" :key="tag" variant="secondary">{{ tag }}</Badge>
                </div>
              </div>
            </div>
          </div>

          <!-- 分页器 -->
          <div v-if="total > pageSize" class="ds-picker-pagination">
            <UiPagination
              v-model:current-page="page"
              :page-size="pageSize"
              :page-sizes="[pageSize]"
              :total="total"
            />
          </div>
        </DialogContent>
      </Dialog>
</template>
