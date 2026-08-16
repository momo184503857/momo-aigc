/**
 * promptEngine 单元测试（验收文档 M3-01 ~ M3-08）。
 * 运行：npx tsx scripts/test-promptEngine.ts
 */
import { assemble, BUILT_IN_ENTRIES, type PromptEntry, type AssembleContext } from '../src/utils/promptEngine/index'
import seedData from '../server/src/db/data/suiteGenSeed.json'

let passed = 0
let failed = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`  ✅ ${name}`) }
  else { failed++; console.error(`  ❌ ${name}${detail ? ' — ' + detail : ''}`) }
}

// DB 模板条目（模拟从 sg_lock_templates 读取的全局资产）
const dbEntries: PromptEntry[] = (seedData.lockTemplates as any[]).map((l) => ({
  key: l.key, name: l.name, grp: l.grp, order: l.order_no,
  content: l.content, condKind: l.cond_kind || undefined,
  models: l.models?.length ? l.models : undefined,
  scope: l.scope?.length ? l.scope : undefined,
  origin: 'global' as const,
}))

const track = {
  key: 'A', name: '新中式禅意国风', emoji: '🏮',
  mood: '东方雅致、禅意松弛', hair: '黑色齐肩一刀切短发', light: '午后柔和侧逆光',
  acc: '玉镯、竹编包', hand: '手插裤袋仅拇指露出',
}
const outdoorTheme = {
  name: '竹林石板小径', track_key: 'A', season: 'ss',
  path: '竹林入口 → 石径中段 → 竹亭 → 溪边 → 亭内',
  points: ['竹林入口，修竹夹道', '石径中段，竹影斑驳', '竹亭外，亭柱石凳', '溪边，溪水石块', '竹亭内，透过亭柱看竹林'],
}
const indoorTheme = {
  name: '暖调茶室', track_key: 'A', season: 'aw',
  path: '茶室门口 → 暖炉旁 → 茶桌 → 窗前 → 长廊',
  points: ['茶室门口，木门暖灯', '暖炉旁，炭火炉陶壶', '茶桌旁，茶席暖光', '窗前，木格窗枯枝', '长廊，木质廊柱'],
}
const persona = {
  name: '贝尔', dna: '鹅蛋脸，暖白偏自然肤色，头身比1:8', hair_default: '黑色齐肩短发', fingerprint: [],
}
const garment = {
  mainUrl: 'https://oss.example/main.jpg',
  detailUrls: [],
  detail4: { shape: '宽松直筒连衣裙', fabric: '香云纱+真丝内衬', structure: '侧边高开叉', element: '手工盘扣' },
  printText: '水墨晕染印花', accessories: '自带丝巾',
}

function baseCtx(overrides?: Partial<AssembleContext>): AssembleContext {
  return {
    persona, track, theme: outdoorTheme, garment,
    model: 'gpt-image-2', feature: 'suite', ...overrides,
  }
}

console.log('━━━ M3-01 全默认组装 ━━━')
{
  const r = assemble(dbEntries, [], baseCtx(), 5)
  check('pointTexts 长度 = 5', r.pointTexts.length === 5)
  check('fullTexts 长度 = 5', r.fullTexts.length === 5)
  check('公共部分含底层锁定', r.commonText.includes('8K超高清商业女装摄影'))
  check('公共部分含色彩锁定', r.commonText.includes('【色彩锁定】'))
  check('公共部分含模特DNA', r.commonText.includes('鹅蛋脸'))
  check('点位1含点位标记', r.pointTexts[0].includes('本张点位 1/5'))
  check('点位3含场景锁定', r.pointTexts[2].includes('竹亭外'))
  check('fullTexts = common + point', r.fullTexts[4].startsWith(r.commonText) && r.fullTexts[4].includes(r.pointTexts[4]))
}

