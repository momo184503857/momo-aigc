<template>
  <!-- TODO(multiple-select): EP 多选下拉（multiple+filterable+allow-create）无对应物，用 Popover + Checkbox 列表 + 输入创建实现同等语义 -->
  <Popover>
    <PopoverTrigger as-child>
      <button
        type="button"
        class="border-input focus-visible:border-ring focus-visible:ring-ring/50 flex min-h-8 w-full flex-wrap items-center gap-1 rounded-lg border bg-transparent px-2 py-1 text-sm outline-none focus-visible:ring-3"
      >
        <template v-if="selectedTags.length > 0">
          <Badge v-for="tag in selectedTags" :key="tag.id" variant="secondary">{{ tag.name }}</Badge>
        </template>
        <span v-else class="text-muted-foreground">选择或输入标签</span>
        <ChevronDown class="text-muted-foreground ml-auto size-4 shrink-0" />
      </button>
    </PopoverTrigger>
    <PopoverContent class="w-(--reka-popover-trigger-width) p-2" align="start">
      <Input v-model="keyword" placeholder="搜索或输入新标签" class="mb-1.5" />
      <div class="max-h-56 overflow-y-auto">
        <label
          v-for="tag in filteredTags"
          :key="tag.id"
          class="hover:bg-muted flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm"
        >
          <Checkbox
            :model-value="selectedTagIds.includes(tag.id)"
            @update:model-value="toggleTag(tag.id)"
          />
          <span class="flex-1 truncate">{{ tag.name }}</span>
          <span class="text-muted-foreground text-xs">{{ tag.usage_count }} 张图片</span>
        </label>
        <button
          v-if="canCreate"
          type="button"
          class="text-primary hover:bg-muted flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm"
          @click="createTag"
        >
          <Plus class="size-3.5" />
          <span>创建标签「{{ keyword.trim() }}」</span>
        </button>
        <p v-if="filteredTags.length === 0 && !canCreate" class="text-muted-foreground px-2 py-3 text-center text-xs">
          无匹配标签
        </p>
      </div>
    </PopoverContent>
  </Popover>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { ChevronDown, Plus } from '@lucide/vue'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { templateApi, type TemplateTag } from '@/services/templateApi'

const props = defineProps<{
  modelValue: number[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: number[]]
}>()

const selectedTagIds = ref<number[]>([...props.modelValue])
const allTags = ref<TemplateTag[]>([])

async function loadTags() {
  try {
    const res = await templateApi.listTags()
    allTags.value = res.data.data || []
  } catch (error) {
    console.error('Failed to load tags:', error)
  }
}

async function handleChange(value: (string | number)[]) {
  const newTagIds: number[] = []

  for (const item of value) {
    const itemStr = String(item)

    const existingTag = allTags.value.find(t => String(t.id) === itemStr)
    if (existingTag) {
      newTagIds.push(existingTag.id)
    } else {
      try {
        const res = await templateApi.createTag(itemStr)
        newTagIds.push(res.data.data.id)
        await loadTags()
      } catch (error) {
        console.error('Failed to create tag:', error)
      }
    }
  }

  emit('update:modelValue', newTagIds)
}

watch(() => props.modelValue, (newVal) => {
  selectedTagIds.value = [...newVal]
}, { deep: true })

onMounted(() => {
  loadTags()
})

// ── 纯 UI：搜索关键字与下拉交互 ──
const keyword = ref('')

const selectedTags = computed(() =>
  allTags.value.filter((t) => selectedTagIds.value.includes(t.id)),
)

const filteredTags = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return allTags.value
  return allTags.value.filter((t) => t.name.toLowerCase().includes(kw))
})

const canCreate = computed(() => {
  const name = keyword.value.trim()
  return name !== '' && !allTags.value.some((t) => t.name === name)
})

function toggleTag(id: number) {
  const next = selectedTagIds.value.includes(id)
    ? selectedTagIds.value.filter((x) => x !== id)
    : [...selectedTagIds.value, id]
  selectedTagIds.value = next
  handleChange(next)
}

function createTag() {
  const name = keyword.value.trim()
  if (!name) return
  keyword.value = ''
  handleChange([...selectedTagIds.value, name])
}
</script>
