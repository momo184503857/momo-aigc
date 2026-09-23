import { ref } from 'vue'

/**
 * 图片预览 composable
 * 用法：
 *   const { visible, url, open } = useImagePreview()
 *   <UiImagePreview v-model="visible" :url="url" />
 *   <img @click="open(imgUrl)" />          单图
 *   <img @click="open([a, b, c])" />       组图（遮罩内 ←/→ 翻页）
 */
export function useImagePreview() {
  const visible = ref(false)
  const url = ref<string | string[]>('')

  function open(imageUrl: string | string[]) {
    url.value = imageUrl
    visible.value = true
  }

  function close() {
    visible.value = false
    url.value = ''
  }

  return { visible, url, open, close }
}
