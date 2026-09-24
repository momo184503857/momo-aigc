import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue(), tailwindcss(), {
    name: 'verify-production-ui-graph',
    apply: 'build',
    generateBundle() {
      const modules = [...this.getModuleIds()].filter(id => id.includes('/src/'))
      const forbidden = modules.filter(id => /\/src\/(components\/ui\/|prototype\/|styles\/(tokens|legacy-surface|admin-theme))/.test(id))
      if (forbidden.length) this.error(`生产构建包含旧 UI 或原型依赖：\n${forbidden.join('\n')}`)
      this.emitFile({ type: 'asset', fileName: 'ui-dependency-audit.json', source: JSON.stringify({ result: 'passed', modules: modules.map(id => id.replace(__dirname + '/', '')) }, null, 2) })
    },
  }],
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
        // MOMO_API_TARGET 供本地验收用独立后端（默认不变）
        target: process.env.MOMO_API_TARGET || 'http://localhost:3000',
        changeOrigin: true,
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
