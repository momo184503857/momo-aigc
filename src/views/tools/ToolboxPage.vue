<script setup lang="ts">
import { onActivated, ref } from 'vue'
import { ArrowRight } from '@lucide/vue'
import { useRouter } from 'vue-router'
import { DsScrollPage as PageLayout, DsToolCard, Badge, Button } from '@/components/design-system'
import { toolboxTools } from '@/configs/toolbox'
import { toolboxApi } from '@/services/toolboxApi'
import { useUiFeedback } from '@/composables/useUiFeedback'
const router = useRouter()
const { error } = useUiFeedback()
const images = ref<Record<string, string>>({})
const tools = [...toolboxTools.map(tool => ({ ...tool, disabled: false })), { id: 'placeholder-1', title: '敬请期待', description: '更多 AI 工具正在开发中，即将上线……', disabled: true }]
onActivated(async () => {
  try { images.value = await toolboxApi.images() }
  catch { error('工具介绍图加载失败，请稍后重试') }
})
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
          <DsToolCard :title="tool.title" :description="tool.description" :image-url="images[tool.id]" :disabled="tool.disabled" @enter="router.push(`/toolbox/${tool.id}`)" />
        </li>
      </ul>
    </section>
  </PageLayout>
</template>
