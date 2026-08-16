<template>
  <div class="sg-track-select">
    <el-select
      :model-value="modelValue"
      placeholder="选择风格赛道"
      style="width: 100%"
      @update:model-value="onChange"
    >
      <el-option
        v-for="t in tracks"
        :key="t.id"
        :value="t.key"
        :label="`${t.emoji || ''} ${t.name}`"
      >
        <div class="track-option">
          <span>{{ t.emoji }} {{ t.name }}</span>
          <span class="opt-badge">{{ t.isGlobal ? '通用' : '我的' }}</span>
        </div>
      </el-option>
    </el-select>
    <div v-if="current" class="track-desc">
      <p><b>基调：</b>{{ current.mood }}</p>
      <p><b>光影：</b>{{ current.light }}</p>
      <p><b>配饰：</b>{{ current.acc }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useAssetLibrary } from '@/composables/useAssetLibrary'
import type { SgTrack } from '@/services/sgApi'

defineOptions({ name: 'SgTrackSelect' })

const props = defineProps<{ modelValue?: string | null }>()
const emit = defineEmits<{ 'update:modelValue': [key: string] }>()

const lib = useAssetLibrary<SgTrack>('tracks')
const tracks = lib.list
onMounted(() => lib.load())

const current = computed(() => tracks.value.find((t) => t.key === props.modelValue))

function onChange(v: string | number | boolean | undefined | any) {
  const key = String(v)
  emit('update:modelValue', key)
  const t = tracks.value.find((x) => x.key === key)
  if (t) emitSelect(t)
}
function emitSelect(t: SgTrack) {
  // 上报热度（失败可忽略）
  lib.reportUse(t.id)
}
</script>

<style scoped>
.sg-track-select { display: flex; flex-direction: column; gap: var(--momo-space-2); }
.track-option { display: flex; align-items: center; justify-content: space-between; }
.opt-badge { font-size: var(--momo-font-size-xs); color: var(--momo-color-text-tertiary); }
.track-desc {
  background: var(--momo-color-bg-soft); border-radius: var(--momo-radius-md);
  padding: var(--momo-space-3); font-size: var(--momo-font-size-sm); color: var(--momo-color-text-secondary);
  display: flex; flex-direction: column; gap: 2px;
}
</style>
