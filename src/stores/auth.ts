import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authApi, type UserInfo, type CodePurpose } from '@/services/authApi'
import { useAppearanceStore } from '@/stores/appearance'
import type { ThemeAccent } from '@/types/appearance'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('auth_token') || '')
  const user = ref<UserInfo | null>(null)
  const loading = ref(false)

  const isLoggedIn = computed(() => !!token.value && !!user.value)
  const isAdmin = computed(() => user.value?.role === 'admin')
  // 展示名优先级：nickname > username > email
  const displayName = computed(() => user.value?.nickname || user.value?.username || user.value?.email || '')

  function applyAuth(t: string, u: UserInfo) {
    token.value = t
    user.value = u
    localStorage.setItem('auth_token', t)
    useAppearanceStore().hydrateAccent(u.theme_color)
  }

  async function login(account: string, password: string) {
    loading.value = true
    try {
      const res = await authApi.login(account, password)
      applyAuth(res.data.data.token, res.data.data.user)
      return true
    } finally {
      loading.value = false
    }
  }

  async function register(email: string, code: string, password: string) {
    loading.value = true
    try {
      const res = await authApi.register(email, code, password)
      applyAuth(res.data.data.token, res.data.data.user)
      return true
    } finally {
      loading.value = false
    }
  }

  async function loginWithCode(email: string, code: string) {
    loading.value = true
    try {
      const res = await authApi.loginCode(email, code)
      applyAuth(res.data.data.token, res.data.data.user)
      return true
    } finally {
      loading.value = false
    }
  }

  async function fetchUser() {
    if (!token.value) return false
    try {
      const res = await authApi.me()
      user.value = res.data.data
      useAppearanceStore().hydrateAccent(res.data.data.theme_color)
      return true
    } catch {
      clear()
      return false
    }
  }

  function logout() {
    authApi.logout().catch(() => {})
    clear()
  }

  function clear() {
    token.value = ''
    user.value = null
    localStorage.removeItem('auth_token')
    useAppearanceStore().resetAccent()
  }

  async function updateThemeColor(themeColor: ThemeAccent) {
    const res = await authApi.updateAppearance(themeColor)
    if (user.value) user.value = { ...user.value, theme_color: res.data.data.theme_color }
    return res.data.data.theme_color
  }

  return { token, user, loading, isLoggedIn, isAdmin, displayName, login, register, loginWithCode, fetchUser, logout, clear, updateThemeColor }
})
