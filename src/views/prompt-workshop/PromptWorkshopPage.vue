<script setup lang="ts">
/**
 * PromptWorkshopPage - 提示词工坊。
 * 独立页面，不改动生图表单，完全解耦。
 *
 * 六个分字段输入框（主体/风格/场景/光影/构图/画质）+ 负面词框，
 * 每个字段旁有「选词」按钮弹出参考案例选择器（看图选词）。
 * 实时预览拼接结果，可保存到提示词库（带 segments 字段）。
 */
defineOptions({ name: 'PromptWorkshopPage' })
import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import PageLayout from '@/components/PageLayout.vue'
import CaseSelector from '@/components/prompt-workshop/CaseSelector.vue'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { usePromptLibrary } from '@/composables/usePromptLibrary'
import { promptLibraryApi } from '@/services/promptLibraryApi'
import {
  SEGMENT_META,
  emptySegments,
  assemblePrompt,
  parsePrompt,
  hasSegments,
  type PromptSegments,
  type SegmentKey,
} from '@/utils/promptAssembler'
import { Collection, Search, Refresh, DocumentCopy, Check } from '@element-plus/icons-vue'

const route = useRoute()
const { success, warning, error } = useUiFeedback()

const segments = ref<PromptSegments>(emptySegments())
const negative = ref('')

// 编辑模式：从提示词库加载已有条目
const editingId = ref<string | null>(null)
const editingName = ref('')

// 实时预览拼接结果
const assembledPrompt = computed(() => assemblePrompt(segments.value, negative.value))

// 案例选择器
const caseSelectorVisible = ref(false)
const caseSelectorSegment = ref<SegmentKey>('subject')
const caseSelectorLabel = ref('主体')

function openCaseSelector(key: SegmentKey, label: string) {
  caseSelectorSegment.value = key
  caseSelectorLabel.value = label
  caseSelectorVisible.value = true
}

function handleCaseSelect(keyword: string) {
  const key = caseSelectorSegment.value
  const current = segments.value[key].trim()
  // 如果当前字段已有内容，追加（逗号分隔）；否则直接填入
  if (current && !current.includes(keyword)) {
    segments.value[key] = `${current}, ${keyword}`
  } else if (!current) {
    segments.value[key] = keyword
  }
}

// 保存到提示词库
const showSaveDialog = ref(false)
const saveName = ref('')
const saveTags = ref<string[]>([])
const saving = ref(false)

const { allTags } = usePromptLibrary({ pageSize: 1 })

function openSaveDialog() {
  if (!assembledPrompt.value.trim()) {
    warning('提示词内容为空，无法保存')
    return
  }
  saveName.value = editingId.value ? editingName.value : (segments.value.subject?.slice(0, 20) || '结构化提示词')
  showSaveDialog.value = true
}

async function handleSave() {
  if (!saveName.value.trim()) {
    warning('请输入名称')
    return
  }
  saving.value = true
  try {
    const segData: Record<string, string> = {}
    for (const meta of SEGMENT_META) {
      if (segments.value[meta.key]?.trim()) {
        segData[meta.key] = segments.value[meta.key].trim()
      }
    }

    if (editingId.value) {
      await promptLibraryApi.update(editingId.value, {
        name: saveName.value.trim(),
        content: assembledPrompt.value,
        tags: saveTags.value,
        segments: segData,
      })
      success('提示词已更新')
    } else {
      await promptLibraryApi.create({
        name: saveName.value.trim(),
        content: assembledPrompt.value,
        tags: saveTags.value,
        segments: segData,
      })
      success('提示词已保存到提示词库')
    }
    showSaveDialog.value = false
  } catch (e) {
    error(e, '保存失败')
  } finally {
    saving.value = false
  }
}

// 复制提示词
function copyPrompt() {
  if (!assembledPrompt.value) return
  navigator.clipboard.writeText(assembledPrompt.value).then(() => success('已复制提示词')).catch(() => warning('复制失败'))
}

// 重置
function handleReset() {
  segments.value = emptySegments()
  negative.value = ''
  editingId.value = null
  editingName.value = ''
}

// 从提示词库加载编辑
async function loadFromLibrary(id: string) {
  try {
    const res = await promptLibraryApi.list()
    const item = (res.data.data as any[]).find((p) => p.id === id)
    if (!item) {
      warning('未找到该提示词')
      return
    }
    const { segments: segs, negative: neg } = parsePrompt(item.content, item.segments)
    segments.value = segs
    negative.value = neg
    editingId.value = item.id
    editingName.value = item.name
    success(`已加载「${item.name}」`)
  } catch (e) {
    error(e, '加载失败')
  }
}

// 路由参数 ?edit=<id> 从提示词库页面跳转来编辑
watch(() => route.query.edit, (editId) => {
  if (editId && typeof editId === 'string') {
    loadFromLibrary(editId)
  }
}, { immediate: true })
</script>

