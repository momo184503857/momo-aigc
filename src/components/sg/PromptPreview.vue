<template>
  <div class="flex flex-col gap-3">
    <div class="grid grid-cols-2 gap-3">
      <div>
        <div class="mb-2 flex items-center justify-between gap-2 text-sm font-semibold">
          <span>公共锁定部分（5 张共用）</span>
          <div class="flex items-center gap-1">
            <Switch v-model="includeCommonModel" size="sm" />
            <span class="text-muted-foreground text-xs font-normal">{{ includeCommon ? '加入最终提示词' : '不加入最终提示词' }}</span>
          </div>
        </div>
        <div class="border-border divide-y border-y">
          <Collapsible v-for="g in groupedCommon" :key="g.name">
            <CollapsibleTrigger class="flex w-full cursor-pointer items-center justify-between py-2 text-sm [&[data-state=open]>svg]:rotate-180">
              <span>{{ g.label }} <span class="text-muted-foreground text-xs">{{ g.items.length }}</span></span>
              <ChevronDown class="text-muted-foreground size-4 transition-transform" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div v-for="e in g.items" :key="e.key" class="flex flex-col gap-1 border-b border-dashed border-border py-2 last:border-b-0">
                <div class="flex items-center gap-2">
                  <Switch
                    :model-value="isEnabled(e.key)"
                    size="sm"
                    @update:model-value="(v: boolean) => toggle(e.key, !!v)"
                  />
                  <span class="flex-1 text-sm text-foreground">{{ e.name }}</span>
                  <Badge v-if="e.condKind && e.condKind !== 'none'" variant="warning">条件</Badge>
                  <Badge v-if="e.origin === 'private'" variant="success">我的</Badge>
                  <Button variant="link" size="sm" @click="startEdit(e)">{{ editingKey === e.key ? '收起' : '编辑' }}</Button>
                </div>
                <Textarea
                  v-if="editingKey === e.key"
                  :model-value="contentOf(e)"
                  :rows="5"
                  @update:model-value="(v: string | number | null | undefined) => editContent(e.key, String(v ?? ''))"
                />
                <div
                  v-else
                  class="max-h-[90px] overflow-y-auto rounded-sm bg-(--momo-color-bg-soft) p-2 text-xs whitespace-pre-wrap text-(--momo-color-text-secondary)"
                  :class="{ 'text-(--momo-color-text-placeholder) line-through': !isEnabled(e.key) }"
                >{{ contentOf(e) }}</div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>
      <div>
        <div class="mb-2 flex items-center gap-2 text-sm font-semibold">每张差异部分（点位）</div>
        <Tabs v-model="activePoint" orientation="vertical">
          <TabsList>
            <TabsTrigger v-for="(t, i) in result.pointTexts" :key="i" :value="String(i)">P{{ i + 1 }}</TabsTrigger>
          </TabsList>
          <TabsContent v-for="(t, i) in result.pointTexts" :key="i" :value="String(i)" class="mt-0">
            <div class="text-xs whitespace-pre-wrap text-(--momo-color-text-secondary)">{{ t }}</div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
    <div class="border-border border-t pt-3">
      <div class="mb-2 flex items-center gap-2 text-sm font-semibold">
        完整 Prompt（P{{ parseInt(activePoint) + 1 }}）
        <Button size="sm" variant="outline" @click="copyAll">复制全部 {{ result.fullTexts.length }} 张</Button>
        <Button size="sm" @click="copyFull">复制本张</Button>
      </div>
      <div class="max-h-60 overflow-y-auto rounded-md bg-(--momo-color-bg-soft) p-3 font-mono text-xs whitespace-pre-wrap text-(--momo-color-text-secondary)">{{ result.fullTexts[parseInt(activePoint)] || '' }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronDown } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import type { AssembleResult, LockSelection, PromptEntry } from '@/utils/promptEngine'
import { useClipboard } from '@/composables/useClipboard'

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

const clipboard = useClipboard()
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

function copyFull() {
  const text = props.result.fullTexts[parseInt(activePoint.value)] || ''
  if (!text.trim()) return
  // HTTP 非安全上下文（生产 IP 直访）下 useClipboard 自动降级 execCommand
  clipboard.copy(text, { successMsg: '已复制到剪贴板' })
}

function copyAll() {
  const { commonText, pointTexts } = props.result
  if (!pointTexts.length) return
  // 公共部分只带一份，随后依次拼接各点位差异文本（公共开关关闭时不带公共段）
  const parts: string[] = []
  if (props.includeCommon && commonText.trim()) parts.push(`【公共部分】\n${commonText.trim()}`)
  pointTexts.forEach((t, i) => {
    if (t.trim()) parts.push(`【点位${i + 1}】\n${t.trim()}`)
  })
  clipboard.copy(parts.join('\n\n'), { successMsg: `已复制全部 ${pointTexts.length} 张提示词` })
}
</script>
