<template>
  <div class="flex flex-col gap-3">
    <SgAssetPicker
      type="personas"
      :model-value="modelValue?.id ?? null"
      @select="onSelect"
    >
      <template #item="{ item }">
        <div class="flex w-full items-start gap-3">
          <div class="bg-muted flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full">
            <img v-if="item.avatar_url" :src="item.avatar_url" :alt="item.name" class="size-full object-cover">
            <span v-else class="text-muted-foreground">{{ item.name.slice(0, 1) }}</span>
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-1 font-medium">
              {{ item.name }}
              <Badge v-if="item.isGlobal" class="bg-(--momo-color-brand-subtle) text-primary">通用</Badge>
              <Badge v-else variant="success">我的</Badge>
              <Badge v-if="(item.fingerprint?.length ?? 0) > 0" variant="warning">指纹{{ item.fingerprint.length }}图</Badge>
            </div>
            <div class="text-muted-foreground line-clamp-2 text-xs">{{ item.dna }}</div>
          </div>
        </div>
      </template>
    </SgAssetPicker>
    <div v-if="modelValue" class="rounded-md bg-(--momo-color-bg-soft) p-3 text-sm text-(--momo-color-text-secondary)">
      <p v-for="(line, i) in dnaLines" :key="i">{{ line }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'
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
