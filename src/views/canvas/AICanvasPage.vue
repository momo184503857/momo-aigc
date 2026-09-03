<script setup lang="ts">
import { watch, onDeactivated, onActivated, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import PageLayout from '@/components/PageLayout.vue'
import WorkflowCanvas from '@/modules/workflow/components/WorkflowCanvas.vue'
import { useWorkflowStore } from '@/modules/workflow/stores/workflowStore'
import { useTabStore } from '@/stores/tabs'

defineOptions({ name: 'AICanvas' })

const route = useRoute()
const workflowStore = useWorkflowStore()
const tabStore = useTabStore()

let currentProjectId = ''

async function loadProject(projectId: string) {
  if (!projectId) return
  currentProjectId = projectId
  await workflowStore.loadFromDb(projectId)
  const tabPath = `/ai-canvas/${projectId}`
  tabStore.updateTabTitle(tabPath, workflowStore.workflow.name)
}

// 未落盘变更用 fetch keepalive 直发（beforeunload 期间 axios 不可靠）
function handleBeforeUnload() {
  const payload = workflowStore.getSavePayload()
  if (!payload) return
  try {
    const token = localStorage.getItem('auth_token')
    void fetch(`/api/canvas/projects/${payload.projectId}`, {
      method: 'PUT',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ workflowData: payload.workflowData, nodeCount: payload.nodeCount }),
    })
  } catch {
    /* 关闭阶段的尽力而为保存 */
  }
}

// Save before leaving（keep-alive 失活）
onDeactivated(() => {
  workflowStore.flushAutosave().catch(() => {})
})

// Reload on re-enter (KeepAlive re-activation)
onActivated(async () => {
  const projectId = route.params.projectId as string
  if (projectId) {
    // Always reload from DB to get latest saved state
    await loadProject(projectId)
  }
})

// Handle route param change (switching between projects)
watch(
  () => route.params.projectId as string,
  async (newId, oldId) => {
    if (!newId) return
    // Save old project before switching
    if (oldId && oldId !== newId) {
      await workflowStore.flushAutosave().catch(() => {})
    }
    // Load new project
    await loadProject(newId)
  },
  { immediate: true }
)

onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload)
})

onUnmounted(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
})
</script>

<template>
  <PageLayout content-padding="0">
    <WorkflowCanvas />
  </PageLayout>
</template>
