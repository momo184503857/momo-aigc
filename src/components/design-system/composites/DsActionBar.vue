<script setup lang="ts">
import { computed, ref, onDeactivated, watch } from 'vue'
import { Button } from '../primitives/button'
import { Spinner } from '../primitives/spinner'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../primitives/tooltip'
const props = withDefaults(defineProps<{ label?: string; busyLabel?: string; busy?: boolean; disabled?: boolean; reason?: string; reasonTone?: 'default' | 'error'; reasonDisplay?: 'inline' | 'tooltip'; fullWidth?: boolean }>(), { label: '开始生成', reasonTone: 'default', reasonDisplay: 'inline' })
defineEmits<{ submit: [] }>()
const tooltipOpen = ref(false)
onDeactivated(() => { tooltipOpen.value = false })
const showTooltip = computed(() => props.reasonDisplay === 'tooltip' && !!props.reason && !!(props.disabled || props.busy))
watch(showTooltip, value => { if (!value) tooltipOpen.value = false })
</script>
<template>
  <div :class="['ds-footer', { 'ds-action-full': fullWidth }]">
    <p v-if="(reasonDisplay === 'inline' && reason) || $slots.default" class="ds-caption" :class="{ 'ds-error': reasonTone === 'error' }" role="status"><template v-if="reasonDisplay === 'inline'">{{ reason }}</template><slot /></p>
    <TooltipProvider v-if="showTooltip" :delay-duration="200">
      <Tooltip v-model:open="tooltipOpen">
        <TooltipTrigger as-child>
          <span class="ds-action-tooltip-trigger" tabindex="0" :aria-label="label" aria-disabled="true">
            <Button :disabled="true"><Spinner v-if="busy" />{{ busy ? busyLabel || '处理中…' : label }}</Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">{{ reason }}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
    <Button v-else :disabled="busy || disabled" @click="$emit('submit')"><Spinner v-if="busy" />{{ busy ? busyLabel || '处理中…' : label }}</Button>
  </div>
</template>
