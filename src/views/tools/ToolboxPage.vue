<script setup lang="ts">
/**
 * AI 工具箱 —— 批量工具入口
 *
 * 定位是「启动器」：每个批量功能独立成卡片，用户可查看用途与素材限制后进入。
 */
import type { Component } from 'vue'
import { Archive, ArrowRight, FileText, Paintbrush, User, Wand2 } from '@lucide/vue'
import { useRouter } from 'vue-router'

const router = useRouter()
import { DsScrollPage as PageLayout } from '@/components/design-system'
import { Badge } from '@/components/design-system/primitives/badge'
import { Button } from '@/components/design-system/primitives/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/design-system/primitives/card'

interface ToolItem {
  id: string
  title: string
  description: string
  icon: Component
  /** 纯视图信息：该工具单次可接受的素材规模，取自各页面自身的上传约束 */
  meta: string[]
  disabled?: boolean
}

const tools: ToolItem[] = [
  {
    id: 'batch-clothes-swap',
    title: '批量换姿势',
    description: '上传多张模特图和一张衣服图，批量生成换装效果图',
    icon: Wand2,
    meta: ['模特图 ≤ 100', '衣服图 × 1'],
  },
  {
    id: 'batch-pose-swap',
    title: '批量换衣服',
    description: '上传一张模特图和多张衣服图，批量生成换装效果图',
    icon: Paintbrush,
    meta: ['模特图 × 1', '衣服图 ≤ 100'],
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
    meta: ['衣服图 ≤ 100', '脸图 × 1'],
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

    <section class="content-max" aria-label="批量工具">
      <ul class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <li v-for="tool in tools" :key="tool.id" class="min-w-0">
          <Card class="h-full" :class="tool.disabled ? 'opacity-60' : undefined">
            <CardHeader>
              <span class="border-border bg-background text-foreground flex size-11 items-center justify-center rounded-md border">
                <component :is="tool.icon" class="size-5" :stroke-width="1.75" />
              </span>
              <div class="flex items-center gap-2">
                <CardTitle>{{ tool.title }}</CardTitle>
                <Badge v-if="tool.disabled" variant="outline">开发中</Badge>
              </div>
              <CardDescription>{{ tool.description }}</CardDescription>
            </CardHeader>
            <CardContent class="flex flex-1 flex-col gap-4">
              <div v-if="tool.meta.length" class="flex flex-wrap gap-2">
                <Badge v-for="m in tool.meta" :key="m" variant="secondary" class="tabular-nums">{{ m }}</Badge>
              </div>
              <Button v-if="!tool.disabled" variant="outline" class="mt-auto w-full justify-between" @click="handleToolClick(tool)">
                进入{{ tool.title }}
                <ArrowRight class="size-4" />
              </Button>
            </CardContent>
          </Card>
        </li>
      </ul>
    </section>
  </PageLayout>
</template>
