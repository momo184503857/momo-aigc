import { nextTick, onUnmounted, ref, watch, type Ref } from 'vue'

/** 使用面板内的底部标记触发加载；失败后交由显式重试，避免请求循环。 */
export function useInfiniteLoader(target: Ref<HTMLElement | undefined>, canLoad: () => boolean, load: () => unknown) {
  const visible = ref(false)
  let observer: IntersectionObserver | undefined
  watch(target, element => {
    observer?.disconnect()
    visible.value = false
    if (!element) return
    observer = new IntersectionObserver(entries => { visible.value = !!entries[0]?.isIntersecting }, { rootMargin: '0px 0px 160px 0px' })
    observer.observe(element)
  }, { flush: 'post' })
  watch([visible, canLoad], async () => {
    await nextTick()
    if (!visible.value || !canLoad() || !target.value) return
    // 追加内容后 Observer 的旧可见状态可能还未更新，重新核对滚动边界。
    const rect = target.value.getBoundingClientRect()
    let bottom = window.innerHeight
    let ancestor = target.value.parentElement
    while (ancestor) {
      if (/(auto|scroll)/.test(getComputedStyle(ancestor).overflowY)) {
        bottom = Math.min(bottom, ancestor.getBoundingClientRect().bottom)
      }
      ancestor = ancestor.parentElement
    }
    if (rect.top <= bottom + 160) void load()
  }, { flush: 'post' })
  onUnmounted(() => observer?.disconnect())
}
