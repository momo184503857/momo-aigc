import { createApp } from 'vue'
import { createPinia } from 'pinia'
import VChart from 'vue-echarts'
import router from './router'
import App from './AdminApp.vue'
import '@/plugins/echarts'
import '@/styles/tailwind.css'
import '@/styles/global.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.component('VChart', VChart)
app.mount('#admin-app')
