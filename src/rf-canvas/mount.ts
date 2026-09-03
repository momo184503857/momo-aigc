/**
 * AI画布 Pro+ React island 挂载入口（由 Vue 壳动态 import，独立懒加载 chunk）。
 *
 * 本文件保持零 JSX（createElement），不依赖 @vitejs/plugin-react 的 include 匹配；
 * React Flow 样式在此 import，随 Pro+ chunk 加载，不进主包。
 */
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import '@xyflow/react/dist/style.css'
import './styles/rf.css'
import { RfApp } from './components/RfApp'
import { flushSave } from './autosave'

export interface RfMountOptions {
  projectId: number
  /** 项目加载完成后回调（Vue 壳用于更新页签标题） */
  onProjectLoaded?: (name: string) => void
}

export interface RfMountHandle {
  unmount(): void
  switchProject(projectId: number): void
  flush(): Promise<void>
}

export function mountRfApp(container: HTMLElement, options: RfMountOptions): RfMountHandle {
  const root: Root = createRoot(container)
  root.render(createElement(RfApp, { projectId: options.projectId, onProjectLoaded: options.onProjectLoaded }))

  return {
    unmount() {
      void flushSave()
      root.unmount()
    },
    switchProject(projectId: number) {
      root.render(createElement(RfApp, { projectId, onProjectLoaded: options.onProjectLoaded }))
    },
    async flush() {
      await flushSave()
    },
  }
}
