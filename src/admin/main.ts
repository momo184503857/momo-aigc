import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { createPinia } from 'pinia'
import VChart from 'vue-echarts'
import router from './router'
import App from './AdminApp.vue'
import '@/plugins/echarts'
import '@/styles/tokens.css'
import '@/styles/global.css'
import 'element-plus/dist/index.css'
import '@/styles/ep-overrides.css'

const app = createApp(App)
app.use(ElementPlus, { locale: zhCn })
app.use(createPinia())
app.use(router)
app.component('VChart', VChart)
app.mount('#admin-app')
