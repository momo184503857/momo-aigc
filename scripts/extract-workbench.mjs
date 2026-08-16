#!/usr/bin/env node
/**
 * 从《女装电商生图工作台 V10.0》单文件 HTML 中提取知识库常量，
 * 生成 suite-gen 种子数据 JSON（server/src/db/data/suiteGenSeed.json）。
 *
 * 用法：node scripts/extract-workbench.mjs <工作台HTML路径>
 * 幂等：直接覆盖输出文件。
 */
import fs from 'node:fs'
import path from 'node:path'

const htmlPath = process.argv[2]
if (!htmlPath || !fs.existsSync(htmlPath)) {
  console.error('用法: node scripts/extract-workbench.mjs <工作台HTML路径>')
  process.exit(1)
}
const html = fs.readFileSync(htmlPath, 'utf-8')

/** 提取顶层 `const NAME=[...];` / `const NAME={...};` 字面量并求值 */
function extractConst(name) {
  const startMark = `const ${name}=`
  const start = html.indexOf(startMark)
  if (start < 0) throw new Error(`未找到 const ${name}`)
  const bodyStart = start + startMark.length
  // 找配对的闭合：从字面量起始字符 [ 或 { 开始做括号配对（忽略字符串内部）
  const open = html[bodyStart]
  const close = open === '[' ? ']' : '}'
  let depth = 0, inStr = null, esc = false
  for (let i = bodyStart; i < html.length; i++) {
    const ch = html[i]
    if (esc) { esc = false; continue }
    if (inStr) {
      if (ch === '\\') esc = true
      else if (ch === inStr) inStr = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue }
    if (ch === open) depth++
    else if (ch === close) {
      depth--
      if (depth === 0) {
        const text = html.slice(bodyStart, i + 1)
        return new Function(`return (${text})`)()
      }
    }
  }
  throw new Error(`const ${name} 括号配对失败`)
}

const THEMES = extractConst('THEMES')
const TRACKS = extractConst('TRACKS')
const MODELS = extractConst('MODELS')
const BASE_LOCK = extractConst('BASE_LOCK')
const PROMPT_TPL = extractConst('PROMPT_TPL')
const FEATURES = extractConst('FEATURES')
const KNOWLEDGE = extractConst('KNOWLEDGE')
const REASON_RULES = extractConst('REASON_RULES')
const EXPAND_DEFAULT = extractConst('EXPAND_DEFAULT')

// ── 赛道 ──
const tracks = Object.entries(TRACKS).map(([key, t]) => ({
  key,
  name: t.name, emoji: t.emoji || '', mood: t.mood || '',
  hair: t.hair || '', light: t.light || '', acc: t.acc || '', hand: t.hand || '',
  sort_order: key.charCodeAt(0) - 64,
}))

// ── 主题 ──
const themes = THEMES.map((t, i) => ({
  name: t.name, track_key: t.track, season: t.season || 'all',
  level: t.level || 'M', path: t.path || '',
  points: Array.isArray(t.points) ? t.points : [],
  sort_order: i + 1,
}))
const expandThemes = EXPAND_DEFAULT.map((t, i) => ({
  name: t.name, track_key: t.track, season: t.season || 'all',
  level: t.level || 'M', path: t.path || '',
  points: Array.isArray(t.points) ? t.points : [],
  sort_order: 1000 + i + 1,
}))

// ── 模特人设（剥离 base64 头像，DNA 由结构化字段拼装）──
function composeDna(m) {
  const parts = []
  if (m.age) parts.push(`年龄气质：${m.age}`)
  if (m.face) parts.push(`面部特征：${m.face}`)
  if (m.skin) parts.push(`肤色肤质：${m.skin}`)
  if (m.body) parts.push(`体态身形：${m.body}`)
  if (m.hair) parts.push(`发型妆造：${m.hair}`)
  if (m.desc) parts.push(`整体气质：${m.desc}`)
  return parts.join('\n')
}
const personas = MODELS
  .filter((m) => m && m.id && m.name)
  .map((m) => ({
    name: m.name, dna: composeDna(m), hair_default: m.hair || '',
    note: `来源：工作台内置模特 ${m.id}（${m.name}）`,
  }))

