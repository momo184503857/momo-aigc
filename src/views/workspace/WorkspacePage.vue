<script setup lang="ts">
/**
 * WorkspacePage - 快速生图
 * 任务列表已移至全局 TaskPanel（MainLayout 级别）
 */
import { ref, computed, watch, onMounted, onActivated, nextTick } from 'vue'

defineOptions({ name: 'Workspace' })
import { useRouter } from 'vue-router'
import { ChevronDown, Ellipsis } from '@lucide/vue'
import { useUiFeedback } from '@/composables/useUiFeedback'
const { success } = useUiFeedback()
import FeatureForm from '@/components/FeatureForm.vue'
import FeatureNav from '@/components/FeatureNav.vue'
import type { TabGroup } from '@/components/FeatureNav.vue'
import { useServerStatusStore } from '@/stores/serverStatus'
import { useTaskManager } from '@/composables/useTaskManager'
import type { ModelId } from '@/types/adapter'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const serverStatus = useServerStatusStore()
const tm = useTaskManager()
const router = useRouter()
const featureForm = ref<InstanceType<typeof FeatureForm>>()

// ─── 功能导航 ───
const activeTab = ref('change-clothes')

const tabGroups: TabGroup[] = [
  {
    name: '常用功能',
    tabs: [
      { id: 'change-clothes', label: '换衣服' },
      { id: 'change-bg', label: '换背景' },
      { id: 'change-face', label: '换脸' },
    ],
  },
  {
    name: '商品素材',
    tabs: [
      { id: 'detail-pic', label: '细节图' },
      { id: 'fabric-pic', label: '面料图' },
      { id: 'flat-pic', label: '平铺图' },
      { id: '3d-pic', label: '3D图' },
    ],
  },
  {
    name: '模特资产',
    tabs: [
      { id: 'model-gen', label: '模特生成' },
      { id: 'three-view', label: '三视图' },
    ],
  },
]

// 页面文案（纯视图层）：说明每个功能需要几张图、产出什么
const FEATURE_META: Record<string, string> = {
  'change-clothes': '保留模特与构图，替换服装',
  'change-bg': '保留模特与服装，替换场景',
  'change-face': '用源图五官替换目标人脸',
  'detail-pic': '由商品图生成细节特写',
  'fabric-pic': '由商品图生成面料质感图',
  'flat-pic': '由商品图生成俯拍平铺图',
  '3d-pic': '由商品图生成 3D 立体效果',
  'model-gen': '生成符合要求的 AI 模特',
  'three-view': '生成正面、侧面、背面三视图',
}

const activeLabel = computed(
  () => tabGroups.flatMap(g => g.tabs).find(t => t.id === activeTab.value)?.label || '快速生图',
)
const activeDesc = computed(() => FEATURE_META[activeTab.value] || '')

// ─── 生成 ───

async function handleGenerate(params: {
  logicalModelId: number
  prompt: string
  resolution: string
  aspectRatio: string
  count: number
  refImages?: Array<{ url?: string; file?: File }>
  featureId?: string
  userPrompt?: string
  systemPrompt?: string
  supplementaryImages?: { name: string; url: string }[]
}) {
  await tm.handleGenerate(params)
}

// ─── 复制参数（从任务面板跳转回来时） ───

function handleCopyParamsFromTask(params: {
  modelId: string
  prompt: string
  resolution: string
  aspectRatio: string
  input_image_urls: string[]
  feature_id?: string
  supplementaryImages?: { name: string; url: string }[]
}) {
  // 自由生图任务由独立的 FreeGenPage 处理；useTaskManager 已直接路由到 /free-gen，
  // 此处若仍收到 free-gen 数据（残留/直接访问），静默丢弃避免参数丢失。
  if (!params.feature_id || params.feature_id === 'free-gen') {
    return
  }
  const targetTab = params.feature_id
  activeTab.value = targetTab
  nextTick(() => {
    featureForm.value?.setParams({
      modelId: params.modelId,
      prompt: params.prompt,
      resolution: params.resolution,
      aspectRatio: params.aspectRatio,
      referenceImages: (params.input_image_urls || []).map((url: string) => ({
        dataUrl: url,
        sourceUrl: url,
      })),
      supplementaryImages: params.supplementaryImages,
    })
    success('参数已复制到表单')
  })
}

