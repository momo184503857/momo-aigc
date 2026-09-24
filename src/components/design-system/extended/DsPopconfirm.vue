<script setup lang="ts">
import { ref } from 'vue'
import { Popover,PopoverTrigger,PopoverContent } from '../primitives/popover'
import { Button } from '../primitives/button'
withDefaults(defineProps<{ title:string; description?:string; confirmText?:string; busy?:boolean }>(),{confirmText:'确认'})
const emit=defineEmits<{ confirm:[]; cancel:[] }>()
const open=ref(false)
</script>
<template><Popover v-model:open="open"><PopoverTrigger as-child><slot><Button variant="outline">操作</Button></slot></PopoverTrigger><PopoverContent class="ds-stack"><h3 class="ds-heading">{{ title }}</h3><p>{{ description }}</p><div class="ds-row"><Button variant="outline" :disabled="busy" @click="open=false;emit('cancel')">取消</Button><Button :disabled="busy" @click="emit('confirm');open=false">{{ confirmText }}</Button></div></PopoverContent></Popover></template>
