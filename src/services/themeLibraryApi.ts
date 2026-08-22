/**
 * 主题库 API：浏览管理员配置的全局主题 + 自己上传的主题（可公开/收藏/删除）。
 * 与后端 server/src/routes/themeLibrary.ts 一一对应。
 */
import http from './http'

export interface ThemeAuthor {
  id: number
  username: string
  nickname: string | null
}

/** 主题点位字段（数据源；points 由其派生同步） */
export interface ThemePointDetail {
  name: string
  scene: string
  pose: string
  camera: string
}

/** 主题条目（sg_themes 行的装饰结果） */
export interface ThemeItem {
  id: number
  name: string
  /** 中文季节数组（春/夏/秋/冬）；空数组 = 全季 */
  season: string[]
  /** 适合风格（新中式国风/文艺风/…，至多 3 个） */
  styles: string[]
  /** 主题图片 URL（≤5 张） */
  images: string[]
  cover_url: string
  /** 动线路径 */
  path: string
  /** 点位描述（由 point_details 派生；兼容旧数据） */
  points: string[]
  /** 点位字段：点位名 / 场景锁定 / 人物姿势 / 机位构图 */
  point_details: ThemePointDetail[]
  use_count: number
  favorite_count: number
  sort_order: number
  /** 用户主题是否公开（全局主题恒全员可见） */
  is_public: boolean
  /** 管理员配置的全局主题 */
  is_global: boolean
  is_mine: boolean
  is_favorited: boolean
  author: ThemeAuthor | null
  created_at: string
}

export interface ThemeListParams {
  page?: number
  pageSize?: number
  scope?: 'all' | 'official' | 'mine' | 'favorites'
  sort?: 'default' | 'latest' | 'hot' | 'favorite'
  keyword?: string
  /** 春/夏/秋/冬；'none' = 仅看全季主题 */
  season?: string
  style?: string
}

export interface ThemeUpsertData {
  name: string
  season?: string[]
  styles?: string[]
  images: string[]
  path?: string
  points?: string[]
  point_details?: ThemePointDetail[]
  is_public?: boolean
}

export interface ThemeListResult {
  records: ThemeItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export const themeLibraryApi = {
  list(params?: ThemeListParams) {
    return http.get<{ success: true; data: ThemeListResult }>('/themes', { params })
  },
  create(data: ThemeUpsertData) {
    return http.post<{ success: true; data: ThemeItem }>('/themes', data)
  },
  update(id: number, data: Partial<ThemeUpsertData>) {
    return http.patch<{ success: true; data: ThemeItem }>(`/themes/${id}`, data)
  },
  remove(id: number) {
    return http.delete(`/themes/${id}`)
  },
  favorite(id: number) {
    return http.post<{ success: true; data: { is_favorited: boolean; favorite_count: number } }>(`/themes/${id}/favorite`)
  },
}