// ── 锁定模板（BASE_LOCK + PROMPT_TPL → 结构化条目）──
const lockJoin = (arr) => (Array.isArray(arr) ? arr.join('\n') : String(arr || ''))
const baseLockLines = Array.isArray(BASE_LOCK) ? BASE_LOCK : []
const lockTemplates = [
  { key: 'base.lock', name: '底层机位锁定', grp: 'quality', order_no: 20, content: baseLockLines[0] || '', scope: ['suite'] },
  { key: 'garment.restore', name: '服装还原锁定', grp: 'garment', order_no: 60, content: baseLockLines[1] || '', scope: ['suite', 'fusion'] },
  { key: 'garment.acc-lock', name: '配饰保留锁定', grp: 'garment', order_no: 70, content: lockJoin(baseLockLines.slice(2, 4)), scope: ['suite', 'fusion'] },
  { key: 'garment.structure-lock', name: '结构细节锁定', grp: 'garment', order_no: 80, content: baseLockLines[4] || '', scope: ['suite'] },
  { key: 'garment.color-lock', name: '色彩锁定', grp: 'garment', order_no: 90, content: baseLockLines[5] || '', scope: ['suite', 'fusion', 'swap'] },
  { key: 'neg.hand', name: '手部结构锁定', grp: 'negative', order_no: 940, content: baseLockLines[6] || '', scope: ['suite', 'fusion', 'swap'] },
  { key: 'quality.clean', name: '画面纯净', grp: 'quality', order_no: 950, content: baseLockLines[7] || '', scope: ['suite', 'fusion', 'swap'] },
  { key: 'scene.style-isolation', name: '风格隔离', grp: 'scene', order_no: 300, content: baseLockLines[8] || '', scope: ['suite'] },
  { key: 'scene.continuity', name: '空间连续性', grp: 'scene', order_no: 310, content: baseLockLines[9] || '', scope: ['suite'] },
  { key: 'scene.unify', name: '全套统一锁定', grp: 'scene', order_no: 320, content: baseLockLines[10] || '', scope: ['suite'] },
  { key: 'identity.single', name: '单人构图强制', grp: 'identity', order_no: 105, content: PROMPT_TPL.singlePerson || '', scope: ['suite', 'fusion', 'swap'] },
  { key: 'identity.real-skin', name: '真实感去AI化·肤质', grp: 'identity', order_no: 110, content: PROMPT_TPL.realSkin || '', scope: ['suite', 'fusion', 'swap'] },
  { key: 'identity.real-hair', name: '发型写实', grp: 'identity', order_no: 115, content: PROMPT_TPL.realHair || '', scope: ['suite', 'fusion', 'swap'] },
  { key: 'identity.real-makeup', name: '妆容写实', grp: 'identity', order_no: 120, content: PROMPT_TPL.realMakeup || '', scope: ['suite', 'fusion', 'swap'] },
  { key: 'garment.ref-bind', name: '参考图绑定', grp: 'garment', order_no: 65, content: PROMPT_TPL.refBind || '', cond_kind: 'refimg', scope: ['suite', 'fusion', 'swap'] },
  { key: 'neg.scene-reality', name: '场景真实性约束', grp: 'negative', order_no: 955, content: lockJoin(PROMPT_TPL.sceneReality), scope: ['suite', 'fusion'] },
  { key: 'neg.outdoor', name: '户外场景硬约束', grp: 'negative', order_no: 960, content: lockJoin(PROMPT_TPL.outdoorLocks), cond_kind: 'outdoor', scope: ['suite'] },
  { key: 'neg.flora', name: '季节植被合理性', grp: 'negative', order_no: 965, content: lockJoin(PROMPT_TPL.seasonalFloraLocks), cond_kind: 'points', scope: ['suite'] },
  { key: 'pose.progress', name: '点位递进', grp: 'pose', order_no: 700, content: PROMPT_TPL.poseProgress || '', scope: ['suite'] },
  { key: 'quality.post', name: '后期质感', grp: 'quality', order_no: 980, content: PROMPT_TPL.postQuality || '', scope: ['suite', 'fusion', 'swap'] },
  { key: 'fidelity.base', name: '保真基底约束', grp: 'fidelity', order_no: 50, content: '【原图保真·绝对基底】本图以上传的优质电商主图为绝对基底：场景、光影、姿态、构图、机位、景别、色调 100% 保留，禁止任何改动。仅替换人物的脸型/五官、发型妆造、服装，其余一切（背景物体、道具、画面裁切、人物站位与动作）与原图完全一致。生成策略为「重拍而非换图」：如同让新模特在同一场拍摄、同一机位重拍一遍。', scope: ['swap'] },
  { key: 'fusion.bind', name: '融合三向绑定', grp: 'fusion', order_no: 40, content: '【融合三向绑定】场景/风格/构图以上传的电商主图为基准（主图作为最高权重参考）；人物面部以所选模特人设 DNA 为基准（防漂移）；服装版型/面料/印花以上传的服装参考图为基准。三者各安其位，禁止交叉污染。', scope: ['fusion'] },
].filter((l) => l.content)

