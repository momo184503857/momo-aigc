<script setup lang="ts">
/**
 * PointDetailsField — 主题点位编辑器（固定 5 个点位，Tab 切换，每点位固定四字段）。
 * 字段：点位名 / 场景锁定 / 人物姿势 / 机位构图。
 * allowJson 开启 JSON 数组模式（管理端批量粘贴场景保留）；值恒归一化为 5 条：
 * 不足补空、超出截断（全空条目由后端清洗剔除，不会入库为脏数据）。
 */
import { ref, watch } from 'vue'
import { useUiFeedback } from '@/composables/useUiFeedback'

interface PointDetail {
  name: string
  scene: string
  pose: string
  camera: string
}

const props = withDefaults(
  defineProps<{ modelValue: PointDetail[]; allowJson?: boolean }>(),
  { allowJson: false },
)
const emit = defineEmits<{ (e: 'update:modelValue', v: PointDetail[]): void }>()

const ui = useUiFeedback()
const POINT_COUNT = 5

function emptyPoint(): PointDetail {
  return { name: '', scene: '', pose: '', camera: '' }
}

/** 归一化为固定 5 条（不足补空，超出截断，字段清洗为四字段结构） */
function normalize(list: unknown): PointDetail[] {
  const arr = (Array.isArray(list) ? list : []).slice(0, POINT_COUNT).map((x) => {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
    return {
      name: String(o.name ?? ''),
      scene: String(o.scene ?? ''),
      pose: String(o.pose ?? ''),
      camera: String(o.camera ?? ''),
    }
  })
  while (arr.length < POINT_COUNT) arr.push(emptyPoint())
  return arr
}

// 外部赋值长度不为 5（弹窗换行 / 旧数据 1~10 点）时归一化回填；点位内字段直接双向绑定
watch(
  () => props.modelValue,
  (v) => {
    if (!Array.isArray(v) || v.length !== POINT_COUNT) emit('update:modelValue', normalize(v))
  },
  { immediate: true },
)

const activeTab = ref('1')

// ── JSON 模式（allowJson 时可用） ──
const mode = ref<'form' | 'json'>('form')
const jsonText = ref('[]')
const jsonError = ref('')

/** 模式切换：表单 → JSON 序列化当前值；JSON → 表单需解析合法才放行 */
function onModeChange(m: string | number | boolean | undefined) {
  if (m === mode.value) return
  if (m === 'json') {
    jsonText.value = JSON.stringify(normalize(props.modelValue), null, 2)
    jsonError.value = ''
    mode.value = 'json'
    return
  }
  try {
    const parsed = JSON.parse(jsonText.value)
    if (!Array.isArray(parsed)) throw new Error('not array')
    emit('update:modelValue', normalize(parsed))
    mode.value = 'form'
  } catch {
    ui.error(new Error('JSON 格式错误'), 'JSON 解析失败，请修正后再切换到表单模式')
  }
}

/** JSON 输入即时校验，合法时同步回表单值 */
function onJsonInput(v: string) {
  jsonText.value = v
  try {
    const parsed = JSON.parse(v)
    if (!Array.isArray(parsed)) {
      jsonError.value = '必须是 JSON 数组（未同步）'
      return
    }
    jsonError.value = parsed.length > POINT_COUNT ? `点位固定 ${POINT_COUNT} 个，已截取前 ${POINT_COUNT} 个` : ''
    emit('update:modelValue', normalize(parsed))
  } catch {
    jsonError.value = 'JSON 格式错误（未同步）'
  }
}
</script>

<template>
  <div class="pdf-editor">
    <div v-if="allowJson" class="pdf-toolbar">
      <el-radio-group :model-value="mode" size="small" @update:model-value="onModeChange">
        <el-radio-button value="form">表单模式</el-radio-button>
        <el-radio-button value="json">JSON 模式</el-radio-button>
      </el-radio-group>
    </div>

    <el-tabs v-if="mode === 'form'" v-model="activeTab" class="pdf-tabs">
      <el-tab-pane v-for="(p, i) in modelValue" :key="i" :name="String(i + 1)">
        <template #label>点位 {{ i + 1 }}</template>
        <div class="pdf-fields">
          <div class="pdf-field">
            <span class="pdf-label">点位名</span>
            <el-input v-model="p.name" placeholder="如：中式园林庭院 · 院外" maxlength="100" />
          </div>
          <div class="pdf-field">
            <span class="pdf-label">场景锁定</span>
            <el-input
              v-model="p.scene"
              type="textarea"
              :rows="2"
              placeholder="如：木质露台入口，盆栽雏菊、老木构件，模特站立…"
              maxlength="600"
              resize="none"
            />
          </div>
          <div class="pdf-field">
            <span class="pdf-label">人物姿势</span>
            <el-input
              v-model="p.pose"
              type="textarea"
              :rows="2"
              placeholder="如：自然直立，双手自然垂放，目光平视镜头…"
              maxlength="600"
              resize="none"
            />
          </div>
          <div class="pdf-field">
            <span class="pdf-label">机位构图</span>
            <el-input
              v-model="p.camera"
              type="textarea"
              :rows="2"
              placeholder="如：全景，35mm 环境人像，人物占画面 1/3…"
              maxlength="600"
              resize="none"
            />
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <template v-else>
      <el-input
        :model-value="jsonText"
        type="textarea"
        :rows="10"
        placeholder='JSON 数组，如 [{"name":"主题 · 院外","scene":"场景锁定","pose":"人物姿势","camera":"机位构图"}]'
        @update:model-value="onJsonInput"
      />
      <div v-if="jsonError" class="pdf-error">{{ jsonError }}</div>
    </template>
  </div>
</template>

<style scoped>
.pdf-editor {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--momo-space-2);
}
.pdf-toolbar {
  display: flex;
  align-items: center;
}
.pdf-tabs {
  width: 100%;
}
.pdf-fields {
  display: flex;
  flex-direction: column;
  gap: var(--momo-space-2);
}
.pdf-field {
  display: flex;
  align-items: flex-start;
  gap: var(--momo-space-2);
}
.pdf-label {
  flex-shrink: 0;
  width: 60px;
  font-size: var(--momo-font-size-sm);
  color: var(--momo-color-text-secondary);
  /* 与单行输入框（32px 高）首行对齐 */
  line-height: 32px;
  text-align: justify;
  text-align-last: justify;
}
.pdf-error {
  font-size: var(--momo-font-size-xs);
  color: var(--momo-color-danger);
}
</style>
