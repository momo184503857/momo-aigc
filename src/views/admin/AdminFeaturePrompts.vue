<script setup lang="ts">
defineOptions({ name: 'AdminFeaturePrompts' })
import { ref, computed, onMounted } from 'vue'
import { useUiFeedback } from '@/composables/useUiFeedback'
const { success, info, error } = useUiFeedback()
import { featurePromptApi } from '@/services/featurePromptApi'
import type { FeaturePromptItem } from '@/services/featurePromptApi'
import { FEATURE_CONFIGS } from '@/configs/featureConfig'
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

interface PromptRow {
  id: number
  feature_id: string
  system_prompt: string
  _dirty: boolean
}

interface FeatureBlock {
  featureId: string
  label: string
  prompt: PromptRow | null
}

interface CategoryBlock {
  name: string
  features: FeatureBlock[]
}

const categories = ref<CategoryBlock[]>([])
const loading = ref(false)
const saving = ref(false)

const dirtyCount = computed(() =>
  categories.value.reduce(
    (n, cat) => n + cat.features.reduce((m, f) => m + (f.prompt?._dirty ? 1 : 0), 0),
    0,
  ),
)

function markDirty(feat: FeatureBlock) {
  if (feat.prompt) feat.prompt._dirty = true
}

async function load() {
  loading.value = true
  try {
    const res = await featurePromptApi.listAll()
    const items: FeaturePromptItem[] = res.data.data || []
    const byFeature = new Map<string, FeaturePromptItem>()
    items.forEach((item) => byFeature.set(item.feature_id, item))

    categories.value = categoryGroups.map((cat) => ({
      name: cat.name,
      features: cat.featureIds.map((fid) => {
        const row = byFeature.get(fid)
        return {
          featureId: fid,
          label: FEATURE_CONFIGS[fid]?.label || fid,
          prompt: row
            ? { id: row.id, feature_id: row.feature_id, system_prompt: row.system_prompt, _dirty: false }
            : null,
        }
      }),
    }))
  } catch {
    error('加载失败')
  } finally {
    loading.value = false
  }
}

async function saveAll() {
  const dirty: PromptRow[] = []
  categories.value.forEach((cat) =>
    cat.features.forEach((f) => {
      if (f.prompt?._dirty) dirty.push(f.prompt)
    }),
  )
  if (dirty.length === 0) {
    info('没有需要保存的修改')
    return
  }
  saving.value = true
  let ok = 0
  for (const p of dirty) {
    try {
      await featurePromptApi.update(p.id, { system_prompt: p.system_prompt })
      p._dirty = false
      ok++
    } catch {
      /* 单条失败不阻断其余保存 */
    }
  }
  saving.value = false
  if (ok > 0) success(`已保存 ${ok} 条`)
  if (ok < dirty.length) error(`${dirty.length - ok} 条保存失败`)
}

onMounted(() => load())
</script>

<template>
  <PageLayout>
    <template #header>功能提示词管理</template>

    <div v-loading="loading">
      <div class="toolbar">
        <el-alert
          title="每个功能一条系统提示词，对所有生图模型生效；使用 {user_prompt} 作为用户补充输入的占位符。"
          type="info" show-icon :closable="false" class="toolbar-alert"
        />
        <el-button
          type="primary"
          :loading="saving"
          :disabled="dirtyCount === 0"
          @click="saveAll"
        >
          {{ dirtyCount ? `保存修改（${dirtyCount}）` : '保存修改' }}
        </el-button>
      </div>

      <div class="categories">
        <section v-for="cat in categories" :key="cat.name" class="category">
          <h3 class="category-title">{{ cat.name }}</h3>
          <div class="feature-grid">
            <div
              v-for="feat in cat.features"
              :key="feat.featureId"
              class="feature-card"
              :class="{ dirty: feat.prompt?._dirty }"
            >
              <div class="feature-head">
                <span class="feature-label">{{ feat.label }}</span>
                <span v-if="feat.prompt?._dirty" class="dirty-tag">未保存</span>
              </div>
              <el-input
                v-if="feat.prompt"
                v-model="feat.prompt.system_prompt"
                type="textarea"
                :rows="6"
                resize="vertical"
                placeholder="系统提示词"
                @input="markDirty(feat)"
              />
              <el-text v-else type="info" size="small">未初始化</el-text>
            </div>
          </div>
        </section>
      </div>
    </div>
  </PageLayout>
</template>

<style scoped>
.toolbar {
  display: flex; align-items: center; gap: 12px;
  margin-bottom: 20px;
}
.toolbar-alert { flex: 1; }

.categories {
  display: flex; flex-direction: column; gap: 24px;
}

.category-title {
  margin: 0 0 12px;
  font-size: var(--momo-font-size-base); font-weight: 600;
  color: var(--el-text-color-secondary);
  letter-spacing: 1px;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
  gap: 16px;
}

.feature-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--momo-radius-md);
  padding: 12px 14px;
  background: var(--el-bg-color);
  transition: border-color 0.15s;
}
.feature-card.dirty {
  border-color: var(--el-color-primary);
}

.feature-head {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 8px;
}

.feature-label {
  font-size: var(--momo-font-size-base); font-weight: 600;
  color: var(--el-text-color-primary);
}

.dirty-tag {
  font-size: var(--momo-font-size-xs);
  color: var(--el-color-warning);
}
</style>
