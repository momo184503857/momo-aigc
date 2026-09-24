<script setup lang="ts">
import { ref } from 'vue'
defineOptions({ inheritAttrs: false })
const input = ref<HTMLInputElement>()
defineExpose({ click: () => input.value?.click(), get value() { return input.value?.value || '' }, set value(v: string) { if (input.value) input.value.value = v } })
</script>
<template><input ref="input" v-bind="$attrs" type="file" hidden tabindex="-1" /></template>
