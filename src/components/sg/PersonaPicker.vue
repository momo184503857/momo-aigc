<template>
  <div class="sg-persona-picker">
    <SgAssetPicker
      type="personas"
      :model-value="modelValue?.id ?? null"
      @select="onSelect"
    >
      <template #item="{ item }">
        <div class="persona-item">
          <div class="avatar">
            <img v-if="item.avatar_url" :src="item.avatar_url" :alt="item.name">
            <span v-else class="avatar-placeholder">{{ item.name.slice(0, 1) }}</span>
          </div>
          <div class="meta">
            <div class="p-name">
              {{ item.name }}
              <span class="badge" :class="item.isGlobal ? 'global' : 'mine'">{{ item.isGlobal ? '通用' : '我的' }}</span>
              <span v-if="(item.fingerprint?.length ?? 0) > 0" class="badge fp">指纹{{ item.fingerprint.length }}图</span>
            </div>
            <div class="dna">{{ item.dna }}</div>
          </div>
        </div>
      </template>
    </SgAssetPicker>
    <div v-if="modelValue" class="persona-detail">
      <p v-for="(line, i) in dnaLines" :key="i">{{ line }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import SgAssetPicker from './AssetPicker.vue'
import type { SgPersona } from '@/services/sgApi'

defineOptions({ name: 'SgPersonaPicker' })

const props = defineProps<{ modelValue?: SgPersona | null }>()
const emit = defineEmits<{ 'update:modelValue': [p: SgPersona | null] }>()

const dnaLines = computed(() => (props.modelValue?.dna || '').split('\n').filter(Boolean))

function onSelect(item: SgPersona) {
  emit('update:modelValue', item)
}
</script>

<style scoped>
.sg-persona-picker { display: flex; flex-direction: column; gap: var(--momo-space-3); }
.persona-item { display: flex; gap: var(--momo-space-3); align-items: flex-start; width: 100%; }
.avatar {
  width: 40px; height: 40px; border-radius: var(--momo-radius-full); overflow: hidden; flex-shrink: 0;
  background: var(--momo-color-bg-muted); display: flex; align-items: center; justify-content: center;
}
.avatar img { width: 100%; height: 100%; object-fit: cover; }
.avatar-placeholder { color: var(--momo-color-text-tertiary); }
.meta { min-width: 0; flex: 1; }
.p-name { font-weight: var(--momo-font-weight-medium); display: flex; align-items: center; gap: var(--momo-space-1); flex-wrap: wrap; }
.badge { font-size: var(--momo-font-size-xs); padding: 0 6px; border-radius: var(--momo-radius-full); line-height: 16px; }
.badge.global { color: var(--momo-color-brand); background: var(--momo-color-brand-subtle); }
.badge.mine { color: var(--momo-color-success-antd); background: var(--momo-color-success-subtle); }
.badge.fp { color: var(--momo-color-warning-antd); background: var(--momo-color-warning-subtle); }
.dna {
  font-size: var(--momo-font-size-xs); color: var(--momo-color-text-tertiary);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.persona-detail {
  background: var(--momo-color-bg-soft); border-radius: var(--momo-radius-md);
  padding: var(--momo-space-3); font-size: var(--momo-font-size-sm); color: var(--momo-color-text-secondary);
}
</style>
