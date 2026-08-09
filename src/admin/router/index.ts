import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'AdminLogin',
    component: () => import('../views/AdminLoginPage.vue'),
    meta: { guest: true, title: '管理员登录' },
  },
  {
    path: '/',
    redirect: '/users',
  },
  {
    path: '/users',
    name: 'AdminUsers',
    component: () => import('@/views/admin/AdminUsers.vue'),
    meta: { title: '用户管理' },
  },
  {
    path: '/dashboard',
    name: 'AdminDashboard',
    component: () => import('@/views/admin/AdminDashboard.vue'),
    meta: { title: '生图日志' },
  },
  {
    path: '/templates',
    name: 'AdminTemplates',
    component: () => import('@/views/admin/AdminTemplates.vue'),
    meta: { title: '模板管理' },
  },
  {
    path: '/feature-prompts',
    name: 'AdminFeaturePrompts',
    component: () => import('@/views/admin/AdminFeaturePrompts.vue'),
    meta: { title: '功能提示词' },
  },
  {
    path: '/photography',
    name: 'AdminPhotography',
    component: () => import('@/views/admin/AdminPhotography.vue'),
    meta: { title: 'AI摄影配置' },
  },
  {
    path: '/works',
    name: 'AdminWorks',
    component: () => import('@/views/admin/AdminWorks.vue'),
    meta: { title: '作品库管理' },
  },
  {
    path: '/prompt-cases',
    name: 'AdminPromptCases',
    component: () => import('@/views/admin/AdminPromptCases.vue'),
    meta: { title: '提示词案例' },
  },
  {
    path: '/prompt-modules',
    name: 'AdminPromptModules',
    component: () => import('@/views/admin/AdminPromptModules.vue'),
    meta: { title: '提示词模块' },
  },
  {
    path: '/toapis-key',
    name: 'AdminToApisKey',
    component: () => import('@/views/admin/AdminToApisKey.vue'),
    meta: { title: 'API Key 管理' },
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/users',
  },
]

const router = createRouter({
  // admin.html 作为独立入口：hash 模式，URL 形如 /admin.html#/users。
  // 选 hash 而非 history：与用户端一致，且 Nginx 无需任何新增 SPA 回退配置，
  // /admin.html 作为静态文件直接返回即可，深链刷新零风险。
  history: createWebHashHistory(),
  routes,
})

router.beforeEach(async (to, _from) => {
  const auth = useAuthStore()

  // guest 页面（登录页）：已登录管理员直接进后台首页
  if (to.meta.guest) {
    if (auth.isLoggedIn && auth.isAdmin) {
      return { path: '/users' }
    }
    return true
  }

  // 非 guest 页面：需要登录 + 管理员身份
  // 首次进入时 token 可能存在但 user 未加载，先拉取一次
  if (auth.token && !auth.user) {
    await auth.fetchUser()
  }

  if (!auth.isLoggedIn) {
    return { path: '/login' }
  }

  if (!auth.isAdmin) {
    // 已登录但非管理员：清空登录态并回到登录页
    auth.clear()
    return { path: '/login' }
  }

  return true
})

export default router
