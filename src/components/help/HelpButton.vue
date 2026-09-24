<script setup lang="ts">
import { CircleHelp } from '@lucide/vue'
import { useHelp } from '@/composables/useHelp'
import { Button } from '@/components/design-system/primitives/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/design-system/primitives/tooltip'

const { open, available } = useHelp()
</script>

<template>
  <Tooltip :disabled="available">
    <TooltipTrigger as-child>
      <!-- disabled 按钮不派发指针事件，需由外层 span 承接 hover -->
      <span class="inline-flex">
        <Button variant="outline" size="sm" :disabled="!available" @click="open">
          <CircleHelp />
          使用帮助
        </Button>
      </span>
    </TooltipTrigger>
    <TooltipContent side="bottom">
      该页面暂未提供帮助文档
    </TooltipContent>
  </Tooltip>
</template>