// ─── 监听来自任务面板的参数复制事件 ───
// 自由生图任务由独立的 FreeGenPage 处理，此处忽略 free-gen 任务

watch(() => tm.copyParamsEvent.value, (evt) => {
  if (!evt) return
  const task = evt.task
  if (!task.feature_id || task.feature_id === 'free-gen') return
  handleCopyParamsFromTask({
    modelId: task.model,
    prompt: task.user_prompt || '',
    resolution: task.resolution,
    aspectRatio: task.aspectRatio,
    input_image_urls: task.input_image_urls || [],
    feature_id: task.feature_id,
    supplementaryImages: task.supplementaryImages,
  })
})

// ─── 生命周期 ───

onMounted(async () => {
  await serverStatus.fetchStatus()

  // Check for pending regenerate from cross-page navigation
  const stored = sessionStorage.getItem('regenerate_task')
  if (stored) {
    sessionStorage.removeItem('regenerate_task')
    try {
      const params = JSON.parse(stored)
      await nextTick()
      handleCopyParamsFromTask(params)
    } catch { /* ignore parse errors */ }
  }
})

onActivated(async () => {
  await serverStatus.fetchStatus()

  // Check for pending regenerate (also on activated for KeepAlive)
  const stored = sessionStorage.getItem('regenerate_task')
  if (stored) {
    sessionStorage.removeItem('regenerate_task')
    try {
      const params = JSON.parse(stored)
      await nextTick()
      handleCopyParamsFromTask(params)
    } catch { /* ignore parse errors */ }
  }
})
</script>

<template>
  <!-- 铺满内容区的工作台：左功能轨 / 右操作区（内容区已无外层 padding，无需负 margin 抵消） -->
  <div class="flex h-full min-h-0 overflow-hidden">
    <aside class="hidden w-56 shrink-0 overflow-hidden border-r lg:block xl:w-60">
      <FeatureNav :groups="tabGroups" :active-tab="activeTab" @select="activeTab = $event" />
    </aside>

    <section class="flex min-w-0 flex-1 flex-col">
      <!-- Page Header：功能名 + 说明 + 状态 + 操作 -->
      <header class="bg-border/80 bg-background flex h-14 shrink-0 items-center gap-3 border-b px-4 xl:px-5">
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="outline" size="sm" class="shrink-0 gap-1 lg:hidden">
              {{ activeLabel }}
              <ChevronDown class="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" class="w-52">
            <template v-for="group in tabGroups" :key="group.name">
              <DropdownMenuLabel>{{ group.name }}</DropdownMenuLabel>
              <DropdownMenuItem
                v-for="tab in group.tabs"
                :key="tab.id"
                :class="cn(activeTab === tab.id && 'bg-accent font-medium')"
                @click="activeTab = tab.id"
              >
                {{ tab.label }}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </template>
          </DropdownMenuContent>
        </DropdownMenu>

        <div class="min-w-0">
          <h1 class="truncate text-[15px] leading-tight font-semibold">{{ activeLabel }}</h1>
          <p class="text-muted-foreground truncate text-xs">{{ activeDesc }}</p>
        </div>

        <div class="ml-auto flex shrink-0 items-center gap-2">
          <Badge v-if="serverStatus.loaded && !serverStatus.canGenerate" variant="warning" class="hidden md:inline-flex">
            无可用渠道
          </Badge>
          <Badge v-else-if="tm.activeTaskCount.value > 0" variant="secondary" class="hidden md:inline-flex tabular-nums">
            {{ tm.activeTaskCount.value }} 个任务生成中
          </Badge>

          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="ghost" size="icon" class="size-8" aria-label="更多操作">
                <Ellipsis class="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-48">
              <DropdownMenuLabel>相关内容</DropdownMenuLabel>
              <DropdownMenuItem @click="router.push('/results')">
                生成结果
              </DropdownMenuItem>
              <DropdownMenuItem @click="router.push('/works')">
                作品库
              </DropdownMenuItem>
              <DropdownMenuItem @click="router.push('/templates')">
                模板图库
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <!-- 操作区：FeatureForm 自带内部滚动 + sticky 生成栏 -->
      <div class="min-h-0 flex-1 overflow-hidden">
        <FeatureForm :key="activeTab" ref="featureForm" :feature-id="activeTab"
          @generate="(p) => handleGenerate({ ...p, featureId: activeTab })" />
      </div>
    </section>
  </div>
</template>
