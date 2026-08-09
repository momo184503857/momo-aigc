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

// ────────────────────────────────────────────────────────────
//  模块化拼接（提示词工坊重构版）
//
//  旧版「六层权重」逻辑（SEGMENT_META / assemblePrompt 等）仍被
//  AdminPromptCases（官方案例管理）、PromptLibraryPage（提示词库列表）使用，
//  保留不动。以下是新版「要求 + 元素 + 禁止出现」模块化拼接逻辑。
//
//  规则（对应需求 5）：
//  - requirement（要求）固定为第一段；
//  - element（元素）按用户添加顺序排列在中间，同模块多条并列不去重；
//  - forbidden（禁止出现）固定为最后一段；
//  - 每段格式「模块名：内容；」，段间换行（\n）。
// ────────────────────────────────────────────────────────────

export type ModuleType = 'requirement' | 'element' | 'forbidden'

/** 一段拼接预览项（对应一张被复用的卡片）。 */
export interface PreviewSegment {
  moduleId: number | null
  moduleName: string
  moduleType: ModuleType
  content: string
}

/** 把一段渲染成文本行：「模块名：内容；」 */
function renderLine(seg: PreviewSegment): string {
  const c = seg.content.trim()
  if (!c) return ''
  return `${seg.moduleName}：${c}；`
}

/**
 * 把预览段列表按规则渲染成完整文本。
 * requirement → 最前；element → 中间按数组顺序；forbidden → 最后。
 */
export function renderPreviewText(segments: PreviewSegment[]): string {
  const requirements = segments.filter((s) => s.moduleType === 'requirement' && s.content.trim())
  const elements = segments.filter((s) => s.moduleType === 'element' && s.content.trim())
  const forbiddens = segments.filter((s) => s.moduleType === 'forbidden' && s.content.trim())
  const ordered = [...requirements, ...elements, ...forbiddens]
  return ordered.map(renderLine).filter(Boolean).join('\n')
}

/**
 * 把一段新内容合并进既有可编辑文本（拼接预览）。
 *
 * 维护规则（同模块覆盖，不重复追加）：
 *  - requirement：若已有「要求」段则覆盖其内容，保持在最前；否则插到最前；
 *  - forbidden：若已有「禁止出现」段则覆盖其内容，保持在最后；否则追加到末尾；
 *  - element：若已有同名模块段则覆盖其内容（保持原位置）；否则作为新行插入到
 *    forbidden 段之前（即元素区末尾）。
 *
 * 保留用户在 textarea 里已有的手动编辑内容，仅做按模块归位的最小改动。
 */
export function appendSegmentToText(prevText: string, seg: PreviewSegment): string {
  const content = seg.content.trim()
  if (!content) return prevText
  const line = renderLine(seg)
  const lines = prevText.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim() !== '')

  const idx = lines.findIndex((l) => l.startsWith(`${seg.moduleName}：`))
  const exists = idx >= 0

  if (seg.moduleType === 'requirement') {
    // 已有则覆盖内容（保持原位置），否则插到最前
    if (exists) lines[idx] = line
    else lines.unshift(line)
  } else if (seg.moduleType === 'forbidden') {
    // 已有则覆盖内容（保持原位置），否则追加到末尾
    if (exists) lines[idx] = line
    else lines.push(line)
  } else {
    // element：已有同名模块段则覆盖内容（保持原位置）；否则插到 forbidden 段之前，否则末尾追加
    if (exists) {
      lines[idx] = line
    } else {
      const forbIdx = lines.findIndex((l) => l.startsWith('禁止出现：'))
      if (forbIdx >= 0) lines.splice(forbIdx, 0, line)
      else lines.push(line)
    }
  }
  return lines.join('\n')
}

