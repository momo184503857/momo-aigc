<script setup lang="ts">
/**
 * UiDateRangePicker — 日期范围选择（Popover + 双月日历 + 快捷项）
 * 对齐 el-date-picker daterange 的关键交互：v-model [Date, Date] | null、change 事件、快捷项、可清除。
 */
import { computed, ref, watch } from 'vue'
import { CalendarDays, ChevronLeft, ChevronRight, X } from '@lucide/vue'
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

const month = ref(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
const pendingStart = ref<Date | null>(null)
const hovered = ref<Date | null>(null)
const weekdays = ['一', '二', '三', '四', '五', '六', '日']
watch(open, (value) => {
  pendingStart.value = null
  hovered.value = null
  if (value) {
    const date = props.modelValue?.[0] ?? new Date()
    month.value = new Date(date.getFullYear(), date.getMonth(), 1)
  }
})
const months = computed(() => [0, 1].map(offset => {
  const date = new Date(month.value.getFullYear(), month.value.getMonth() + offset, 1)
  const padding = (date.getDay() + 6) % 7
  const count = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  return { key: fmt(date), title: `${date.getFullYear()}年${date.getMonth() + 1}月`, days: Array.from({ length: 42 }, (_, i) => i >= padding && i < padding + count ? new Date(date.getFullYear(), date.getMonth(), i - padding + 1) : null) }
}))
function moveMonth(delta: number) {
  month.value = new Date(month.value.getFullYear(), month.value.getMonth() + delta, 1)
}
const displayedRange = computed(() => {
  const start = pendingStart.value ?? props.modelValue?.[0]
  const end = pendingStart.value ? hovered.value ?? pendingStart.value : props.modelValue?.[1]
  if (!start || !end) return null
  return [fmt(start), fmt(end)].sort()
})
function dayState(date: Date) {
  const range = displayedRange.value
  const value = fmt(date)
  return { endpoint: !!range && (value === range[0] || value === range[1]), inside: !!range && value > range[0]! && value < range[1]! }
}
function selectDate(date: Date) {
  if (!pendingStart.value) { pendingStart.value = date; hovered.value = date; return }
  const start = pendingStart.value
  commit(start <= date ? start : date, start <= date ? date : start)
  open.value = false
}

const startText = computed(() => (props.modelValue ? fmt(props.modelValue[0]) : ''))
const endText = computed(() => (props.modelValue ? fmt(props.modelValue[1]) : ''))

function commit(start: Date | null, end: Date | null) {
  const value = start && end ? ([start, end] as [Date, Date]) : null
  emit('update:modelValue', value)
  emit('change', value)
}

function applyShortcut(s: DateRangeShortcut) {
  const [start, end] = s.value()
  commit(start, end)
  open.value = false
}

function clear(e: MouseEvent) {
  e.stopPropagation()
  if (props.disabled) return
  pendingStart.value = null
  hovered.value = null
  commit(null, null)
  open.value = false
}

const label = computed(() =>
  props.modelValue ? `${startText.value} ~ ${endText.value}` : props.placeholder,
)
</script>

<template>
  <Popover v-model:open="open">
    <div class="ds-date-range-control">
    <PopoverTrigger as-child>
      <Button
        variant="outline"
        size="sm"
        :disabled="disabled"
        class="ds-date-range-trigger justify-start gap-1.5 font-normal"
        :class="{ 'text-muted-foreground': !modelValue, 'ds-date-range-clearable': !!modelValue }"
      >
        <CalendarDays />
        <span class="truncate">{{ label }}</span>

      </Button>
    </PopoverTrigger>
      <Button v-if="modelValue" variant="ghost" size="icon-xs" class="ds-date-range-clear" :disabled="disabled" aria-label="清除日期范围" title="清除日期范围" @click="clear"><X /></Button>
    </div>
    <PopoverContent class="ds-date-range-content w-auto p-3" align="start" side="bottom">
      <div class="ds-date-calendar-nav">
        <Button variant="ghost" size="icon-sm" aria-label="上个月" @click="moveMonth(-1)"><ChevronLeft /></Button>
        <span class="ds-caption" role="status">{{ pendingStart ? '请选择结束日期' : '请选择开始日期' }}</span>
        <Button variant="ghost" size="icon-sm" aria-label="下个月" @click="moveMonth(1)"><ChevronRight /></Button>
      </div>
      <div class="ds-date-calendar-months" @mouseleave="hovered = null">
        <section v-for="item in months" :key="item.key" :aria-label="item.title" class="ds-date-calendar-month">
          <h3 class="ds-heading">{{ item.title }}</h3>
          <div class="ds-date-calendar-grid">
            <span v-for="day in weekdays" :key="day" class="ds-caption">{{ day }}</span>
            <template v-for="(date, index) in item.days" :key="index">
              <Button v-if="date" variant="ghost" class="ds-date-calendar-day" :aria-label="fmt(date)" :aria-pressed="dayState(date).endpoint || dayState(date).inside" :data-endpoint="dayState(date).endpoint" :data-in-range="dayState(date).inside" @mouseenter="hovered = date" @focus="hovered = date" @click="selectDate(date)">{{ date.getDate() }}</Button>
              <span v-else aria-hidden="true" />
            </template>
          </div>
        </section>
      </div>
      <Button v-if="modelValue" variant="ghost" size="sm" @click="commit(null, null); open = false">清除日期</Button>
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