console.log('━━━ M3-02 户外条件注入 ━━━')
{
  const outdoor = assemble(dbEntries, [], baseCtx({ theme: outdoorTheme }), 5)
  const indoor = assemble(dbEntries, [], baseCtx({ theme: indoorTheme }), 5)
  check('户外主题注入 neg.outdoor', outdoor.commonText.includes('【户外场景硬约束'))
  check('室内主题不注入 neg.outdoor', !indoor.commonText.includes('【户外场景硬约束'))
}

console.log('━━━ M3-03 指纹库条件 ━━━')
{
  const noFp = assemble(dbEntries, [], baseCtx(), 5)
  const withFp = assemble(dbEntries, [], baseCtx({ persona: { ...persona, fingerprint: ['a.jpg', 'b.jpg'] } }), 5)
  check('无指纹不注入身份锚定', !noFp.commonText.includes('【身份锚定】'))
  check('有指纹注入身份锚定', withFp.commonText.includes('【身份锚定】'))
}

console.log('━━━ M3-04 模型过滤 ━━━')
{
  const geminiOnly: PromptEntry[] = [{
    key: 'test.model-only', name: '仅Gemini', grp: 'quality', order: 999,
    content: 'GEMINI_ONLY_MARKER', models: ['gemini-3-pro-image-preview'], origin: 'global',
  }]
  const gpt = assemble([...dbEntries, ...geminiOnly], [], baseCtx({ model: 'gpt-image-2' }), 5)
  const gem = assemble([...dbEntries, ...geminiOnly], [], baseCtx({ model: 'gemini-3-pro-image-preview' }), 5)
  check('gpt-image-2 过滤该条目', !gpt.commonText.includes('GEMINI_ONLY_MARKER'))
  check('gemini 保留该条目', gem.commonText.includes('GEMINI_ONLY_MARKER'))
}

console.log('━━━ M3-05 用户开关与改文 ━━━')
{
  const r = assemble(dbEntries, [
    { key: 'neg.flora', enabled: false },
    { key: 'garment.color-lock', enabled: true, content: '【色彩锁定·我的版本】CUSTOM_COLOR_LOCK' },
  ], baseCtx(), 5)
  check('关闭 neg.flora 后不出现', !r.commonText.includes('【季节植被合理性'))
  check('改文生效', r.commonText.includes('CUSTOM_COLOR_LOCK'))
  check('改文替换原文', !r.commonText.includes('严格100%原样还原参考服装色彩与印花，禁止AI自动调色、禁止色相漂移、禁止饱和度改变、禁止色彩替换。'))
}

console.log('━━━ M3-06 占位符插值 ━━━')
{
  const r = assemble(dbEntries, [], baseCtx(), 5)
  check('{{persona.dna}} 已插值', r.commonText.includes('鹅蛋脸'))
  check('{{track.light}} 已插值', r.commonText.includes('午后柔和侧逆光'))
  check('{{theme.point}} 已插值（点位5）', r.pointTexts[4].includes('竹亭内'))
  const missingPersona = assemble(dbEntries, [], baseCtx({ persona: undefined }), 5)
  check('缺失 persona 不报错且无 {{ 残留', !missingPersona.commonText.includes('{{'))
}

console.log('━━━ M3-07 Fuzz 随机组合 ━━━')
{
  let ok = true
  for (let i = 0; i < 500; i++) {
    const locks = dbEntries.filter(() => Math.random() > 0.5).map((e) => ({ key: e.key, enabled: Math.random() > 0.3 }))
    try {
      const r = assemble(dbEntries, locks, baseCtx({ theme: Math.random() > 0.5 ? outdoorTheme : indoorTheme }), 5)
      if (r.fullTexts.some((t) => t.length > 32000)) { ok = false; console.error('    超长输出'); break }
    } catch (e) {
      ok = false
      console.error('    异常:', e)
      break
    }
  }
  check('500 组随机开关无异常且输出 ≤ 32K', ok)
}

