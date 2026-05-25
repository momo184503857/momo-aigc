<script setup lang="ts">
import { ref, watch } from 'vue'
import { CircleCheckFilled } from '@element-plus/icons-vue'
import { templateApi, type TemplateTag } from '@/services/templateApi'

const props = defineProps<{ visible: boolean; single?: boolean }>()
const emit = defineEmits<{
  'update:visible': [value: boolean]
  'select': [templates: Array<{ name: string; url: string; previewUrl: string }>]
}>()

const loading = ref(false)
const templates = ref<any[]>([])
const selected = ref<Set<number>>(new Set())
const tags = ref<TemplateTag[]>([])
const selectedTagId = ref<number | undefined>(undefined)

watch(() => props.visible, (v) => {
  if (v) {
    selected.value = new Set()
    loadTemplates()
    loadTags()
  }
})

async function loadTags() {
  try {
    const res = await templateApi.listTags()
    tags.value = res.data.data || []
  } catch { /* ignore */ }
}

async function loadTemplates() {
  loading.value = true
  try {
    const res = await templateApi.list({
      page: 1,
      pageSize: 100,
      tagId: selectedTagId.value,
    })
    templates.value = res.data.data?.records || []
  } catch {
    templates.value = []
  } finally {
    loading.value = false
  }
}

function filterByTag(tagId: number | undefined) {
  selectedTagId.value = tagId
  loadTemplates()
}

function toggleSelect(id: number) {
  if (props.single) {
    selected.value = new Set(selected.value.has(id) ? [] : [id])
  } else {
    const s = new Set(selected.value)
    if (s.has(id)) s.delete(id)
    else s.add(id)
    selected.value = s
  }
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
    title="从模板库选择"
    width="1200px"
    :close-on-click-modal="false"
    @close="close"
  >
    <!-- Tag filter -->
    <div v-if="tags.length > 0" class="selector-tag-filter">
      <el-tag
        :type="!selectedTagId ? 'primary' : 'info'"
        size="small"
        class="selector-tag"
        @click="filterByTag(undefined)"
      >
        全部
      </el-tag>
      <el-tag
        v-for="tag in tags"
        :key="tag.id"
        :type="selectedTagId === tag.id ? 'primary' : 'info'"
        size="small"
        class="selector-tag"
        @click="filterByTag(tag.id)"
      >
        {{ tag.name }} ({{ tag.usage_count }})
      </el-tag>
    </div>

    <div v-loading="loading" class="selector-body">
      <el-empty v-if="!loading && templates.length === 0" description="暂无模板图，请先在图库中上传" />
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
            <span v-if="t.tags && t.tags.length > 0" class="template-tags">
              <el-tag v-for="tag in t.tags" :key="tag.id" size="small" class="mini-tag">{{ tag.name }}</el-tag>
            </span>
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
.selector-tag-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 14px;
}

.selector-tag {
  cursor: pointer;
  user-select: none;
}

.selector-body {
  min-height: 200px;
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 10px;
  max-height: 520px;
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
  padding: 6px 8px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.template-name {
  color: #fff; font-size: 12px; font-weight: 500;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.template-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
}

.mini-tag {
  font-size: 10px;
  padding: 0 4px;
  height: 18px;
  line-height: 18px;
}

.check-icon {
  position: absolute; top: 6px; right: 6px;
  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3));
}
</style>
