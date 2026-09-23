<script setup lang="ts">
/**
 * PointDetailsField — 主题点位编辑器（固定 5 个点位，Tab 切换，每点位固定四字段）。
 * 字段：点位名 / 场景锁定 / 人物姿势 / 机位构图。
 * 值恒归一化为 5 条：不足补空、超出截断（全空条目由后端清洗剔除，不会入库为脏数据）。
 * 批量粘贴走管理端主题库弹窗的「JSON 导入」按钮（AdminSuiteAssets），本组件只负责表单编辑。
 */
import { ref, watch } from 'vue'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

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
  <div class="flex w-full flex-col gap-2">
    <Tabs v-model="activeTab" class="w-full">
      <TabsList>
        <TabsTrigger v-for="(p, i) in modelValue" :key="i" :value="String(i + 1)">
          点位 {{ i + 1 }}
        </TabsTrigger>
      </TabsList>
      <TabsContent v-for="(p, i) in modelValue" :key="i" :value="String(i + 1)">
        <div class="mt-2 flex flex-col gap-2">
          <div class="flex items-start gap-2">
            <span class="pdf-label">点位名</span>
            <Input v-model="p.name" placeholder="如：中式园林庭院 · 院外" maxlength="100" />
          </div>
          <div class="flex items-start gap-2">
            <span class="pdf-label">场景锁定</span>
            <Textarea
              v-model="p.scene"
              :rows="2"
              placeholder="如：木质露台入口，盆栽雏菊、老木构件，模特站立…"
              maxlength="600"
              class="resize-none"
            />
          </div>
          <div class="flex items-start gap-2">
            <span class="pdf-label">人物姿势</span>
            <Textarea
              v-model="p.pose"
              :rows="2"
              placeholder="如：自然直立，双手自然垂放，目光平视镜头…"
              maxlength="600"
              class="resize-none"
            />
          </div>
          <div class="flex items-start gap-2">
            <span class="pdf-label">机位构图</span>
            <Textarea
              v-model="p.camera"
              :rows="2"
              placeholder="如：全景，35mm 环境人像，人物占画面 1/3…"
              maxlength="600"
              class="resize-none"
            />
          </div>
        </div>
      </TabsContent>
    </Tabs>
  </div>
</template>

<style scoped>
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
