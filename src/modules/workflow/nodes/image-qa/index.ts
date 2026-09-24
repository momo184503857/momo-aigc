import type { NodeModule, NodeRunResult } from '@/modules/workflow/nodes/types'
import type { WorkflowNode } from '@/modules/workflow/types/workflow'
import { resolveNodeInputs } from '@/modules/workflow/engine/basicRunner'
import { collectImageAssets, assetUrl, isUsableImageUrl } from '@/modules/workflow/utils/imageAssets'
import { canvasApi } from '@/services/canvasApi'
import { useModelCatalogStore } from '@/stores/modelCatalog'

/** QA 返回的判定结构 */
interface QaVerdict {
  passed: boolean
  issues?: Array<{
    /** 问题图在送检序列中的序号（从 1 起） */
    imageIndex: number
    /** 问题类别（如 文字水印/主体截断/服装不一致/背景偏离） */
    type: string
    /** 问题说明 */
    detail: string
    /** 给生图节点的修正指令（如何重画才能修复） */
    fix: string
  }>
  summary?: string
}

const DEFAULT_QA_PROMPT = `【输出格式硬性要求：你的回复必须是且仅是一个 JSON 对象，以 { 开头、以 } 结尾。禁止输出任何解释、前言、编号列表、markdown 或 JSON 以外的任何文字。】

你是电商图片质检员。对送检的图片逐张检查：
1. 画面内不得出现任何文字、水印、logo、边框、价格、促销信息或 UI 元素；
2. 商品/模特主体必须完整居中，关键内容（服装结构、头部、手部、配饰）不得贴边或被裁切，且须落在画面中央 75% 安全区内（左右各 12.5% 允许被裁掉而不伤主体）。注意：上半身特写、细节特写是组图的合法景别——特写只判「头部/面部/手部/服装关键结构被画面边缘切断」为不合格，不因景别本身近而判不合格；
3. 服装的品类、颜色、廓形、领口、袖型、门襟、纽扣等可见结构须与参考图保持一致，不得擅自增减腰带、口袋、配饰或出现未提供的背面/隐藏细节；
4. 组图之间：姿势/景别/机位应有差异化（不得同一站姿重复）；背景须符合共同基调（室内应基本一致，户外应为同一场景不同角度），指出明显偏离基调的那张。

JSON 字段格式：
{"passed": false, "summary": "一句话总评", "issues": [{"imageIndex": 1, "type": "文字水印", "detail": "第1张左下角出现水印文字", "fix": "重新生成，提示词中强调：画面中不得出现任何文字、水印或标志"}]}
全部合格时只输出 {"passed": true, "summary": "一句话总评"}。imageIndex 从 1 开始，对应送检顺序。`

/** 剥 <think> 与 markdown 代码栅栏，容错提取 JSON 对象 */
function parseQaVerdict(text: string): QaVerdict | null {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  const candidates: string[] = []
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced?.[1]) candidates.push(fenced[1].trim())
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(cleaned.slice(firstBrace, lastBrace + 1))
  }
  candidates.push(cleaned)
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c) as QaVerdict
      if (typeof parsed.passed === 'boolean') return parsed
    } catch {
      /* try next candidate */
    }
  }
  return null
}

interface CollectedImage {
  /** 来源节点 id（retry 回写目标） */
  sourceNodeId: string
  url: string
  fileName: string
}

/**
 * 从质检输入的来源节点向上追溯最近的「图片 AI」生成节点作为修正目标。
 * 质检常连接裁剪/预览等确定性变换节点——对它们重跑无意义（同样的输入只会产出同样的图），
 * 修正指令必须打到真正消费提示词的 image-ai 节点上。
 */