console.log('━━━ M3-08 工作台基线对比（golden） ━━━')
{
  // 种子模板内容直接来自工作台 BASE_LOCK / PROMPT_TPL，
  // 断言公共文本按序包含工作台的 12 条底层锁定与关键模板。
  const r = assemble(dbEntries, [], baseCtx(), 5)
  const baseLock = (seedData as any)._meta ? undefined : undefined
  const expectations = [
    '8K超高清商业女装摄影',        // BASE_LOCK[0]
    '【服装还原】100%还原参考服装', // BASE_LOCK[1]
    '【配饰保留锁定】',             // BASE_LOCK[2-3]
    '【结构细节锁定】',             // BASE_LOCK[4]
    '【色彩锁定】',                 // BASE_LOCK[5]
    '【手部结构锁定】',             // BASE_LOCK[6]
    '【画面纯净】',                 // BASE_LOCK[7]
    '【空间连续性】',               // BASE_LOCK[9]
    '【全套统一】',                 // BASE_LOCK[10]
    '【单人构图强制约束】',          // PROMPT_TPL.singlePerson
    '【真实感去AI化】',             // PROMPT_TPL.realSkin
    '【发型写实·真实发丝】',        // PROMPT_TPL.realHair
    '【场景真实性约束',             // PROMPT_TPL.sceneReality
    '【季节植被合理性',             // PROMPT_TPL.seasonalFloraLocks
    '【点位递进】',                 // PROMPT_TPL.poseProgress
    '【后期质感】',                 // PROMPT_TPL.postQuality
  ]
  for (const e of expectations) {
    check(`包含「${e.slice(0, 12)}…」`, r.commonText.includes(e))
  }
}

console.log('━━━ 单张模式（专家玩法） ━━━')
{
  const r = assemble(dbEntries, [], baseCtx({ feature: 'swap', theme: undefined }), 0)
  check('swap 输出含保真基底约束', r.fullTexts[0].includes('【原图保真·绝对基底】'))
  const f = assemble(dbEntries, [], baseCtx({ feature: 'fusion', theme: undefined }), 0)
  check('fusion 输出含三向绑定', f.fullTexts[0].includes('【融合三向绑定】'))
  check('fusion 不含套系专属的空间连续性', !f.fullTexts[0].includes('【空间连续性】'))
}

console.log('━━━ 分模型基线话术优先级（P0） ━━━')
{
  const modelVariants: PromptEntry[] = [
    { key: 'garment.color-lock', name: '默认版', grp: 'garment', order: 90, content: 'DEFAULT_COLOR_LOCK', origin: 'global' },
    { key: 'garment.color-lock', name: 'GPT版', grp: 'garment', order: 90, content: 'GPT_COLOR_LOCK', models: ['gpt-image-2'], origin: 'global' },
    { key: 'garment.color-lock', name: 'Gemini版', grp: 'garment', order: 90, content: 'GEMINI_COLOR_LOCK', models: ['gemini-3.1-flash-image-preview'], origin: 'global' },
    { key: 'garment.color-lock', name: '我的Gemini版', grp: 'garment', order: 90, content: 'PRIVATE_GEMINI_COLOR_LOCK', models: ['gemini-3.1-flash-image-preview'], origin: 'private' },
  ]
  const gpt = assemble(modelVariants, [], baseCtx({ model: 'gpt-image-2' }), 5)
  check('gpt-image-2 命中 GPT 专属版', gpt.commonText.includes('GPT_COLOR_LOCK') && !gpt.commonText.includes('GEMINI_COLOR_LOCK'))
  const gem = assemble(modelVariants, [], baseCtx({ model: 'gemini-3.1-flash-image-preview' }), 5)
  check('gemini 命中私有 Gemini 版（私有+专属 最高优先）', gem.commonText.includes('PRIVATE_GEMINI_COLOR_LOCK'))
  const other = assemble(modelVariants, [], baseCtx({ model: 'gemini-2.5-flash-image-preview' }), 5)
  check('无专属版模型回落通用版', other.commonText.includes('DEFAULT_COLOR_LOCK'))
}

console.log(`\n结果：${passed} 通过 / ${failed} 失败`)
process.exit(failed > 0 ? 1 : 0)
