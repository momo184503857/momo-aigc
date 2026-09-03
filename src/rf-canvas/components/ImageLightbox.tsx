/**
 * 图片放大层（R7.4）：遮罩 + 滚轮缩放 + Esc 关闭。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRfStore } from '../store'

export function ImageLightbox() {
  const lightbox = useRfStore((s) => s.lightbox)
  const setLightbox = useRfStore((s) => s.setLightbox)
  const [scale, setScale] = useState(1)
  const registered = useRef(false)

  const close = useCallback(() => setLightbox(null), [setLightbox])

  useEffect(() => {
    if (!lightbox) {
      setScale(1)
      registered.current = false
      return
    }
    if (registered.current) return
    registered.current = true
  }, [lightbox])

  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [lightbox, close])

  if (!lightbox) return null

  return (
    <div className="rf-lightbox" onClick={close} onWheel={(e) => { e.preventDefault(); setScale((s) => Math.max(0.2, Math.min(8, s + (e.deltaY < 0 ? 0.2 : -0.2)))) }}>
      <img
        src={lightbox.url}
        alt="预览大图"
        className="rf-lightbox__img"
        style={{ transform: `scale(${scale})` }}
        onClick={(e) => e.stopPropagation()}
      />
      <button className="rf-lightbox__close" onClick={close}>
        ✕
      </button>
      <div className="rf-lightbox__hint">滚轮缩放 · Esc 关闭</div>
    </div>
  )
}
