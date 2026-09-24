<script setup lang="ts">
defineOptions({ name: 'AdminFeaturePrompts' })
import { ref, computed, onMounted } from 'vue'
import { useUiFeedback } from '@/composables/useUiFeedback'
const { success, info, error } = useUiFeedback()
import { featurePromptApi } from '@/services/featurePromptApi'
import type { FeaturePromptItem } from '@/services/featurePromptApi'
import { FEATURE_CONFIGS } from '@/configs/featureConfig'
import { DsScrollPage as PageLayout } from '@/components/design-system'
import { LoaderCircle } from '@lucide/vue'
import { Button } from '@/components/design-system/primitives/button'
import { Skeleton } from '@/components/design-system/primitives/skeleton'
import { Textarea } from '@/components/design-system/primitives/textarea'

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

/** 展示用：已初始化 / 总数，让管理员一眼看到还有几个功能没配置 */
const totalCount = computed(() =>
  categories.value.reduce((n, cat) => n + cat.features.length, 0),
)
const configuredCount = computed(() =>
  categories.value.reduce(
    (n, cat) => n + cat.features.reduce((m, f) => m + (f.prompt ? 1 : 0), 0),
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
  <PageLayout
    title="功能提示词管理"
    subtitle="每个功能一条系统提示词，对所有生图模型生效；{user_prompt} 为用户补充输入的占位符。"
    :show-footer="!loading"
  >
    <!-- 编辑长文本时保存入口必须常驻：整页唯一滚动区 + 吸底动作栏 -->
    <template #footer>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-muted-foreground text-xs tabular-nums">
          <template v-if="dirtyCount > 0">
            <span class="text-warning font-medium">未保存 {{ dirtyCount }} 处</span>
            <span class="text-muted-foreground/70"> · 修改后点右侧保存</span>
          </template>
          <template v-else>
            <span>全部修改已保存</span>
            <span class="text-muted-foreground/70"> · 已配置 {{ configuredCount }} / {{ totalCount }} 个功能</span>
          </template>
        </p>
        <Button :disabled="saving || dirtyCount === 0" @click="saveAll">
          <LoaderCircle v-if="saving" class="animate-spin" />
          {{ dirtyCount ? `保存修改（${dirtyCount}）` : '保存修改' }}
        </Button>
      </div>
    </template>

    <div v-if="loading" class="flex flex-col gap-8">
      <Skeleton v-for="i in 3" :key="i" class="h-44 w-full" />
    </div>

    <div v-else class="flex flex-col gap-8">
      <section v-for="cat in categories" :key="cat.name">
        <h3 class="cat-head">
          {{ cat.name }}
          <span class="text-muted-foreground/70 font-normal tabular-nums">{{ cat.features.length }}</span>
        </h3>
        <div class="feature-grid">
          <div v-for="feat in cat.features" :key="feat.featureId" class="feature-item">
            <div class="feature-head">
              <span class="feature-label">{{ feat.label }}</span>
              <span v-if="feat.prompt?._dirty" class="dirty-flag">未保存</span>
            </div>
            <Textarea
              v-if="feat.prompt"
              v-model="feat.prompt.system_prompt"
              :rows="6"
              class="resize-y"
              placeholder="系统提示词"
              @input="markDirty(feat)"
            />
            <p v-else class="uninit">该功能尚未初始化提示词</p>
          </div>
        </div>
      </section>
    </div>
  </PageLayout>
</template>

<style scoped>
/* 分类标题吸顶：滚动长表单时始终知道自己在改哪一组 */
.cat-head {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 12px;
  padding: 6px 0;
  background: var(--background);
  font-size: var(--ds-font-small);
  font-weight: var(--ds-weight-medium);
  letter-spacing: 0.06em;
  color: var(--muted-foreground);
  border-bottom: 1px solid var(--border);
}

/* 提示词本身已经自带边框，外面再套一层卡片纯属装饰；只留一条发丝线分行 */
.feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(380px, 100%), 1fr));
  gap: 18px 24px;
}

.feature-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.feature-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.feature-label {
  font-size: var(--ds-font-small);
  font-weight: var(--ds-weight-medium);
  color: var(--foreground);
}

/* 脏标记：文字 + 圆点，比原来「整张卡描边变品牌色」更明确，也不会和焦点态混淆 */
.dirty-flag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--ds-font-small);
  color: var(--warning);
}
.dirty-flag::before {
  content: '';
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--warning);
}

.uninit {
  margin: 0;
  padding: 10px 12px;
  border: 1px dashed var(--border);
  border-radius: var(--ds-radius);
  font-size: var(--ds-font-small);
  color: var(--muted-foreground);
}
</style>