function findImageAiAncestor(
  workflow: { nodes: Array<{ id: string; type: string; disabled: boolean }>; edges: Array<{ sourceNodeId: string; targetNodeId: string }> },
  fromNodeId: string
): string | undefined {
  const queue = [fromNodeId]
  const visited = new Set<string>()
  while (queue.length > 0) {
    const id = queue.shift()
    if (!id || visited.has(id)) continue
    visited.add(id)
    const node = workflow.nodes.find((n) => n.id === id)
    if (!node) continue
    if (node.type === 'image-ai' && !node.disabled) return node.id
    for (const edge of workflow.edges.filter((e) => e.targetNodeId === id)) {
      queue.push(edge.sourceNodeId)
    }
  }
  return undefined
}

const imageQa: NodeModule = {
  type: 'image-qa',
  title: '图片质检',
  description: '识图模型组图质检，不合格时自动生成修正指令并触发重跑。',
  icon: 'Finished',
  color: 'var(--destructive)',
  inputs: [
    ...Array.from({ length: 8 }, (_, i) => ({
      id: `image_${i + 1}`,
      name: `图${i + 1}`,
      dataType: 'Image' as const,
      direction: 'input' as const,
    })),
    { id: 'text', name: '质检说明', dataType: 'Text', direction: 'input' as const },
  ],
  outputs: [{ id: 'report', name: '质检报告', dataType: 'Text', direction: 'output' }],
  defaultConfig: { channelModelId: undefined, modelName: '', qaPrompt: DEFAULT_QA_PROMPT, strict: false },

  getSummary(config) {
    const strict = config.strict ? ' · 严格' : ''
    return `识图组检${strict}`
  },

  async run(workflow, node): Promise<NodeRunResult> {
    const config = node.config
    const qaPrompt = typeof config.qaPrompt === 'string' && config.qaPrompt.trim() ? config.qaPrompt : DEFAULT_QA_PROMPT
    const strict = config.strict === true

    // 收集各图片端口的图与来源（含来源节点 id，供 retry 回写）
    const inputs = resolveNodeInputs(workflow, node.id)
    const collected: CollectedImage[] = []
    for (let i = 1; i <= 8; i++) {
      const input = inputs[`image_${i}`]
      if (!input) continue
      for (const asset of collectImageAssets(input.result.value)) {
        const url = assetUrl(asset)
        if (isUsableImageUrl(url)) {
          collected.push({ sourceNodeId: input.sourceNodeId, url, fileName: asset.fileName })
        }
      }
    }
    if (!collected.length) {
      return { success: false, message: `节点「${node.title}」至少需要一张图片输入。` }
    }
    // 服务端 imageUrls 上限 8 张
    const toInspect = collected.slice(0, 8)

    const logs: NodeRunResult['logs'] = [
      { level: 'info', message: `送检 ${toInspect.length} 张图片，明细：\n${toInspect.map((c, i) => `${i + 1}. ${c.fileName}（来自节点 ${c.sourceNodeId}）`).join('\n')}` },
    ]

    // 解析识图模型：优先 vision 文字模型；无 vision 模型时退任意文字模型并警告
    const catalog = useModelCatalogStore()
    await catalog.ensureLoaded()
    const model =
      (typeof config.channelModelId === 'number' ? catalog.getModel(config.channelModelId) : undefined) ??
      catalog.visionTextModels[0] ??
      catalog.defaultTextModel
    if (!model) {
      return { success: false, message: `节点「${node.title}」无可用的文字模型（需管理员配置识图模型）。` }
    }
    if (!model.supportsVision) {
      logs.push({ level: 'warn', message: `所选模型「${model.displayName}」不支持识图，质检结果可能不可靠。` })
    }

    // 质检说明（可选上游文本，如背景基调描述）拼进提示词
    const noteText = typeof inputs.text?.result.value === 'string' ? inputs.text.result.value.trim() : ''
    const prompt = [
      qaPrompt,
      noteText ? `\n[补充质检说明]\n${noteText}` : '',
      `\n共送检 ${toInspect.length} 张图片，按顺序编号 1..${toInspect.length}。`,
    ].join('')

    try {
      const startedAt = Date.now()
      const result = await canvasApi.chat({
        model: model.modelId,
        channelModelId: model.id,
        messages: [{ role: 'user', content: prompt }],
        imageUrls: toInspect.map((c) => c.url),
        maxTokens: 2048,
      })
      const durationMs = Date.now() - startedAt

      const verdict = parseQaVerdict(result.text)
      if (!verdict) {
        // 判定解析失败按通过处理 + 警告：质检基础设施问题不阻塞交付
        logs.push({ level: 'warn', message: `质检模型返回无法解析为 JSON（耗时 ${(durationMs / 1000).toFixed(1)}s），按通过处理。原文：\n${result.text.slice(0, 500)}` })
        return {
          success: true,
          result: { dataType: 'Text', value: `质检通过（模型返回未解析，宽松处理）。原文：${result.text}`, updatedAt: new Date().toISOString() },
          logs,
        }
      }

      logs.push({ level: 'info', message: `质检完成（耗时 ${(durationMs / 1000).toFixed(1)}s）：${verdict.passed ? '通过' : '不通过'}。${verdict.summary ?? ''}` })

      if (verdict.passed) {
        return {
          success: true,
          result: { dataType: 'Text', value: `质检通过。${verdict.summary ?? ''}`, updatedAt: new Date().toISOString() },
          logs,
        }
      }

      // 不通过：把问题项映射回来源节点，生成 retry 修正请求
      const issues = Array.isArray(verdict.issues) ? verdict.issues : []
      const retry: NonNullable<NodeRunResult & { success: true }>['retry'] = []
      const reportLines: string[] = [`质检不通过：${verdict.summary ?? ''}`]

      for (const issue of issues) {
        const idx = Number(issue.imageIndex)
        const target = Number.isInteger(idx) && idx >= 1 && idx <= toInspect.length ? toInspect[idx - 1] : null
        const desc = `图${idx}（${target?.fileName ?? '未知'}）— ${issue.type ?? '问题'}：${issue.detail ?? ''}`
        reportLines.push(desc)
        logs.push({ level: 'warn', message: desc })
        if (target && issue.fix?.trim()) {
          // 修正目标追溯到 image-ai 生成节点（直接上游可能是裁剪等确定性节点，重跑无意义）
          const imageAiId = findImageAiAncestor(workflow, target.sourceNodeId)
          if (imageAiId) {
            retry.push({ nodeId: imageAiId, feedback: `质检修正（${issue.type ?? '问题'}：${issue.detail ?? ''}）：${issue.fix.trim()}`, strict })
          } else {
            logs.push({ level: 'warn', message: `图${idx} 的来源链上没有可修正的图片 AI 节点（可能是参考图直连），跳过修正请求。` })
          }
        }
      }

      // 同一目标去重合并（多张问题图可能来自同一生成节点）
      const mergedRetry = Array.from(
        retry.reduce((map, item) => {
          const existing = map.get(item.nodeId)
          map.set(item.nodeId, existing ? { ...existing, feedback: `${existing.feedback}\n${item.feedback}` } : item)
          return map
        }, new Map<string, (typeof retry)[number]>())
      ).map(([, item]) => item)

      // 无可回写的修正（比如问题图找不到来源节点）：宽松交付并警告，strict 则失败
      if (!mergedRetry.length) {
        if (strict) {
          return { success: false, message: `质检不通过且无修正目标：${reportLines.join('；')}`, logs }
        }
        logs.push({ level: 'warn', message: '问题项未能映射到可修正的上游节点，按宽松模式交付。' })
        return {
          success: true,
          result: { dataType: 'Text', value: reportLines.join('\n'), updatedAt: new Date().toISOString() },
          logs,
        }
      }

      return {
        success: true,
        result: { dataType: 'Text', value: reportLines.join('\n'), updatedAt: new Date().toISOString() },
        logs,
        retry: mergedRetry,
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } }
      const message = axiosErr?.response?.data?.error || (err instanceof Error ? err.message : '质检调用失败')
      logs.push({ level: 'error', message: `质检调用失败: ${message}` })
      return { success: false, message, logs }
    }
  },
}

export default imageQa
