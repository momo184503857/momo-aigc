/**
 * 自动保存（D9 / R8.1）：dirty 标记 + 2s 防抖 PATCH 全量 graph；
 * flushSave 供切页签/失活/beforeunload 强制落盘（keepalive 走原生 fetch）。
 */
import type { GraphJSON } from './types'
import { httpFor } from './api'

let saveTimer: ReturnType<typeof setTimeout> | null = null
let pending: { projectId: number; graph: GraphJSON; nodeCount: number } | null = null
let inFlight: Promise<void> | null = null
let stateListener: ((state: SaveState) => void) | null = null

export type SaveState = 'saved' | 'pending' | 'saving' | 'error'

let saveState: SaveState = 'saved'

export function getSaveState(): SaveState {
  return saveState
}

export function onSaveStateChange(listener: (state: SaveState) => void): () => void {
  stateListener = listener
  return () => {
    if (stateListener === listener) stateListener = null
  }
}

function setState(next: SaveState) {
  saveState = next
  stateListener?.(next)
}

const AUTOSAVE_DELAY_MS = 2000

/** 图变更后调用：登记待存内容并重置 2s 防抖 */
export function scheduleSave(projectId: number, graph: GraphJSON, nodeCount: number): void {
  pending = { projectId, graph, nodeCount }
  setState('pending')
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    void flushSave()
  }, AUTOSAVE_DELAY_MS)
}

async function patchGraph(projectId: number, graph: GraphJSON, nodeCount: number): Promise<void> {
  const res = await httpFor.patch(`/rf-canvas/projects/${projectId}`, { graph, nodeCount })
  if (!(res.data as { success?: boolean }).success) throw new Error('保存失败')
}

/** 强制落盘（若防抖中/在途保存未完成则等待） */
export async function flushSave(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  if (inFlight) await inFlight.catch(() => undefined)
  const payload = pending
  if (!payload) return
  pending = null
  setState('saving')
  try {
    await patchGraph(payload.projectId, payload.graph, payload.nodeCount)
    setState('saved')
  } catch (err) {
    // 失败保留 pending 内容，下次变更/flush 重试
    pending = payload
    setState('error')
    console.error('[rf-canvas] 自动保存失败:', err)
  }
}

/**
 * beforeunload 兜底：axios 异步请求在页面卸载时不可靠，
 * 用原生 fetch keepalive 发出最后一次 PATCH（body ≤ 64KB 限制内通常够用；
 * 超限时丢弃——常规路径的 flushSave 已覆盖绝大多数场景）。
 */
export function flushSaveKeepalive(): void {
  const payload = pending
  if (!payload) return
  pending = null
  const token = localStorage.getItem('auth_token')
  const body = JSON.stringify({ graph: payload.graph, nodeCount: payload.nodeCount })
  try {
    void fetch(`/api/rf-canvas/projects/${payload.projectId}`, {
      method: 'PATCH',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body,
    })
  } catch {
    /* 卸载路径尽力而为 */
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushSaveKeepalive)
}
