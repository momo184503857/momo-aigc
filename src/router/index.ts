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
      path: '/prompt-workshop',
      name: 'PromptWorkshop',
      component: () => import('@/views/prompt-workshop/PromptWorkshopPage.vue'),
      meta: { title: '提示词工坊', requiresAuth: true, helpKey: 'prompt-workshop' },
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
      // 旧六步成套生图已下线，历史页签/书签重定向到成套提示词
      path: '/suite-gen',
      redirect: '/suite-prompt',
    },
    {
      path: '/suite-prompt',
      name: 'SuitePrompt',
      component: () => import('@/views/suite-gen/SuitePromptPage.vue'),
      meta: { title: '成套提示词', requiresAuth: true },
    },
    {
      path: '/expert',
      name: 'Expert',
      component: () => import('@/views/expert/ExpertPage.vue'),
      meta: { title: '提示词专家', requiresAuth: true, helpKey: 'expert' },
    },
    {
      path: '/themes',
      name: 'ThemeLibrary',
      component: () => import('@/views/themes/ThemeLibraryPage.vue'),
      meta: { title: '主题库', requiresAuth: true },
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
      path: '/works',
      name: 'WorksGallery',
      component: () => import('@/views/works/WorksGalleryPage.vue'),
      meta: { title: '作品库', requiresAuth: true, helpKey: 'works.gallery' },
    },
    {
      path: '/works/:id',
      name: 'WorkDetail',
      component: () => import('@/views/works/WorkDetailPage.vue'),
      meta: { title: '作品详情', requiresAuth: true, hideInMenu: true },
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
      path: '/admin/works',
      name: 'AdminWorks',
      component: () => import('@/views/admin/AdminWorks.vue'),
      meta: { title: '作品库管理', requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/admin/prompt-cases',
      name: 'AdminPromptCases',
      component: () => import('@/views/admin/AdminPromptCases.vue'),
      meta: { title: '提示词案例管理', requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/admin/prompt-modules',
      name: 'AdminPromptModules',
      component: () => import('@/views/admin/AdminPromptModules.vue'),
      meta: { title: '提示词模块管理', requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/admin/sg-assets',
      name: 'AdminSgAssets',
      component: () => import('@/views/admin/AdminSuiteAssets.vue'),
      meta: { title: '成套生图资产', requiresAuth: true, requiresAdmin: true },
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

const APP_TITLE = '墨墨 AI 生图'
const ADMIN_TITLE = '墨墨AI生图管理员后台'

router.afterEach((to) => {
  document.title = to.path.startsWith('/admin/') || to.path === '/admin' ? ADMIN_TITLE : APP_TITLE
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
