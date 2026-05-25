import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/login',
      name: 'Login',
      component: () => import('@/views/login/LoginPage.vue'),
      meta: { guest: true },
    },
    {
      path: '/',
      redirect: '/workspace',
    },
    {
      path: '/workspace',
      name: 'Workspace',
      component: () => import('@/views/workspace/WorkspacePage.vue'),
      meta: { title: '生图工作台', requiresAuth: true },
    },
    {
      path: '/templates',
      name: 'Templates',
      component: () => import('@/views/templates/TemplatesPage.vue'),
      meta: { title: '模板图库', requiresAuth: true },
    },
    {
      path: '/results',
      name: 'Results',
      component: () => import('@/views/results/ResultsPage.vue'),
      meta: { title: '生图结果', requiresAuth: true },
    },

    {
      path: '/prompts',
      name: 'PromptLibrary',
      component: () => import('@/views/prompts/PromptLibraryPage.vue'),
      meta: { title: '提示词库', requiresAuth: true },
    },
    {
      path: '/admin',
      redirect: '/admin/users',
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/admin/users',
      name: 'AdminUsers',
      component: () => import('@/views/admin/AdminUsers.vue'),
      meta: { title: '用户管理', requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/admin/tasks',
      name: 'AdminTasks',
      component: () => import('@/views/admin/AdminTasks.vue'),
      meta: { title: '任务管理', requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/admin/templates',
      name: 'AdminTemplates',
      component: () => import('@/views/admin/AdminTemplates.vue'),
      meta: { title: '模板管理', requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/admin/feature-prompts',
      name: 'AdminFeaturePrompts',
      component: () => import('@/views/admin/AdminFeaturePrompts.vue'),
      meta: { title: '功能提示词', requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/admin/stats',
      name: 'AdminStats',
      component: () => import('@/views/admin/AdminStats.vue'),
      meta: { title: '生成统计', requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/admin/toapis-key',
      name: 'AdminToApisKey',
      component: () => import('@/views/admin/AdminToApisKey.vue'),
      meta: { title: 'API Key 管理', requiresAuth: true, requiresAdmin: true },
    },
  ],
})

router.beforeEach(async (to, _from, next) => {
  const auth = useAuthStore()

  // Fetch user on first load if token exists
  if (auth.token && !auth.user) {
    const ok = await auth.fetchUser()
    if (!ok && to.meta.requiresAuth) {
      next('/login')
      return
    }
  }

  if (to.meta.guest) {
    if (auth.isLoggedIn) {
      next('/workspace')
      return
    }
    next()
    return
  }

  if (to.meta.requiresAuth && !auth.isLoggedIn) {
    next('/login')
    return
  }

  if (to.meta.requiresAdmin && !auth.isAdmin) {
    next('/workspace')
    return
  }

  next()
})

export default router
