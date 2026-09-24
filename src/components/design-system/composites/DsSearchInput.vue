<script setup lang="ts">
import { Search, X } from '@lucide/vue'
import { Input } from '../primitives/input'
import { Button } from '../primitives/button'
defineOptions({ inheritAttrs: false })
withDefaults(defineProps<{ disabled?: boolean; clearable?: boolean }>(), { clearable: true })
const model = defineModel<string>({ default: '' })
</script>
<template><div class="ds-search-input"><Search aria-hidden="true" /><Input v-bind="$attrs" v-model="model" :disabled="disabled" /><Button v-if="clearable && model" variant="ghost" size="icon-sm" :disabled="disabled" aria-label="清除搜索" @click="model = ''"><X /></Button></div></template>
