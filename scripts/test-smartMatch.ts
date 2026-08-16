/** smartMatch 规则引擎验收测试（M2-20~22）：npx tsx scripts/test-smartMatch.ts */
import { matchPlan } from '../src/utils/smartMatch'
import seed from '../server/src/db/data/suiteGenSeed.json'

const rules = { tag_affinity: {}, color_affinity: {} } as { tag_affinity: Record<string, any>, color_affinity: Record<string, any> }
for (const k of seed.knowledge as any[]) {
  if (k.kind === 'match_rule' && k.field === 'tag_affinity') Object.assign(rules.tag_affinity, k.content)
  if (k.kind === 'match_rule' && k.field === 'color_affinity') Object.assign(rules.color_affinity, k.content)
}
const tracks = (seed.tracks as any[]).map((t) => ({ key: t.key, name: t.name, use_count: 0 }))
const themes = (seed.themes as any[]).map((t) => ({ name: t.name, track_key: t.track_key, season: t.season, use_count: 0 }))

let failed = 0
function check(name: string, cond: boolean, detail?: unknown) {
  console.log(`${cond ? '✅' : '❌'} ${name}`, cond ? '' : detail ?? '')
  if (!cond) failed++
}

const r1 = matchPlan(tracks, themes, ['新中式', '香云纱', '刺绣'], '绿色系', rules)
check('M2-20 新中式特征 → 推荐含新中式赛道', r1.some((p) => p.track.name.includes('新中式')), r1.map((p) => p.track.name))
check('M2-20 推荐理由含命中特征', r1[0].reason.length > 0, r1[0].reason)
check('M2-20 每赛道 2 主题', r1.every((p) => p.themes.length <= 2 && p.themes.length > 0))

const r2 = matchPlan(tracks, themes, ['法式', '蕾丝', '碎花'], '粉色系', rules)
check('M2-21 法式特征 → 推荐含法式赛道', r2.some((p) => p.track.name.includes('法式')))

const r3 = matchPlan(tracks, themes, [], '', rules)
check('M2-22 无特征仍有 6 卡片方案（3赛道×2主题）', r3.length === 3 && r3.every((p) => p.themes.length === 2), r3.map((p) => p.themes.length))
check('M2-22 全部主题点位完整（5点）', r3.every((p) => p.themes.every((t) => (seed.themes as any[]).find((s) => s.name === t.name)?.points?.length === 5)))

console.log(failed === 0 ? '\n全部通过' : `\n${failed} 项失败`)
process.exit(failed === 0 ? 0 : 1)
