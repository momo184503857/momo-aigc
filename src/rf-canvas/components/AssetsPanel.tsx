/**
 * 成果面板（R5.4）：save 节点产出（图带缩略/放大、文带复制），随图持久化；清空按钮。
 */
import { useState } from 'react'
import { useRfStore } from '../store'

export function AssetsPanel() {
  const assetsOpen = useRfStore((s) => s.assetsOpen)
  const assets = useRfStore((s) => s.assets)
  const setLightbox = useRfStore((s) => s.setLightbox)
  const clearAssets = useRfStore((s) => s.clearAssets)
  const notify = useRfStore((s) => s.notify)
  const state = useRfStore

  const [copiedId, setCopiedId] = useState<string | null>(null)

  if (!assetsOpen) return null

  const copyText = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1500)
    } catch {
      notify('error', '复制失败，请手动选择复制')
    }
  }

  return (
    <div className="rf-assets">
      <div className="rf-assets__head">
        <span className="rf-assets__title">成果面板（{assets.length}）</span>
        <div className="rf-assets__actions">
          <button className="rf-btn rf-btn--sm" onClick={() => state.getState().setAssetsOpen(false)}>
            收起
          </button>
          <button className="rf-btn rf-btn--sm rf-btn--danger-plain" disabled={!assets.length} onClick={clearAssets}>
            清空
          </button>
        </div>
      </div>
      {assets.length === 0 ? (
        <div className="rf-assets__empty">暂无产出。运行「保存」节点后，其收集的图片/文本会出现在这里。</div>
      ) : (
        <div className="rf-assets__body">
          {assets.map((asset) =>
            asset.kind === 'image' && asset.url ? (
              <div key={asset.id} className="rf-asset rf-asset--image" title={asset.fileName ?? ''}>
                <img src={asset.url} alt={asset.fileName ?? '产出图'} className="rf-asset__img" onClick={() => setLightbox(asset.url!)} />
                <button className="rf-asset__copy" onClick={() => void copyText(asset.id, asset.url!)}>
                  {copiedId === asset.id ? '已复制' : '复制链接'}
                </button>
              </div>
            ) : (
              <div key={asset.id} className="rf-asset rf-asset--text">
                <pre className="rf-asset__text">{asset.text}</pre>
                <button className="rf-asset__copy" onClick={() => void copyText(asset.id, asset.text ?? '')}>
                  {copiedId === asset.id ? '已复制' : '复制文本'}
                </button>
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}
