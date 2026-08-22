import { useUiFeedback } from '@/composables/useUiFeedback'

/**
 * 复制文本到剪贴板：优先 Clipboard API，失败回退隐藏 textarea + execCommand。
 * 用法：const { copy } = useClipboard(); copy(text, { successMsg: '已复制 N 条' })
 */
export function useClipboard() {
  const { success, warning } = useUiFeedback()

  function fallbackCopy(text: string, msg: string) {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    textarea.style.top = '-9999px'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    try {
      const ok = document.execCommand('copy')
      if (ok) success(msg)
      else warning('复制失败，请手动复制')
    } catch {
      warning('复制失败，请手动复制')
    }
    document.body.removeChild(textarea)
  }

  function copy(text: string, opts?: { successMsg?: string }) {
    if (!text) return
    const msg = opts?.successMsg || '已复制'
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard
        .writeText(text)
        .then(() => success(msg))
        .catch((e) => {
          // 留诊断痕迹：剪贴板权限拒绝等问题在 UI 提示之外可见于控制台
          console.warn('[clipboard] Clipboard API 失败，降级 execCommand:', e)
          fallbackCopy(text, msg)
        })
    } else {
      fallbackCopy(text, msg)
    }
  }

  return { copy }
}
