/**
 * AI画布 Pro+ 根组件：ReactFlowProvider + 布局（工具栏 / 画布 / 检查器 / 成果面板 / lightbox / toast）。
 */
import { useEffect, useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { useRfStore } from '../store'
import { onSaveStateChange } from '../autosave'
import { ensureImageCatalog } from '../catalogSync'
import { Toolbar } from './Toolbar'
import { FlowCanvas } from './FlowCanvas'
import { InspectorPanel } from './InspectorPanel'
import { AssetsPanel } from './AssetsPanel'
import { ImageLightbox } from './ImageLightbox'

export function RfApp({ projectId, onProjectLoaded }: { projectId: number; onProjectLoaded?: (name: string) => void }) {
  return (
    <ReactFlowProvider>
      <RfAppInner projectId={projectId} onProjectLoaded={onProjectLoaded} />
    </ReactFlowProvider>
  )
}

function RfAppInner({ projectId, onProjectLoaded }: { projectId: number; onProjectLoaded?: (name: string) => void }) {
  const loadProject = useRfStore((s) => s.loadProject)
  const projectName = useRfStore((s) => s.projectName)
  const loaded = useRfStore((s) => s.loaded)
  const toast = useRfStore((s) => s.toast)
  const clearToast = useRfStore((s) => s.clearToast)
  const setSaveState = useRfStore((s) => s.setSaveState)
  const notify = useRfStore((s) => s.notify)
  const notifiedName = useState({ name: '', projectId: 0 })[0]

  // 项目加载（projectId 变化 = 同壳切项目）
  useEffect(() => {
    void loadProject(projectId)
    void ensureImageCatalog()
  }, [projectId, loadProject])

  // 自动保存状态 → store（工具栏指示）
  useEffect(() => onSaveStateChange((state) => setSaveState(state)), [setSaveState])

  // 页签标题（经 Vue 壳回调）
  useEffect(() => {
    if (loaded && projectName) {
      notifiedName.name = projectName
      notifiedName.projectId = projectId
      onProjectLoaded?.(projectName)
    }
  }, [loaded, projectName, projectId, onProjectLoaded, notifiedName])

  // 网络断连提示（A8.10 可读错误的第一道）
  useEffect(() => {
    const offline = () => notify('error', '网络已断开，运行中的请求可能失败。')
    window.addEventListener('offline', offline)
    return () => window.removeEventListener('offline', offline)
  }, [notify])

  return (
    <div className="rf-app">
      <Toolbar />
      <div className="rf-main">
        <div className="rf-main__canvas">
          <FlowCanvas />
          <AssetsPanel />
        </div>
        <InspectorPanel />
      </div>
      <ImageLightbox />
      {toast && (
        <div className={`rf-toast rf-toast--${toast.kind}`} onClick={() => clearToast(toast.id)}>
          {toast.message}
        </div>
      )}
    </div>
  )
}
