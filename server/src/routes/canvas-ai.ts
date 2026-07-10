import { Router } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'
import { resolveUserApiKey } from '../utils/toapis.js'

export const canvasAiRouter = Router()

canvasAiRouter.use(authMiddleware)

const BASE_URL = 'https://toapis.com'

// Proxy text model (chat completions) call
canvasAiRouter.post('/chat', async (req: AuthRequest, res) => {
  const { key: apiKey } = resolveUserApiKey(req.user!.userId)
  if (!apiKey) {
    res.status(400).json({ success: false, error: 'API Key 未配置' })
    return
  }

  const { model, messages, temperature, maxTokens } = req.body
  if (!model || !messages) {
    res.status(400).json({ success: false, error: '缺少 model 或 messages' })
    return
  }

  const requestBody: Record<string, unknown> = { model, messages, stream: false }
  if (temperature !== undefined && temperature !== null) requestBody.temperature = temperature
  if (maxTokens !== undefined && maxTokens !== null) requestBody.max_tokens = maxTokens

  try {
    // 文字模型（尤其带参考图的多模态）上游响应较慢；设 3 分钟超时，避免上游挂起导致前端一直转圈。
    const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(180000),
    })

    // 先读原始文本再解析：ToAPIs 在网关层（404/413/502/504）或上游异常时会返回 HTML 而非 JSON，
    // 直接 response.json() 会抛 "Unexpected token '<'" 并吞掉真实状态码。这里手动判定，
    // 非 JSON 时把状态码 + 文本片段透传回前端，便于定位（模型不可用 / 超时 / 请求过大 等）。
    const rawText = await response.text()
    const contentType = response.headers.get('content-type') || ''
    const trimmed = rawText.trimStart()
    const looksJson = contentType.includes('application/json') || trimmed.startsWith('{') || trimmed.startsWith('[')
    if (!looksJson) {
      console.error('[canvas-ai] ToAPIs 返回非 JSON:', response.status, contentType, rawText.slice(0, 500))
      res.status(502).json({
        success: false,
        error: `中转站返回了非 JSON 响应（HTTP ${response.status}），通常是该文字模型不可用或上游网关超时。预览: ${trimmed.slice(0, 120)}`,
      })
      return
    }

    let data: Record<string, unknown>
    try {
      data = JSON.parse(rawText)
    } catch {
      console.error('[canvas-ai] ToAPIs 响应 JSON 解析失败:', response.status, rawText.slice(0, 500))
      res.status(502).json({ success: false, error: `中转站响应 JSON 解析失败（HTTP ${response.status}）。预览: ${trimmed.slice(0, 120)}` })
      return
    }

    if (!response.ok) {
      console.error('[canvas-ai] ToAPIs 返回错误:', response.status, JSON.stringify(data).slice(0, 800))
      const errMsg = (data.error as { message?: string } | undefined)?.message
      res.status(response.status).json({ success: false, error: errMsg || `HTTP ${response.status}` })
      return
    }

    // Extract content
    const choices = data.choices as Array<{ message?: { content?: unknown } }> | undefined
    const content = choices?.[0]?.message?.content
    let text = ''
    if (typeof content === 'string') {
      text = content
    } else if (Array.isArray(content)) {
      text = content.map((item: { text?: string }) => item.text || '').join('')
    }

    res.json({ success: true, data: { text } })
  } catch (err: unknown) {
    console.error('[canvas-ai] chat 代理异常:', err)
    const isTimeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
    const message = isTimeout
      ? '文字模型请求超时（3 分钟未响应），可能该模型不可用或上游拥堵，请稍后重试或更换模型。'
      : err instanceof Error
        ? err.message
        : '文字模型调用失败'
    res.status(500).json({ success: false, error: message })
  }
})
