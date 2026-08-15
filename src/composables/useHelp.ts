// 全局帮助 Drawer 状态（模块级单例，MainLayout 内 HelpButton / HelpDrawer 共享）
// 路由切换时自动跟随 route.meta.helpKey 更新目标文档；Drawer 打开状态下自动换文档
import { computed, toRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { getHelpEntry } from '@/configs/helpRegistry'
import { useUiFeedback } from '@/composables/useUiFeedback'

const state = {
  visible: false,
  currentKey: null as string | null,
}

// 路由 → helpKey 的绑定只做一次（多个组件调用 useHelp 时共享）
let routeBound = false

export function useHelp() {
  const route = useRoute()
  const ui = useUiFeedback()

  if (!routeBound) {
    routeBound = true
    watch(
      () => route.meta.helpKey,
      (key) => {
        state.currentKey = key ?? null
      },
      { immediate: true },
    )
  }

  const visible = toRef(state, 'visible')

  const available = computed(() => !!state.currentKey)

  const currentEntry = computed(() => getHelpEntry(state.currentKey))

  function open() {
    if (!state.currentKey) {
      ui.info('该页面暂未提供帮助文档')
      return
    }
    state.visible = true
  }

  function close() {
    state.visible = false
  }

  return { visible, available, currentEntry, open, close }
}
