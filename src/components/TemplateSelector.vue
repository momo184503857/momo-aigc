<script setup lang="ts">
import { ref, watch } from 'vue'
import { CircleCheck } from '@lucide/vue'
import { templateApi, type TemplateTag } from '@/services/templateApi'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { UiEmptyState } from '@/components/ui'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const props = defineProps<{ visible: boolean; single?: boolean }>()
const emit = defineEmits<{
  'update:visible': [value: boolean]
  'select': [templates: Array<{ name: string; url: string; previewUrl: string }>]
}>()

const loading = ref(false)
const templates = ref<any[]>([])
const selected = ref<Set<number>>(new Set())
const tags = ref<TemplateTag[]>([])
const selectedTagId = ref<number | undefined>(undefined)

watch(() => props.visible, (v) => {
  if (v) {
    selected.value = new Set()
    loadTemplates()
    loadTags()
  }
})

async function loadTags() {
  try {
    const res = await templateApi.listTags()
    tags.value = res.data.data || []
  } catch { /* ignore */ }
}

async function loadTemplates() {
  loading.value = true
  try {
    const res = await templateApi.list({
      page: 1,
      pageSize: 100,
      tagId: selectedTagId.value,
    })
    templates.value = res.data.data?.records || []
  } catch {
    templates.value = []
  } finally {
    loading.value = false
  }
}

function filterByTag(tagId: number | undefined) {
  selectedTagId.value = tagId
  loadTemplates()
}

function toggleSelect(id: number) {
  if (props.single) {
    selected.value = new Set(selected.value.has(id) ? [] : [id])
  } else {
    const s = new Set(selected.value)
    if (s.has(id)) s.delete(id)
    else s.add(id)
    selected.value = s
  }
}

function confirm() {
  const picked = templates.value.filter((t) => selected.value.has(t.id))
  emit('select', picked.map((t) => ({
    name: t.name || t.original_filename || '',
    url: t.public_url,
    previewUrl: t.public_url,
  })))
  emit('update:visible', false)
}

function close() {
  emit('update:visible', false)
}
</script>

<template>
  <Dialog :open="visible" @update:open="(v: boolean) => { if (!v) close() }">
    <DialogContent class="sm:max-w-6xl" @pointer-down-outside.prevent>
      <DialogHeader>
        <DialogTitle>从模板库选择</DialogTitle>
      </DialogHeader>

      <!-- Tag filter -->
      <div v-if="tags.length > 0" class="mb-3.5 flex flex-wrap gap-1.5">
        <Badge
          :variant="!selectedTagId ? 'default' : 'secondary'"
          class="cursor-pointer select-none"
          @click="filterByTag(undefined)"
        >
          全部
        </Badge>
        <Badge
          v-for="tag in tags"
          :key="tag.id"
          :variant="selectedTagId === tag.id ? 'default' : 'secondary'"
          class="cursor-pointer select-none"
          @click="filterByTag(tag.id)"
        >
          {{ tag.name }} ({{ tag.usage_count }})
        </Badge>
      </div>

      <div class="min-h-50">
        <div v-if="loading" class="grid grid-cols-6 gap-2.5">
          <Skeleton v-for="i in 12" :key="i" class="aspect-square w-full rounded-md" />
        </div>
        <UiEmptyState v-else-if="templates.length === 0" title="暂无模板图，请先在图库中上传" />
        <div v-else class="grid max-h-130 grid-cols-6 gap-2.5 overflow-y-auto">
          <div
            v-for="t in templates"
            :key="t.id"
            class="relative aspect-square cursor-pointer overflow-hidden rounded-md border-3 transition-colors"
            :class="selected.has(t.id) ? 'border-primary' : 'border-transparent hover:border-primary/50'"
            @click="toggleSelect(t.id)"
          >
            <img :src="t.public_url" :alt="t.name || t.original_filename" class="size-full object-cover" />
            <div class="template-info absolute right-0 bottom-0 left-0 flex flex-col gap-0.5 px-2 py-1.5">
              <span class="truncate text-xs font-medium text-white">{{ t.name || t.original_filename }}</span>
              <span v-if="t.tags && t.tags.length > 0" class="flex flex-wrap gap-0.5">
                <span v-for="tag in t.tags" :key="tag.id" class="rounded-full bg-white/20 px-1 text-[10px] leading-4 text-white">{{ tag.name }}</span>
              </span>
            </div>
            <CircleCheck
              v-if="selected.has(t.id)"
              class="text-primary absolute top-1.5 right-1.5 size-5 rounded-full bg-white drop-shadow"
            />
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="close">取消</Button>
        <Button :disabled="selected.size === 0" @click="confirm">
          确认选择（{{ selected.size }}张）
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.template-info {
  background: linear-gradient(transparent, var(--momo-color-overlay-heavy));
}
</style>
