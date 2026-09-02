<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { RefreshRight } from '@element-plus/icons-vue'
import PageLayout from '@/components/PageLayout.vue'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { useAuthStore } from '@/stores/auth'
import { useTabStore } from '@/stores/tabs'
import { flowCanvasApi } from '@/services/flowCanvasApi'

defineOptions({ name: 'FlowCanvasEditor' })

const route = useRoute()
const auth = useAuthStore()
const tabStore = useTabStore()
const { error: showError } = useUiFeedback()

const iframeSrc = ref('')
const opening = ref(false)
const loadError = ref('')

/**
 * 打开编辑器会话：后端确保 (用户,项目) 的 Node-RED 子进程在运行后返回编辑器地址，
 * 前端用应用 JWT 通过 ?access_token= 免登录桥接进 Node-RED 编辑器（adminAuth.tokens 校验）。
 */
async function openSession(projectId: string, reload = true) {
  if (!projectId) return
  opening.value = true
  loadError.value = ''
  try {
    const { editorUrl, accessToken } = await flowCanvasApi.openSession(projectId)
    if (reload || !iframeSrc.value) {
      // accessToken 为该实例的 token，与子进程内 adminAuth 比对一致（应用 JWT 亦可）
      iframeSrc.value = `${editorUrl}?access_token=${encodeURIComponent(accessToken || auth.token)}`
    }
    // 会话保活：实例被空闲回收后下次访问会自动重启，此处刷新最后活跃时间即可
  } catch (err: unknown) {
    const message =
      (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
      (err instanceof Error ? err.message : '编辑器会话打开失败')
    loadError.value = message
    showError(message)
  } finally {
    opening.value = false
  }
}

async function loadProjectMeta(projectId: string) {
  try {
    const project = await flowCanvasApi.getProject(projectId)
    tabStore.updateTabTitle(`/flow-canvas/${projectId}`, project.name)
  } catch {
    /* 标题更新失败不影响编辑器 */
  }
}

watch(
  () => route.params.projectId as string,
  (newId) => {
    if (newId) {
      void openSession(newId)
      void loadProjectMeta(newId)
    }
  },
  { immediate: true }
)

function reloadIframe() {
  const current = route.params.projectId as string
  if (current) void openSession(current, true)
}
</script>

<template>
  <PageLayout content-padding="0">
    <template #header>
      <div class="editor-toolbar">
        <span class="editor-toolbar__hint">Node-RED 流程编辑器 · 修改后请点右上角「部署」保存</span>
        <el-button size="small" :icon="RefreshRight" :loading="opening" @click="reloadIframe">刷新</el-button>
      </div>
    </template>

    <div class="editor-content">
      <div v-if="loadError" v-loading="false" class="editor-error">
        <el-empty :description="`编辑器打开失败：${loadError}`">
          <el-button type="primary" @click="reloadIframe">重试</el-button>
        </el-empty>
      </div>

      <div v-else-if="!iframeSrc" v-loading="true" class="editor-loading" />

      <iframe
        v-show="iframeSrc && !loadError"
        :src="iframeSrc"
        class="editor-frame"
        allow="clipboard-read; clipboard-write; fullscreen"
        title="AI画布 Pro 编辑器"
      />
    </div>
  </PageLayout>
</template>

<style scoped>
.editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}

.editor-toolbar__hint {
  font-size: var(--el-font-size-small);
  color: var(--el-text-color-secondary);
}

.editor-content {
  position: relative;
  height: 100%;
  min-height: 400px;
}

.editor-loading {
  height: 100%;
}

.editor-frame {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
  background: var(--el-bg-color);
}

.editor-error {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
