<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowDown } from '@element-plus/icons-vue'
import { featurePromptApi } from '@/services/featurePromptApi'
import type { FeaturePromptItem } from '@/services/featurePromptApi'
import { FEATURE_CONFIGS } from '@/configs/featureConfig'
import { MODELS } from '@/types/adapter'
import PageLayout from '@/components/PageLayout.vue'

const categoryGroups = [
  {
    name: '常用功能',
    featureIds: ['change-clothes', 'change-bg', 'change-face'],
  },
  {
    name: '商品素材',
    featureIds: ['detail-pic', 'fabric-pic', 'flat-pic', '3d-pic'],
  },
  {
    name: '模特资产',
    featureIds: ['model-gen', 'three-view'],
  },
]

interface PromptRow extends FeaturePromptItem {
  _dirty: boolean
}

interface FeatureBlock {
  featureId: string
  label: string
  prompts: PromptRow[]
}

interface CategoryBlock {
  name: string
  features: FeatureBlock[]
}

const categories = ref<CategoryBlock[]>([])
const loading = ref(false)
const saving = ref(false)
const expandedCats = ref(new Set<number>())

const allExpanded = computed(() => expandedCats.value.size === categories.value.length && categories.value.length > 0)

function toggleCat(index: number) {
  const s = new Set(expandedCats.value)
  if (s.has(index)) s.delete(index)
  else s.add(index)
  expandedCats.value = s
}

function toggleAll() {
  if (allExpanded.value) {
    expandedCats.value = new Set()
  } else {
    expandedCats.value = new Set(categories.value.map((_, i) => i))
  }
}

function modelDisplayName(modelId: string): string {
  const m = MODELS.find(m => m.id === modelId)
  return m?.name || modelId
}

async function load() {
  loading.value = true
  try {
    const res = await featurePromptApi.listAll()
    const items: FeaturePromptItem[] = res.data.data || []

    const promptMap = new Map<string, FeaturePromptItem[]>()
    items.forEach(item => {
      const list = promptMap.get(item.feature_id) || []
      list.push(item)
      promptMap.set(item.feature_id, list)
    })

    categories.value = categoryGroups.map(cat => ({
      name: cat.name,
      features: cat.featureIds.map(fid => {
        const prompts = (promptMap.get(fid) || []).sort(
          (a, b) => a.model_id.localeCompare(b.model_id)
        )
        return {
          featureId: fid,
          label: FEATURE_CONFIGS[fid]?.label || fid,
          prompts: prompts.map(p => ({ ...p, _dirty: false })),
        }
      }),
    }))
  } catch {
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

function markDirty(prompt: PromptRow) {
  prompt._dirty = true
}

async function saveFeature(feature: FeatureBlock) {
  saving.value = true
  let ok = 0
  for (const p of feature.prompts) {
    if (!p._dirty) continue
    try {
      await featurePromptApi.update(p.id, {
        system_prompt: p.system_prompt,
        user_prompt_label: p.user_prompt_label,
        user_prompt_placeholder: p.user_prompt_placeholder,
      })
      p._dirty = false
      ok++
    } catch { /* skip */ }
  }
  saving.value = false
  if (ok > 0) ElMessage.success(`已保存 ${ok} 条`)
}

onMounted(() => load())
</script>

<template>
  <PageLayout>
    <template #header>功能提示词管理</template>

    <div v-loading="loading">
      <div class="toolbar">
        <el-alert
          title="提示词中使用 {user_prompt} 作为用户补充输入的占位符。"
          type="info" show-icon :closable="false" class="toolbar-alert"
        />
        <el-button size="small" @click="toggleAll">
          {{ allExpanded ? '全部折叠' : '全部展开' }}
        </el-button>
      </div>

      <div class="categories-container">
        <div v-for="(cat, ci) in categories" :key="cat.name" class="category-card">
          <div class="category-header" @click="toggleCat(ci)">
            <div class="category-header-left">
              <el-icon class="chevron" :class="{ rotated: expandedCats.has(ci) }">
                <ArrowDown />
              </el-icon>
              <span class="category-name">{{ cat.name }}</span>
            </div>
            <span class="category-count">{{ cat.features.length }} 个功能</span>
          </div>

          <div v-show="expandedCats.has(ci)" class="category-body">
            <div v-for="feat in cat.features" :key="feat.featureId" class="feature-block">
              <div class="feature-header">
                <span class="feature-label">{{ feat.label }}</span>
              </div>

              <div class="feature-prompts">
                <div v-for="prompt in feat.prompts" :key="prompt.id" class="prompt-row">
                  <div class="prompt-model">{{ modelDisplayName(prompt.model_id) }}</div>
                  <el-input
                    v-model="prompt.system_prompt"
                    type="textarea"
                    :rows="3"
                    placeholder="系统提示词"
                    @input="markDirty(prompt)"
                  />
                </div>
              </div>

              <div class="feature-footer">
                <span class="footer-label">输入框标签</span>
                <el-input
                  v-model="feat.prompts[0].user_prompt_label"
                  size="small"
                  style="width: 140px"
                  @input="markDirty(feat.prompts[0])"
                />
                <span class="footer-label">占位文字</span>
                <el-input
                  v-model="feat.prompts[0].user_prompt_placeholder"
                  size="small"
                  style="width: 220px"
                  @input="markDirty(feat.prompts[0])"
                />
                <el-button
                  size="small"
                  type="primary"
                  :loading="saving"
                  @click="saveFeature(feat)"
                >
                  保存
                </el-button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <el-empty v-if="categories.length === 0 && !loading" description="暂无数据" />
    </div>
  </PageLayout>
</template>

<style scoped>
.toolbar {
  display: flex; align-items: flex-start; gap: 12px;
  margin-bottom: 24px;
}
.toolbar-alert { flex: 1; }

.categories-container {
  display: flex; flex-direction: column; gap: 20px;
}

.category-card {
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
  overflow: hidden;
  background: var(--el-bg-color);
}

.category-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 20px;
  background: var(--el-fill-color-light);
  border-bottom: 1px solid var(--el-border-color);
  cursor: pointer; user-select: none;
  transition: background 0.15s;
}
.category-header:hover {
  background: var(--el-fill-color);
}

.category-header-left {
  display: flex; align-items: center; gap: 10px;
}

.chevron {
  transition: transform 0.25s;
  font-size: 14px; color: var(--el-text-color-secondary);
}
.chevron.rotated {
  transform: rotate(180deg);
}

.category-name {
  font-size: 16px; font-weight: 600;
  color: var(--el-text-color-primary);
  letter-spacing: 1px;
}

.category-count {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.category-body {
  padding: 0;
}

.feature-block {
  padding: 16px 20px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.feature-block:last-child {
  border-bottom: none;
}

.feature-header {
  margin-bottom: 12px;
}

.feature-label {
  font-size: 15px; font-weight: 600;
  color: var(--el-color-primary);
  padding-left: 10px;
  border-left: 3px solid var(--el-color-primary);
}

.feature-prompts {
  display: flex; flex-direction: column; gap: 10px;
  margin-bottom: 12px;
}

.prompt-row {
  display: flex; gap: 12px; align-items: flex-start;
}

.prompt-model {
  width: 170px; flex-shrink: 0;
  font-size: 13px; font-weight: 500;
  color: var(--el-text-color-regular);
  padding-top: 8px;
}

.feature-footer {
  display: flex; align-items: center; gap: 8px;
  padding-top: 10px;
  border-top: 1px dashed var(--el-border-color-lighter);
}

.footer-label {
  font-size: 13px; color: var(--el-text-color-secondary);
  white-space: nowrap;
}
</style>
