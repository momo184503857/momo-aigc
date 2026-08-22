<template>
  <div class="sg-prompt-preview">
    <div class="pp-main">
      <div class="pp-col common">
        <div class="pp-col-title common-title">
          <span>公共锁定部分（5 张共用）</span>
          <div class="common-switch">
            <el-switch v-model="includeCommonModel" size="small" />
            <span class="common-switch-text">{{ includeCommon ? '加入最终提示词' : '不加入最终提示词' }}</span>
          </div>
        </div>
        <el-collapse>
          <el-collapse-item v-for="g in groupedCommon" :key="g.name" :name="g.name">
            <template #title>
              <span class="grp-title">{{ g.label }} <span class="grp-count">{{ g.items.length }}</span></span>
            </template>
            <div v-for="e in g.items" :key="e.key" class="entry">
              <div class="entry-head">
                <el-switch
                  :model-value="isEnabled(e.key)"
                  size="small"
                  @update:model-value="(v: any) => toggle(e.key, !!v)"
                />
                <span class="e-name">{{ e.name }}</span>
                <el-tag v-if="e.condKind && e.condKind !== 'none'" size="small" type="warning" effect="plain">条件</el-tag>
                <el-tag v-if="e.origin === 'private'" size="small" type="success" effect="plain">我的</el-tag>
                <el-button link size="small" @click="startEdit(e)">{{ editingKey === e.key ? '收起' : '编辑' }}</el-button>
              </div>
              <el-input
                v-if="editingKey === e.key"
                :model-value="contentOf(e)"
                type="textarea" :rows="5"
                @update:model-value="(v: string | number | null | undefined) => editContent(e.key, String(v ?? ''))"
              />
              <div v-else class="e-content" :class="{ disabled: !isEnabled(e.key) }">{{ contentOf(e) }}</div>
            </div>
          </el-collapse-item>
        </el-collapse>
      </div>
      <div class="pp-col points">
        <div class="pp-col-title">每张差异部分（点位）</div>
        <el-tabs v-model="activePoint" tab-position="left">
          <el-tab-pane v-for="(t, i) in result.pointTexts" :key="i" :name="String(i)" :label="`P${i + 1}`">
            <div class="point-text">{{ t }}</div>
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>
    <div class="pp-full">
      <div class="pp-col-title">
        完整 Prompt（P{{ parseInt(activePoint) + 1 }}）
        <el-button size="small" @click="copyAll">复制全部 {{ result.fullTexts.length }} 张</el-button>
        <el-button size="small" type="primary" plain @click="copyFull">复制本张</el-button>
      </div>
      <div class="full-text">{{ result.fullTexts[parseInt(activePoint)] || '' }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AssembleResult, LockSelection, PromptEntry } from '@/utils/promptEngine'
import { useUiFeedback } from '@/composables/useUiFeedback'

defineOptions({ name: 'SgPromptPreview' })

const props = defineProps<{
  result: AssembleResult
  locks: LockSelection[]
  /** 公共提示词是否拼入最终提示词（false = 完整 Prompt 仅差异部分） */
  includeCommon: boolean
}>()

const emit = defineEmits<{
  'update:locks': [locks: LockSelection[]]
  'update:includeCommon': [v: boolean]
}>()

/** 开关受控值：写入走 emit，父组件状态是唯一数据源 */
const includeCommonModel = computed({
  get: () => props.includeCommon,
  set: (v: boolean) => emit('update:includeCommon', v),
})

const ui = useUiFeedback()
const editingKey = ref<string | null>(null)
const activePoint = ref('0')

const GROUP_LABELS: Record<string, string> = {
  quality: '画质', identity: '人物', garment: '服装', scene: '场景',
  light: '光影', pose: '姿态', camera: '机位', negative: '负面约束',
  fusion: '融合', fidelity: '保真',
}

const groupedCommon = computed(() => {
  const common = props.result.usedEntries.filter((e) => e.order < 1000)
  const map = new Map<string, PromptEntry[]>()
  for (const e of common) {
    const list = map.get(e.grp) || []
    list.push(e)
    map.set(e.grp, list)
  }
  return [...map.entries()].map(([name, items]) => ({ name, label: GROUP_LABELS[name] || name, items }))
})

const lockMap = computed(() => new Map(props.locks.map((l) => [l.key, l])))

