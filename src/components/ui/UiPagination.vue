<script setup lang="ts">
withDefaults(defineProps<{
  currentPage: number
  pageSize: number
  total: number
  pageSizes?: number[]
  hideOnEmpty?: boolean
  disabled?: boolean
  layout?: string
}>(), {
  pageSizes: () => [10, 20, 50, 100],
  hideOnEmpty: true,
  disabled: false,
  layout: 'total, sizes, prev, pager, next',
})

const emit = defineEmits<{
  'update:currentPage': [value: number]
  'update:pageSize': [value: number]
  currentChange: [value: number]
  sizeChange: [value: number]
}>()

function handleCurrentChange(value: number) {
  emit('update:currentPage', value)
  emit('currentChange', value)
}

function handleSizeChange(value: number) {
  emit('update:pageSize', value)
  emit('sizeChange', value)
}
</script>

<template>
  <div v-if="!hideOnEmpty || total > 0" class="ui-pagination">
    <el-pagination
      :current-page="currentPage"
      :page-size="pageSize"
      :page-sizes="pageSizes"
      :total="total"
      :disabled="disabled"
      :layout="layout"
      :pager-count="5"
      @current-change="handleCurrentChange"
      @size-change="handleSizeChange"
    />
  </div>
</template>

<style scoped>
.ui-pagination {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  width: 100%;
}
</style>
