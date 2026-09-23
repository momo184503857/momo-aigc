<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center gap-2">
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        :model-value="scope"
        @update:model-value="(v) => { if (v) onScope(v) }"
      >
        <ToggleGroupItem value="all">全部</ToggleGroupItem>
        <ToggleGroupItem value="global">通用</ToggleGroupItem>
        <ToggleGroupItem value="mine">我的</ToggleGroupItem>
      </ToggleGroup>
      <div class="relative w-40">
        <Search class="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          :model-value="keyword"
          placeholder="搜索…"
          class="h-7 pl-8 text-[0.8rem]"
          @update:model-value="onKeyword"
        />
      </div>
      <slot name="actions" />
    </div>
    <div v-if="loading" class="text-muted-foreground p-4 text-center text-sm">加载中…</div>
    <div v-else-if="list.length === 0" class="text-muted-foreground p-4 text-center text-sm">暂无资产，可在管理后台或「我的」中创建</div>
    <div v-else class="grid max-h-80 grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2 overflow-y-auto">
      <div
        v-for="item in list"
        :key="item.id"
        class="cursor-pointer rounded-md border bg-background p-3 transition-[border-color,box-shadow]"
        :class="item.id === modelValue
          ? 'border-primary shadow-(--momo-shadow-brand)'
          : 'border-(--momo-color-border-light) hover:border-(--momo-color-brand-border)'"
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
import { Search } from '@lucide/vue'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
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
