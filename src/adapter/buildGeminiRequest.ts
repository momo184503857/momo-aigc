/**
 * 构建 Gemini 系列模型的 ToAPIs 请求体
 * image_urls 格式为 [{url: "..."}] 对象数组（非 string[]）
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
    body.image_urls = params.imageUrls.map((url) => ({ url }))
  }

  return body
}
