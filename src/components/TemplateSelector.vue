<script setup lang="ts">
import { ref, watch } from 'vue'
import { CircleCheckFilled } from '@element-plus/icons-vue'
import { templateApi } from '@/services/templateApi'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{
  'update:visible': [value: boolean]
  'select': [templates: Array<{ name: string; url: string; previewUrl: string }>]
}>()

const loading = ref(false)
const templates = ref<any[]>([])
const selected = ref<Set<number>>(new Set())

watch(() => props.visible, (v) => {
  if (v) {
    selected.value = new Set()
    loadTemplates()
  }
})

async function loadTemplates() {
  loading.value = true
  try {
    const res = await templateApi.list()
    templates.value = res.data.data || []
  } catch {
    templates.value = []
  } finally {
    loading.value = false
  }
}

function toggleSelect(id: number) {
  const s = new Set(selected.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  selected.value = s
}

function confirm() {
  const picked = templates.value.filter((t) => selected.value.has(t.id))
  emit('select', picked.map((t) => ({
    name: t.name || t.original_filename || '',
    url: t.public_url,
    previewUrl: t.public_url,
  })))
  emit('update:visible', false)
}

function close() {
  emit('update:visible', false)
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="选择模板图"
    width="700px"
    @close="close"
  >
    <div v-loading="loading">
      <el-empty v-if="!loading && templates.length === 0" description="暂无模板图，请先在模板图库中上传" />
      <div v-else class="template-grid">
        <div
          v-for="t in templates"
          :key="t.id"
          class="template-item"
          :class="{ selected: selected.has(t.id) }"
          @click="toggleSelect(t.id)"
        >
          <img :src="t.public_url" :alt="t.name || t.original_filename" />
          <div class="template-info">
            <span class="template-name">{{ t.name || t.original_filename }}</span>
          </div>
          <el-icon v-if="selected.has(t.id)" class="check-icon" color="var(--el-color-primary)" size="20"><CircleCheckFilled /></el-icon>
        </div>
      </div>
    </div>
    <template #footer>
      <el-button @click="close">取消</el-button>
      <el-button type="primary" @click="confirm" :disabled="selected.size === 0">
        确认选择（{{ selected.size }}张）
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.template-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  max-height: 400px;
  overflow-y: auto;
}
.template-item {
  position: relative;
  aspect-ratio: 1;
  border-radius: 8px;
  overflow: hidden;
  border: 3px solid transparent;
  cursor: pointer;
  transition: border-color 0.2s;
}
.template-item:hover { border-color: var(--el-color-primary-light-5); }
.template-item.selected { border-color: var(--el-color-primary); }
.template-item img {
  width: 100%; height: 100%; object-fit: cover;
}
.template-info {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  padding: 4px 8px;
  background: rgba(0, 0, 0, 0.5);
}
.template-name {
  color: #fff; font-size: 12px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.check-icon {
  position: absolute; top: 4px; right: 4px;
  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3));
}
</style>
