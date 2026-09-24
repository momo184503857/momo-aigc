import { createRouter, createWebHashHistory } from 'vue-router'
import { routeMetaMap } from '@/configs/navigation'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    // 已移除功能的历史链接统一回到自由生图，不再加载旧页面。
    { path: '/:pathMatch(.*)*', redirect: '/free-gen' },
    ...(import.meta.env.DEV ? [{
      path: '/prototype/create',
      name: 'CreationPrototype',
      component: () => import('@/prototype/CreationPrototype.vue'),
      meta: { prototype: true, title: '墨墨 · 创作原型' },
    }] : []),
    {
      path: '/login',
      name: 'Login',
      component: () => import('@/views/login/LoginPage.vue'),
      meta: { guest: true },
    },
    {
      path: '/register',
      name: 'Register',
      component: () => import('@/views/login/RegisterPage.vue'),
      meta: { guest: true },
    },
    {
      path: '/forgot-password',
      name: 'ForgotPassword',
      component: () => import('@/views/login/ForgotPasswordPage.vue'),
      meta: { guest: true },
    },
    {
      path: '/',
      redirect: '/free-gen',
    },
    {
      path: '/free-gen',
      name: 'FreeGen',
      component: () => import('@/views/free-gen/FreeGenPage.vue'),
      meta: { title: '自由生图', requiresAuth: true },
    },
    {
      path: '/workspace',
      name: 'Workspace',
      component: () => import('@/views/workspace/WorkspacePage.vue'),
      meta: { title: '快速生图', requiresAuth: true },
    },
    { path: '/assets', redirect: '/assets/results' },
    {
      path: '/templates',
      alias: '/assets/templates',
      name: 'Templates',
      component: () => import('@/views/templates/TemplatesPage.vue'),
      meta: { title: '模板图库', requiresAuth: true },
    },
    {
      path: '/results',
      alias: '/assets/results',
      name: 'Results',
      component: () => import('@/views/results/ResultsPage.vue'),
      meta: { title: '生图结果', requiresAuth: true },
    },

    {
      path: '/prompts',
      alias: '/assets/prompts',
      name: 'PromptLibrary',
      component: () => import('@/views/prompts/PromptLibraryPage.vue'),
      meta: { title: '提示词库', requiresAuth: true },
    },
    {
      path: '/canvas-projects',
      name: 'CanvasProjects',
      component: () => import('@/views/canvas/ProjectsPage.vue'),
      meta: { title: 'AI画布', requiresAuth: true },
    },
    {
      path: '/photography',
      name: 'Photography',
      component: () => import('@/views/photography/PhotographyPage.vue'),
      meta: { title: 'AI摄影', requiresAuth: true },
    },

    {
      path: '/toolbox',
      name: 'Toolbox',
      component: () => import('@/views/tools/ToolboxPage.vue'),
      meta: { title: 'AI工具箱', requiresAuth: true },
    },
    {
      path: '/buyer-show',
      name: 'BuyerShow',
      component: () => import('@/views/buyer-show/BuyerShowPage.vue'),
      meta: { title: 'AI买家秀', requiresAuth: true },
    },
    {
      path: '/settings',
      name: 'UserSettings',
      component: () => import('@/views/user/UserSettingsPage.vue'),
      meta: { title: '个人设置', requiresAuth: true },
    },
    {
      path: '/my-quota',
      name: 'MyQuota',
      component: () => import('@/views/user/MyQuotaPage.vue'),
      meta: { title: '我的额度', requiresAuth: true },
    },
    {
      path: '/my-consumption',
      name: 'MyConsumption',
      component: () => import('@/views/user/MyConsumptionPage.vue'),
      meta: { title: '我的消耗', requiresAuth: true },
    },
    {
      path: '/pricing',
      name: 'Pricing',
      component: () => import('@/views/user/PricingPage.vue'),
      meta: { title: '计费说明', requiresAuth: true },
    },
    {
      path: '/toolbox/batch-clothes-swap',
      name: 'BatchClothesSwap',
      component: () => import('@/views/tools/BatchClothesSwapPage.vue'),
      meta: { title: '批量换姿势', requiresAuth: true },
    },
    {
      path: '/toolbox/batch-pose-swap',
      name: 'BatchPoseSwap',
      component: () => import('@/views/tools/BatchPoseSwapPage.vue'),
      meta: { title: '批量换衣服', requiresAuth: true },
    },
    {
      path: '/toolbox/batch-spreadsheet',
      name: 'BatchSpreadsheet',
      component: () => import('@/views/tools/BatchSpreadsheetPage.vue'),
      meta: { title: '批量传表格做图', requiresAuth: true },
    },
    {
      path: '/toolbox/batch-face-swap',
      name: 'BatchFaceSwap',
      component: () => import('@/views/tools/BatchFaceSwapPage.vue'),
      meta: { title: '批量换脸', requiresAuth: true },
    },
    {
      path: '/ai-canvas/:projectId',
      name: 'AICanvas',
      component: () => import('@/views/canvas/AICanvasPage.vue'),
      meta: { title: 'AI画布', requiresAuth: true, hideInMenu: true },
    },
    {
      path: '/admin',
      redirect: '/admin/users',
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/admin/ui-components',
      name: 'AdminUiComponents',
      component: () => import('@/views/admin/AdminUiComponents.vue'),
      meta: { title: 'UI 组件库', requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/admin/users',
      name: 'AdminUsers',
      component: () => import('@/views/admin/AdminUsers.vue'),
      meta: { title: '用户管理', requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/admin/dashboard',
      name: 'AdminDashboard',
      component: () => import('@/views/admin/AdminDashboard.vue'),
      meta: { title: '生图日志', requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/admin/tasks',
      redirect: '/admin/dashboard',
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/admin/stats',
      redirect: '/admin/dashboard',
      meta: { requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/admin/points/transactions',
      redirect: '/admin/dashboard',
      meta: { requiresAuth: true, requiresAdmin: true },
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
      path: '/admin/photography',
      name: 'AdminPhotography',
      component: () => import('@/views/admin/AdminPhotography.vue'),
      meta: { title: 'AI摄影配置', requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/admin/ai-config',
      name: 'AdminAiConfig',
      component: () => import('@/views/admin/AdminAiConfig.vue'),
      meta: { title: '配置', requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/admin/points',
      redirect: '/admin/users',
      meta: { requiresAuth: true, requiresAdmin: true },
    },
  ],
})

for (const route of router.getRoutes()) { if (routeMetaMap[route.path]) route.meta.title = routeMetaMap[route.path].title }

const APP_TITLE = '墨墨 AI 生图'
const ADMIN_TITLE = '墨墨AI生图管理员后台'

router.afterEach((to) => {
  if (import.meta.env.DEV && to.meta.prototype) {
    document.title = '墨墨 · 创作原型'
    return
  }
  document.title = to.path.startsWith('/admin/') || to.path === '/admin' ? ADMIN_TITLE : APP_TITLE
})

router.beforeEach(async (to, _from, next) => {
  // Local-only design prototype: never fetch a user or touch an existing session.
  if (import.meta.env.DEV && to.meta.prototype) {
    next()
    return
  }
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
      next('/free-gen')
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
    next('/free-gen')
    return
  }

  next()
})

export default router
