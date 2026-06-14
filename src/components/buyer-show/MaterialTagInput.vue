<template>
  <el-select
    v-model="selectedTagIds"
    multiple
    filterable
    allow-create
    default-first-option
    :reserve-keyword="false"
    placeholder="选择或输入标签（可选）"
    style="width: 100%"
    @change="handleChange"
  >
    <el-option
      v-for="tag in allTags"
      :key="tag.id"
      :label="tag.name"
      :value="tag.id"
    >
      <div class="tag-option">
        <span>{{ tag.name }}</span>
        <span class="tag-count">{{ tag.usage_count }} 条</span>
      </div>
    </el-option>
  </el-select>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { adminBuyerShowApi, type BuyerShowTag } from '@/services/buyerShowApi'

const props = defineProps<{ modelValue: number[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: number[]] }>()

const selectedTagIds = ref<number[]>([...props.modelValue])
const allTags = ref<BuyerShowTag[]>([])

async function loadTags() {
  try {
    const res = await adminBuyerShowApi.listTags()
    allTags.value = res.data.data || []
  } catch (error) {
    console.error('Failed to load tags:', error)
  }
}

async function handleChange(value: (string | number)[]) {
  const newTagIds: number[] = []
  for (const item of value) {
    const itemStr = String(item)
    const existingTag = allTags.value.find(t => String(t.id) === itemStr)
    if (existingTag) {
      newTagIds.push(existingTag.id)
    } else {
      try {
        const res = await adminBuyerShowApi.createTag(itemStr)
        newTagIds.push(res.data.data.id)
        await loadTags()
      } catch (error) {
        console.error('Failed to create tag:', error)
      }
    }
  }
  emit('update:modelValue', newTagIds)
}

watch(() => props.modelValue, (newVal) => {
  selectedTagIds.value = [...newVal]
}, { deep: true })

onMounted(() => {
  loadTags()
})
</script>

<style scoped>
.tag-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.tag-count {
  font-size: var(--el-font-size-extra-small);
  color: var(--el-text-color-secondary);
}
</style>
