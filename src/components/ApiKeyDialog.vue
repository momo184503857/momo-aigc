<script setup lang="ts">
import { ref } from 'vue'
import { useUiFeedback } from '@/composables/useUiFeedback'
const { success, info, warning, error } = useUiFeedback()
import { useKeyConfigStore } from '@/stores/keyConfig'
import { testConnection } from '@/adapter/toapisClient'

const store = useKeyConfigStore()

const visible = defineModel<boolean>({ default: false })

const keyInput = ref('')
const testing = ref(false)

function handleSave() {
  if (!keyInput.value.trim()) {
    warning('请输入 ToAPIs API Key')
    return
  }
  store.saveKey(keyInput.value.trim())
  keyInput.value = ''
  success('API Key 已保存到本地浏览器')
}

function handleDelete() {
  store.deleteKey()
  info('已删除本地保存的 API Key')
}

async function handleTest() {
  const key = keyInput.value.trim() || store.apiKey
  if (!key) {
    warning('请先填写 API Key')
    return
  }
  testing.value = true
  try {
    const ok = await testConnection(key)
    if (ok) {
      success('连接成功，API Key 有效')
    } else {
      error('连接失败，请检查 Key 是否正确')
    }
  } catch {
    error('连接测试失败，请检查网络')
  } finally {
    testing.value = false
  }
}
</script>

<template>
  <el-dialog v-model="visible" title="管理 API Key" width="520px" :close-on-click-modal="false">
    <el-alert
      title="ToAPIs Key 仅保存在当前浏览器本地，不会上传到公司服务器。清理浏览器缓存、换电脑或换浏览器后，需要重新填写。"
      type="info"
      :closable="false"
      show-icon
      style="margin-bottom: 20px"
    />

    <el-descriptions :column="1" border style="margin-bottom: 20px">
      <el-descriptions-item label="当前状态">
        <el-tag :type="store.hasKey ? 'success' : 'danger'">
          {{ store.hasKey ? '已保存' : '未保存' }}
        </el-tag>
      </el-descriptions-item>
      <el-descriptions-item v-if="store.hasKey" label="当前 Key">
        <code>{{ store.maskedKey }}</code>
      </el-descriptions-item>
    </el-descriptions>

    <div class="key-form">
      <label class="key-label">ToAPIs API Key</label>
      <el-input
        v-model="keyInput"
        type="password"
        show-password
        placeholder="输入你的 ToAPIs API Key"
        size="large"
      />
      <div class="form-actions">
        <el-button type="primary" size="large" @click="handleSave">保存到本机</el-button>
        <el-button size="large" :loading="testing" @click="handleTest">测试连接</el-button>
        <el-button v-if="store.hasKey" type="danger" size="large" plain @click="handleDelete">删除本地 Key</el-button>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.key-form {
  display: flex; flex-direction: column; gap: 16px;
}
.key-label {
  font-size: var(--momo-font-size-base); color: var(--el-text-color-regular);
}
.form-actions {
  display: flex; gap: 12px;
}
</style>
