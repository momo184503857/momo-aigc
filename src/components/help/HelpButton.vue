<script setup lang="ts">
import { QuestionFilled } from '@element-plus/icons-vue'
import { useHelp } from '@/composables/useHelp'

const { open, available } = useHelp()
</script>

<template>
  <el-tooltip
    :disabled="available"
    content="该页面暂未提供帮助文档"
    placement="bottom"
  >
    <span class="help-button-wrap">
      <el-button size="small" :disabled="!available" :icon="QuestionFilled" @click="open">
        使用帮助
      </el-button>
    </span>
  </el-tooltip>
</template>

<style scoped>
.help-button-wrap {
  display: inline-flex;
}
</style>
