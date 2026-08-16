import { createOpenAiCompatAdapter } from './openaiCompat.js'

/**
 * 火山引擎（火山方舟 Ark · Coding Plan 端点）适配器。
 *
 * 实测结论（2026-08，端点 https://ark.cn-beijing.volces.com/api/coding/v3）：
 *  - 协议为 OpenAI 兼容风格：POST {base}/chat/completions 可用；
 *    Anthropic 协议路径 /v1/messages、/messages 均返回 404，不可用；
 *  - 认证：Authorization: Bearer <ark-...>（x-api-key 头无效）；
 *  - 识图：image_url 传 data URL（注意按图片真实 MIME 类型传，扩展名可能是假的）；
 *  - 推理型模型：最终回答在 message.content，思维链在 message.reasoning_content（忽略）。
 *
 * 端点/协议若有变化，只需改本文件，不影响其他服务商。
 */
export const volcengineAdapter = createOpenAiCompatAdapter({
  code: 'volcengine',
  label: '火山引擎',
  description: '火山方舟 Ark API（OpenAI 兼容协议，Bearer 认证，支持识图）',
  defaultTestModel: 'doubao-seed-2.1-turbo',
})
