/**
 * 适配器共享的 HTTP 工具：超时控制、JSON 解析、错误信息归一化。
 * 各适配器不再各自手写 fetch 细节。
 */

export interface PostJsonResult {
  status: number
  json: any | null
  text: string
}

export async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs = 120_000,
): Promise<PostJsonResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const text = await res.text()
    let json: any = null
    try { json = text ? JSON.parse(text) : null } catch { /* 非 JSON 响应 */ }
    return { status: res.status, json, text }
  } finally {
    clearTimeout(timer)
  }
}

/** multipart 表单 POST（不设 content-type，由 fetch 自动带 boundary）；响应解析与 postJson 一致 */
export async function postForm(
  url: string,
  headers: Record<string, string>,
  form: FormData,
  timeoutMs = 120_000,
): Promise<PostJsonResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...headers },
      body: form,
      signal: controller.signal,
    })
    const text = await res.text()
    let json: any = null
    try { json = text ? JSON.parse(text) : null } catch { /* 非 JSON 响应 */ }
    return { status: res.status, json, text }
  } finally {
    clearTimeout(timer)
  }
}

/** 拼接 base_url 与路径，容忍 base 结尾有无斜杠 */
export function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, '')
  // base 已以 /v1 结尾（如 https://toapis.xyz/v1）而 path 也以 /v1/ 开头时去重，
  // 避免拼出 /v1/v1/...（toapis 渠道地址固定带 /v1，与存量不带 /v1 的写法并存）
  if (/\/v1$/i.test(b) && path.startsWith('/v1/')) return b + path.slice(3)
  return b + path
}

/** 从服务商响应中提取人话错误信息（OpenAI 风格 error.message / HTTP 状态 / 原文兜底） */
export function extractErrorMessage(result: PostJsonResult, fallback = '调用失败'): string {
  const { status, json, text } = result
  const apiMsg = json?.error?.message ?? json?.error?.msg ?? json?.message
  if (apiMsg) return `${fallback}（HTTP ${status}）：${String(apiMsg)}`
  if (text) return `${fallback}（HTTP ${status}）：${text.slice(0, 300)}`
  return `${fallback}（HTTP ${status}）`
}

export class ProviderCallError extends Error {
  constructor(message: string, public readonly status?: number, public readonly raw?: unknown) {
    super(message)
    this.name = 'ProviderCallError'
  }
}
