import { Router } from 'express'
import { db } from '../db/index.js'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'
import { getAdapter } from '../providers/index.js'
import { resolveProviderContext, ProviderContextError } from '../utils/channelModel.js'

/**
 * 画布文字 AI 节点代理（ai-provider §8 文字模型迁移）。
 *
 * 请求体携带 channelModelId（渠道模型），服务端按渠道模型解析渠道（平台或我的）
 * → 适配器 chat()。兼容旧画布存量节点：仅传模型名字符串时，按「渠道模型名全局查一次」兜底。
 * 计费维持现状（不计积分）。
 */

export const canvasAiRouter = Router()

canvasAiRouter.use(authMiddleware)

interface ChatCallResult {
  text: string
}

async function callChat(req: {
  userId: number
  model: string
  messages: Array<{ role: string; content: unknown }>
  temperature?: number | null
  maxTokens?: number | null
  images?: Array<{ mimeType: string; base64: string }>
}): Promise<ChatCallResult> {
  // 1. 解析渠道模型：优先 channelModelId（数字 id），其次按模型名全局兜底（旧画布兼容）
  let cm: any = null
  const byName = db.prepare(`
    SELECT m.*, p.owner_user_id AS p_owner, p.id AS p_id FROM ai_models m
    JOIN api_providers p ON p.id = m.provider_id
    WHERE m.model_id = ? AND m.supports_chat = 1 AND m.status = 'active' AND p.status = 'active'
    ORDER BY CASE WHEN p.owner_user_id IS NULL THEN 0 ELSE 1 END, m.id ASC
    LIMIT 1
  `).get(req.model) as any
  if (byName) cm = byName
  if (!cm) throw new ProviderContextError(`模型「${req.model}」不可用，请在画布中重新选择文字模型`, 404)

  // 归属校验：用户渠道仅 owner 可用
  const ctx = resolveProviderContext(req.userId, cm.provider_id, 'chat')
  const provider = db.prepare(`SELECT adapter FROM api_providers WHERE id = ?`).get(cm.provider_id) as any
  const adapter = getAdapter(provider.adapter)

  // 组装 ChatRequest：messages 拍平为文本（画布节点是单轮生成场景）
  const text = req.messages
    .map((m) => (typeof m.content === 'string' ? m.content : ''))
    .filter(Boolean)
    .join('\n')
  const result = await adapter.chat({
    model: cm.model_id,
    messages: [{ role: 'user', content: text || 'ping' }],
    images: req.images || [],
    maxTokens: req.maxTokens ?? 4096,
    ...(req.temperature !== undefined && req.temperature !== null ? { temperature: req.temperature } : {}),
  }, ctx.config)
  return { text: result.text }
}

canvasAiRouter.post('/chat', async (req: AuthRequest, res) => {
  const { channelModelId, model, messages, temperature, maxTokens, images } = req.body || {}
  const finalModel = channelModelId ? null : model
  if (!channelModelId && !finalModel) {
    res.status(400).json({ success: false, error: '缺少模型参数' })
    return
  }
  if (!messages) {
    res.status(400).json({ success: false, error: '缺少 messages' })
    return
  }

  // channelModelId → 渠道模型名（发给上游的 model 字符串）
  let modelIdStr = finalModel
  if (channelModelId) {
    const cm = db.prepare(`
      SELECT m.model_id FROM ai_models m
      JOIN api_providers p ON p.id = m.provider_id
      WHERE m.id = ? AND m.supports_chat = 1 AND m.status = 'active' AND p.status = 'active'
    `).get(channelModelId) as any
    if (!cm) {
      res.status(404).json({ success: false, error: '所选文字模型不可用（渠道/模型已停用或删除），请重新选择' })
      return
    }
    modelIdStr = cm.model_id
  }

  try {
    const { text } = await callChat({
      userId: req.user!.userId,
      model: modelIdStr,
      messages,
      temperature,
      maxTokens,
      images,
    })
    res.json({ success: true, data: { text } })
  } catch (err: any) {
    if (err instanceof ProviderContextError) {
      res.status(err.status).json({ success: false, error: err.message })
      return
    }
    console.error('[canvas-ai] chat 代理异常:', err)
    const isTimeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
    const message = isTimeout
      ? '文字模型请求超时，可能该模型不可用或上游拥堵，请稍后重试或更换模型。'
      : err instanceof Error ? err.message : '文字模型调用失败'
    res.status(500).json({ success: false, error: message })
  }
})
