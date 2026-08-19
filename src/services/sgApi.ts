/**
 * suite-gen API：资产（六类通用）+ 套系。
 * 与后端 server/src/routes/sgAssets.ts / sgSuites.ts 一一对应。
 */
import http from './http'
import type { PromptEntry } from '@/utils/promptEngine'
import type { AssembleContext } from '@/utils/promptEngine'

export type SgAssetType =
  | 'themes' | 'tracks' | 'personas' | 'lock-templates' | 'garment-features' | 'knowledge'

export interface SgAssetBase {
  id: number
  isGlobal: boolean
  status: string
  use_count?: number
  created_at?: string
  updated_at?: string
}

export interface SgTheme extends SgAssetBase {
  name: string
  track_key: string
  /** 中文季节数组（春/夏/秋/冬）；空数组 = 全季 */
  season: string[]
  /** 适合风格（新中式国风/文艺风/…） */
  styles: string[]
  /** 主题图片 URL（≤5 张） */
  images: string[]
  level: string
  path: string
  points: string[]
  /** 点位三字段：点位名 / 场景锁定 / 机位构图（数据源，points 由其派生） */
  point_details?: Array<{ name: string; scene: string; camera: string }>
  sort_order: number
}

export interface SgTrack extends SgAssetBase {
  key: string
  name: string
  emoji: string
  mood: string
  hair: string
  light: string
  acc: string
  hand: string
  sort_order: number
}

export interface SgPersona extends SgAssetBase {
  name: string
  avatar_url: string
  dna: string
  hair_default: string
  fingerprint: string[]
  note: string
}

export interface SgLockTemplate extends SgAssetBase {
  key: string
  name: string
  grp: string
  order_no: number
  content: string
  cond_kind: string
  models: string[]
  scope: string[]
}

export interface SgGarmentFeature extends SgAssetBase {
  grp: string
  name: string
  match_tags: string[]
  detail_hint: string
  sort_order: number
}

export interface SgKnowledge extends SgAssetBase {
  kind: string
  field: string
  content: unknown
}

export interface SgSuite {
  id: number
  name: string
  feature_source: string
  track_snapshot: Record<string, unknown>
  theme_snapshot: {
    name: string
    track_key?: string
    season?: string | string[]
    path: string
    points: string[]
  }
  persona_snapshot: { name: string; dna: string; hair_default?: string; fingerprint?: string[] } | Record<string, never>
  garment: Record<string, unknown>
  prompt_common: string
  prompt_points: string[]
  enabled_locks: Array<{ key: string; enabled: boolean; content?: string }>
  model: string
  resolution: string
  aspect_ratio: string
  n_total: number
  status: string
  taskCount: number
  completedCount: number
  failedCount: number
  points: Array<{ pointIndex: number; status: string; taskId: number | null; resultUrl: string }>
  tasks: Array<{
    id: number
    status: string
    point_index: number | null
    model: string
    prompt: string
    input_image_urls: string[]
    result_image_urls: string[]
    error_message?: string
    points_cost: number
    created_at: string
  }>
  created_at: string
  updated_at: string
}

export interface SuiteDraft {
  id?: number
  name?: string
  feature_source?: string
  track_snapshot?: unknown
  theme_snapshot?: unknown
  persona_snapshot?: unknown
  garment?: unknown
  prompt_common?: string
  prompt_points?: string[]
  enabled_locks?: Array<{ key: string; enabled: boolean; content?: string }>
  model?: string
  resolution?: string
  aspect_ratio?: string
  n_total?: number
}

/** DB 锁定模板 → 引擎条目 */
export function toPromptEntry(t: SgLockTemplate): PromptEntry {
  return {
    key: t.key,
    name: t.name,
    grp: t.grp as PromptEntry['grp'],
    order: t.order_no,
    content: t.content,
    condKind: t.cond_kind,
    models: t.models?.length ? t.models : undefined,
    scope: t.scope?.length ? t.scope : undefined,
    origin: t.isGlobal ? 'global' : 'private',
  }
}

export const sgApi = {
  // ── 资产 ──
  listAssets<T>(type: SgAssetType, params?: {
    scope?: 'global' | 'mine' | 'all'
    keyword?: string
    page?: number
    pageSize?: number
    season?: string
    track_key?: string
    grp?: string
    kind?: string
    field?: string
    status?: string
  }) {
    return http.get<{ success: true; data: { records: T[]; total: number; page: number; pageSize: number } }>(
      `/sg/assets/${type}`, { params })
  },
  createAsset<T>(type: SgAssetType, data: Record<string, unknown>, isGlobal = false) {
    return http.post<{ success: true; data: T }>(`/sg/assets/${type}`, data, { params: isGlobal ? { global: 'true' } : undefined })
  },
  updateAsset<T>(type: SgAssetType, id: number, data: Record<string, unknown>) {
    return http.patch<{ success: true; data: T }>(`/sg/assets/${type}/${id}`, data)
  },
  deleteAsset(type: SgAssetType, id: number) {
    return http.delete(`/sg/assets/${type}/${id}`)
  },
  copyAsset<T>(type: SgAssetType, id: number) {
    return http.post<{ success: true; data: T }>(`/sg/assets/${type}/${id}/copy`)
  },
  reportAssetUse(type: SgAssetType, id: number) {
    return http.post(`/sg/assets/${type}/${id}/use`)
  },
  publishLockCard(id: number) {
    return http.post(`/admin/sg-extra/lock-templates/${id}/publish-card`)
  },

  // ── 套系 ──
  listSuites(params?: { page?: number; pageSize?: number; status?: string }) {
    return http.get<{ success: true; data: { records: SgSuite[]; total: number } }>('/sg/suites', { params })
  },
  getSuite(id: number) {
    return http.get<{ success: true; data: SgSuite }>(`/sg/suites/${id}`)
  },
  saveSuite(draft: SuiteDraft) {
    return http.post<{ success: true; data: { id: number } }>('/sg/suites', draft)
  },
  renameSuite(id: number, name: string) {
    return http.patch(`/sg/suites/${id}/rename`, { name })
  },
  deleteSuite(id: number) {
    return http.delete(`/sg/suites/${id}`)
  },

  // ── AI 识别（走管理端配置的默认识图模型） ──
  analyzeGarment(image: { mimeType: string; base64: string }) {
    return http.post<{ success: true; data: GarmentRecognition }>('/sg/analyze/garment', { image }, { timeout: 120_000 })
  },
}

/** AI 服装识别结果：风格 / 适合季节（均已过滤为合法候选） */
export interface GarmentRecognition {
  styles: string[]
  seasons: string[]
  raw: string
}

export type { AssembleContext }
