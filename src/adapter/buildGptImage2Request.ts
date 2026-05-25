/**
 * 构建 GPT-Image-2 模型的 ToAPIs 请求体
 * 对应 PRD 第 8.2 节 GPT-Image-2 请求格式
 */
export function buildGptImage2Request(params: {
  prompt: string
  size: string
  resolution: string
  imageUrls: string[]
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: 'gpt-image-2',
    prompt: params.prompt,
    n: 1,
    size: params.size,
    resolution: params.resolution,
    response_format: 'url',
  }

  if (params.imageUrls.length > 0) {
    body.reference_images = params.imageUrls
  }

  return body
}
