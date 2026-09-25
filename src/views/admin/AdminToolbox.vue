<script setup lang="ts">
defineOptions({ name: 'AdminToolbox' })
import { onMounted, ref } from 'vue'
import { DsScrollPage, DsToolCard, DsFileInput, Button } from '@/components/design-system'
import { toolboxTools } from '@/configs/toolbox'
import { toolboxApi } from '@/services/toolboxApi'
import { ossApi } from '@/services/ossApi'
import { useUiFeedback } from '@/composables/useUiFeedback'
const { success, error } = useUiFeedback()
const images = ref<Record<string, string>>({})
const saved = ref<Record<string, string>>({})
const fileInput = ref<InstanceType<typeof DsFileInput>>()
const selectedId = ref('')
const busy = ref(false)
const loading = ref(true)
const loadError = ref(false)
async function load() {
  loading.value = true
  loadError.value = false
  try { images.value = await toolboxApi.images(); saved.value = { ...images.value } }
  catch { loadError.value = true; error('配置加载失败') }
  finally { loading.value = false }
}
onMounted(load)
function choose(id: string) { selectedId.value = id; fileInput.value?.click() }
async function upload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type) || file.size > 10 * 1024 * 1024) {
    error('请选择不超过 10MB 的 JPG、PNG、WebP 或 GIF 图片'); return
  }
  const id = selectedId.value
  busy.value = true
  try { images.value[id] = (await ossApi.upload(file, 'materials')).publicUrl; success('图片已上传，请保存配置') }
  catch { error('上传失败，请重试') }
  finally { busy.value = false }
}
async function save(id: string) {
  busy.value = true
  try { await toolboxApi.saveImage(id, images.value[id] || ''); saved.value[id] = images.value[id] || ''; success('介绍图已保存') }
  catch { error('保存失败，请重试') }
  finally { busy.value = false }
}
</script>
<template>
  <DsScrollPage title="工具介绍图" description="配置批量工具的介绍图，前台按 4:3 比例居中裁切。建议上传 4:3 图片；未配置时显示“无图片介绍”。">
    <DsFileInput ref="fileInput" accept="image/jpeg,image/png,image/webp,image/gif" @change="upload" />
    <p v-if="loading" role="status">正在加载配置…</p>
    <div v-else-if="loadError" role="alert">配置加载失败。<Button variant="outline" @click="load">重新加载</Button></div>
    <div v-else class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <DsToolCard v-for="tool in toolboxTools" :key="tool.id" :title="tool.title" :description="tool.description" :image-url="images[tool.id]">
        <template #actions>
          <div class="flex flex-wrap gap-2">
            <Button variant="outline" :disabled="busy" @click="choose(tool.id)">上传介绍图</Button>
            <Button variant="ghost" :disabled="busy || !images[tool.id]" @click="images[tool.id] = ''">清空图片</Button>
            <Button :disabled="busy || images[tool.id] === saved[tool.id]" @click="save(tool.id)">保存</Button>
          </div>
        </template>
      </DsToolCard>
    </div>
  </DsScrollPage>
</template>
