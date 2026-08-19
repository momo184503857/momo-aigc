/**
 * 提示词组装引擎 · 核心纯函数。
 *
 * assemble(dbEntries, lockSelections, ctx) → { commonText, pointTexts, fullTexts }
 * 步骤：合并内置条目（DB 同 key 覆盖内置）→ 过滤(models/scope/cond)
 *     → 应用用户开关与改文 → 占位符插值 → 按 grp+order 排序
 *     → 拆公共/点位（order >= 1000 为点位差异）→ 拼接
 */
import type { PromptEntry, AssembleContext, AssembleResult, LockSelection } from './types'
import { POINT_ORDER_BASE } from './types'
import { BUILT_IN_ENTRIES, POINT_PROGRESSION } from './entries'

/** 从对象按 a.b.c 路径取值；缺失返回 undefined */
function getByPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, seg) => {
    if (acc === null || acc === undefined) return undefined
    return (acc as Record<string, unknown>)[seg]
  }, obj)
}

/** 条目启用条件求值 */
function evalCond(entry: PromptEntry, ctx: AssembleContext): boolean {
  switch (entry.condKind) {
    case undefined:
    case '':
    case 'none':
      return true
    case 'outdoor':
      // 户外主题（动线/点位含户外关键词）才注入户外硬约束
      return /户外|花园|花田|公园|田野|庭院|海边|山|草地|露台|街|路|径|湖|池|林|竹|沙滩/.test(
        `${ctx.theme?.path || ''} ${(ctx.theme?.points || []).join(' ')}`)
    case 'fingerprint':
      return (ctx.persona?.fingerprint?.length ?? 0) > 0
    case 'persona':
      return !!ctx.persona?.dna
    case 'refimg':
      return !!ctx.garment.mainUrl || (ctx.garment.detailUrls?.length ?? 0) > 0
    case 'points':
      return true
    default:
      return true
  }
}

/** 占位符插值：{{persona.dna}} / {{point.shot}} / {{garment.shape}} … */
function interpolate(text: string, ctx: AssembleContext, pointIndex?: number): string {
  const g = ctx.garment
  const persona = ctx.persona
  const point = pointIndex !== undefined ? POINT_PROGRESSION[pointIndex] ?? POINT_PROGRESSION[0] : undefined
  const vars: Record<string, unknown> = {
    persona: {
      name: persona?.name,
      // 无 persona 时 dna 留空（相关条目已由 cond 剔除），hair 回退赛道妆发
      dna: persona ? (persona.dna || '（未指定）') : undefined,
      hair: persona?.hair_default || ctx.track.hair,
    },
    track: ctx.track,
    theme: ctx.theme ? {
      name: ctx.theme.name,
      path: ctx.theme.path,
      pathSeg: pointIndex !== undefined ? (ctx.theme.path.split('→')[pointIndex] || '').trim() : ctx.theme.path,
      point: pointIndex !== undefined ? (ctx.theme.points[pointIndex] || '') : (ctx.theme.points[0] || ''),
    } : undefined,
    garment: {
      mainUrl: g.mainUrl || '',
      shape: g.detail4?.shape || '按参考服装版型',
      fabric: g.detail4?.fabric || '按参考服装面料',
      structure: g.detail4?.structure || '按参考服装结构',
      element: g.detail4?.element || '按参考服装元素',
      print: g.printText || '以参考图为准，禁止改变印花',
      accessories: g.accessories || '参考服装自带配饰全部保留',
    },
    model: ctx.model,
    point: point ? { idx: String((pointIndex ?? 0) + 1), shot: point.shot } : undefined,
  }
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, path: string) => {
    const v = getByPath(vars, path)
    return v === undefined || v === null ? '' : String(v)
  })
}

const GROUP_ORDER: Record<string, number> = {
  quality: 0, identity: 1, garment: 2, scene: 3, light: 4, pose: 5, camera: 6, negative: 7, fusion: 8, fidelity: 9,
}

/**
 * 组装入口。
 *
 * @param dbEntries 数据库模板条目（全局 + 私有资产；私有覆盖同 key 全局）
 * @param lockSelections 用户开关/改文（PromptPreview 交互产物）
 * @param ctx 组装上下文
 * @param pointCount 点位数（默认 5；单张模式传 0）
 */
export function assemble(
  dbEntries: PromptEntry[],
  lockSelections: LockSelection[],
  ctx: AssembleContext,
  pointCount = 5,
): AssembleResult {
  // 1. 合并：私有 > 全局；同 origin 下模型专属版 > 通用版；内置兜底最低
  //    （分模型基线话术 = 同 key 多行，按 models 字段区分，靠优先级取胜）
  const priority = (e: PromptEntry) => {
    const originScore = e.origin === 'private' ? 2 : e.origin === 'global' ? 1 : 0
    const specificScore = e.models && e.models.length > 0 ? 1 : 0
    return originScore * 2 + specificScore
  }
  const sorted = [...dbEntries].sort((a, b) => priority(a) - priority(b))
  const byKey = new Map<string, PromptEntry>()
  for (const e of BUILT_IN_ENTRIES) byKey.set(e.key, { ...e })
  for (const e of sorted) {
    if (e.models && e.models.length > 0 && !e.models.includes(ctx.model)) continue
    byKey.set(e.key, { ...e })
  }

  const selMap = new Map(lockSelections.map((s) => [s.key, s]))

  // 2. 过滤 + 开关应用
  const used: Array<PromptEntry & { enabled: boolean }> = []
  for (const entry of byKey.values()) {
    if (entry.models && entry.models.length > 0 && !entry.models.includes(ctx.model)) continue
    if (entry.scope && entry.scope.length > 0 && !entry.scope.includes(ctx.feature)) continue
    if (!evalCond(entry, ctx)) continue
    const sel = selMap.get(entry.key)
    const enabled = sel ? sel.enabled : (entry.defaultEnabled !== false)
    used.push({ ...entry, enabled, contentOverride: sel?.content ?? entry.contentOverride })
  }

  // 3. 排序：grp 权重 → order
  used.sort((a, b) => (GROUP_ORDER[a.grp] ?? 99) - (GROUP_ORDER[b.grp] ?? 99) || a.order - b.order)

  // 4. 拆公共 / 点位并插值
  const commonParts: string[] = []
  for (const e of used.filter((x) => x.enabled && x.order < POINT_ORDER_BASE)) {
    const text = interpolate(e.contentOverride || e.content, ctx)
    if (text.trim()) commonParts.push(text.trim())
  }
  const commonText = commonParts.join('\n')

  const pointTexts: string[] = []
  const n = Math.max(0, pointCount)
  for (let i = 0; i < n; i++) {
    const parts: string[] = []
    for (const e of used.filter((x) => x.enabled && x.order >= POINT_ORDER_BASE)) {
      const text = interpolate(e.contentOverride || e.content, { ...ctx, pointIndex: i }, i)
      if (text.trim()) parts.push(text.trim())
    }
    pointTexts.push(parts.join('\n'))
  }

  const fullTexts = pointTexts.map((p) => [commonText, p].filter(Boolean).join('\n'))
  // 单张模式（专家玩法）：无点位时 fullTexts 仅公共部分（点位条目由调用方以单点 ctx 组装）
  if (n === 0) {
    const singleParts: string[] = []
    for (const e of used.filter((x) => x.enabled)) {
      const text = interpolate(e.contentOverride || e.content, ctx)
      if (text.trim()) singleParts.push(text.trim())
    }
    pointTexts.push(singleParts.join('\n'))
    fullTexts.push(singleParts.join('\n'))
  }

  return { commonText, pointTexts, fullTexts, usedEntries: used }
}