// ── 服装特征速选 ──
const grpMap = { style: 'style', shape: 'shape', fabric: 'fabric', element: 'element', accessory: 'accessory' }
const grpName = { style: '风格', shape: '版型', fabric: '面料', element: '设计元素', accessory: '自带配饰' }
const garmentFeatures = []
Object.entries(FEATURES).forEach(([grp, items]) => {
  const g = grpMap[grp] || grp
  ;(items || []).forEach((it, idx) => {
    garmentFeatures.push({
      grp: g, name: it.id || it.name || String(it),
      match_tags: (it.txt || '').split(/[\/、,，]/).map((s) => s.trim()).filter(Boolean),
      detail_hint: it.txt || '',
      sort_order: idx + 1,
    })
  })
})

// ── 拆解知识：18 维选项 + 推理规则 + 智能匹配规则 ──
const knowledge = Object.entries(KNOWLEDGE).map(([field, opts]) => ({
  kind: 'field_options', field,
  content: opts,
}))
REASON_RULES.forEach((r, i) => {
  knowledge.push({ kind: 'reason_rule', field: `rule_${i + 1}`, content: r })
})
// 智能匹配规则（手写：特征标签/色系 → 赛道亲和度）
knowledge.push({
  kind: 'match_rule', field: 'tag_affinity',
  content: {
    // 特征(小写包含匹配) → {赛道: 分值}
    '新中式': { A: 10 }, '国风': { A: 10 }, '旗袍': { A: 8 }, '香云纱': { A: 8 }, '盘扣': { A: 6 }, '刺绣': { A: 5, E: 2 },
    '度假': { B: 10 }, '棉麻': { B: 7, A: 3 }, '文艺': { B: 8 }, '肌理': { B: 5 },
    '都市': { C: 10 }, '休闲': { C: 8 }, '慵懒': { C: 7 }, '牛仔': { C: 6 }, '针织': { C: 5, F: 5 },
    '极简': { D: 10 }, '通勤': { D: 8, G: 6 }, '纯色': { D: 7 }, '垂感': { D: 6 },
    '法式': { E: 10 }, '田园': { E: 9 }, '蕾丝': { E: 8 }, '碎花': { E: 8 },
    '成熟': { F: 10 }, '优雅': { F: 9 }, '知性': { F: 8, G: 5 }, '端庄': { F: 8 },
    '职场': { G: 10 }, '西装': { G: 8 }, '衬衫': { G: 6, D: 3 },
  },
})
knowledge.push({
  kind: 'match_rule', field: 'color_affinity',
  content: {
    // 色系 → {赛道: 分值}
    '绿色系': { A: 6, B: 3 }, '大地色系': { A: 4, B: 5, F: 3 }, '蓝色系': { B: 5, D: 4 },
    '白色系': { D: 6, E: 4 }, '红色系': { E: 5, F: 4 }, '粉色系': { E: 7 }, '紫色系': { E: 4, F: 3 },
    '黑灰色系': { D: 6, C: 4 }, '黄色系': { B: 5, E: 3 }, '棕色系': { A: 5, B: 4, F: 4 },
  },
})

const seed = {
  _meta: {
    source: '女装电商生图工作台 V10.0（2026-08-11 快照）',
    extractedAt: new Date().toISOString(),
    counts: {
      themes: themes.length, tracks: tracks.length, personas: personas.length,
      lockTemplates: lockTemplates.length, garmentFeatures: garmentFeatures.length,
      knowledge: knowledge.length,
    },
  },
  tracks, themes: [...themes, ...expandThemes], personas, lockTemplates, garmentFeatures, knowledge,
}

const outDir = path.resolve(process.cwd(), 'server/src/db/data')
fs.mkdirSync(outDir, { recursive: true })
const outPath = path.join(outDir, 'suiteGenSeed.json')
fs.writeFileSync(outPath, JSON.stringify(seed, null, 1), 'utf-8')
console.log('已生成', outPath)
console.log('统计:', JSON.stringify(seed._meta.counts))
// 校验：主题点位必须是 5
const bad = themes.filter((t) => t.points.length !== 5)
if (bad.length) { console.error('警告：以下主题点位数不为5：', bad.map((t) => t.name).join('、')); process.exit(2) }
console.log('校验通过：全部主题点位数 = 5')
