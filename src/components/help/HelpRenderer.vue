<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { FileText, TriangleAlert } from '@lucide/vue'
import { Skeleton } from '@/components/design-system/primitives/skeleton'
import { Button } from '@/components/design-system/primitives/button'
import { renderHelpMarkdown } from '@/utils/helpMarkdown'

const props = defineProps<{
  /** 相对 docs/help/ 的 Markdown 路径，如 works/gallery.md */
  path: string
}>()

type RenderStatus = 'loading' | 'ok' | 'notfound' | 'error'

const status = ref<RenderStatus>('loading')
const html = ref('')

const url = computed(() => `/docs/${props.path}`)

async function load() {
  status.value = 'loading'
  try {
    const res = await fetch(url.value)
    if (res.status === 404) {
      status.value = 'notfound'
      return
    }
    if (!res.ok) {
      status.value = 'error'
      return
    }
    html.value = renderHelpMarkdown(await res.text(), url.value)
    status.value = 'ok'
  } catch {
    status.value = 'error'
  }
}

watch(() => props.path, load, { immediate: true })
</script>

<template>
  <div class="help-renderer">
    <div v-if="status === 'loading'" class="help-state">
      <div class="flex flex-col gap-3">
        <Skeleton v-for="i in 8" :key="i" class="h-4" :class="i % 3 === 0 ? 'w-2/3' : 'w-full'" />
      </div>
    </div>

    <div v-else-if="status === 'notfound'" class="help-state help-state--center">
      <FileText class="size-8" />
      <p>帮助文档不存在或尚未发布</p>
      <p class="help-state-path">{{ path }}</p>
    </div>

    <div v-else-if="status === 'error'" class="help-state help-state--center">
      <TriangleAlert class="help-state-error size-8" />
      <p>文档加载失败，请检查网络后重试</p>
      <Button variant="outline" size="sm" @click="load">重试</Button>
    </div>

    <!-- v-html 内容由 renderHelpMarkdown 生成（html: false，不执行文档内联 HTML） -->
    <div v-else class="ds-prose" v-html="html"></div>
  </div>
</template>

<style scoped>
.help-renderer {
  min-height: 100%;
}

.help-state {
  padding: var(--ds-space-6) var(--ds-space-4);
}

.help-state--center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ds-space-3);
  padding: var(--ds-space-16) var(--ds-space-4);
  color: var(--muted-foreground);
  font-size: var(--ds-font-body);
  text-align: center;
}

.help-state-error {
  color: var(--warning);
}

.help-state-path {
  margin: 0;
  font-size: var(--ds-font-small);
  color: var(--muted-foreground);
  font-family: var(--ds-font-mono);
  word-break: break-all;
}

</style>
