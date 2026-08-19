import { Router } from 'express'
import { db } from '../db/index.js'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'
import { getChannelModelCapabilities } from '../utils/channelModel.js'

/**
 * 模型目录（前端唯一模型真源，ai-provider §5.1）。
 *
 * GET /api/models/catalog?kind=image|text
 * 返回 { platform: [渠道组...], mine: [渠道组...] }，每组含渠道信息与渠道模型列表
 * （生效能力 / 定价 / 逻辑模型 code）。仅返回 active 渠道/模型；用户未建渠道时 mine=[]。
 */

export const modelsRouter = Router()
modelsRouter.use(authMiddleware)

function buildGroups(ownerUserId: number | null, userId: number, kind: 'image' | 'text') {
  const isMine = ownerUserId !== null
  const rows = db.prepare(`
    SELECT m.id, m.model_id, m.display_name, m.logical_model_id, m.param_overrides, m.pricing,
           m.supports_vision, m.supports_image_gen, m.supports_chat,
           p.id AS provider_id, p.name AS provider_name, p.adapter
    FROM ai_models m
    JOIN api_providers p ON p.id = m.provider_id
    WHERE p.status = 'active' AND m.status = 'active'
      AND p.owner_user_id ${isMine ? '= ?' : 'IS NULL'}
      AND ${kind === 'image' ? 'm.supports_image_gen = 1' : 'm.supports_chat = 1'}
    ORDER BY p.id ASC, m.id ASC
  `).all(...(isMine ? [ownerUserId] : [])) as any[]

  const groups: Array<Record<string, unknown>> = []
  const groupByProvider = new Map<number, Record<string, unknown>>()
  const logicalCache = new Map<number, { code: string; name: string; kind: string }>()

  for (const r of rows) {
    let logical: { code: string; name: string; kind: string } | undefined
    if (r.logical_model_id) {
      if (!logicalCache.has(r.logical_model_id)) {
        const lm = db.prepare(`SELECT code, name, kind FROM ai_logical_models WHERE id = ?`).get(r.logical_model_id) as any
        if (lm) logicalCache.set(r.logical_model_id, lm)
      }
      logical = logicalCache.get(r.logical_model_id)
    }
    // 生图模型必须有能力定义；文字模型无能力要求
    const capabilities = r.supports_image_gen ? getChannelModelCapabilities(r) : null
    if (r.supports_image_gen && (!capabilities || capabilities.resolutions.length === 0)) continue

    let group = groupByProvider.get(r.provider_id)
    if (!group) {
      group = {
        providerId: r.provider_id,
        providerName: r.provider_name,
        adapter: r.adapter,
        models: [] as any[],
      }
      groupByProvider.set(r.provider_id, group)
      groups.push(group)
    }

    let pricing: Record<string, number> | null = null
    if (!isMine && r.pricing) {
      try { pricing = JSON.parse(r.pricing) } catch { pricing = null }
    }

    ;(group as any).models.push({
      id: r.id,                        // channelModelId
      modelId: r.model_id,             // 渠道模型名（发给上游的 model 字符串）
      displayName: r.display_name || logical?.name || r.model_id,
      logicalCode: logical?.code ?? null,
      capabilities: capabilities ? {
        resolutions: capabilities.resolutions,
        aspectRatiosByResolution: capabilities.aspectRatiosByResolution ?? undefined,
        aspectRatios: capabilities.aspectRatios ?? undefined,
        maxReferenceImages: capabilities.maxReferenceImages ?? 14,
        maxPromptChars: capabilities.maxPromptChars ?? 32000,
      } : null,
      pricing: isMine ? null : pricing, // 我的渠道恒 null（不扣积分，D8）
      kind,
    })
  }
  return groups
}

modelsRouter.get('/catalog', (req: AuthRequest, res) => {
  const kind = req.query.kind === 'text' ? 'text' : 'image'
  const userId = req.user!.userId
  res.json({
    success: true,
    data: {
      platform: buildGroups(null, userId, kind),
      mine: buildGroups(userId, userId, kind),
    },
  })
})
