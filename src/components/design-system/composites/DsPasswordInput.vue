<script setup lang="ts">
import { ref } from 'vue'
import { Eye, EyeOff } from '@lucide/vue'
import { Input } from '../primitives/input'
import { Button } from '../primitives/button'
defineOptions({ inheritAttrs: false })
defineProps<{ disabled?: boolean }>()
const model = defineModel<string>({ default: '' })
const visible = ref(false)
</script>

<template>
  <div class="ds-password-input">
    <Input v-bind="$attrs" v-model="model" :type="visible ? 'text' : 'password'" :disabled="disabled" />
    <Button variant="ghost" size="icon-sm" type="button" :disabled="disabled"
      :aria-label="visible ? '隐藏密码' : '显示密码'" :aria-pressed="visible" @click="visible = !visible">
      <EyeOff v-if="visible" aria-hidden="true" /><Eye v-else aria-hidden="true" />
    </Button>
  </div>
</template>
