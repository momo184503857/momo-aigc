/**
 * 构建 Gemini 系列模型的 ToAPIs 请求体
 * 对应 PRD 第 8.2 节 Gemini 请求格式
 */
export function buildGeminiRequest(params: {
  model: string
  prompt: string
  size: string
  resolution: string
  imageUrls: string[]
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: params.model,
    prompt: params.prompt,
    n: 1,
    size: params.size,
    metadata: {
      resolution: params.resolution,
    },
  }

  if (params.imageUrls.length > 0) {
    body.image_urls = params.imageUrls
  }

  return body
}
