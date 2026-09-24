<script setup lang="ts">
import { Input } from '../primitives/input'
import { Button } from '../primitives/button'
withDefaults(defineProps<{ modelValue:string; disabled?:boolean; presets?:string[]; allowAutomatic?:boolean }>(), { allowAutomatic:false })
defineEmits<{ 'update:modelValue':[value:string]; change:[value:string] }>()
</script>
<template>
  <div v-if="presets" class="ds-color-presets" role="group" aria-label="颜色预设">
    <Button v-for="color in presets" :key="color" variant="outline" size="icon-sm" class="ds-color-swatch" :disabled="disabled" :aria-label="`颜色 ${color}`" :aria-pressed="modelValue === color" :style="{ '--ds-swatch-content': color }" @click="$emit('update:modelValue',color); $emit('change',color)" />
    <Button v-if="allowAutomatic" variant="outline" :disabled="disabled" :aria-pressed="!modelValue" @click="$emit('update:modelValue','');$emit('change','')">随机</Button>
  </div>
  <div v-else class="ds-row"><Input type="color" :model-value="modelValue" :disabled="disabled" aria-label="选择颜色" @update:model-value="$emit('update:modelValue',String($event));$emit('change',String($event))" /><code>{{ modelValue }}</code></div>
</template>
