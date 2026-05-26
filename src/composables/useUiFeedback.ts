import { ElMessage, ElMessageBox } from 'element-plus'
import { translateError } from '@/utils/errors'

export function useUiFeedback() {
  function success(message: string) {
    ElMessage.success(message)
  }

  function info(message: string) {
    ElMessage.info(message)
  }

  function warning(message: string) {
    ElMessage.warning(message)
  }

  function error(err: unknown, fallback = '操作失败') {
    ElMessage.error(translateError(err) || fallback)
  }

  async function confirmDanger(options: {
    title?: string
    message: string
    confirmText?: string
    cancelText?: string
  }) {
    await ElMessageBox.confirm(options.message, options.title || '确认操作', {
      type: 'warning',
      confirmButtonText: options.confirmText || '确认',
      cancelButtonText: options.cancelText || '取消',
      confirmButtonClass: 'el-button--danger',
    })
  }

  return {
    success,
    info,
    warning,
    error,
    confirmDanger,
  }
}
