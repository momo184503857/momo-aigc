import { createApp } from 'vue'
import { createPinia } from 'pinia'
import VChart from 'vue-echarts'
import router from './router'
import App from './App.vue'
import './plugins/echarts'
import './styles/tailwind.css'
import './styles/global.css'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.component('VChart', VChart)
app.mount('#app')
