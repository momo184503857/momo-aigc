<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Document, WarningFilled } from '@element-plus/icons-vue'
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
      <el-skeleton :rows="8" animated />
    </div>

    <div v-else-if="status === 'notfound'" class="help-state help-state--center">
      <el-icon :size="32"><Document /></el-icon>
      <p>帮助文档不存在或尚未发布</p>
      <p class="help-state-path">{{ path }}</p>
    </div>

    <div v-else-if="status === 'error'" class="help-state help-state--center">
      <el-icon :size="32" class="help-state-error"><WarningFilled /></el-icon>
      <p>文档加载失败，请检查网络后重试</p>
      <el-button size="small" @click="load">重试</el-button>
    </div>

    <!-- v-html 内容由 renderHelpMarkdown 生成（html: false，不执行文档内联 HTML） -->
    <div v-else class="help-doc" v-html="html"></div>
  </div>
</template>

<style scoped>
.help-renderer {
  min-height: 100%;
}

.help-state {
  padding: var(--momo-space-6) var(--momo-space-4);
}

.help-state--center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--momo-space-3);
  padding: var(--momo-space-16) var(--momo-space-4);
  color: var(--momo-color-text-secondary);
  font-size: var(--momo-font-size-base);
  text-align: center;
}

.help-state-error {
  color: var(--momo-color-warning);
}

.help-state-path {
  margin: 0;
  font-size: var(--momo-font-size-xs);
  color: var(--momo-color-text-secondary);
  font-family: var(--momo-font-mono);
  word-break: break-all;
}

/* ─── 帮助文档排版（全部取 --momo-* token） ─── */
.help-doc {
  font-size: var(--momo-font-size-base);
  line-height: var(--momo-leading-relaxed);
  color: var(--momo-color-text);
  word-break: break-word;
}

.help-doc :deep(h1) {
  margin: 0 0 var(--momo-space-4);
  font-size: var(--momo-font-size-2xl);
  font-weight: var(--momo-font-weight-semibold);
  line-height: var(--momo-leading-tight);
}

.help-doc :deep(h2) {
  margin: var(--momo-space-8) 0 var(--momo-space-3);
  padding-bottom: var(--momo-space-2);
  font-size: var(--momo-font-size-xl);
  font-weight: var(--momo-font-weight-semibold);
  border-bottom: 1px solid var(--momo-color-border-soft);
}

.help-doc :deep(h3) {
  margin: var(--momo-space-6) 0 var(--momo-space-2);
  font-size: var(--momo-font-size-lg);
  font-weight: var(--momo-font-weight-semibold);
}

.help-doc :deep(h4) {
  margin: var(--momo-space-4) 0 var(--momo-space-2);
  font-size: var(--momo-font-size-base);
  font-weight: var(--momo-font-weight-semibold);
}

.help-doc :deep(p) {
  margin: 0 0 var(--momo-space-3);
}

.help-doc :deep(ul),
.help-doc :deep(ol) {
  margin: 0 0 var(--momo-space-3);
  padding-left: var(--momo-space-6);
}

.help-doc :deep(li) {
  margin-bottom: var(--momo-space-2);
}

.help-doc :deep(a) {
  color: var(--momo-color-brand);
  text-decoration: none;
}

.help-doc :deep(a:hover) {
  color: var(--momo-color-brand-hover);
  text-decoration: underline;
}

.help-doc :deep(img) {
  max-width: 100%;
  border-radius: var(--momo-radius-md);
  margin: var(--momo-space-2) 0;
}

.help-doc :deep(video) {
  display: block;
  width: 100%;
  border-radius: var(--momo-radius-md);
  margin: var(--momo-space-3) 0;
  background: var(--momo-color-bg-page);
}

.help-doc :deep(blockquote) {
  margin: 0 0 var(--momo-space-3);
  padding: var(--momo-space-3) var(--momo-space-4);
  border-left: 3px solid var(--momo-color-brand-border);
  border-radius: var(--momo-radius-sm);
  background: var(--momo-color-brand-subtle);
  color: var(--momo-color-text-secondary);
}

.help-doc :deep(blockquote p:last-child) {
  margin-bottom: 0;
}

.help-doc :deep(code) {
  padding: var(--momo-space-1) var(--momo-space-2);
  border-radius: var(--momo-radius-sm);
  background: var(--momo-color-info-subtle);
  font-family: var(--momo-font-mono);
  font-size: var(--momo-font-size-xs);
}

.help-doc :deep(pre) {
  margin: 0 0 var(--momo-space-3);
  padding: var(--momo-space-4);
  border-radius: var(--momo-radius-md);
  background: var(--momo-terminal-bg);
  overflow-x: auto;
}

.help-doc :deep(pre code) {
  padding: 0;
  background: transparent;
  color: var(--momo-terminal-text);
  font-size: var(--momo-font-size-xs);
  line-height: var(--momo-leading-normal);
}

.help-doc :deep(table) {
  width: 100%;
  margin: 0 0 var(--momo-space-3);
  border-collapse: collapse;
  font-size: var(--momo-font-size-base);
}

.help-doc :deep(th),
.help-doc :deep(td) {
  padding: var(--momo-space-2) var(--momo-space-3);
  border: 1px solid var(--momo-color-border-soft);
  text-align: left;
}

.help-doc :deep(th) {
  background: var(--momo-color-bg-page);
  font-weight: var(--momo-font-weight-medium);
}

.help-doc :deep(hr) {
  margin: var(--momo-space-6) 0;
  border: none;
  border-top: 1px solid var(--momo-color-border-soft);
}
</style>
