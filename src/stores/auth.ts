import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authApi, type UserInfo } from '@/services/authApi'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('auth_token') || '')
  const user = ref<UserInfo | null>(null)
  const loading = ref(false)

  const isLoggedIn = computed(() => !!token.value && !!user.value)
  const isAdmin = computed(() => user.value?.role === 'admin')

  async function login(username: string, password: string) {
    loading.value = true
    try {
      const res = await authApi.login(username, password)
      const { token: t, user: u } = res.data.data
      token.value = t
      user.value = u
      localStorage.setItem('auth_token', t)
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
  }

  return { token, user, loading, isLoggedIn, isAdmin, login, fetchUser, logout, clear }
})
