/**
 * 原版拆解 · 四种专家组装策略 + 反馈闭环/历史兜底纯函数。
 * 模板源自坤哥工作台 V10.0 的专家组装器，适配本项目的 18 项字段
 * （garment 服装描述对应原 advantage 槽位，atmosphere 并入 Master 的 Style 段）。
 */
import { DECOMPOSE_LABELS, filledSections } from './decomposeSpec'

export type DecomposeExpertId = 'engineer' | 'image' | 'architect' | 'master'

export interface DecomposeExpertDef {
  id: DecomposeExpertId
  name: string
  icon: string
  tagline: string
  desc: string
  build(values: Record<string, string>): string
}

const seg = (v: Record<string, string>, k: string, def: string) => (v[k] || '').trim() || def

export const DECOMPOSE_EXPERTS: DecomposeExpertDef[] = [
  {
    id: 'engineer',
    name: '提示词工程专家',
    icon: '🔧',
    tagline: '稳定可控 · 默认',
    desc: '结构化指令式：分段清晰、锁定指令、负向约束，最稳最可控',
    build(v) {
      return [
        '8K超高清商业女装摄影，3:4竖版电商主图，保留竖版全身机位：模特全身直立出镜、纵向占满画幅、人物居中、上下不裁切，四周预留8%留白。',
        '模特：31岁东方知性女性，鹅蛋柔和骨相，圆润杏眼，原生真实皮肤肌理，伪素颜淡妆，纯正东亚面孔，7.5~8.5头身，人体结构自然无畸形。',
        ...filledSections(v),
        '',
        '【锁定指令】服装版型/面料/色彩/印花100%还原参考图，自带配饰（丝巾/项链/耳饰/腰带/发饰）必须原样保留，禁止删减更换。',
        '【负向约束】禁止路人/文字/乱码/logo；禁止畸形手部（标准5指）；禁止过度磨皮塑料感；禁止风格混搭。',
        '【画质】商业实拍原图基底，保留皮肤与面料真实肌理，原生相机质感，无AI假面感。',
      ].join('\n')
    },
  },
  {
    id: 'image',
    name: '图像提示词工程师',
    icon: '📷',
    tagline: '参数极致',
    desc: '视觉参数式：镜头/光圈/焦距/色温/构图等成像参数详尽，追求画面质感极致还原',
    build(v) {
      const params = v.params || ''
      return [
        '【画面基础】8K超高清商业女装摄影，3:4竖版构图，保留竖版全身机位（模特全身直立、纵向占满画幅、上下不裁切），全画幅传感器质感，高动态范围。',
        `【镜头参数】${seg(v, 'lens', '85mm f1.8定焦')}，浅景深，焦点锁定服装主视觉区；ISO 100-200，快门1/125-1/250，色温${params.includes('色温') ? params : '5200K中性白平衡'}。`,
        '【模特】31岁东方知性女性，鹅蛋骨相，杏眼，原生皮肤肌理，伪素颜，东亚面孔，7.5头身自然体态。',
        ...filledSections(v),
        '',
        `【光影】${seg(v, 'light', '柔和自然光')}，主光-辅光-轮廓光三层布光，避免生硬阴影。`,
        `【构图】${seg(v, 'composition', '黄金分割')}，人物置于分割点，前景空间留白，背景纵深虚化。`,
        '【色彩管理】严格还原服装原色，禁止AI自动调色/色相漂移/饱和度改变。',
        '【输出质感】原生实拍质感，不重度磨皮，保留面料细节与皮肤纹理。',
      ].join('\n')
    },
  },
  {
    id: 'architect',
    name: '大模型提示词架构师',
    icon: '🧬',
    tagline: '架构分层',
    desc: '逻辑架构式：人/衣/景/光/拍五级分层 + 变量隔离 + 模板化复用，适合复杂多变量场景',
    build(v) {
      const byKeys = (keys: string[]) => keys
        .filter((k) => (v[k] || '').trim())
        .map((k) => `【${DECOMPOSE_LABELS[k]}】${v[k].trim()}`)
        .join('；')
      return [
        '== 女装电商主图生图任务 ==',
        '【第一层 · 人】模特：31岁东方知性女性，鹅蛋柔和骨相，圆润杏眼，原生真实皮肤肌理，伪素颜淡妆，纯正东亚面孔，7.5~8.5头身，人体结构自然无畸形。',
        '【第二层 · 衣】服装严格100%还原参考图：版型/面料/色彩/印花/结构细节，自带全部配饰原样保留呈现，禁止删减更换。',
        '【第三层 · 景】场景主题：空间叙事动线连续（5张图沿动线推进，背景连续衍生，色调/光线/季节/天气统一）。',
        `【第四层 · 光】${byKeys(['light', 'camera', 'lens']) || '柔和自然光，人眼平视机位。'}`,
        `【第五层 · 拍】${byKeys(['composition', 'quality', 'params']) || '黄金分割构图，8K超清，商业实拍质感。'}`,
        '',
        '【全部拆解信息】',
        ...filledSections(v),
        '',
        '【变量隔离】全套统一：发型/妆容/配饰/鞋履/色调/光线方向/季节/天气；禁止漂移。',
        '【负向约束】无人/无字/无乱码/无畸形手/无塑料假面。',
      ].join('\n')
    },
  },
  {
    id: 'master',
    name: 'Master 框架组装',
    icon: '🧩',
    tagline: '14段全维度',
    desc: '通用主提示词框架：Style/Subject/Clothing/Pose/Expression/Accessory/Background/Props/Lighting/Camera/Composition/Quality/Post/Negative 十四段全维度',
    build(v) {
      const style = seg(v, 'theme', '新中式高级 (chinese-modern-haute)')
      const atmosphere = (v.atmosphere || '').trim()
      return [
        `[Style Theme] ${style}${atmosphere ? `，氛围：${atmosphere}` : '，美学特征：东方美学/极简留白'}`,
        `[Subject] ${seg(v, 'face', '25-30岁亚洲女性 / 模特身材 / 鹅蛋脸 / 168-172cm')}，${seg(v, 'expression', '淡雅浅笑，视线略偏左')}`,
        `[Clothing] ${seg(v, 'garment', '立领盘扣 + 桑蚕丝缎面 + 浅米色')}，严格100%还原参考图，禁止改色/改版型/换印花`,
        `[Pose] ${seg(v, 'pose', '站立 3/4 侧 / 右手轻提裙摆 / 抬头 45°')}；${seg(v, 'body', '双手自然垂落')}`,
        `[Expression] ${seg(v, 'expression', '淡雅浅笑 / 视线略偏左 / 温柔')}`,
        `[Accessory] ${seg(v, 'accessories', '金色耳环 + 翡翠玉镯 + 珍珠项链')}，全部原样保留`,
        `[Background] ${seg(v, 'scene', '木门 + 屏风 + 暖光落地灯')}`,
        `[Props] ${seg(v, 'props', '中式团扇 / 草帽 / 咖啡杯 / 草编包')}`,
        `[Lighting] ${seg(v, 'light', '左侧自然光 + 右侧补光 + 暖光阴影')}；${seg(v, 'params', 'ISO 100 / 色温 5200K')}`,
        `[Camera] ${seg(v, 'camera', '胸口截取 / 人眼平视')} / ${seg(v, 'lens', '85mm / f/2.8 / 浅景深')}`,
        `[Composition] ${seg(v, 'composition', '居中 / 3/4 黄金分割 / 留白 1/4')}`,
        `[Quality] ${seg(v, 'quality', '8K 高清 / 商业级皮肤质感')}`,
        '[Post] 自然磨皮 / 暖色调 / 适度对比 / 胶片颗粒',
        '[Negative] 变形 / 模糊 / 多手指 / 文字水印 / 背景杂物 / 色彩漂移 / 版型改变 / 印花替换',
        '',
        '【空间叙事】5张图沿主题动线连续推进，背景连续衍生，色调/光线/季节/天气统一；',
        '【参考图绑定】服装版型/色彩/面料/印花及自带配饰严格以参考图为准，禁止偏离。',
      ].join('\n')
    },
  },
]

