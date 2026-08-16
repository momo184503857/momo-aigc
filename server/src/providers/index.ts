import type { ProviderAdapter } from './types.js'
import { genericOpenAiAdapter } from './openaiCompat.js'
import { volcengineAdapter } from './volcengine.js'

/**
 * 适配器注册表：api_providers.adapter 列的值 → 适配器实例。
 * 新增服务商适配器：实现 ProviderAdapter 接口 → 在此注册 → 前端下拉即可选用。
 */
const adapters = new Map<string, ProviderAdapter>()

function register(adapter: ProviderAdapter): void {
  adapters.set(adapter.code, adapter)
}

register(genericOpenAiAdapter)
register(volcengineAdapter)

export function getAdapter(code: string): ProviderAdapter {
  const adapter = adapters.get(code)
  if (!adapter) {
    throw new Error(`未注册的服务商适配器「${code}」，已注册：${[...adapters.keys()].join('、')}`)
  }
  return adapter
}

/** 供前端下拉展示适配器清单 */
export function listAdapters(): Array<{ code: string; label: string; description: string }> {
  return [...adapters.values()].map(({ code, label, description }) => ({ code, label, description }))
}

export type { ProviderAdapter } from './types.js'
