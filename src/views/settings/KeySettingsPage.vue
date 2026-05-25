<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useKeyConfigStore } from '@/stores/keyConfig'
import { testConnection } from '@/adapter/toapisClient'
import PageLayout from '@/components/PageLayout.vue'

const store = useKeyConfigStore()

const keyInput = ref('')
const testing = ref(false)

function handleSave() {
  if (!keyInput.value.trim()) {
    ElMessage.warning('请输入 ToAPIs API Key')
    return
  }
  store.saveKey(keyInput.value.trim())
  keyInput.value = ''
  ElMessage.success('API Key 已保存到本地浏览器')
}

function handleDelete() {
  store.deleteKey()
  ElMessage.info('已删除本地保存的 API Key')
}

async function handleTest() {
  const key = keyInput.value.trim() || store.apiKey
  if (!key) {
    ElMessage.warning('请先填写 API Key')
    return
  }
  testing.value = true
  try {
    const ok = await testConnection(key)
    if (ok) {
      ElMessage.success('连接成功，API Key 有效')
    } else {
      ElMessage.error('连接失败，请检查 Key 是否正确')
    }
  } catch {
    ElMessage.error('连接测试失败，请检查网络')
  } finally {
    testing.value = false
  }
}
</script>

<template>
  <PageLayout>
    <template #header>
      <h2>API Key 设置</h2>
    </template>

    <div class="key-settings">
      <el-alert
        title="ToAPIs Key 仅保存在当前浏览器本地，不会上传到公司服务器。清理浏览器缓存、换电脑或换浏览器后，需要重新填写。"
        type="info"
        :closable="false"
        show-icon
        style="margin-bottom: 24px"
      />

      <el-descriptions :column="1" border style="margin-bottom: 24px">
        <el-descriptions-item label="当前状态">
          <el-tag :type="store.hasKey ? 'success' : 'danger'">
            {{ store.hasKey ? '已保存' : '未保存' }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="当前 Key" v-if="store.hasKey">
          <code>{{ store.maskedKey }}</code>
        </el-descriptions-item>
      </el-descriptions>

      <div class="key-form">
        <div class="form-item">
          <label>ToAPIs API Key</label>
          <el-input
            v-model="keyInput"
            type="password"
            show-password
            placeholder="输入你的 ToAPIs API Key"
            size="large"
          />
        </div>
        <div class="form-actions">
          <el-button type="primary" size="large" @click="handleSave">保存到本机</el-button>
          <el-button size="large" :loading="testing" @click="handleTest">测试连接</el-button>
          <el-button v-if="store.hasKey" type="danger" size="large" plain @click="handleDelete">删除本地 Key</el-button>
        </div>
      </div>
    </div>
  </PageLayout>
</template>

<style scoped>
.key-settings {
  max-width: 600px;
}
.key-form {
  display: flex; flex-direction: column; gap: 16px;
}
.form-item label {
  display: block; font-size: 14px; color: var(--el-text-color-regular); margin-bottom: 8px;
}
.form-actions {
  display: flex; gap: 12px;
}
</style>
