import { inject, type InjectionKey, type Ref } from 'vue'
export type ThemeMode = 'light' | 'dark'
export interface DesignSystemContext { portalTarget: Ref<HTMLElement | undefined>; toastId: string }
export const designSystemKey: InjectionKey<DesignSystemContext> = Symbol('design-system')
export function useDesignSystem() {
  const value = inject(designSystemKey)
  if (!value) throw new Error('公共组件必须放在 DsThemeProvider 内')
  return value
}