<template>
  <PageLayout>
    <template #header>
      <div class="workshop-header">
        <h2>提示词工坊</h2>
        <span v-if="editingId" class="editing-badge">
          <el-icon><Check /></el-icon>
          编辑中：{{ editingName }}
        </span>
      </div>
    </template>
    <template #extra>
      <el-button :icon="Refresh" @click="handleReset">重置</el-button>
      <el-button :icon="DocumentCopy" @click="copyPrompt" :disabled="!assembledPrompt">复制提示词</el-button>
      <el-button type="primary" :icon="Collection" @click="openSaveDialog">保存到提示词库</el-button>
    </template>

    <div class="workshop-body">
      <!-- 左：结构化编辑区 -->
      <div class="workshop-left">
        <div class="workshop-intro">
          按六层权重公式（主体40% + 风格20% + 场景15% + 光影10% + 构图10% + 画质5%）分字段填写，
          字段越靠前影响越大。点击「选词」可查看参考图，看图选词。
        </div>

        <div class="segments-form">
          <div v-for="meta in SEGMENT_META" :key="meta.key" class="segment-row">
            <div class="segment-label-col">
              <span class="segment-label">{{ meta.label }}</span>
              <span class="segment-weight">{{ meta.weight }}%</span>
            </div>
            <div class="segment-input-col">
              <el-input
                v-model="segments[meta.key]"
                type="textarea"
                :rows="meta.key === 'subject' ? 3 : 2"
                :placeholder="meta.placeholder"
                resize="none"
              />
            </div>
            <div class="segment-action-col">
              <el-button size="small" :icon="Search" @click="openCaseSelector(meta.key, meta.label)">选词</el-button>
            </div>
          </div>

          <!-- 负面词 -->
          <div class="segment-row negative-row">
            <div class="segment-label-col">
              <span class="segment-label negative-label">负向规避</span>
            </div>
            <div class="segment-input-col">
              <el-input
                v-model="negative"
                type="textarea"
                :rows="2"
                placeholder="如：模糊、低质量、多余手指、变形"
                resize="none"
              />
              <div class="negative-hint">以自然语言追加到提示词末尾（如「请避免出现：...」）</div>
            </div>
            <div class="segment-action-col"></div>
          </div>
        </div>
      </div>

      <!-- 右：实时预览 -->
      <div class="workshop-right">
        <div class="preview-panel">
          <div class="preview-title">拼接预览</div>
          <div class="preview-prompt">{{ assembledPrompt || '（填写左侧字段后，这里会实时显示拼接后的完整提示词）' }}</div>
          <div class="preview-stats">
            <span>共 {{ assembledPrompt.length }} 字</span>
            <span v-if="hasSegments(segments)">结构化 ✓</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 案例选择器 -->
    <CaseSelector
      v-model:visible="caseSelectorVisible"
      :segment-key="caseSelectorSegment"
      :segment-label="caseSelectorLabel"
      @select="handleCaseSelect"
    />

    <!-- 保存弹窗 -->
    <el-dialog v-model="showSaveDialog" title="保存到提示词库" width="480px" :close-on-click-modal="false">
      <el-form label-position="top">
        <el-form-item label="名称">
          <el-input v-model="saveName" placeholder="给这条提示词起个名字" maxlength="40" show-word-limit />
        </el-form-item>
        <el-form-item label="标签（可选）">
          <el-select v-model="saveTags" multiple filterable allow-create placeholder="选择或输入标签" style="width: 100%">
            <el-option v-for="tag in allTags" :key="tag" :label="tag" :value="tag" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showSaveDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </PageLayout>
</template>

<style scoped>
.workshop-header {
  display: flex;
  align-items: center;
  gap: 12px;
}
.workshop-header h2 {
  margin: 0;
  font-size: var(--momo-font-size-xl);
}
.editing-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--momo-font-size-sm);
  color: var(--el-color-success);
  background: var(--el-color-success-light-9);
  padding: 2px 10px;
  border-radius: var(--momo-radius-md);
}

.workshop-body {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}

.workshop-left {
  flex: 1;
  min-width: 0;
}

.workshop-intro {
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-secondary);
  line-height: 1.6;
  padding: 12px 16px;
  background: var(--el-color-primary-light-9);
  border-radius: var(--momo-radius-md);
  margin-bottom: 20px;
}

.segments-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.segment-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.segment-label-col {
  width: 80px;
  flex-shrink: 0;
  text-align: right;
  padding-top: 6px;
}
.segment-label {
  font-size: var(--momo-font-size-sm);
  font-weight: 600;
  color: var(--el-text-color-primary);
  display: block;
}
.segment-weight {
  font-size: var(--momo-font-size-xs);
  color: var(--el-text-color-placeholder);
}
.negative-label {
  color: var(--el-color-danger);
}

.segment-input-col {
  flex: 1;
  min-width: 0;
}
.negative-hint {
  font-size: var(--momo-font-size-xs);
  color: var(--el-text-color-placeholder);
  margin-top: 4px;
}

.segment-action-col {
  width: 72px;
  flex-shrink: 0;
  padding-top: 2px;
}

.workshop-right {
  flex: 0 0 360px;
}

.preview-panel {
  position: sticky;
  top: 0;
  background: var(--el-fill-color-lighter);
  border-radius: var(--momo-radius-md);
  padding: 16px;
  border: 1px solid var(--el-border-color-lighter);
}
.preview-title {
  font-size: var(--momo-font-size-sm);
  font-weight: 600;
  color: var(--el-text-color-secondary);
  margin-bottom: 12px;
}
.preview-prompt {
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-regular);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  min-height: 120px;
  max-height: 400px;
  overflow-y: auto;
  background: var(--el-bg-color);
  border-radius: var(--momo-radius-sm);
  padding: 12px;
}
.preview-stats {
  display: flex;
  gap: 12px;
  font-size: var(--momo-font-size-xs);
  color: var(--el-text-color-placeholder);
  margin-top: 8px;
}

@media (max-width: 900px) {
  .workshop-body {
    flex-direction: column;
  }
  .workshop-right {
    flex: none;
    width: 100%;
  }
}
</style>
