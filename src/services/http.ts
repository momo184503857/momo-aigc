import axios from 'axios'
import { useAuthStore } from '@/stores/auth'

const http = axios.create({
  baseURL: '/api',
  timeout: 15000,
})

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

http.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('auth_token')
      const auth = useAuthStore()
      auth.clear()
      // 按入口分流：管理后台(admin.html)401 跳管理后台登录页，否则跳用户端登录页
      const inAdmin = window.location.pathname.endsWith('admin.html')
      window.location.href = inAdmin ? '/admin.html#/login' : '/#/login'
    }
    return Promise.reject(err)
  }
)

export default http
