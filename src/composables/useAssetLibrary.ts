/**
 * 资产库通用组合式函数：六类资产（主题/赛道/人设/模板/特征/知识）共用。
 *
 * useAssetLibrary<T>('themes') → { list, loading, scope, setScope, load, create, update, remove, copyGlobal, reportUse }
 * 模块级缓存（stale-while-revalidate）：同类型多组件共享一次加载。
 */
import { ref, computed } from 'vue'
import { sgApi, type SgAssetType } from '@/services/sgApi'

export interface UseAssetLibrary<T> {
  list: import('vue').Ref<T[]>
  total: import('vue').Ref<number>
  loading: import('vue').Ref<boolean>
  scope: import('vue').Ref<'global' | 'mine' | 'all'>
  setScope: (s: 'global' | 'mine' | 'all') => void
  load: (extra?: Record<string, unknown>) => Promise<void>
  create: (data: Record<string, unknown>) => Promise<T | null>
  update: (id: number, data: Record<string, unknown>) => Promise<boolean>
  remove: (id: number) => Promise<boolean>
  copyGlobal: (id: number) => Promise<T | null>
  reportUse: (id: number) => void
}

const cache = new Map<string, { list: any[]; total: number; at: number }>()
const CACHE_TTL = 60_000

export function useAssetLibrary<T extends { id: number; isGlobal: boolean }>(
  type: SgAssetType,
  defaults?: { scope?: 'global' | 'mine' | 'all' },
): UseAssetLibrary<T> {
  const list = ref<T[]>([]) as import('vue').Ref<T[]>
  const total = ref(0)
  const loading = ref(false)
  const scope = ref<'global' | 'mine' | 'all'>(defaults?.scope ?? 'all')

  async function load(extra?: Record<string, unknown>) {
    loading.value = true
    try {
      const res = await sgApi.listAssets<T>(type, { scope: scope.value, pageSize: 100, ...extra })
      list.value = res.data.data.records
      total.value = res.data.data.total
      cache.set(type, { list: list.value, total: total.value, at: Date.now() })
    } finally {
      loading.value = false
    }
  }

  async function create(data: Record<string, unknown>) {
    const res = await sgApi.createAsset<T>(type, data)
    await load()
    return res.data.data
  }

  async function update(id: number, data: Record<string, unknown>) {
    await sgApi.updateAsset<T>(type, id, data)
    await load()
    return true
  }

  async function remove(id: number) {
    await sgApi.deleteAsset(type, id)
    await load()
    return true
  }

  async function copyGlobal(id: number) {
    const res = await sgApi.copyAsset<T>(type, id)
    await load()
    return res.data.data
  }

  function reportUse(id: number) {
    sgApi.reportAssetUse(type, id).catch(() => { /* 热度上报失败可忽略 */ })
  }

  function setScope(s: 'global' | 'mine' | 'all') {
    scope.value = s
    load()
  }

  // 首次：有缓存先用缓存（stale-while-revalidate）
  const cached = cache.get(type)
  if (cached && Date.now() - cached.at < CACHE_TTL) {
    list.value = cached.list as T[]
    total.value = cached.total
  }

  return { list, total, loading, scope, setScope, load, create, update, remove, copyGlobal, reportUse }
}
