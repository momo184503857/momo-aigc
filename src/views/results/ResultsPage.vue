<script setup lang="ts">
defineOptions({ name: 'ResultsPage' })
import { ref, onMounted } from 'vue'
import { useUiFeedback } from '@/composables/useUiFeedback'
const { success, info, warning, error, confirmDanger } = useUiFeedback()
import { Download, Delete, Picture, Check, Close } from '@element-plus/icons-vue'
import PageLayout from '@/components/PageLayout.vue'
import { UiImagePreview } from '@/components/ui'
import { useImagePreview } from '@/composables/useImagePreview'
import { taskApi } from '@/services/taskApi'
import type { TaskItem } from '@/components/TaskList.vue'
import JSZip from 'jszip'

const tasks = ref<TaskItem[]>([])
const loading = ref(false)
const page = ref(1)
const pageSize = ref(24)
const total = ref(0)

// Bulk mode
const bulkMode = ref(false)
const selectedIds = ref(new Set<number>())

async function loadResults() {
  loading.value = true
  try {
    const res = await taskApi.list({ page: page.value, pageSize: pageSize.value, status: 'completed' })
    tasks.value = res.data.data?.records || []
    total.value = res.data.data?.total || 0
  } catch (e) {
    console.error('Load results error:', e)
  } finally {
    loading.value = false
  }
}

function toggleBulkMode() {
  bulkMode.value = !bulkMode.value
  if (!bulkMode.value) selectedIds.value.clear()
}

function toggleSelect(id: number) {
  const s = new Set(selectedIds.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  selectedIds.value = s
}

function selectAll() {
  if (selectedIds.value.size === tasks.value.length) {
    selectedIds.value = new Set()
  } else {
    selectedIds.value = new Set(tasks.value.map((t) => t.id))
  }
}

// ─── Download helpers ───

async function fetchAsBlob(url: string): Promise<Blob> {
  const token = localStorage.getItem('auth_token')
  const resp = await fetch('/api/proxy/image', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ url }),
  })
  if (!resp.ok) throw new Error('Download failed')
  return resp.blob()
}

function downloadBlob(blob: Blob, filename: string) {
  const objUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objUrl
  a.download = filename
  a.click()
  URL.revokeObjectURL(objUrl)
}

async function handleDownload(task: TaskItem) {
  const url = task.result_image_urls?.[0]
  if (!url) { warning('没有可下载的图片'); return }
  try {
    const blob = await fetchAsBlob(url)
    const ext = blob.type === 'image/png' ? 'png' : 'jpg'
    downloadBlob(blob, `${task.model}_${task.toapis_task_id?.slice(0, 8) || 'image'}.${ext}`)
    success('下载完成')
  } catch {
    error('下载失败')
  }
}

async function handleDelete(task: TaskItem) {
  try {
    await taskApi.delete(task.id)
    tasks.value = tasks.value.filter((t) => t.id !== task.id)
    total.value--
    success('已删除')
  } catch { /* cancelled */ }
}

// ─── Batch operations ───

async function handleBatchDelete() {
  const count = selectedIds.value.size
  try {
    await confirmDanger({
      title: '批量删除',
      message: `确定要删除选中的 ${count} 项结果吗？此操作不可恢复。`,
      confirmText: '删除',
      cancelText: '取消',
    })
  } catch { return }

  loading.value = true
  let deleted = 0
  for (const id of selectedIds.value) {
    try { await taskApi.delete(id); deleted++ } catch { /* skip */ }
  }
  selectedIds.value.clear()
  bulkMode.value = false
  await loadResults()
  loading.value = false
  success(`已删除 ${deleted} 项`)
}

async function handleBatchDownload() {
  const selected = tasks.value.filter((t) => selectedIds.value.has(t.id) && t.result_image_urls?.[0])
  if (selected.length === 0) { warning('所选结果没有可下载的图片'); return }

  loading.value = true
  let count = 0
  for (const task of selected) {
    try {
      const blob = await fetchAsBlob(task.result_image_urls[0])
      const ext = blob.type === 'image/png' ? 'png' : 'jpg'
      downloadBlob(blob, `${task.model}_${task.toapis_task_id?.slice(0, 8) || 'image'}.${ext}`)
      count++
      // Small delay between downloads to avoid browser throttling
      await new Promise((r) => setTimeout(r, 300))
    } catch { /* skip */ }
  }
  loading.value = false
  success(`已下载 ${count} 张图片`)
}

async function handlePackDownload() {
  const selected = tasks.value.filter((t) => selectedIds.value.has(t.id) && t.result_image_urls?.[0])
  if (selected.length === 0) { warning('所选结果没有可下载的图片'); return }

  loading.value = true
  const zip = new JSZip()
  let fetched = 0

  for (const task of selected) {
    try {
      const blob = await fetchAsBlob(task.result_image_urls[0])
      const ext = blob.type === 'image/png' ? 'png' : 'jpg'
      zip.file(`${task.model}_${task.toapis_task_id?.slice(0, 8) || 'image'}.${ext}`, blob)
      fetched++
    } catch { /* skip */ }
  }

  if (fetched === 0) { error('打包失败：无法获取图片'); loading.value = false; return }

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  downloadBlob(zipBlob, `momo-results-${new Date().toISOString().slice(0, 10)}.zip`)
  loading.value = false
  success(`已打包 ${fetched} 张图片`)
}

// ─── Preview ───

const { visible: previewVisible, url: previewUrl, open: openPreviewRaw } = useImagePreview()
function openPreview(url: string) { if (!bulkMode.value) openPreviewRaw(url) }

// ─── Pagination ───