function isEnabled(key: string): boolean {
  const entry = props.result.usedEntries.find((e) => e.key === key)
  return lockMap.value.get(key)?.enabled ?? (entry?.defaultEnabled !== false)
}

function toggle(key: string, enabled: boolean) {
  const cur = lockMap.value.get(key)
  const next = cur
    ? props.locks.map((l) => (l.key === key ? { ...l, enabled } : l))
    : [...props.locks, { key, enabled }]
  emit('update:locks', next)
}

function contentOf(e: PromptEntry): string {
  return lockMap.value.get(e.key)?.content ?? e.contentOverride ?? e.content
}

function editContent(key: string, content: string) {
  const cur = lockMap.value.get(key)
  const next = cur
    ? props.locks.map((l) => (l.key === key ? { ...l, content } : l))
    : [...props.locks, { key, enabled: true, content }]
  emit('update:locks', next)
}

function startEdit(e: PromptEntry) {
  editingKey.value = editingKey.value === e.key ? null : e.key
}

async function copyFull() {
  const text = props.result.fullTexts[parseInt(activePoint.value)] || ''
  try {
    await navigator.clipboard.writeText(text)
    ui.success('已复制到剪贴板')
  } catch {
    ui.error(new Error('复制失败'), '复制失败，请手动选择复制')
  }
}

async function copyAll() {
  const { commonText, pointTexts } = props.result
  if (!pointTexts.length) return
  // 公共部分只带一份，随后依次拼接各点位差异文本（公共开关关闭时不带公共段）
  const parts: string[] = []
  if (props.includeCommon && commonText.trim()) parts.push(`【公共部分】\n${commonText.trim()}`)
  pointTexts.forEach((t, i) => {
    if (t.trim()) parts.push(`【点位${i + 1}】\n${t.trim()}`)
  })
  const text = parts.join('\n\n')
  try {
    await navigator.clipboard.writeText(text)
    ui.success(`已复制全部 ${pointTexts.length} 张提示词`)
  } catch {
    ui.error(new Error('复制失败'), '复制失败，请手动选择复制')
  }
}
</script>

<style scoped>
.sg-prompt-preview { display: flex; flex-direction: column; gap: var(--momo-space-3); }
.pp-main { display: grid; grid-template-columns: 1fr 1fr; gap: var(--momo-space-3); }
.pp-col-title {
  font-weight: var(--momo-font-weight-semibold); font-size: var(--momo-font-size-sm);
  margin-bottom: var(--momo-space-2); display: flex; align-items: center; gap: var(--momo-space-2);
}
.common-title { justify-content: space-between; }
.common-switch { display: flex; align-items: center; gap: var(--momo-space-1); }
.common-switch-text { font-size: var(--momo-font-size-xs); font-weight: normal; color: var(--momo-color-text-tertiary); }
.grp-title { font-size: var(--momo-font-size-sm); }
.grp-count { color: var(--momo-color-text-tertiary); font-size: var(--momo-font-size-xs); }
.entry { display: flex; flex-direction: column; gap: var(--momo-space-1); padding: var(--momo-space-2) 0; border-bottom: 1px dashed var(--momo-color-border-soft); }
.entry-head { display: flex; align-items: center; gap: var(--momo-space-2); }
.e-name { font-size: var(--momo-font-size-sm); color: var(--momo-color-text); flex: 1; }
.e-content {
  font-size: var(--momo-font-size-xs); color: var(--momo-color-text-secondary);
  white-space: pre-wrap; max-height: 90px; overflow-y: auto;
  background: var(--momo-color-bg-soft); border-radius: var(--momo-radius-sm); padding: var(--momo-space-2);
}
.e-content.disabled { color: var(--momo-color-text-placeholder); text-decoration: line-through; }
.point-text { font-size: var(--momo-font-size-xs); color: var(--momo-color-text-secondary); white-space: pre-wrap; }
.pp-full { border-top: 1px solid var(--momo-color-border-soft); padding-top: var(--momo-space-3); }
.full-text {
  font-family: var(--momo-font-mono); font-size: var(--momo-font-size-xs); color: var(--momo-color-text-secondary);
  white-space: pre-wrap; max-height: 240px; overflow-y: auto;
  background: var(--momo-color-bg-soft); border-radius: var(--momo-radius-md); padding: var(--momo-space-3);
}
</style>