// ─── 反馈闭环（localStorage: sg_expert_feedback，键 = 主题名） ───

export interface DecomposeFeedbackEntry {
  ok: boolean
  fields?: Record<string, string>
  at?: number
}
export type DecomposeFeedbackStore = Record<string, DecomposeFeedbackEntry>

/** 主题键大小写无关精确查条目 */
function findEntryExact(theme: string, store: DecomposeFeedbackStore): DecomposeFeedbackEntry | undefined {
  const t = (theme || '').trim().toLowerCase()
  if (!t) return undefined
  return Object.entries(store).find(([key]) => key.trim().toLowerCase() === t)?.[1]
}

/** 同主题「需修正」反馈 → 修正指令（追加到 Prompt 末尾）；无则返回空串 */
export function buildFeedbackFixes(theme: string, store: DecomposeFeedbackStore): string {
  const entry = findEntryExact(theme, store)
  if (!entry || entry.ok) return ''
  return '【历史修正】上次同主题反馈需修正：请对照参考图逐项复核服装版型/颜色/面料/印花，确保1:1还原不漂移；五官脸型严格按参考模特，禁止改变。'
}

/** 同主题「精准」反馈的字段集（推理时优先于规则值）；无则返回 null */
export function findAccurateFeedbackFields(theme: string, store: DecomposeFeedbackStore): Record<string, string> | null {
  const t = (theme || '').trim().toLowerCase()
  if (!t) return null
  const exact = findEntryExact(theme, store)
  if (exact?.ok && exact.fields) return exact.fields
  // 宽松匹配：主题前两字包含（如「新中式禅意」↔「新中式高级」）
  const head = t.slice(0, 2)
  if (head) {
    for (const [key, entry] of Object.entries(store)) {
      const k = key.trim().toLowerCase()
      if (entry.ok && entry.fields && (k.includes(head) || t.includes(k.slice(0, 2)))) {
        return entry.fields
      }
    }
  }
  return null
}

// ─── 历史拆解兜底（来自提示词库 sgType=decompose 条目） ───

export interface DecomposeHistoryItem {
  theme: string
  fields: Record<string, string>
}

/** 按主题关键词在历史拆解中找相似条目的字段集（规则未命中时的兜底） */
export function findSimilarHistoryFields(theme: string, history: DecomposeHistoryItem[]): Record<string, string> | null {
  const t = (theme || '').trim()
  if (!t || !history.length) return null
  const kws = t.split(/[·\-/ /]/).map((s) => s.trim()).filter(Boolean)
  const hit = history.find((h) => {
    const ht = (h.theme || '').trim()
    if (!ht) return false
    return ht === t || kws.some((k) => ht.includes(k))
  })
  return hit?.fields || null
}
