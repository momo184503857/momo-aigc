import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5273,
    // 双栈监听：默认 localhost 在部分 Windows 上仅绑 IPv6 [::1]，IPv4 浏览器打不开
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      // Node-RED 画布（AI画布 Pro）反向代理，含编辑器 comms WebSocket
      '/red': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      },
      // 用户帮助文档静态资源（开发链路与生产 Nginx /docs/ 一致）
      '/docs': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
      },
    },
  },
})
