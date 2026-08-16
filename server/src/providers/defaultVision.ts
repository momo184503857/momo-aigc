/**
 * 默认识图模型：管理后台配置的「服装图片识别」专用模型。
 *
 * 配置存 system_config（key = default_vision_model，value = "providerId:modelId"），
 * 业务侧（成套生图第一步的 AI 识别）通过 resolveDefaultVision() 拿到
 * 「适配器 + 运行时配置 + 模型名」三件套后直接调用，不感知服务商协议。
 */
import { db } from '../db/index.js'
import { decryptKey } from '../utils/crypto.js'
import { getAdapter } from './index.js'
import type { ProviderAdapter, ProviderRuntimeConfig } from './types.js'

export const DEFAULT_VISION_CONFIG_KEY = 'default_vision_model'

/** 服装风格候选（与管理端/前端候选保持一致） */
export const GARMENT_STYLES = [
  '新中式国风', '文艺风', '休闲', '极简', '法式', '度假',
  '优雅', '职场', '运动', '喜婆婆', '小香风',
] as const

/** 适合季节候选 */
export const GARMENT_SEASONS = ['春', '夏', '秋', '冬'] as const

/** 服装识别提示词（固定话术，返回 JSON） */
export const GARMENT_ANALYZE_PROMPT =
  '识别图片的风格和适合季节，返回json格式内容，无需返回其他内容，风格和适合季节都是多选，多选用英文逗号隔开。' +
  '风格：新中式国风、文艺风、休闲、极简、法式、度假、优雅、职场、运动、喜婆婆、小香风；适合季节：春、夏、秋、冬'

export interface DefaultVisionSetting {
  providerId: number
  modelId: string
}

export interface DefaultVisionRuntime {
  providerName: string
  modelId: string
  adapter: ProviderAdapter
  config: ProviderRuntimeConfig
}

/** 读取配置（不校验有效性），未配置返回 null */
export function getDefaultVisionSetting(): DefaultVisionSetting | null {
  const row = db.prepare(`SELECT value FROM system_config WHERE key = ?`).get(DEFAULT_VISION_CONFIG_KEY) as { value: string } | undefined
  const raw = (row?.value || '').trim()
  if (!raw) return null
  const sep = raw.indexOf(':')
  if (sep <= 0) return null
  const providerId = Number(raw.slice(0, sep))
  const modelId = raw.slice(sep + 1)
  if (!Number.isInteger(providerId) || !modelId) return null
  return { providerId, modelId }
}

/**
 * 校验并解析默认识图模型的完整调用链。
 * 任一环节不满足时抛出带明确指引的错误（面向管理端/用户展示）。
 */
export function resolveDefaultVision(): DefaultVisionRuntime {
  const setting = getDefaultVisionSetting()
  if (!setting) {
    throw new Error('尚未配置默认识图模型，请联系管理员在后台「配置」页设置')
  }
  const provider = db.prepare(`SELECT * FROM api_providers WHERE id = ?`).get(setting.providerId) as any
  if (!provider) throw new Error('默认识图模型所属服务商已不存在，请联系管理员重新配置')
  if (provider.status !== 'active') throw new Error(`默认识图模型所属服务商「${provider.name}」已停用，请联系管理员`)

  const model = db.prepare(`SELECT * FROM ai_models WHERE provider_id = ? AND model_id = ?`)
    .get(provider.id, setting.modelId) as any
  if (!model) throw new Error('默认识图模型已不存在，请联系管理员重新配置')
  if (model.status !== 'active') throw new Error(`默认识图模型「${model.model_id}」已停用，请联系管理员`)
  if (!model.supports_vision) throw new Error(`默认识图模型「${model.model_id}」不支持识图，请联系管理员更换`)

  const keyRow = db.prepare(`
    SELECT * FROM api_provider_keys WHERE provider_id = ? AND is_primary = 1 AND status = 'active'
  `).get(provider.id) as any
  if (!keyRow) throw new Error(`服务商「${provider.name}」没有可用的主 Key，请联系管理员配置`)

  let plain: string
  try {
    plain = decryptKey({ ciphertext: keyRow.encrypted_key, iv: keyRow.key_iv, tag: keyRow.key_tag })
  } catch {
    throw new Error('主 Key 解密失败（可能加密密钥已轮换），请联系管理员重新录入')
  }

  return {
    providerName: provider.name,
    modelId: model.model_id,
    adapter: getAdapter(provider.adapter),
    config: {
      providerId: provider.id,
      code: provider.code,
      name: provider.name,
      baseUrl: provider.base_url,
      apiKey: plain,
    },
  }
}

/**
 * 解析模型返回文本 → { styles, seasons }。
 * 依次尝试：剥掉 ```json 围栏的 JSON（键：风格/style、适合季节/season，
 * 值为逗号分隔字符串或数组）→ 全文扫描候选词兜底；候选外的词一律丢弃。
 */
export function parseGarmentRecognition(text: string): { styles: string[]; seasons: string[] } {
  const pick = (v: unknown): string[] => {
    if (Array.isArray(v)) return v.flatMap((x) => String(x).split(/[,,、;；]/))
    return String(v ?? '').split(/[,,、;；]/)
  }
  const norm = (list: string[], allowed: readonly string[]): string[] =>
    [...new Set(list.map((s) => s.trim()).filter((s) => (allowed as readonly string[]).includes(s)))]

  const stripped = String(text || '').replace(/```(?:json)?/gi, '')
  const jsonMatch = stripped.match(/\{[\s\S]*?\}/)
  if (jsonMatch) {
    try {
      const obj = JSON.parse(jsonMatch[0]) as Record<string, unknown>
      const styles = norm(pick(obj['风格'] ?? obj['style']), GARMENT_STYLES)
      const seasons = norm(pick(obj['适合季节'] ?? obj['season']), GARMENT_SEASONS)
      if (styles.length || seasons.length) return { styles, seasons }
    } catch { /* 落入全文扫描 */ }
  }
  // 兜底：全文扫描候选词（模型未按 JSON 返回时）
  const scan = (allowed: readonly string[]): string[] =>
    allowed.filter((w) => stripped.includes(w))
  return { styles: scan(GARMENT_STYLES), seasons: scan(GARMENT_SEASONS) }
}
