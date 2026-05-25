<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import http from '@/services/http'

defineOptions({ name: 'AdminToApisKey' })

const mode = ref<'user' | 'shared'>('user')
const apiKey = ref('')
const maskedKey = ref('')
const loading = ref(false)
const testing = ref(false)
const saving = ref(false)

async function loadConfig() {
  loading.value = true
  try {
    const res = await http.get('/admin/toapis/config')
    mode.value = res.data.data.mode
    maskedKey.value = res.data.data.maskedKey || ''
  } catch (e: any) {
    ElMessage.error('加载配置失败: ' + (e.response?.data?.error || e.message))
  } finally {
    loading.value = false
  }
}

async function handleSave() {
  saving.value = true
  try {
    const body: Record<string, string> = { mode: mode.value }
    if (apiKey.value) {
      body.apiKey = apiKey.value
    }
    await http.put('/admin/toapis/config', body)
    ElMessage.success('保存成功')
    apiKey.value = ''
    await loadConfig()
  } catch (e: any) {
    ElMessage.error('保存失败: ' + (e.response?.data?.error || e.message))
  } finally {
    saving.value = false
  }
}

async function handleTest() {
  const key = apiKey.value || ''
  if (!key) {
    ElMessage.warning('请先输入 API Key')
    return
  }
  testing.value = true
  try {
    const res = await http.post('/admin/toapis/test', { apiKey: key })
    if (res.data.data.ok) {
      ElMessage.success('连接成功，API Key 有效')
    } else {
      ElMessage.error('连接失败，API Key 无效')
    }
  } catch (e: any) {
    ElMessage.error('测试失败: ' + (e.response?.data?.error || e.message))
  } finally {
    testing.value = false
  }
}

async function handleDeleteKey() {
  try {
    await http.delete('/admin/toapis/key')
    ElMessage.success('共享 Key 已清空')
    apiKey.value = ''
    await loadConfig()
  } catch (e: any) {
    ElMessage.error('清空失败: ' + (e.response?.data?.error || e.message))
  }
}

onMounted(() => {
  loadConfig()
})
</script>

<template>
  <div class="toapis-key-page" v-loading="loading">
    <h2 class="page-title">API Key 管理</h2>
    <p class="page-desc">配置 ToAPIs API Key 的使用方式。切换模式后立即生效。</p>

    <div class="config-section">
      <!-- Mode Toggle -->
      <div class="config-row">
        <label class="config-label">Key 模式</label>
        <div class="config-control">
          <el-radio-group v-model="mode">
            <el-radio value="user">用户模式</el-radio>
            <el-radio value="shared">共享模式</el-radio>
          </el-radio-group>
          <p class="mode-hint">
            <template v-if="mode === 'user'">
              每个用户使用自己的 API Key（存在浏览器本地）
            </template>
            <template v-else>
              所有用户共用管理员配置的 Key（存在服务器，走代理转发）
            </template>
          </p>
        </div>
      </div>

      <!-- Shared Key Config (only in shared mode) -->
      <template v-if="mode === 'shared'">
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
            <el-button type="primary" @click="handleSave" :loading="saving">保存</el-button>
            <el-button @click="handleTest" :loading="testing" :disabled="!apiKey">测试连接</el-button>
            <el-button type="danger" plain @click="handleDeleteKey" :disabled="!maskedKey">清空 Key</el-button>
          </div>
        </div>
      </template>

      <!-- User mode: just save mode switch -->
      <div v-else class="config-row">
        <label class="config-label"></label>
        <div class="config-control config-actions">
          <el-button type="primary" @click="handleSave" :loading="saving">切换模式</el-button>
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
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.config-section {
  background: var(--el-bg-color);
  border-radius: 8px;
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
  font-size: 14px;
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

.mode-hint {
  margin: 8px 0 0 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.current-key-info {
  margin: 6px 0 0 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  font-family: monospace;
}
</style>
