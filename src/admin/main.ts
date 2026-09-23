import { createApp } from 'vue'
import { createPinia } from 'pinia'
import VChart from 'vue-echarts'
import router from './router'
import App from './AdminApp.vue'
import '@/plugins/echarts'
import '@/styles/tokens.css'
// Tailwind 必须在 tokens.css 之后（语义层桥接 --momo-*）
import '@/styles/tailwind.css'
// 管理端主题层：必须在 tailwind.css 之后，覆盖语义变量与圆角/留白基准
import '@/styles/admin-theme.css'
import '@/styles/global.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.component('VChart', VChart)
app.mount('#admin-app')
