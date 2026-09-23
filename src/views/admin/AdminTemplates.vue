<script setup lang="ts">
defineOptions({ name: 'AdminTemplates' })
import { ref, computed, onMounted } from 'vue'
import { Search, RefreshCw, Trash2, X } from '@lucide/vue'
import { toBJMinute } from '@/utils/datetime'
import { useUiFeedback } from '@/composables/useUiFeedback'
const { success, error, confirmDanger } = useUiFeedback()
import { useImagePreview } from '@/composables/useImagePreview'
import { adminApi } from '@/services/adminApi'
import PageLayout from '@/components/PageLayout.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { UiEmptyState, UiImagePreview } from '@/components/ui'

interface TmplRow {
  id: number
  username: string
  user_id: number
  name: string
  public_url: string
  original_filename: string
  mime_type: string
  size_bytes: number
  created_at: string
}

const templates = ref<TmplRow[]>([])
const loading = ref(false)
const filterUserId = ref<string>('')
const { visible: previewVisible, url: previewUrl, open: openPreview } = useImagePreview()

/** 当前是否在按用户筛选：决定筛选行是否显示「已筛出用户 X」提示 */
const filterActive = computed(() => Boolean(filterUserId.value.trim()))

async function loadTemplates() {
  loading.value = true
  try {
    const userId = filterUserId.value ? parseInt(filterUserId.value) : undefined
    const res = await adminApi.listTemplates(userId)
    templates.value = res.data.data || []
  } catch {
    error('加载失败')
  } finally {
    loading.value = false
  }
}

async function handleDelete(tmpl: TmplRow) {
  try {
    await confirmDanger({ title: '确认删除', message: '确定删除该模板记录吗？' })
    await adminApi.deleteTemplate(tmpl.id)
    success('已删除')
    await loadTemplates()
  } catch { /* cancelled */ }
}

function formatSize(bytes: number): string {
  if (!bytes) return '-'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

onMounted(() => loadTemplates())
</script>

<template>
  <PageLayout
    title="模板管理（全部用户）"
    subtitle="全站用户上传的模板图，点击缩略图全屏查看；按用户 ID 可筛出单个用户的模板。"
  >
    <template #filters>
      <div class="relative w-40">
        <Search class="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          v-model="filterUserId"
          placeholder="按用户ID筛选"
          class="pr-7 pl-8"
          @keyup.enter="loadTemplates"
        />
        <button
          v-if="filterUserId"
          type="button"
          class="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer"
          title="清除"
          @click="() => { filterUserId = ''; loadTemplates() }"
        >
          <X class="size-3.5" />
        </button>
      </div>
      <Button size="sm" variant="outline" @click="loadTemplates"><Search />搜索</Button>
      <Button variant="ghost" size="sm" class="gap-1.5" @click="loadTemplates">
        <RefreshCw class="size-3.5" />刷新
      </Button>
      <span v-if="!loading && templates.length" class="text-muted-foreground ml-auto text-xs tabular-nums">
        {{ filterActive ? `用户 ${filterUserId} 名下 ${templates.length} 个模板` : `共 ${templates.length} 个模板` }}
      </span>
    </template>

    <!-- 图集：一次拉全量、无分页，所以直接让页面唯一的滚动区承载网格 -->
    <div v-if="loading" class="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
      <Skeleton v-for="i in 8" :key="i" class="h-[268px] w-full rounded-md" />
    </div>

    <UiEmptyState v-else-if="!templates.length" title="暂无模板">
      <Button variant="outline" @click="loadTemplates"><RefreshCw />重新加载</Button>
    </UiEmptyState>

    <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
      <div v-for="row in templates" :key="row.id" class="tmpl-card group">
        <button
          type="button"
          class="block aspect-square w-full cursor-zoom-in overflow-hidden bg-muted"
          :title="`查看大图：${row.name}`"
          @click="openPreview(row.public_url)"
        >
          <img :src="row.public_url" class="size-full object-cover" loading="lazy" alt="模板预览" />
        </button>

        <Button
          variant="ghost"
          size="icon-sm"
          title="删除该模板记录"
          class="text-destructive hover:text-destructive absolute top-1.5 right-1.5 z-10 bg-background/90 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          @click="handleDelete(row)"
        >
          <Trash2 />
        </Button>

        <div class="tmpl-meta">
          <div class="flex items-center gap-1.5">
            <span class="text-muted-foreground/70 shrink-0 text-xs tabular-nums">#{{ row.id }}</span>
            <span class="truncate text-sm font-medium" :title="row.name">{{ row.name }}</span>
          </div>
          <div class="text-muted-foreground mt-0.5 truncate text-xs">{{ row.username }}</div>
          <div
            class="text-muted-foreground/80 mt-2 truncate border-t pt-2 text-[11px] leading-tight"
            :title="`${row.original_filename} · ${row.mime_type}`"
          >
            {{ row.original_filename }}
          </div>
          <div class="text-muted-foreground/80 mt-0.5 flex items-center justify-between text-[11px] tabular-nums">
            <span>{{ formatSize(row.size_bytes) }}</span>
            <span>{{ toBJMinute(row.created_at) }}</span>
          </div>
        </div>
      </div>
    </div>

    <UiImagePreview v-model="previewVisible" :url="previewUrl" />
  </PageLayout>
</template>

<style scoped>
/* 图块：图片本身即主体，外框只留一条发丝线，hover 时靠边框反馈而不是加阴影 */
.tmpl-card {
  position: relative;
  border: 1px solid var(--momo-color-border-soft);
  border-radius: var(--momo-radius-md);
  background: var(--momo-color-bg);
  overflow: hidden;
  transition: border-color 0.15s;
}
.tmpl-card:hover {
  border-color: var(--momo-color-border);
}
.tmpl-meta {
  padding: 8px 10px 10px;
}
</style>