function handlePageChange(p: number) { page.value = p; loadResults() }
function handlePageSizeChange(s: number) { pageSize.value = s; page.value = 1; loadResults() }

onMounted(() => { loadResults() })
</script>

<template>
  <PageLayout>
    <template #header>
      <h2>生图结果</h2>
    </template>
    <template #extra>
      <div class="header-actions">
        <template v-if="bulkMode">
          <span class="bulk-count">已选 {{ selectedIds.size }} 项</span>
          <el-button @click="selectAll">
            {{ selectedIds.size === tasks.length && tasks.length > 0 ? '取消全选' : '全选' }}
          </el-button>
          <el-button type="danger" :disabled="selectedIds.size === 0" @click="handleBatchDelete">
            批量删除
          </el-button>
          <el-button type="primary" :disabled="selectedIds.size === 0" @click="handleBatchDownload">
            批量下载
          </el-button>
          <el-button type="primary" :disabled="selectedIds.size === 0" @click="handlePackDownload">
            打包下载
          </el-button>
          <el-button @click="toggleBulkMode">
            <el-icon><Close /></el-icon>取消
          </el-button>
        </template>
        <el-button v-else @click="toggleBulkMode">批量操作</el-button>
      </div>
    </template>

    <div v-loading="loading" class="results-gallery">
      <el-empty v-if="!loading && tasks.length === 0" description="暂无生成结果" />
      <div v-else class="result-grid">
        <div
          v-for="task in tasks"
          :key="task.id"
          class="result-card"
          :class="{ selected: bulkMode && selectedIds.has(task.id) }"
          @click="bulkMode && toggleSelect(task.id)"
        >
          <!-- Selection circle (Google Photos style) -->
          <div v-if="bulkMode" class="select-circle" :class="{ checked: selectedIds.has(task.id) }" @click.stop="toggleSelect(task.id)">
            <el-icon v-if="selectedIds.has(task.id)" size="14"><Check /></el-icon>
          </div>

          <!-- Selection overlay on hover -->
          <div v-if="bulkMode" class="select-overlay" :class="{ on: selectedIds.has(task.id) }" />

          <div class="result-image" @click="task.result_image_urls?.[0] && openPreview(task.result_image_urls[0])">
            <img v-if="task.result_image_urls?.[0]" :src="task.result_image_urls[0]" alt="" />
            <el-icon v-else size="32"><Picture /></el-icon>
          </div>
          <div class="result-info">
            <div class="result-prompt" :title="task.prompt">{{ task.prompt }}</div>
            <div class="result-meta">
              <span>{{ task.model }}</span>
              <span>{{ task.resolution }} / {{ task.aspectRatio }}</span>
              <span>{{ task.created_at?.slice(0, 10) }}</span>
            </div>
          </div>
          <div class="result-actions" v-if="!bulkMode">
            <el-button size="small" :icon="Download" @click="handleDownload(task)" v-if="task.result_image_urls?.[0]">下载</el-button>
            <el-button size="small" :icon="Delete" type="danger" @click="handleDelete(task)">删除</el-button>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="result-pagination">
        <el-pagination
          :current-page="page"
          :page-size="pageSize"
          :page-sizes="[24, 48, 96]"
          :total="total"
          layout="total, sizes, prev, pager, next"
          :pager-count="5"
          @current-change="handlePageChange"
          @size-change="handlePageSizeChange"
        />
      </div>
    </template>
  </PageLayout>

  <!-- Preview -->
  <UiImagePreview v-model="previewVisible" :url="previewUrl" />
</template>

<style scoped>
.header-actions {
  display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
}

.bulk-count {
  font-size: var(--momo-font-size-base); font-weight: 500;
  color: var(--el-color-primary); margin-right: 4px;
}

.results-gallery { display: flex; flex-direction: column; gap: 16px; }

.result-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}

.result-card {
  background: var(--el-fill-color-lighter);
  border-radius: var(--momo-radius-md);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: box-shadow 0.2s;
  position: relative;
  cursor: default;
}
.result-card:hover { box-shadow: var(--el-box-shadow-light); }
.result-card.selected { box-shadow: 0 0 0 2px var(--el-color-primary); }

/* ─── Selection circle ─── */
.select-circle {
  position: absolute; top: 10px; left: 10px; z-index: 3;
  width: 24px; height: 24px; border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.9);
  background: rgba(0,0,0,0.25);
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s ease;
  cursor: pointer;
}
.select-circle.checked {
  background: var(--el-color-primary);
  border-color: var(--el-color-primary);
}
.select-circle .el-icon {
  color: var(--momo-color-text-inverse);
}

/* Semi-transparent overlay on card when hovered in bulk mode */
.select-overlay {
  position: absolute; inset: 0; z-index: 1;
  background: transparent;
  transition: background 0.15s ease;
  pointer-events: none;
}
.result-card:hover .select-overlay {
  background: rgba(0,0,0,0.08);
}
.select-overlay.on {
  background: rgba(var(--el-color-primary-rgb, 64 158 255), 0.06);
}

.result-image {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-fill-color);
  overflow: hidden;
  cursor: pointer;
}
.result-image img {
  width: 100%; height: 100%;
  object-fit: cover;
  transition: transform 0.3s;
}
.result-image:hover img { transform: scale(1.05); }

.result-info {
  padding: 10px 12px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.result-prompt {
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.result-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  font-size: var(--momo-font-size-xs);
  color: var(--el-text-color-secondary);
}

.result-actions {
  display: flex;
  gap: 4px;
  padding: 6px 12px 10px;
}

.result-pagination {
  display: flex;
  justify-content: flex-end;
}

</style>
