import type { ProviderAdapter, ImageProviderAdapter } from './types.js'
import { genericOpenAiAdapter } from './openaiCompat.js'
import { volcengineAdapter } from './volcengine.js'
import { toapisImageAdapter } from './toapisImage.js'
import { openaiImageAdapter } from './openaiImage.js'
import { volcengineImageAdapter } from './volcengineImage.js'
import { geminiImageAdapter } from './geminiImage.js'

/**
 * 适配器注册表：api_providers.adapter 列的值 → 适配器实例。
 * 新增服务商适配器：实现 ProviderAdapter / ImageProviderAdapter 接口 → 在此注册
 * → 管理页与「我的渠道」页的协议下拉自动带出，无需改前端硬编码。
 */
const adapters = new Map<string, ProviderAdapter>()

function register(adapter: ProviderAdapter): void {
  adapters.set(adapter.code, adapter)
}

register(genericOpenAiAdapter)      // openai_compat：文字/识图（通用）
register(volcengineAdapter)         // volcengine：火山识图（存量识图渠道沿用）
register(toapisImageAdapter)        // toapis：生图（异步任务式）+ 文字
register(openaiImageAdapter)        // openai_image：生图（同步）
register(volcengineImageAdapter)    // volcengine_image：火山 Ark 生图（同步）
register(geminiImageAdapter)        // gemini_image：Gemini 原生生图（同步，/v1beta generateContent）

export function getAdapter(code: string): ProviderAdapter {
  const adapter = adapters.get(code)
  if (!adapter) {
    throw new Error(`未注册的服务商适配器「${code}」，已注册：${[...adapters.keys()].join('、')}`)
  }
  return adapter
}

/** 取生图适配器（含 submitImageTask 的适配器；toapis/openai_image/volcengine_image/gemini_image） */
export function getImageAdapter(code: string): ImageProviderAdapter {
  const adapter = adapters.get(code)
  if (!adapter || typeof (adapter as ImageProviderAdapter).submitImageTask !== 'function') {
    throw new Error(`适配器「${code}」不支持生图，请选择 toapis / openai_image / volcengine_image / gemini_image 协议的渠道`)
  }
  return adapter as ImageProviderAdapter
}

/** 是否为生图协议适配器 */
export function isImageAdapter(code: string): boolean {
  const a = adapters.get(code)
  return !!a && typeof (a as ImageProviderAdapter).submitImageTask === 'function'
}

/** 用户「我的渠道」可选的协议模板白名单（FR1/FR5 第一期清单） */
export const CHANNEL_ADAPTER_WHITELIST = ['toapis', 'openai_image', 'volcengine_image', 'openai_compat']

/** 供前端下拉展示适配器清单 */
export function listAdapters(): Array<{ code: string; label: string; description: string; imageCapable: boolean; supportsBalance: boolean }> {
  return [...adapters.values()].map((a) => ({
    code: a.code,
    label: a.label,
    description: a.description,
    imageCapable: typeof (a as ImageProviderAdapter).submitImageTask === 'function',
    supportsBalance: !!(a as ImageProviderAdapter).supportsBalance,
  }))
}

export type { ProviderAdapter, ImageProviderAdapter } from './types.js'
