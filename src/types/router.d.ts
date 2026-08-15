// RouteMeta 模块增强（必须是模块文件才能与 vue-router 原类型合并，而不是覆盖）
import 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    /** 当前页面对应的帮助文档 key（helpRegistry 中的键） */
    helpKey?: string
  }
}
