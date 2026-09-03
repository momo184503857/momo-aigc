import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    vue(),
    // AI画布 Pro+ React island：仅转换 src/rf-canvas/ 下的 .tsx，babel 不触碰其余 .ts（与 Vue 构建隔离）
    react({ include: ['src/rf-canvas/**/*.tsx'] }),
  ],
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
      output: {
        // React island 供应商代码独立分包：未访问 Pro+ 页面时主包不引入 react/@xyflow（N1）。
        // 用函数形式只圈定 react 系包：公共 CJS interop helper 留在既有共享 chunk，
        // 避免 element-plus 等反向依赖 rf-vendor 导致全站预载 React（依赖方向必须 rf-vendor → 共享 chunk）。
        manualChunks(id) {
          // CJS interop helper 被 react 系与 element-plus 系共用：单独成极小 chunk，
          // 保证主包只加载该 helper 而不触碰 rf-vendor（否则 rollup 会把它并进 rf-vendor 造成反向依赖）
          if (id.includes('commonjsHelpers')) return 'cjs-helpers'
          if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/') || id.includes('/node_modules/scheduler/')) {
            return 'rf-vendor'
          }
          if (id.includes('/node_modules/@xyflow/') || id.includes('/node_modules/zustand/')) {
            return 'rf-vendor'
          }
          return undefined
        },
      },
    },
  },
})
