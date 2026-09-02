import { Router } from 'express'
import { db } from '../db/index.js'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'
import { getChannelModelCapabilities, parseParams } from '../utils/channelModel.js'

/** 用户模型目录：生图只返回逻辑模型与统一售价，渠道和成本对普通用户不可见。 */
export const modelsRouter = Router()
modelsRouter.use(authMiddleware)

function buildImageModels() {
  const logicalRows = db.prepare(`
    SELECT id, code, name, default_params, sale_pricing
    FROM ai_logical_models
    WHERE kind = 'image' AND status = 'active' AND sale_pricing IS NOT NULL
    ORDER BY id ASC
  `).all() as any[]
  const channelRows = db.prepare(`
    SELECT m.*
    FROM ai_models m JOIN api_providers p ON p.id = m.provider_id
    WHERE m.logical_model_id = ? AND m.status = 'active' AND p.status = 'active'
      AND m.supports_image_gen = 1 AND m.cost_pricing IS NOT NULL
      AND EXISTS (SELECT 1 FROM api_provider_keys k WHERE k.provider_id = p.id AND k.status = 'active')
    ORDER BY m.id ASC
  `)

  return logicalRows.flatMap((logical) => {
    const salePricing = parseParams(logical.sale_pricing) as Record<string, number> | null
    const base = parseParams(logical.default_params)
    if (!salePricing || !base) return []
    const channels = channelRows.all(logical.id) as any[]
    const availableResolutions = (base.resolutions ?? []).filter((resolution: string) =>
      salePricing[resolution] !== undefined && channels.some((row) => {
        const costs = parseParams(row.cost_pricing) as Record<string, number> | null
        return costs?.[resolution] !== undefined && getChannelModelCapabilities(row)?.resolutions.includes(resolution)
      }))
    if (availableResolutions.length === 0) return []
    const ratiosByResolution: Record<string, string[]> = {}
    for (const resolution of availableResolutions) {
      const ratios = new Set<string>()
      for (const row of channels) {
        const caps = getChannelModelCapabilities(row)
        if (!caps?.resolutions.includes(resolution)) continue
        const values = caps.aspectRatiosByResolution?.[resolution] ?? caps.aspectRatios ?? []
        values.forEach((value) => ratios.add(value))
      }
      ratiosByResolution[resolution] = [...ratios]
    }
    return [{
      id: logical.id,
      modelId: logical.code,
      displayName: logical.name || logical.code,
      logicalCode: logical.code,
      capabilities: {
        resolutions: availableResolutions,
        aspectRatiosByResolution: ratiosByResolution,
        maxReferenceImages: base.maxReferenceImages ?? 14,
        maxPromptChars: base.maxPromptChars ?? 32000,
      },
      pricing: Object.fromEntries(availableResolutions.map((r: string) => [r, salePricing[r]])),
      kind: 'image',
    }]
  })
}

function buildTextGroups() {
  const rows = db.prepare(`
    SELECT m.id, m.model_id, m.display_name, m.logical_model_id,
           p.id AS provider_id, p.name AS provider_name, p.display_name AS provider_display_name, p.adapter
    FROM ai_models m JOIN api_providers p ON p.id = m.provider_id
    WHERE p.status = 'active' AND m.status = 'active' AND m.supports_chat = 1
    ORDER BY p.id ASC, m.id ASC
  `).all() as any[]
  const groups = new Map<number, any>()
  for (const row of rows) {
    let group = groups.get(row.provider_id)
    if (!group) {
      group = { providerId: row.provider_id, providerName: row.provider_display_name || row.provider_name, adapter: row.adapter, models: [] }
      groups.set(row.provider_id, group)
    }
    const logical = row.logical_model_id
      ? db.prepare(`SELECT code, name FROM ai_logical_models WHERE id = ?`).get(row.logical_model_id) as any
      : null
    group.models.push({
      id: row.id,
      modelId: row.model_id,
      displayName: row.display_name || logical?.name || row.model_id,
      logicalCode: logical?.code ?? null,
      capabilities: null,
      pricing: null,
      kind: 'text',
    })
  }
  return [...groups.values()]
}

modelsRouter.get('/catalog', (req: AuthRequest, res) => {
  const kind = req.query.kind === 'text' ? 'text' : 'image'
  res.json({
    success: true,
    data: kind === 'image' ? { models: buildImageModels() } : { platform: buildTextGroups() },
  })
})
