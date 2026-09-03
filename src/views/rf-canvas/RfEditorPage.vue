<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, onDeactivated } from 'vue'
import { useRoute } from 'vue-router'
import PageLayout from '@/components/PageLayout.vue'
import { useTabStore } from '@/stores/tabs'
import { rfCanvasApi } from '@/services/rfCanvasApi'

defineOptions({ name: 'RfCanvasEditor' })

/**
 * AI画布 Pro+ 编辑器壳：页面内嵌 React island（D1）。
 *
 * KeepAlive 缓存的是本 Vue 壳——壳不销毁 ⇒ React 树存活（切页签画布状态不丢）；
 * onDeactivated 只 flush 保存，onBeforeUnmount 才 unmount React root（防泄漏）。
 * React 源码经动态 import 懒加载（N1：未访问本页时主包不含 react/@xyflow）。
 */
const route = useRoute()
const tabStore = useTabStore()

const containerRef = ref<HTMLDivElement | null>(null)
const loadError = ref('')

interface RfMountHandle {
  unmount(): void
  switchProject(projectId: number): void
  flush(): Promise<void>
}

let handle: RfMountHandle | null = null
let mounting = false

function currentProjectId(): number {
  return Number(route.params.projectId)
}

async function ensureMounted() {
  if (handle || mounting || !containerRef.value) return
  mounting = true
  try {
    const { mountRfApp } = await import('@/rf-canvas/mount')
    if (!containerRef.value) return
    handle = mountRfApp(containerRef.value, {
      projectId: currentProjectId(),
      onProjectLoaded: (name: string) => {
        tabStore.updateTabTitle(`/rf-canvas/${currentProjectId()}`, `AI画布 Pro+ · ${name}`)
      },
    })
    loadError.value = ''
  } catch (err) {
    console.error('[RfCanvasEditor] React island 挂载失败:', err)
    loadError.value = err instanceof Error ? err.message : '编辑器加载失败'
  } finally {
    mounting = false
  }
}

async function loadProjectMeta(projectId: string) {
  try {
    const project = await rfCanvasApi.getProject(projectId)
    tabStore.updateTabTitle(`/rf-canvas/${projectId}`, `AI画布 Pro+ · ${project.name}`)
  } catch {
    /* 标题更新失败不影响编辑器 */
  }
}

watch(
  () => route.params.projectId as string | undefined,
  (newId, oldId) => {
    if (!newId) return
    if (newId !== oldId) {
      loadError.value = ''
      void loadProjectMeta(newId)
      if (handle) {
        handle.switchProject(Number(newId))
      } else {
        void ensureMounted()
      }
    }
  },
  { immediate: true }
)

onMounted(() => {
  void ensureMounted()
  window.addEventListener('beforeunload', onBeforeUnloadFlush)
})

function onBeforeUnloadFlush() {
  // beforeunload 中异步请求不可靠：React 侧 flush 走 fetch keepalive（R8.1 强制落盘）
  void handle?.flush()
}

onDeactivated(() => {
  // 切走页签：强制 flush 未落盘变更，不销毁 React 树
  void handle?.flush()
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', onBeforeUnloadFlush)
  handle?.unmount()
  handle = null
})
</script>

<template>
  <PageLayout content-padding="0">
    <div class="rf-editor-root">
      <div v-if="loadError" class="rf-editor-error">{{ loadError }}</div>
      <div ref="containerRef" class="rf-editor-container" />
    </div>
  </PageLayout>
</template>

<style scoped>
.rf-editor-root {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.rf-editor-container {
  flex: 1;
  min-height: 0;
}

.rf-editor-error {
  padding: 24px;
  color: var(--momo-color-danger);
  font-size: var(--momo-font-size-base);
}
</style>
