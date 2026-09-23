<script setup lang="ts">
/**
 * BasicPage —— 数据/内容页骨架（移植 reference-ui global-layout/basic-page.vue）
 *
 * 与 PageLayout 的区别：滚动容器交给 AdminLayout 的 main，页面自身按文档流铺开，
 * 表格随页面滚走、标题带 sticky —— 这正是 reference 全站的管理页阅读方式。
 */
import BasicHeader from './BasicHeader.vue'

withDefaults(defineProps<{
  title?: string
  description?: string
  sticky?: boolean
}>(), {
  title: '',
  description: '',
  sticky: false,
})
</script>

<template>
  <div>
    <BasicHeader :title="title" :description="description" :sticky="sticky">
      <template #actions>
        <slot name="actions" />
      </template>
    </BasicHeader>

    <div class="py-4">
      <slot />
    </div>
  </div>
</template>
