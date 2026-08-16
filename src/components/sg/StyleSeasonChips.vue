<template>
  <div class="sg-style-season-chips">
    <div v-for="group in groups" :key="group.key" class="chip-group">
      <div class="group-label">{{ group.label }}</div>
      <div class="chips">
        <span
          v-for="name in group.items"
          :key="name"
          class="chip"
          :class="{ active: isSelected(group.key, name) }"
          @click="toggle(group.key, name)"
        >{{ name }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 成套生图第一步特征选择：仅「风格」与「适合季节」两组多选。
 * 候选为固定清单（与管理端配置的识图提示词保持一致），AI 识别结果写入 modelValue 自动选中。
 */
defineOptions({ name: 'SgStyleSeasonChips' })

const props = defineProps<{ modelValue: Record<string, string[]> }>()
const emit = defineEmits<{ 'update:modelValue': [v: Record<string, string[]>] }>()

const groups = [
  { key: 'style', label: '👗 风格（多选）', items: ['新中式国风', '文艺风', '休闲', '极简', '法式', '度假', '优雅', '职场', '运动', '喜婆婆', '小香风'] },
  { key: 'season', label: '🌤 适合季节（多选）', items: ['春', '夏', '秋', '冬'] },
] as const

function isSelected(group: string, name: string) {
  return (props.modelValue[group] || []).includes(name)
}

function toggle(group: string, name: string) {
  const cur = new Set(props.modelValue[group] || [])
  if (cur.has(name)) cur.delete(name)
  else cur.add(name)
  emit('update:modelValue', { ...props.modelValue, [group]: [...cur] })
}
</script>

<style scoped>
.sg-style-season-chips { display: flex; flex-direction: column; gap: var(--momo-space-3); }
.group-label { font-size: var(--momo-font-size-sm); color: var(--momo-color-text-secondary); margin-bottom: var(--momo-space-1); }
.chips { display: flex; flex-wrap: wrap; gap: var(--momo-space-2); }
.chip {
  padding: 2px var(--momo-space-3); border-radius: var(--momo-radius-full);
  border: 1px solid var(--momo-color-border); font-size: var(--momo-font-size-sm);
  cursor: pointer; user-select: none; color: var(--momo-color-text-secondary);
  transition: all var(--momo-transition-fast);
}
.chip:hover { border-color: var(--momo-color-brand-border); }
.chip.active {
  color: var(--momo-color-brand); border-color: var(--momo-color-brand);
  background: var(--momo-color-brand-subtle);
}
</style>
