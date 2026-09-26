import { computed } from 'vue'
import { useAppearanceStore } from '@/stores/appearance'
import { useAuthStore } from '@/stores/auth'
import { useUiFeedback } from '@/composables/useUiFeedback'
import { isThemeAccent, type ThemeAccent } from '@/types/appearance'

export function useThemeAccent() {
  const appearance = useAppearanceStore()
  const auth = useAuthStore()
  const { success, error } = useUiFeedback()
  const saving = computed(() => appearance.accentSaving)

  async function selectAccent(value: unknown) {
    if (appearance.accentSaving || !isThemeAccent(value) || value === appearance.accent) return
    const previous = appearance.accent
    appearance.previewAccent(value)
    appearance.accentSaving = true
    try {
      const saved = await auth.updateThemeColor(value)
      appearance.commitAccent(saved)
      success('主题色已更新')
    } catch (err) {
      appearance.previewAccent(previous)
      error(err, '主题色保存失败，已恢复原设置')
    } finally {
      appearance.accentSaving = false
    }
  }

  return { appearance, saving, selectAccent }
}
