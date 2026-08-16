<template>
  <div class="sg-asset-picker">
    <div class="picker-toolbar">
      <el-radio-group :model-value="scope" size="small" @update:model-value="onScope">
        <el-radio-button value="all">全部</el-radio-button>
        <el-radio-button value="global">通用</el-radio-button>
        <el-radio-button value="mine">我的</el-radio-button>
      </el-radio-group>
      <el-input
        :model-value="keyword"
        size="small"
        clearable
        placeholder="搜索…"
        style="width: 160px"
        @update:model-value="onKeyword"
      />
      <slot name="actions" />
    </div>
    <div v-if="loading" class="picker-loading">加载中…</div>
    <div v-else-if="list.length === 0" class="picker-empty">暂无资产，可在管理后台或「我的」中创建</div>
    <div v-else class="picker-list">
      <div
        v-for="item in list"
        :key="item.id"
        class="picker-item"
        :class="{ selected: item.id === modelValue }"
        @click="emit('select', item)"
      >
        <slot name="item" :item="item">
          <span>{{ item[labelField] }}</span>
        </slot>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useAssetLibrary } from '@/composables/useAssetLibrary'
import type { SgAssetType } from '@/services/sgApi'

defineOptions({ name: 'SgAssetPicker' })

const props = withDefaults(defineProps<{
  type: SgAssetType
  /** 选中项 id */
  modelValue?: number | null
  labelField?: string
  filter?: (item: any) => boolean
  extraQuery?: Record<string, unknown>
}>(), { labelField: 'name', modelValue: null })

const emit = defineEmits<{
  select: [item: any]
}>()

const keyword = ref('')
const lib = useAssetLibrary<any>(props.type)
const scope = lib.scope
const loading = lib.loading

const visible = ref<any[]>([])
function refreshVisible() {
  visible.value = props.filter ? lib.list.value.filter(props.filter) : lib.list.value
}
watch(() => lib.list.value, refreshVisible, { immediate: true })
const list = visible

let kwTimer: ReturnType<typeof setTimeout> | null = null
function onKeyword(v: string | number | null) {
  keyword.value = String(v ?? '')
  if (kwTimer) clearTimeout(kwTimer)
  kwTimer = setTimeout(() => load(), 300)
}
function onScope(v: string | number | boolean | undefined | any) {
  lib.setScope(String(v) as 'global' | 'mine' | 'all')
}
async function load() {
  await lib.load({ keyword: keyword.value || undefined, ...props.extraQuery })
}
onMounted(load)
watch(() => props.extraQuery, () => load(), { deep: true })
</script>

<style scoped>
.sg-asset-picker { display: flex; flex-direction: column; gap: var(--momo-space-3); }
.picker-toolbar { display: flex; align-items: center; gap: var(--momo-space-2); }
.picker-loading, .picker-empty {
  color: var(--momo-color-text-tertiary); font-size: var(--momo-font-size-sm);
  padding: var(--momo-space-4); text-align: center;
}
.picker-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: var(--momo-space-2); max-height: 320px; overflow-y: auto; }
.picker-item {
  border: 1px solid var(--momo-color-border-light); border-radius: var(--momo-radius-md);
  padding: var(--momo-space-3); cursor: pointer; background: var(--momo-color-bg);
  transition: border-color var(--momo-transition-fast), box-shadow var(--momo-transition-fast);
}
.picker-item:hover { border-color: var(--momo-color-brand-border); }
.picker-item.selected { border-color: var(--momo-color-brand); box-shadow: var(--momo-shadow-brand); }
</style>
