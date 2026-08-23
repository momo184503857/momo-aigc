<script setup lang="ts">
/**
 * PointDetailsField — 主题点位编辑器（固定 5 个点位，Tab 切换，每点位固定四字段）。
 * 字段：点位名 / 场景锁定 / 人物姿势 / 机位构图。
 * 值恒归一化为 5 条：不足补空、超出截断（全空条目由后端清洗剔除，不会入库为脏数据）。
 * 批量粘贴走管理端主题库弹窗的「JSON 导入」按钮（AdminSuiteAssets），本组件只负责表单编辑。
 */
import { ref, watch } from 'vue'

interface PointDetail {
  name: string
  scene: string
  pose: string
  camera: string
}

const props = defineProps<{ modelValue: PointDetail[] }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: PointDetail[]): void }>()

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

// 外部赋值长度不为 5（弹窗换行 / JSON 导入 / 旧数据 1~10 点）时归一化回填；点位内字段直接双向绑定
watch(
  () => props.modelValue,
  (v) => {
    if (!Array.isArray(v) || v.length !== POINT_COUNT) emit('update:modelValue', normalize(v))
  },
  { immediate: true },
)

const activeTab = ref('1')
</script>

<template>
  <div class="pdf-editor">
    <el-tabs v-model="activeTab" class="pdf-tabs">
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
  </div>
</template>

<style scoped>
.pdf-editor {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--momo-space-2);
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
</style>
