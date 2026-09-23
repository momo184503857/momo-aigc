<script setup lang="ts">
/**
 * PromptCardPreview - 卡片预览弹窗（多图）。
 * 左：大图 + 缩略图条（点击切换主图、左右翻页、主图点击放大）。
 * 右：模块标签 + 完整内容 + 备注 + 作者 + 统计行 + 复用按钮。
 */
import { ref, computed, watch } from 'vue'
import { useImagePreview } from '@/composables/useImagePreview'
import { useUiFeedback } from '@/composables/useUiFeedback'
import UiImagePreview from '@/components/ui/UiImagePreview.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { promptCardsApi, type PromptCardItem } from '@/services/promptCardsApi'
import { ArrowLeft, ArrowRight, Star, Bookmark, Copy } from '@lucide/vue'

const props = defineProps<{
  modelValue: boolean
  card: PromptCardItem | null
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'reuse', card: PromptCardItem): void
}>()

const { success, warning, error } = useUiFeedback()
const { visible: bigVisible, url: bigUrl, open: openBig } = useImagePreview()

const activeIdx = ref(0)

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const images = computed(() => props.card?.images || [])
const currentUrl = computed(() => images.value[activeIdx.value] || '')

// 打开新卡片时，默认显示置顶图
watch(() => props.card?.id, (id) => {
  if (id && props.card) {
    activeIdx.value = props.card.cover_index || 0
  }
})

function prev() {
  if (images.value.length <= 1) return
  activeIdx.value = (activeIdx.value - 1 + images.value.length) % images.value.length
}
function next() {
  if (images.value.length <= 1) return
  activeIdx.value = (activeIdx.value + 1) % images.value.length
}
function selectIdx(idx: number) {
  activeIdx.value = idx
}
function openMain() {
  if (currentUrl.value) openBig(currentUrl.value)
}

async function handleReuse() {
  if (!props.card) return
  try {
    await promptCardsApi.reuse(props.card.id)
    success('已复用到拼接预览')
    emit('reuse', props.card)
    visible.value = false
  } catch (e) {
    error(e, '复用失败')
  }
}

function copyContent() {
  if (!props.card?.content) return
  navigator.clipboard.writeText(props.card.content)
    .then(() => success('已复制提示词'))
    .catch(() => warning('复制失败，请手动复制'))
}
</script>

<template>
  <Dialog :open="visible" @update:open="(v: boolean) => (visible = v)">
    <DialogContent class="sm:max-w-3xl">
      <DialogTitle class="sr-only">卡片预览</DialogTitle>
      <div v-if="card" class="flex gap-5 max-[720px]:flex-col">
        <!-- 左：大图区 -->
        <div class="flex flex-[0_0_360px] flex-col gap-2.5 max-[720px]:w-full max-[720px]:flex-none">
          <div class="relative aspect-square w-full overflow-hidden rounded-md bg-muted">
            <img
              v-if="currentUrl"
              :src="currentUrl"
              alt="预览图"
              class="size-full cursor-zoom-in object-contain"
              @click="openMain"
            />
            <div
              v-if="images.length > 1"
              class="absolute top-1/2 left-2 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/45 text-white opacity-80 transition-opacity hover:opacity-100"
              @click="prev"
            >
              <ArrowLeft class="size-4.5" />
            </div>
            <div
              v-if="images.length > 1"
              class="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/45 text-white opacity-80 transition-opacity hover:opacity-100"
              @click="next"
            >
              <ArrowRight class="size-4.5" />
            </div>
            <div v-if="images.length > 1" class="absolute right-2 bottom-2 rounded-sm bg-black/50 px-2 py-0.5 text-xs text-white">{{ activeIdx + 1 }} / {{ images.length }}</div>
          </div>
          <div v-if="images.length > 1" class="flex gap-1.5 overflow-x-auto pb-1">
            <div
              v-for="(img, idx) in images"
              :key="idx"
              class="h-14 w-14 shrink-0 cursor-pointer overflow-hidden rounded-sm border-2 transition-[opacity,border-color]"
              :class="idx === activeIdx ? 'border-primary opacity-100' : 'border-transparent opacity-70'"
              @click="selectIdx(idx)"
            >
              <img :src="img" alt="缩略图" class="size-full object-cover" />
            </div>
          </div>
        </div>

        <!-- 右：信息区 -->
        <div class="flex min-w-0 flex-1 flex-col gap-3">
          <div class="flex items-center gap-2">
            <Badge v-if="card.module" :variant="card.module.type === 'forbidden' ? 'destructive' : card.module.type === 'requirement' ? 'warning' : 'default'">
              {{ card.module.name }}
            </Badge>
            <Badge v-if="card.is_official" variant="warning">官方</Badge>
          </div>

          <div class="rounded-md bg-(--momo-color-bg-soft) px-3.5 py-3 text-base leading-7 break-words whitespace-pre-wrap text-foreground">{{ card.content }}</div>

          <div v-if="card.remark" class="text-muted-foreground flex gap-2 text-sm leading-6">
            <span class="shrink-0 font-semibold">备注</span>
            <span class="break-words whitespace-pre-wrap">{{ card.remark }}</span>
          </div>

          <div class="text-muted-foreground flex items-center gap-4 text-sm">
            <span class="flex items-center gap-1"><Star class="size-4" /> {{ card.like_count }}</span>
            <span class="flex items-center gap-1"><Bookmark class="size-4" /> {{ card.favorite_count }}</span>
            <span class="flex items-center gap-1"><Copy class="size-4" /> {{ card.reuse_count }}</span>
            <span class="ml-auto text-(--momo-color-text-placeholder)">{{ card.author?.nickname || card.author?.username || '匿名' }}</span>
          </div>

          <div class="mt-auto flex gap-2.5 pt-2">
            <Button variant="outline" @click="copyContent"><Copy />复制内容</Button>
            <Button @click="handleReuse"><Copy />复用到拼接预览</Button>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>

  <UiImagePreview v-model="bigVisible" :url="bigUrl" />
</template>
