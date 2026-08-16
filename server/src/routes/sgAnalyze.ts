/**
 * suite-gen AI 识别路由：服装图片 → 风格 + 适合季节。
 *
 * 调用管理后台配置的「默认识图模型」（system_config.default_vision_model，
 * 走服务商主 Key + providers/ 适配器），提示词固定、返回 JSON 由服务端解析，
 * 前端拿到即用的候选子集，不暴露服务商与 Key 细节。
 */
import { Router } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'
import {
  resolveDefaultVision,
  parseGarmentRecognition,
  GARMENT_ANALYZE_PROMPT,
} from '../providers/defaultVision.js'

export const sgAnalyzeRouter = Router()
sgAnalyzeRouter.use(authMiddleware)

// base64 上限 10MB（约对应 7.5MB 原图，足够服装主图识别）
const MAX_BASE64_LENGTH = 10 * 1024 * 1024

// POST /api/sg/analyze/garment  { image: { mimeType, base64 } }
sgAnalyzeRouter.post('/garment', async (req: AuthRequest, res) => {
  const { image } = req.body || {}
  const base64 = String(image?.base64 || '')
  const mimeType = String(image?.mimeType || 'image/png')
  if (!base64) { res.status(400).json({ success: false, error: '缺少图片内容' }); return }
  if (base64.length > MAX_BASE64_LENGTH) { res.status(413).json({ success: false, error: '图片过大，请压缩后重试' }); return }

  let runtime: ReturnType<typeof resolveDefaultVision>
  try {
    runtime = resolveDefaultVision()
  } catch (e: any) {
    res.status(503).json({ success: false, error: e.message || '识图服务未就绪' })
    return
  }

  try {
    const result = await runtime.adapter.chat({
      model: runtime.modelId,
      messages: [{ role: 'user', content: GARMENT_ANALYZE_PROMPT }],
      images: [{ mimeType, base64 }],
      maxTokens: 2048,
    }, runtime.config)
    const parsed = parseGarmentRecognition(result.text)
    if (parsed.styles.length === 0 && parsed.seasons.length === 0) {
      res.status(502).json({ success: false, error: '识别结果为空，请重试或换一张更清晰的服装图' })
      return
    }
    res.json({ success: true, data: { ...parsed, raw: result.text } })
  } catch (e: any) {
    console.error('[sg/analyze] Garment recognition error:', e.message)
    res.status(502).json({ success: false, error: e.message || '识别调用失败' })
  }
})
