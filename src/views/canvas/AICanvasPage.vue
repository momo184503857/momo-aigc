<script setup lang="ts">
import { watch, onDeactivated, onActivated } from 'vue'
import { useRoute } from 'vue-router'
import PageLayout from '@/components/PageLayout.vue'
import WorkflowCanvas from '@/modules/workflow/components/WorkflowCanvas.vue'
import { useWorkflowStore } from '@/modules/workflow/stores/workflowStore'
import { useTabStore } from '@/stores/tabs'

defineOptions({ name: 'AICanvas' })

const route = useRoute()
const workflowStore = useWorkflowStore()
const tabStore = useTabStore()

let autoSaveTimer: ReturnType<typeof setInterval> | null = null
let currentProjectId = ''

function startAutoSave(projectId: string) {
  stopAutoSave()
  autoSaveTimer = setInterval(() => {
    workflowStore.saveToDb(projectId)
  }, 30_000)
}

function stopAutoSave() {
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer)
    autoSaveTimer = null
  }
}

async function loadProject(projectId: string) {
  if (!projectId) return
  currentProjectId = projectId
  await workflowStore.loadFromDb(projectId)
  startAutoSave(projectId)
  const tabPath = `/ai-canvas/${projectId}`
  tabStore.updateTabTitle(tabPath, workflowStore.workflow.name)
}

// Save before leaving
onDeactivated(() => {
  stopAutoSave()
  if (currentProjectId) {
    workflowStore.saveToDb(currentProjectId)
  }
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
      stopAutoSave()
      await workflowStore.saveToDb(oldId)
    }
    // Load new project
    await loadProject(newId)
  },
  { immediate: true }
)
</script>

<template>
  <PageLayout content-padding="0">
    <WorkflowCanvas />
  </PageLayout>
</template>
