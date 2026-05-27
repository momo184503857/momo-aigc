<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useUiFeedback } from '@/composables/useUiFeedback'
const { success, warning, error } = useUiFeedback()
import http from '@/services/http'

defineOptions({ name: 'AdminToApisKey' })

const apiKey = ref('')
const maskedKey = ref('')
const loading = ref(false)
const testing = ref(false)
const saving = ref(false)

async function loadConfig() {
  loading.value = true
  try {
    const res = await http.get('/admin/toapis/config')
    maskedKey.value = res.data.data.maskedKey || ''
  } catch (e: any) {
    error('加载配置失败: ' + (e.response?.data?.error || e.message))
  } finally {
    loading.value = false
  }
}

async function handleSave() {
  if (!apiKey.value.trim()) {
    warning('请输入 API Key')
    return
  }
  saving.value = true
  try {
    await http.put('/admin/toapis/config', { apiKey: apiKey.value.trim() })
    success('保存成功')
    apiKey.value = ''
    await loadConfig()
  } catch (e: any) {
    error('保存失败: ' + (e.response?.data?.error || e.message))
  } finally {
    saving.value = false
  }
}

async function handleTest() {
  const key = apiKey.value.trim()
  if (!key) {
    warning('请先输入 API Key')
    return
  }
  testing.value = true
  try {
    const res = await http.post('/admin/toapis/test', { apiKey: key })
    if (res.data.data.ok) {
      success('连接成功，API Key 有效')
    } else {
      error('连接失败，API Key 无效')
    }
  } catch (e: any) {
    error('测试失败: ' + (e.response?.data?.error || e.message))
  } finally {
    testing.value = false
  }
}

async function handleDeleteKey() {
  try {
    await http.delete('/admin/toapis/key')
    success('共享 Key 已清空')
    apiKey.value = ''
    await loadConfig()
  } catch (e: any) {
    error('清空失败: ' + (e.response?.data?.error || e.message))
  }
}

onMounted(() => {
  loadConfig()
})
</script>

<template>
  <div class="toapis-key-page" v-loading="loading">
    <h2 class="page-title">API Key 管理</h2>
    <p class="page-desc">配置所有用户共享的 ToAPIs API Key。修改后立即生效。</p>

    <div class="config-section">
      <div class="config-row">
        <label class="config-label">共享 Key</label>
        <div class="config-control">
          <el-input
            v-model="apiKey"
            type="password"
            show-password
            placeholder="输入 ToAPIs API Key"
          />
          <p v-if="maskedKey" class="current-key-info">
            当前 Key：{{ maskedKey }}
          </p>
        </div>
      </div>

      <div class="config-row">
        <label class="config-label"></label>
        <div class="config-control config-actions">
          <el-button type="primary" @click="handleSave" :loading="saving" :disabled="!apiKey.trim()">保存</el-button>
          <el-button @click="handleTest" :loading="testing" :disabled="!apiKey.trim()">测试连接</el-button>
          <el-button type="danger" plain @click="handleDeleteKey" :disabled="!maskedKey">清空 Key</el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.toapis-key-page {
  max-width: 640px;
  padding: 24px;
}

.page-title {
  margin: 0 0 8px 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.page-desc {
  margin: 0 0 24px 0;
  font-size: var(--momo-font-size-base);
  color: var(--el-text-color-secondary);
}

.config-section {
  background: var(--el-bg-color);
  border-radius: var(--momo-radius-md);
  padding: 24px;
  border: 1px solid var(--el-border-color-lighter);
}

.config-row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 20px;
}

.config-row:last-child {
  margin-bottom: 0;
}

.config-label {
  width: 80px;
  flex-shrink: 0;
  text-align: right;
  font-size: var(--momo-font-size-base);
  font-weight: 500;
  color: var(--el-text-color-primary);
  padding-top: 6px;
}

.config-control {
  flex: 1;
  min-width: 0;
}

.config-actions {
  display: flex;
  gap: 8px;
}

.current-key-info {
  margin: 6px 0 0 0;
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-secondary);
  font-family: monospace;
}
</style>
