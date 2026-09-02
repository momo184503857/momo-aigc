import { readLocalImage, isLocalFileUrl } from './storage.js'
import { postForm, joinUrl, extractErrorMessage, ProviderCallError } from '../providers/http.js'

/**
 * 参考图直传渠道（直接传模式的核心）：把站内本地文件 URL（/api/files/...）解析为上游可用形式。
 *
 *  - 绝对 http(s) URL（OSS 公网地址、渠道托管地址等）：原样透传
 *  - 本地文件 URL：
 *      toapis 协议   → POST {base}/v1/uploads/images 换取渠道托管 URL
 *                     （官方文档明确生成接口不再支持 base64，必须先上传；multipart file 字段，单图 ≤10MB）
 *      其余协议      → 读取本地文件转 data:base64 URL 塞 image 数组
 *                     （OpenAI 兼容中转普遍接受 data URL；火山 Ark 官方支持 base64）
 *
 *  必须在 withKeyFailover 回调内调用（toapis 上传消耗渠道 Key，402/欠费要走 Key 轮换）。
 *  DB input_image_urls 始终存原始 URL，转换结果仅本次派发生效（重试重新转换）。
 */

const TOAPIS_UPLOAD_LIMIT_BYTES = 10 * 1024 * 1024

async function uploadToToapis(url: string, ctx: { baseUrl: string; apiKey: string }): Promise<string> {
  const img = await readLocalImage(url)
  if (!img) throw new ProviderCallError(`参考图文件不存在或已失效：${url}`)
  if (img.buffer.length > TOAPIS_UPLOAD_LIMIT_BYTES) {
    throw new ProviderCallError(`参考图 ${(img.buffer.length / 1024 / 1024).toFixed(1)}MB 超过 ToAPIs 上传上限 10MB，请压缩后重试`)
  }

  const form = new FormData()
  form.append('purpose', 'generation')
  const ext = img.mimeType === 'image/jpeg' ? 'jpg' : img.mimeType.split('/')[1] || 'png'
  form.append('file', new Blob([img.buffer], { type: img.mimeType }), `reference.${ext}`)

  const result = await postForm(
    joinUrl(ctx.baseUrl, '/v1/uploads/images'),
    { authorization: `Bearer ${ctx.apiKey}` },
    form,
    120_000,
  )
  if (result.status !== 200) {
    throw new ProviderCallError(extractErrorMessage(result, '参考图上传渠道失败'), result.status, result.json)
  }
  const hostedUrl = result.json?.data?.url
  if (typeof hostedUrl !== 'string' || !hostedUrl) {
    throw new ProviderCallError('渠道上传接口未返回图片 URL', result.status, result.json)
  }
  return hostedUrl
}

async function localToDataUrl(url: string): Promise<string> {
  const img = await readLocalImage(url)
  if (!img) throw new ProviderCallError(`参考图文件不存在或已失效：${url}`)
  return `data:${img.mimeType};base64,${img.buffer.toString('base64')}`
}

/** 按适配器协议解析参考图列表（见模块注释；无参考图或全为绝对 URL 时零开销透传） */
export async function resolveUpstreamImageUrls(
  adapterCode: string,
  imageUrls: string[],
  ctx: { baseUrl: string; apiKey: string },
): Promise<string[]> {
  if (imageUrls.length === 0) return imageUrls
  const out: string[] = []
  for (const url of imageUrls) {
    if (!isLocalFileUrl(url)) {
      out.push(url)
      continue
    }
    out.push(adapterCode === 'toapis' ? await uploadToToapis(url, ctx) : await localToDataUrl(url))
  }
  return out
}

const INLINE_IMAGE_LIMIT_BYTES = 10 * 1024 * 1024

/** 从 URL 扩展名推断图片 MIME（下载响应 content-type 缺失/非 image 时兜底） */
function mimeFromUrlExt(url: string): string {
  const m = /\.(png|jpe?g|webp|gif|bmp)(?:[?#]|$)/i.exec(url)
  if (!m) return 'image/png'
  const ext = m[1].toLowerCase()
  return ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
}

/**
 * 参考图 → 纯 base64 内联形式（Gemini 原生协议 inlineData、openai_image 的 multipart edits 用，不带 data: 前缀）。
 * 与 resolveUpstreamImageUrls 的差异：返回 {mimeType, base64} 而非 URL/data-URL 字符串，
 * 且远程 URL 不透传——Gemini 只收内联 bytes、multipart edits 要以文件上传，
 * OSS 模式的公网地址必须服务端拉回。单图 ≤10MB（对齐 toapis 上传上限）。
 * DB input_image_urls 仍存原始 URL，转换仅本次派发生效。
 */
export async function resolveUpstreamInlineImages(
  imageUrls: string[],
): Promise<Array<{ mimeType: string; base64: string }>> {
  if (imageUrls.length === 0) return []
  const out: Array<{ mimeType: string; base64: string }> = []
  for (const url of imageUrls) {
    if (isLocalFileUrl(url)) {
      const img = await readLocalImage(url)
      if (!img) throw new ProviderCallError(`参考图文件不存在或已失效：${url}`)
      if (img.buffer.length > INLINE_IMAGE_LIMIT_BYTES) {
        throw new ProviderCallError(`参考图 ${(img.buffer.length / 1024 / 1024).toFixed(1)}MB 超过内联上限 10MB，请压缩后重试`)
      }
      out.push({ mimeType: img.mimeType, base64: img.buffer.toString('base64') })
      continue
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 60_000)
    let buffer: Buffer
    let mimeType: string
    try {
      const res = await fetch(url, { signal: controller.signal })
      if (!res.ok) throw new ProviderCallError(`参考图下载失败（HTTP ${res.status}）：${url}`)
      const declared = Number(res.headers.get('content-length') || 0)
      if (declared > INLINE_IMAGE_LIMIT_BYTES) {
        throw new ProviderCallError(`参考图 ${(declared / 1024 / 1024).toFixed(1)}MB 超过内联上限 10MB，请压缩后重试`)
      }
      mimeType = (res.headers.get('content-type') || '').split(';')[0].trim()
      if (!/^image\//i.test(mimeType)) mimeType = mimeFromUrlExt(url)
      buffer = Buffer.from(await res.arrayBuffer())
    } finally {
      clearTimeout(timer)
    }
    if (buffer.length > INLINE_IMAGE_LIMIT_BYTES) {
      throw new ProviderCallError(`参考图 ${(buffer.length / 1024 / 1024).toFixed(1)}MB 超过内联上限 10MB，请压缩后重试`)
    }
    out.push({ mimeType, base64: buffer.toString('base64') })
  }
  return out
}
