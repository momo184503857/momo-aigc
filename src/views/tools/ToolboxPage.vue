<script setup lang="ts">
/**
 * AI 工具箱 —— 批量工具入口
 *
 * 定位是「启动器」：用户来这里只为选一个工具并立刻进入，因此列表按可扫读的行式
 * 清单排布（图标 / 名称 / 输入约束 / 说明），而不是五张大卡片。
 */
import type { Component } from 'vue'
import { Archive, ArrowRight, ChevronRight, FileText, Paintbrush, Settings, Upload, User, Wand2, Workflow, ListChecks } from '@lucide/vue'
import { useRouter } from 'vue-router'

const router = useRouter()
import { DsScrollPage as PageLayout } from '@/components/design-system'
import { Badge } from '@/components/design-system/primitives/badge'
import { Button } from '@/components/design-system/primitives/button'

interface ToolItem {
  id: string
  title: string
  description: string
  icon: Component
  /** 纯视图信息：该工具单次可接受的素材规模，取自各页面自身的上传约束 */
  meta: string[]
  disabled?: boolean
}

/** 批量工具的共用流程（纯视图说明，不驱动任何路由或状态机） */
const PIPELINE: { label: string; icon: Component }[] = [
  { label: '上传素材', icon: Upload },
  { label: '配置提示词与参数', icon: Settings },
  { label: '批量提交任务', icon: ListChecks },
]

const tools: ToolItem[] = [
  {
    id: 'batch-clothes-swap',
    title: '批量换姿势',
    description: '上传多张模特图和一张衣服图，批量生成换装效果图',
    icon: Wand2,
    meta: ['模特图 ≤ 20', '衣服图 × 1'],
  },
  {
    id: 'batch-pose-swap',
    title: '批量换衣服',
    description: '上传一张模特图和多张衣服图，批量生成换装效果图',
    icon: Paintbrush,
    meta: ['模特图 × 1', '衣服图 ≤ 20'],
  },
  {
    id: 'batch-spreadsheet',
    title: '批量传表格做图',
    description: '上传 Excel 表格，批量提交生图任务',
    icon: FileText,
    meta: ['1 行 = 1 任务', '结果可批量下载'],
  },
  {
    id: 'batch-face-swap',
    title: '批量换脸',
    description: '上传多张衣服图和一张模特脸图，批量生成换脸效果图',
    icon: User,
    meta: ['衣服图 ≤ 20', '脸图 × 1'],
  },
  {
    id: 'placeholder-1',
    title: '敬请期待',
    description: '更多 AI 工具正在开发中，即将上线……',
    icon: Archive,
    meta: [],
    disabled: true,
  },
]

function handleToolClick(tool: ToolItem) {
  if (tool.disabled) return
  const routes: Record<string, string> = {
    'batch-clothes-swap': '/toolbox/batch-clothes-swap',
    'batch-pose-swap': '/toolbox/batch-pose-swap',
    'batch-spreadsheet': '/toolbox/batch-spreadsheet',
    'batch-face-swap': '/toolbox/batch-face-swap',
  }
  const path = routes[tool.id]
  if (path) router.push(path)
}
</script>

<template>
  <PageLayout>
    <template #header>
      <h2>AI 工具箱</h2>
      <p class="text-muted-foreground mt-0.5 text-sm">
        批量流水线入口：一组素材 × 一次配置，提交为多个生图任务
      </p>
    </template>

    <template #extra>
      <Badge variant="secondary" class="tabular-nums">{{ tools.filter(t => !t.disabled).length }} 个工具可用</Badge>
      <Button variant="outline" size="sm" class="gap-1.5" @click="router.push('/results')">
        <ArrowRight class="size-3.5" />
        生成结果
      </Button>
    </template>

    <div class="content-max flex flex-col gap-4">
      <!-- 共用流程说明：一行带过，避免每页重复解释 -->
      <div class="border-border bg-muted/30 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2">
        <span class="text-muted-foreground flex items-center gap-1.5 text-sm font-medium tracking-wider uppercase">
          <Workflow class="size-3.5" />
          批量流程
        </span>
        <span
          v-for="(s, i) in PIPELINE"
          :key="s.label"
          class="flex items-center gap-2 text-sm"
        >
          <span class="border-border bg-background text-muted-foreground flex size-5 items-center justify-center rounded-full border text-sm font-semibold tabular-nums">
            {{ i + 1 }}
          </span>
          <span class="text-foreground/80">{{ s.label }}</span>
          <ChevronRight v-if="i < PIPELINE.length - 1" class="text-muted-foreground/50 size-3.5" />
        </span>
        <span class="text-muted-foreground ml-auto hidden text-sm xl:inline">
          提交后可在右侧任务面板查看进度
        </span>
      </div>

      <!-- 工具清单：行式排列，输入约束前置到一行内可读 -->
      <section class="border-border bg-card overflow-hidden rounded-lg border">
        <h3 class="sr-only">批量工具</h3>
        <ul class="divide-border divide-y">
          <li v-for="tool in tools" :key="tool.id">
            <Button variant="ghost"
              type="button"
              :disabled="tool.disabled"
              :aria-label="tool.disabled ? undefined : `进入${tool.title}`"
              class="group flex w-full cursor-pointer items-center gap-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              @click="handleToolClick(tool)"
            >
              <span
                class="border-border bg-background flex size-9 shrink-0 items-center justify-center rounded-md border"
                :class="tool.disabled ? 'text-muted-foreground/60' : 'text-foreground/80'"
              >
                <component :is="tool.icon" class="size-4.5" :stroke-width="1.75" />
              </span>

              <span class="min-w-0 flex-1">
                <span class="flex items-center gap-2">
                  <span class="truncate text-sm font-medium">{{ tool.title }}</span>
                  <Badge v-if="tool.disabled" variant="outline" class="h-4 shrink-0 px-1.5">
                    开发中
                  </Badge>
                </span>
                <span class="text-muted-foreground mt-0.5 block truncate text-sm">
                  {{ tool.description }}
                </span>
              </span>

              <span v-if="tool.meta.length" class="hidden shrink-0 items-center gap-1.5 md:flex">
                <span
                  v-for="m in tool.meta"
                  :key="m"
                  class="text-muted-foreground bg-muted border-border rounded border px-1.5 py-0.5 text-sm whitespace-nowrap tabular-nums"
                >
                  {{ m }}
                </span>
              </span>

              <ChevronRight
                v-if="!tool.disabled"
                class="text-muted-foreground/40 group-hover:text-foreground size-4 shrink-0 transition-colors"
              />
            </Button>
          </li>
        </ul>
      </section>

      <p class="text-muted-foreground text-sm">
        所有批量任务按「1 张素材 = 1 个任务」提交，消耗按模型分辨率单价 × 任务数计算，任务间提交间隔 3 秒。
      </p>
    </div>
  </PageLayout>
</template>
