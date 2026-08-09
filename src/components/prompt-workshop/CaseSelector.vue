<script setup lang="ts">
/**
 * CaseSelector - 参考案例选择器弹窗。
 * 点某字段「选词」-> 弹出该字段关键词列表 + 参考图缩略图 -> 看图选词 -> 点击填入对应字段。
 */
import { ref, watch } from 'vue'
import { promptCasesApi } from '@/services/promptCasesApi'
import type { PromptCase } from '@/services/promptCasesApi'
import { useImageRetry } from '@/composables/useImageRetry'
import { Picture } from '@element-plus/icons-vue'

const props = defineProps<{
  visible: boolean
  segmentKey: string
  segmentLabel: string
}>()

const emit = defineEmits<{
  'update:visible': [val: boolean]
  'select': [keyword: string]
}>()

const { retryOnError } = useImageRetry()
const loading = ref(false)
const cases = ref<PromptCase[]>([])

// 按关键词分组
const groupedCases = ref<{ keyword: string; items: PromptCase[] }[]>([])

function groupCases(items: PromptCase[]) {
  const map = new Map<string, PromptCase[]>()
  for (const c of items) {
    const kw = c.keyword
    if (!map.has(kw)) map.set(kw, [])
    map.get(kw)!.push(c)
  }
  groupedCases.value = Array.from(map.entries()).map(([keyword, items]) => ({ keyword, items }))
}

async function loadCases() {
  if (!props.segmentKey) return
  loading.value = true
  try {
    const res = await promptCasesApi.list(props.segmentKey)
    cases.value = res.data.data || []
    groupCases(cases.value)
  } catch {
    cases.value = []
    groupedCases.value = []
  } finally {
    loading.value = false
  }
}

watch(() => props.visible, (v) => {
  if (v) loadCases()
})

function handleSelect(keyword: string) {
  emit('select', keyword)
  emit('update:visible', false)
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="emit('update:visible', $event)"
    :title="`选词 · ${segmentLabel}`"
    width="780px"
    :close-on-click-modal="true"
  >
    <div v-loading="loading" class="case-selector-body">
      <el-empty v-if="!loading && groupedCases.length === 0" description="暂无参考案例，可先在作品库发布带结构化字段的作品" :image-size="60" />
      <div v-else class="case-groups">
        <div v-for="group in groupedCases" :key="group.keyword" class="case-group">
          <div class="case-group-header" @click="handleSelect(group.keyword)">
            <span class="case-keyword">{{ group.keyword }}</span>
            <el-button size="small" type="primary" text>选用</el-button>
          </div>
          <div class="case-images">
            <div
              v-for="item in group.items.slice(0, 4)"
              :key="item.id"
              class="case-image-item"
              @click="handleSelect(group.keyword)"
            >
              <img
                v-if="item.image_url"
                :src="item.image_url"
                :alt="item.keyword"
                loading="lazy"
                @error="retryOnError($event, item.image_url)"
              />
              <div v-else class="case-image-placeholder">
                <el-icon size="20"><Picture /></el-icon>
              </div>
              <el-tag v-if="item.source === 'official'" type="warning" size="small" class="case-source-badge">官方</el-tag>
            </div>
          </div>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.case-selector-body {
  min-height: 200px;
  max-height: 60vh;
  overflow-y: auto;
}

.case-groups {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.case-group {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--momo-radius-md);
  overflow: hidden;
}

.case-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--el-fill-color-lighter);
  cursor: pointer;
  transition: background 0.2s;
}
.case-group-header:hover {
  background: var(--el-color-primary-light-9);
}

.case-keyword {
  font-size: var(--momo-font-size-base);
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.case-images {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
}

.case-image-item {
  position: relative;
  width: 100px;
  height: 100px;
  border-radius: var(--momo-radius-sm);
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
  cursor: pointer;
  flex-shrink: 0;
  transition: border-color 0.2s, transform 0.2s;
}
.case-image-item:hover {
  border-color: var(--el-color-primary);
  transform: scale(1.05);
}
.case-image-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.case-image-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--el-text-color-placeholder);
}
.case-source-badge {
  position: absolute;
  top: 4px;
  left: 4px;
}
</style>
