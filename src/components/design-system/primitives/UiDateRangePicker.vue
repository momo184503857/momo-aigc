<script setup lang="ts">
/**
 * UiDateRangePicker — 日期范围选择（Popover + 原生 date input + 快捷项）
 * 对齐 el-date-picker daterange 的关键交互：v-model [Date, Date] | null、change 事件、快捷项、可清除。
 */
import { computed, ref } from 'vue'
import { CalendarDays, X } from '@lucide/vue'
import { Button } from '@/components/design-system/primitives/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/design-system/primitives/popover'

export interface DateRangeShortcut {
  text: string
  value: () => [Date, Date]
}

const props = withDefaults(defineProps<{
  modelValue: [Date, Date] | null
  shortcuts?: DateRangeShortcut[]
  placeholder?: string
  disabled?: boolean
}>(), {
  shortcuts: () => [],
  placeholder: '日期范围',
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: [Date, Date] | null]
  change: [value: [Date, Date] | null]
}>()

const open = ref(false)

function fmt(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseLocal(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

const startText = computed(() => (props.modelValue ? fmt(props.modelValue[0]) : ''))
const endText = computed(() => (props.modelValue ? fmt(props.modelValue[1]) : ''))

function commit(start: Date | null, end: Date | null) {
  const value = start && end ? ([start, end] as [Date, Date]) : null
  emit('update:modelValue', value)
  emit('change', value)
}

function onStartInput(e: Event) {
  const d = parseLocal((e.target as HTMLInputElement).value)
  commit(d, d ? (props.modelValue?.[1] ?? d) : null)
}

function onEndInput(e: Event) {
  const d = parseLocal((e.target as HTMLInputElement).value)
  commit(d ? (props.modelValue?.[0] ?? d) : null, d)
}

function applyShortcut(s: DateRangeShortcut) {
  const [start, end] = s.value()
  commit(start, end)
  open.value = false
}

function clear(e: MouseEvent) {
  e.stopPropagation()
  commit(null, null)
}

const label = computed(() =>
  props.modelValue ? `${startText.value} ~ ${endText.value}` : props.placeholder,
)
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        variant="outline"
        size="sm"
        :disabled="disabled"
        class="justify-start gap-1.5 font-normal"
        :class="{ 'text-muted-foreground': !modelValue }"
      >
        <CalendarDays />
        <span class="truncate">{{ label }}</span>
        <X
          v-if="modelValue"
          class="text-muted-foreground hover:text-foreground ml-auto size-3.5 shrink-0"
          @click="clear"
        />
      </Button>
    </PopoverTrigger>
    <PopoverContent class="w-auto p-3" align="start">
      <div class="flex items-center gap-2">
        <input
          type="date"
          class="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-7 rounded-md border px-2 text-sm outline-none focus-visible:ring-2"
          :value="startText"
          :max="endText || undefined"
          @change="onStartInput"
        />
        <span class="text-muted-foreground text-xs">至</span>
        <input
          type="date"
          class="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-7 rounded-md border px-2 text-sm outline-none focus-visible:ring-2"
          :value="endText"
          :min="startText || undefined"
          @change="onEndInput"
        />
      </div>
      <div v-if="shortcuts.length" class="mt-2.5 flex flex-wrap gap-1.5">
        <Button
          v-for="s in shortcuts"
          :key="s.text"
          variant="secondary"
          size="xs"
          @click="applyShortcut(s)"
        >
          {{ s.text }}
        </Button>
      </div>
    </PopoverContent>
  </Popover>
</template>
