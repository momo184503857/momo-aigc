import { reactive } from 'vue'
import { toast } from 'vue-sonner'
import { translateError } from '@/utils/errors'

export interface DialogOptions {
  confirmText?: string
  cancelText?: string
  /** prompt 模式：输入框初始值 */
  inputValue?: string
  inputPlaceholder?: string
}

// 模块级单例：FeedbackHost 负责渲染，这里只暴露触发/结算入口。
// 同一时刻只保留一个对话框（与 ElMessageBox 的排队行为一致）。
export const feedbackDialog = reactive({
  open: false,
  mode: 'confirm' as 'confirm' | 'prompt',
  title: '确认操作',
  message: '',
  confirmText: '确认',
  cancelText: '取消',
  destructive: false,
  input: '',
  inputPlaceholder: '',
  settle: null as ((value: string | null) => void) | null,
})

export function settleFeedbackDialog(value: string | null) {
  const settle = feedbackDialog.settle
  feedbackDialog.settle = null
  feedbackDialog.open = false
  settle?.(value)
}

function openDialog(params: {
  mode: 'confirm' | 'prompt'
  title: string
  message: string
  confirmText: string
  cancelText: string
  destructive: boolean
  inputValue: string
  inputPlaceholder: string
}): Promise<string | null> {
  // 上一个未结算的对话框按取消处理，避免 Promise 悬挂
  if (feedbackDialog.settle) feedbackDialog.settle(null)
  Object.assign(feedbackDialog, params, { open: true, settle: null })
  return new Promise((resolve) => {
    feedbackDialog.settle = resolve
  })
}

const CANCEL = new Error('cancel')

/** 普通确认框：取消时 reject（调用方沿用 try/catch 写法） */
export async function confirmDialog(
  message: string,
  title = '确认操作',
  options: DialogOptions = {},
): Promise<void> {
  const value = await openDialog({
    mode: 'confirm',
    title,
    message,
    confirmText: options.confirmText || '确认',
    cancelText: options.cancelText || '取消',
    destructive: false,
    inputValue: '',
    inputPlaceholder: '',
  })
  if (value === null) throw CANCEL
}

/** 输入确认框：取消时 reject，确认时 resolve { value }（与 ElMessageBox.prompt 同构） */
export async function promptDialog(
  message: string,
  title = '请输入',
  options: DialogOptions = {},
): Promise<{ value: string }> {
  const value = await openDialog({
    mode: 'prompt',
    title,
    message,
    confirmText: options.confirmText || '确认',
    cancelText: options.cancelText || '取消',
    destructive: false,
    inputValue: options.inputValue || '',
    inputPlaceholder: options.inputPlaceholder || '',
  })
  if (value === null) throw CANCEL
  return { value }
}

export function useUiFeedback() {
  function success(message: string) {
    toast.success(message)
  }

  function info(message: string) {
    toast.info(message)
  }

  function warning(message: string) {
    toast.warning(message)
  }

  function error(err: unknown, fallback = '操作失败') {
    toast.error(translateError(err) || fallback)
  }

  async function confirmDanger(options: {
    title?: string
    message: string
    confirmText?: string
    cancelText?: string
  }) {
    const value = await openDialog({
      mode: 'confirm',
      title: options.title || '确认操作',
      message: options.message,
      confirmText: options.confirmText || '确认',
      cancelText: options.cancelText || '取消',
      destructive: true,
      inputValue: '',
      inputPlaceholder: '',
    })
    if (value === null) throw CANCEL
  }

  return {
    success,
    info,
    warning,
    error,
    confirmDanger,
  }
}
