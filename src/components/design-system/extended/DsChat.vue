<script setup lang="ts">
import { ref } from 'vue'
import { Textarea } from '../primitives/textarea'
import { Button } from '../primitives/button'
const props=defineProps<{ messages:{id:string;role:'user'|'assistant';content:string}[]; busy?:boolean; disabled?:boolean }>()
const emit=defineEmits<{ send:[text:string] }>()
const draft=ref('')
function send(){if(!draft.value.trim()||props.busy||props.disabled)return;emit('send',draft.value.trim());draft.value=''}
</script>
<template><section class="ds-stack" aria-label="聊天"><ol class="ds-stack" role="log" aria-live="polite"><li v-for="message in messages" :key="message.id" class="ds-chat-message" :data-role="message.role"><strong class="ds-caption">{{ message.role === 'user' ? '你' : '助手' }}</strong><p>{{ message.content }}</p></li></ol><Textarea v-model="draft" aria-label="聊天内容" :disabled="disabled || busy" placeholder="输入消息；Ctrl+Enter 发送" @keydown.ctrl.enter.prevent="send" /><Button :disabled="disabled || busy || !draft.trim()" @click="send">{{ busy ? '回复中…' : '发送' }}</Button></section></template>
