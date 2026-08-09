/**
 * 结构化提示词拼接工具。
 *
 * 六层权重公式（主体40% + 风格20% + 场景15% + 光影10% + 构图10% + 画质5%）
 * 在本工具中体现为拼接顺序：权重越大的字段排越前（词越靠前影响越大）。
 * ToAPIs（gpt-image-2/gemini）是自然语言模型，不解析 SD 的 (word:1.4) 权重语法，
 * 因此权重仅通过拼接顺序生效，不做括号语法输出。
 *
 * 负向规避词以自然语言追加到 prompt 末尾（如「请避免出现：模糊、低质量」）。
 */

export type SegmentKey = 'subject' | 'style' | 'scene' | 'lighting' | 'composition' | 'quality'

export interface PromptSegments {
  subject: string
  style: string
  scene: string
  lighting: string
  composition: string
  quality: string
}

// 字段元信息：key -> { label, weight, placeholder, hint }
export interface SegmentMeta {
  key: SegmentKey
  label: string
  weight: number
  placeholder: string
  hint: string
}

// 按权重从大到小排列
export const SEGMENT_ORDER: SegmentKey[] = [
  'subject',
  'style',
  'scene',
  'lighting',
  'composition',
  'quality',
]

export const SEGMENT_META: SegmentMeta[] = [
  {
    key: 'subject',
    label: '主体',
    weight: 40,
    placeholder: '描述画面的核心对象，如「穿着白色连衣裙的女孩」',
    hint: '占比 40%，画面最重要的部分',
  },
  {
    key: 'style',
    label: '风格',
    weight: 20,
    placeholder: '如「日系清新、柔焦、水彩质感」',
    hint: '占比 20%，决定整体视觉调性',
  },
  {
    key: 'scene',
    label: '场景',
    weight: 15,
    placeholder: '如「樱花树下、春日午后、室外」',
    hint: '占比 15%，交代环境与氛围',
  },
  {
    key: 'lighting',
    label: '光影',
    weight: 10,
    placeholder: '如「逆光、柔光、金色光斑」',
    hint: '占比 10%，影响画面层次与情绪',
  },
  {
    key: 'composition',
    label: '构图',
    weight: 10,
    placeholder: '如「三分构图、浅景深、俯拍」',
    hint: '占比 10%，决定画面布局与视角',
  },
  {
    key: 'quality',
    label: '画质',
    weight: 5,
    placeholder: '如「高画质、细节丰富、4K」',
    hint: '占比 5%，画质增强词',
  },
]

export function emptySegments(): PromptSegments {
  return { subject: '', style: '', scene: '', lighting: '', composition: '', quality: '' }
}

/**
 * 将六层结构化字段按权重顺序拼接成完整 prompt。
 * 空字段自动跳过。负向词以自然语言追加到末尾。
 */
export function assemblePrompt(segments: Partial<PromptSegments>, negative: string = ''): string {
  const parts: string[] = []
  for (const key of SEGMENT_ORDER) {
    const val = segments[key]?.trim()
    if (val) parts.push(val)
  }
  let prompt = parts.join(', ')
  const neg = negative.trim()
  if (neg) {
    prompt += `\n请避免出现：${neg}`
  }
  return prompt
}

/**
 * 从已拼接的 prompt 文本反向解析出结构化字段。
 * 仅当 prompt 是标准格式（逗号分隔 + 可选的「请避免出现：」后缀）时有效。
 * 用于从提示词库加载结构化提示词到工坊编辑。
 */
export function parsePrompt(prompt: string, segments?: Partial<PromptSegments>): { segments: PromptSegments; negative: string } {
  // 如果直接有 segments 字段，优先使用
  if (segments && Object.values(segments).some((v) => v && v.trim())) {
    return {
      segments: { ...emptySegments(), ...segments },
      negative: '',
    }
  }
  // 从 prompt 文本解析（尽力而为，非结构化的纯文本会全部归入主体）
  let negative = ''
  let body = prompt
  const negMatch = prompt.match(/\n?请避免出现：(.+)$/s)
  if (negMatch) {
    negative = negMatch[1].trim()
    body = prompt.slice(0, negMatch.index).trim()
  }
  const parts = body.split(',').map((s) => s.trim()).filter(Boolean)
  const result = emptySegments()
  if (parts.length > 0) {
    result.subject = parts[0]
    if (parts.length > 1) result.style = parts[1]
    if (parts.length > 2) result.scene = parts[2]
    if (parts.length > 3) result.lighting = parts[3]
    if (parts.length > 4) result.composition = parts[4]
    if (parts.length > 5) result.quality = parts.slice(5).join(', ')
  }
  return { segments: result, negative }
}

/**
 * 判断 segments 是否有内容（至少一个字段非空）。
 */
export function hasSegments(segments: Partial<PromptSegments> | null | undefined): boolean {
  if (!segments) return false
  return SEGMENT_ORDER.some((k) => segments[k]?.trim())
}
