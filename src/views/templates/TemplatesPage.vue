<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Upload } from '@element-plus/icons-vue'
import { templateApi } from '@/services/templateApi'
import { ossApi } from '@/services/ossApi'
import PageLayout from '@/components/PageLayout.vue'

interface TemplateItem {
  id: number
  name: string
  oss_bucket: string
  oss_object_key: string
  public_url: string
  original_filename: string
  mime_type: string
  size_bytes: number
  width: number
  height: number
  created_at: string
}

const templates = ref<TemplateItem[]>([])
const loading = ref(false)
const uploading = ref(false)

async function loadTemplates() {
  loading.value = true
  try {
    const res = await templateApi.list()
    templates.value = res.data.data || []
  } catch {
    ElMessage.error('加载模板图失败')
  } finally {
    loading.value = false
  }
}

async function handleUpload() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/png,image/jpeg,image/webp'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return

    if (file.size > 10 * 1024 * 1024) {
      ElMessage.warning('图片大小不能超过 10MB')
      return
    }

    uploading.value = true
    try {
      // 1. Get OSS upload token
      const tokenRes = await ossApi.getUploadToken(file.name, file.type, file.size)
      const { uploadUrl, objectKey, publicUrl, fields } = tokenRes.data.data

      // 2. Upload directly to OSS
      const formData = new FormData()
      for (const [key, value] of Object.entries(fields)) {
        formData.append(key, String(value))
      }
      formData.append('file', file)

      const uploadRes = await fetch(uploadUrl, { method: 'POST', body: formData })
      if (uploadRes.status !== 200) {
        throw new Error(`OSS 上传失败: HTTP ${uploadRes.status}`)
      }

      // 3. Save record to server
      const img = new Image()
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('图片加载失败'))
        img.src = URL.createObjectURL(file)
      })

      await templateApi.create({
        name: file.name.replace(/\.[^.]+$/, ''),
        oss_bucket: tokenRes.data.data.ossBucket || '',
        oss_object_key: objectKey,
        public_url: publicUrl,
        original_filename: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        width: img.naturalWidth,
        height: img.naturalHeight,
      })

      ElMessage.success('上传成功')
      await loadTemplates()
    } catch (e: any) {
      ElMessage.error(e.message || '上传失败')
    } finally {
      uploading.value = false
    }
  }
  input.click()
}

async function handleDelete(tmpl: TemplateItem) {
  try {
    await ElMessageBox.confirm('确定删除该模板图吗？', '确认删除', {
      type: 'warning',
      confirmButtonText: '删除',
    })
    await templateApi.delete(tmpl.id)
    ElMessage.success('已删除')
    templates.value = templates.value.filter((t) => t.id !== tmpl.id)
  } catch { /* cancelled */ }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

onMounted(() => loadTemplates())
</script>

<template>
  <PageLayout>
    <template #header>
      <h2>模板图库</h2>
    </template>
    <template #extra>
      <el-button type="primary" :icon="Upload" :loading="uploading" @click="handleUpload">
        上传模板图
      </el-button>
    </template>

    <div v-loading="loading">
      <el-empty v-if="!loading && templates.length === 0" description="暂无模板图，点击右上角上传" />

      <div v-else class="template-grid">
        <div v-for="t in templates" :key="t.id" class="template-card">
          <div class="card-image">
            <img :src="t.public_url" :alt="t.name" />
          </div>
          <div class="card-info">
            <div class="card-name">{{ t.name || t.original_filename }}</div>
            <div class="card-meta">
              <span>{{ t.mime_type }}</span>
              <span>{{ formatSize(t.size_bytes) }}</span>
              <span v-if="t.width && t.height">{{ t.width }}x{{ t.height }}</span>
            </div>
            <div class="card-time">{{ t.created_at?.slice(0, 10) }}</div>
          </div>
          <div class="card-actions">
            <el-button type="danger" size="small" plain @click="handleDelete(t)">删除</el-button>
          </div>
        </div>
      </div>
    </div>
  </PageLayout>
</template>

<style scoped>
.template-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}
.template-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--tf-radius-md, 8px);
  overflow: hidden;
  transition: box-shadow 0.2s;
}
.template-card:hover { box-shadow: var(--el-box-shadow); }

.card-image {
  aspect-ratio: 1; overflow: hidden; background: var(--el-fill-color);
}
.card-image img { width: 100%; height: 100%; object-fit: cover; }

.card-info { padding: 12px; }
.card-name {
  font-size: 14px; font-weight: 500; color: var(--el-text-color-primary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  margin-bottom: 6px;
}
.card-meta {
  display: flex; gap: 8px; font-size: 12px; color: var(--el-text-color-secondary);
}
.card-time { font-size: 11px; color: var(--el-text-color-placeholder); margin-top: 4px; }

.card-actions {
  padding: 0 12px 12px; display: flex; gap: 8px;
}
</style>
