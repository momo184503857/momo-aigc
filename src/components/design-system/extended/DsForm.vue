<script setup lang="ts">
import { computed,ref } from 'vue'
import DsField from '../composites/DsField.vue'
import { Input } from '../primitives/input'
import { Button } from '../primitives/button'
const props=defineProps<{ modelValue:Record<string,string>; fields:{name:string;label:string;required?:boolean;type?:'text'|'email'|'password';maxLength?:number}[]; busy?:boolean; disabled?:boolean }>()
const emit=defineEmits<{ 'update:modelValue':[value:Record<string,string>]; submit:[value:Record<string,string>]; invalid:[errors:Record<string,string>] }>()
const submitted=ref(false)
const errors=computed(()=>Object.fromEntries(props.fields.filter(f=>f.required&&!props.modelValue[f.name]?.trim()).map(f=>[f.name,`请填写${f.label}`])))
function submit(){if(props.busy||props.disabled)return;submitted.value=true;if(Object.keys(errors.value).length)emit('invalid',errors.value);else emit('submit',{...props.modelValue})}
</script>
<template><form class="ds-stack" @submit.prevent="submit"><DsField v-for="field in fields" :key="field.name" v-slot="binding" :label="field.label" :required="field.required" :error="submitted?errors[field.name]:undefined"><Input :id="binding.id" :aria-describedby="binding.describedby" :aria-invalid="binding.invalid" :type="field.type || 'text'" :maxlength="field.maxLength" :model-value="modelValue[field.name] || ''" :disabled="busy || disabled" @update:model-value="emit('update:modelValue',{...modelValue,[field.name]:String($event)})" /></DsField><slot :errors="submitted?errors:{}" /><Button type="submit" :disabled="busy || disabled">{{ busy?'提交中…':'提交表单' }}</Button></form></template>
