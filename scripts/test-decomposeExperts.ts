/**
 * 原版拆解（18 项）补齐功能单元测试：
 * 4 专家组装 / 反馈闭环（精准字段优先 + 需修正注入）/ 历史相似主题兜底 / 字段规格。
 * 运行：npx tsx scripts/test-decomposeExperts.ts
 */
import {
  DECOMPOSE_EXPERTS, buildFeedbackFixes, findAccurateFeedbackFields, findSimilarHistoryFields,
  type DecomposeFeedbackStore, type DecomposeHistoryItem,
} from '../src/utils/decomposeExperts'
import { DECOMPOSE_FIELDS, filledSections } from '../src/utils/decomposeSpec'

let passed = 0
let failed = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`  ✅ ${name}`) }
  else { failed++; console.error(`  ❌ ${name}${detail ? ' — ' + detail : ''}`) }
}

console.log('── 字段规格 ──')
check('共 18 项', DECOMPOSE_FIELDS.length === 18, `实际 ${DECOMPOSE_FIELDS.length}`)
check('16 项下拉 + 2 项文本',
  DECOMPOSE_FIELDS.filter((f) => f.kind === 'select').length === 16
  && DECOMPOSE_FIELDS.filter((f) => f.kind === 'text').length === 2)
check('不含移植尾巴字段（post / advantage）',
  !DECOMPOSE_FIELDS.some((f) => f.key === 'post' || f.key === 'advantage'))
check('key 无重复', new Set(DECOMPOSE_FIELDS.map((f) => f.key)).size === 18)

console.log('── filledSections ──')
const full: Record<string, string> = {}
for (const f of DECOMPOSE_FIELDS) full[f.key] = `值-${f.key}`
const secs = filledSections(full)
check('全填 → 18 行', secs.length === 18)
check('行格式为【标签】值', secs[0] === `【${DECOMPOSE_FIELDS[0].label}】值-theme`, secs[0])
check('空值跳过', filledSections({ theme: '新中式', scene: '  ' }).length === 1)

console.log('── 4 专家组装 ──')
const engineer = DECOMPOSE_EXPERTS.find((e) => e.id === 'engineer')!
const image = DECOMPOSE_EXPERTS.find((e) => e.id === 'image')!
const architect = DECOMPOSE_EXPERTS.find((e) => e.id === 'architect')!
const master = DECOMPOSE_EXPERTS.find((e) => e.id === 'master')!
check('四种策略齐全', DECOMPOSE_EXPERTS.length === 4 && [engineer, image, architect, master].every(Boolean))
const pe = engineer.build(full)
const pi = image.build(full)
const pa = architect.build(full)
const pm = master.build(full)
check('工程专家：锁定指令 + 负向约束 + 全部拆解段', pe.includes('【锁定指令】') && pe.includes('【负向约束】') && pe.includes('【道具】值-props'))
check('图像工程师：镜头参数引用 lens 字段', pi.includes('【镜头参数】值-lens'))
check('图像工程师：params 含色温时透传', image.build({ ...full, params: 'ISO 100 / 色温 4800K' }).includes('4800K'))
check('架构师：五层分层 + 光层含光影字段', pa.includes('第一层 · 人') && pa.includes('【第四层 · 光】【光影系统】值-light'))
check('Master：14 段英文框架 + garment 进 Clothing', pm.includes('[Style Theme]') && pm.includes('[Clothing] 值-garment'))
check('Master：atmosphere 并入 Style 段', master.build(full).includes('，氛围：值-atmosphere'))

console.log('── 部分填写不崩 ──')
const onlyTheme = { theme: '法式田园' }
check('仅填主题：四种策略均可组装', [engineer, image, architect, master].every((e) => e.build(onlyTheme).length > 0))
check('仅填主题：图像工程师用默认色温', image.build(onlyTheme).includes('5200K'))

console.log('── 反馈闭环 ──')
const fbStore: DecomposeFeedbackStore = {
  'Boho Chic': { ok: false, fields: { theme: 'Boho Chic' }, at: 1 },
  '新中式高级': { ok: true, fields: { theme: '新中式高级', light: '精准-光影' }, at: 2 },
}
check('同主题「需修正」→ 注入修正指令', buildFeedbackFixes('boho chic', fbStore).includes('【历史修正】'))
check('同主题「精准」→ 无修正指令', buildFeedbackFixes('新中式高级', fbStore) === '')
check('无反馈记录 → 空串', buildFeedbackFixes('未知主题', fbStore) === '')
const acc1 = findAccurateFeedbackFields('新中式高级', fbStore)
check('精准字段：精确主题命中', acc1?.light === '精准-光影')
check('精准字段：宽松匹配（前两字）', findAccurateFeedbackFields('新中式禅意', fbStore)?.light === '精准-光影')
check('精准字段：仅「需修正」记录不命中', findAccurateFeedbackFields('Boho Chic', fbStore) === null)

console.log('── 历史拆解兜底 ──')
const history: DecomposeHistoryItem[] = [
  { theme: '法式温柔田园', fields: { theme: '法式温柔田园', scene: '历史-场景' } },
  { theme: '极简通勤', fields: { theme: '极简通勤' } },
]
check('关键词命中相似历史（新中式→无 / 法式田园→法式温柔田园）',
  findSimilarHistoryFields('法式 田园 度假', history)?.scene === '历史-场景')
check('分隔符拆词命中（· / - / 空格）', findSimilarHistoryFields('复古·法式', history)?.scene === '历史-场景')
check('完全无相似 → null', findSimilarHistoryFields('赛博朋克', history) === null)
check('空历史 → null', findSimilarHistoryFields('法式', []) === null)

console.log(`\n结果：${passed} 通过，${failed} 失败`)
process.exit(failed ? 1 : 0)
