<script setup lang="ts">
import { Box, MagicStick, Brush, Document } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'

const router = useRouter()
import PageLayout from '@/components/PageLayout.vue'

interface ToolItem {
  id: string
  title: string
  description: string
  icon: any
  disabled?: boolean
}

const tools: ToolItem[] = [
  {
    id: 'batch-clothes-swap',
    title: '批量换姿势',
    description: '上传多张模特图和一张衣服图，批量生成换装效果图',
    icon: MagicStick,
  },
  {
    id: 'batch-pose-swap',
    title: '批量换衣服',
    description: '上传一张模特图和多张衣服图，批量生成换装效果图',
    icon: Brush,
  },
  {
    id: 'batch-spreadsheet',
    title: '批量传表格做图',
    description: '上传 Excel 表格，批量提交生图任务',
    icon: Document,
  },
  {
    id: 'placeholder-1',
    title: '敬请期待',
    description: '更多 AI 工具正在开发中，即将上线……',
    icon: Box,
    disabled: true,
  },
]

function handleToolClick(tool: ToolItem) {
  if (tool.disabled) return
  const routes: Record<string, string> = {
    'batch-clothes-swap': '/toolbox/batch-clothes-swap',
    'batch-pose-swap': '/toolbox/batch-pose-swap',
    'batch-spreadsheet': '/toolbox/batch-spreadsheet',
  }
  const path = routes[tool.id]
  if (path) router.push(path)
}
</script>

<template>
  <PageLayout>
    <template #header>
      <h2>AI 工具箱</h2>
    </template>

    <div class="tool-grid">
      <div
        v-for="tool in tools"
        :key="tool.id"
        class="tool-card"
        :class="{ disabled: tool.disabled }"
        @click="handleToolClick(tool)"
      >
        <div class="tool-card-icon">
          <el-icon :size="32"><component :is="tool.icon" /></el-icon>
        </div>
        <div class="tool-card-body">
          <h3 class="tool-card-title">{{ tool.title }}</h3>
          <p class="tool-card-desc">{{ tool.description }}</p>
        </div>
      </div>
    </div>
  </PageLayout>
</template>

<style scoped>
.tool-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}

.tool-card {
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color-light);
  border-radius: var(--momo-radius-md);
  padding: 24px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.tool-card:hover:not(.disabled) {
  box-shadow: var(--el-box-shadow-light);
  border-color: var(--el-border-color);
}

.tool-card.disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.tool-card-icon {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  background: var(--el-fill-color);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-color-primary);
}

.tool-card-title {
  font-size: var(--momo-font-size-lg);
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin: 0;
}

.tool-card-desc {
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-secondary);
  margin: 0;
  line-height: 1.5;
}
</style>
