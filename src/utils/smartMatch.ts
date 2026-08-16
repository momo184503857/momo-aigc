/**
 * 智能匹配纯函数：服装特征标签 + 主色 → 赛道/主题加权打分推荐。
 *
 * 规则数据来自 sg_knowledge(match_rule: tag_affinity / color_affinity)，
 * 由管理员可调；本模块只做打分，不做数据拉取。
 */

export interface TrackAssetLike {
  key: string
  name: string
  emoji?: string
  use_count?: number
}

export interface ThemeAssetLike {
  name: string
  track_key: string
  /** 中文季节数组（春/夏/秋/冬），空数组 = 全季；兼容历史快照的旧字符串 */
  season: string[] | string
  use_count?: number
}

export interface MatchPlan<T extends ThemeAssetLike> {
  track: TrackAssetLike
  themes: T[]
  reason: string[]
}

export interface AffinityRules {
  /** 特征名（包含匹配）→ { 赛道: 分值 } */
  tag_affinity?: Record<string, Record<string, number>>
  /** 色系 → { 赛道: 分值 } */
  color_affinity?: Record<string, Record<string, number>>
}

const TRACK_FALLBACK = ['A', 'B', 'C', 'D', 'E', 'F', 'G']

/**
 * 打分推荐：3 赛道 × 每赛道 2 主题。
 * 赛道分 = Σ(特征命中分) × 0.6 + 色系分 × 0.4 + use_count 归一化 × 0.2
 * @param seasons 识别/勾选的适合季节（多选）；空数组 = 不过滤，主题全季（season 为空）始终命中
 */
export function matchPlan<T extends ThemeAssetLike>(
  tracks: TrackAssetLike[],
  themes: T[],
  featureNames: string[],
  colorFamily: string,
  rules: AffinityRules,
  seasons?: string[],
): MatchPlan<T>[] {
  const trackScores = new Map<string, { score: number; reasons: string[] }>()
  const bump = (key: string, score: number, reason: string) => {
    const cur = trackScores.get(key) || { score: 0, reasons: [] }
    cur.score += score
    if (reason && !cur.reasons.includes(reason)) cur.reasons.push(reason)
    trackScores.set(key, cur)
  }

  for (const name of featureNames) {
    for (const [tag, aff] of Object.entries(rules.tag_affinity || {})) {
      if (name.includes(tag) || tag.includes(name)) {
        for (const [trackKey, v] of Object.entries(aff)) bump(trackKey, v, `特征「${tag}」`)
      }
    }
  }
  const colorAff = rules.color_affinity?.[colorFamily]
  if (colorAff) {
    for (const [trackKey, v] of Object.entries(colorAff)) bump(trackKey, v, `主色${colorFamily}`)
  }

  const maxUse = Math.max(1, ...tracks.map((t) => t.use_count || 0))
  const scored = tracks
    .map((t) => {
      const s = trackScores.get(t.key) || { score: 0, reasons: [] }
      const final = s.score * 0.6 + (t.use_count || 0) / maxUse * 2
      return { track: t, score: final, reasons: s.reasons }
    })
    .sort((a, b) => b.score - a.score)

  const top = scored.slice(0, 3)
  if (top.length === 0) {
    // 兜底：无规则数据时按内置顺序取前3
    return TRACK_FALLBACK.slice(0, 3).map((key) => {
      const track = tracks.find((t) => t.key === key) || { key, name: key }
      return { track, themes: filterThemes(themes, key, seasons).slice(0, 2), reason: ['默认推荐'] }
    })
  }

  return top.map(({ track, reasons }) => {
    const pool = filterThemes(themes, track.key, seasons)
    // 主题分：轻微热度 + 伪随机扰动（每次重匹配有变化）
    const ranked = pool
      .map((t) => ({ t, s: (t.use_count || 0) / 10 + Math.random() * 0.5 }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 2)
      .map((x) => x.t)
    return { track, themes: ranked, reason: reasons.length ? reasons : ['热门推荐'] }
  })
}

/** 主题季节 → 中文数组；空数组 = 全季（含历史旧值 ss/aw/all 的换算） */
function themeSeasonListOf(t: { season: string[] | string }): string[] {
  if (Array.isArray(t.season)) return t.season
  if (t.season === 'ss') return ['春', '夏']
  if (t.season === 'aw') return ['秋', '冬']
  return []
}

function filterThemes<T extends ThemeAssetLike>(themes: T[], trackKey: string, seasons?: string[]): T[] {
  return themes.filter((t) => {
    if (t.track_key !== trackKey) return false
    if (!seasons || seasons.length === 0) return true
    const themeSeasons = themeSeasonListOf(t)
    return themeSeasons.length === 0 || seasons.some((s) => themeSeasons.includes(s))
  })
}
