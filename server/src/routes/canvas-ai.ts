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
    const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    const data = await response.json()
    if (!response.ok) {
      console.error('[canvas-ai] ToAPIs 返回错误:', response.status, JSON.stringify(data).slice(0, 800))
      res.status(response.status).json({ success: false, error: data.error?.message || `HTTP ${response.status}` })
      return
    }

    // Extract content
    const content = data.choices?.[0]?.message?.content
    let text = ''
    if (typeof content === 'string') {
      text = content
    } else if (Array.isArray(content)) {
      text = content.map((item: { text?: string }) => item.text || '').join('')
    }

    res.json({ success: true, data: { text } })
  } catch (err: unknown) {
    console.error('[canvas-ai] chat 代理异常:', err)
    const message = err instanceof Error ? err.message : '文字模型调用失败'
    res.status(500).json({ success: false, error: message })
  }
})
