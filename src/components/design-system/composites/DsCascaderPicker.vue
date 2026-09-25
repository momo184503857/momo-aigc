<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronDown, ChevronRight, Check } from '@lucide/vue'
import { Button } from '../primitives/button'
import { Popover, PopoverTrigger, PopoverContent } from '../primitives/popover'
export interface CascaderOption { value: string; label: string; children?: CascaderOption[] }
const props = withDefaults(defineProps<{ modelValue: string; options: CascaderOption[]; placeholder?: string; disabled?: boolean; label?: string }>(), { placeholder: '请选择', label: '分类筛选' })
const emit = defineEmits<{ 'update:modelValue': [value: string]; change: [value: string] }>()
const open = ref(false)
const active = ref('')
const parent = computed(() => props.options.find(item => item.children?.some(child => child.value === props.modelValue)))
const selected = computed(() => parent.value?.children?.find(item => item.value === props.modelValue) ?? props.options.find(item => item.value === props.modelValue))
const children = computed(() => props.options.find(item => item.value === active.value)?.children ?? [])
watch(open, value => { if (value) active.value = parent.value?.value ?? '' })
function choose(item: CascaderOption) {
  if (item.children?.length) { active.value = item.value; return }
  emit('update:modelValue', item.value)
  emit('change', item.value)
  open.value = false
}
</script>
<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button variant="outline" :disabled="disabled" :aria-label="`${label}：${selected?.label ?? placeholder}`" class="ds-cascader-trigger">
        <span>{{ selected?.label ?? placeholder }}</span><ChevronDown />
      </Button>
    </PopoverTrigger>
    <PopoverContent side="bottom" align="start" :side-offset="4" class="ds-cascader-content">
      <div class="ds-cascader-column" role="group" aria-label="一级分类">
        <Button v-for="item in options" :key="item.value" variant="ghost" class="ds-cascader-option" :data-selected="modelValue === item.value || parent?.value === item.value" :data-expanded="active === item.value" :aria-expanded="item.children?.length ? active === item.value : undefined" :aria-pressed="item.children?.length ? undefined : modelValue === item.value" @click="choose(item)">
          {{ item.label }}<ChevronRight v-if="item.children?.length" /><Check v-else-if="modelValue === item.value" />
        </Button>
      </div>
      <div v-if="children.length" class="ds-cascader-column" role="group" aria-label="二级功能">
        <Button v-for="item in children" :key="item.value" variant="ghost" class="ds-cascader-option" :data-selected="modelValue === item.value" :aria-pressed="modelValue === item.value" @click="choose(item)">{{ item.label }}<Check v-if="modelValue === item.value" /></Button>
      </div>
    </PopoverContent>
  </Popover>
</template>
