/**
 * P0 分模型基线话术 v0 入库（幂等：system_config.seed_sg_p0_v1）。
 *
 * 策略（v0，待真实生图校准）：
 * - gpt-image-2：指令遵循强，对「禁止X」负面句式遵循可靠 → 显式收录工作台原文风格
 * - Gemini 系：对长负面列表的遵循度弱、且超长模板会稀释注意力 → 改写为正向表述 + 压缩篇幅
 *
 * 运行：npx tsx scripts/seed-p0-baselines.ts
 */
import Database from 'better-sqlite3'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const db = new Database(path.resolve(__dirname, '../server/data/momo.db'))

const GPT = ['gpt-image-2']
const GEMINI = ['gemini-3-pro-image-preview', 'gemini-3.1-flash-image-preview', 'gemini-2.5-flash-image-preview']

const baselines: Array<{ key: string; name: string; grp: string; order_no: number; content: string; models: string[]; note: string }> = [
  {
    key: 'garment.color-lock', name: '色彩锁定（Gemini 正向版）', grp: 'garment', order_no: 90, models: GEMINI,
    content: '【色彩锁定】服装色彩必须逐区域复刻参考图：色相、饱和度、明度与参考图完全一致，印花配色原样呈现，成图色彩即参考图色彩。',
  },
  {
    key: 'garment.color-lock', name: '色彩锁定（GPT 版）', grp: 'garment', order_no: 90, models: GPT,
    content: '【色彩锁定】严格100%原样还原参考服装色彩与印花，禁止AI自动调色、禁止色相漂移、禁止饱和度改变、禁止色彩替换。',
  },
  {
    key: 'neg.hand', name: '手部结构（Gemini 正向版）', grp: 'negative', order_no: 940, models: GEMINI,
    content: '【手部结构】双手均为解剖结构正确的自然人手：每只手完整呈现五根手指，指节自然弯曲，手腕角度合理，手部清晰可辨。',
  },
  {
    key: 'neg.hand', name: '手部结构（GPT 版）', grp: 'negative', order_no: 940, models: GPT,
    content: '【手部结构锁定】自然人手，标准5根手指，骨骼结构正常。禁止六指、禁止手指交错扭曲、禁止手掌反转、禁止手腕折断。',
  },
  {
    key: 'garment.acc-lock', name: '配饰保留（Gemini 正向版）', grp: 'garment', order_no: 70, models: GEMINI,
    content: '【配饰保留】参考服装自带的全部配饰（丝巾、项链、耳饰、腰带、盘扣、流苏等）在图中完整原样呈现：款式、颜色、位置与参考图一致；额外搭配道具仅限指定的1-2件。',
  },
  {
    key: 'garment.acc-lock', name: '配饰保留（GPT 版）', grp: 'garment', order_no: 70, models: GPT,
    content: '【配饰保留锁定】参考服装自带的全部配饰（丝巾、项链、耳饰、腰带、发饰、盘扣、流苏等）必须100%原样保留呈现，禁止删减、禁止更换款式与颜色。额外搭配道具仅限指定1-2件。【规则澄清】「禁止丝巾披肩」仅指禁止额外添加，服装自带的丝巾必须完整保留呈现。',
  },
  {
    key: 'identity.real-skin', name: '去AI化肤质（Gemini 压缩版）', grp: 'identity', order_no: 110, models: GEMINI,
    content: '【肤质】真实人像皮肤：保留毛孔与细纹的自然肌理，皮肤有通透质感，呈现实拍商业人像效果。',
  },
  {
    key: 'garment.restore', name: '服装还原（Gemini 压缩版）', grp: 'garment', order_no: 60, models: GEMINI,
    content: '【服装还原】服装以参考图为唯一基准：版型、面料纹理、色彩、印花与结构细节逐项一致，各部位比例准确。',
  },
]

const cfg = db.prepare(`SELECT value FROM system_config WHERE key = 'seed_sg_p0_v1'`).get() as { value: string } | undefined
if (cfg?.value === 'done') {
  console.log('[P0] 分模型基线话术已入库（幂等跳过）')
} else {
  const ins = db.prepare(`
    INSERT INTO sg_lock_templates (owner_user_id, key, name, grp, order_no, content, cond_kind, models, scope, source)
    VALUES (NULL, ?, ?, ?, ?, ?, 'none', ?, ?, 'admin')
  `)
  const tx = db.transaction(() => {
    for (const b of baselines) {
      ins.run(b.key, b.name, b.grp, b.order_no, b.content, JSON.stringify(b.models), JSON.stringify(['suite', 'fusion', 'swap']))
    }
    db.prepare(`INSERT INTO system_config (key, value) VALUES ('seed_sg_p0_v1', 'done')
                ON CONFLICT(key) DO UPDATE SET value = 'done'`).run()
  })
  tx()
  console.log(`[P0] 已入库 ${baselines.length} 条分模型基线话术（v0，待实测校准）`)
}

// 校验：每个模型都能解析到专属版
const rows = db.prepare('SELECT key, models FROM sg_lock_templates WHERE owner_user_id IS NULL').all() as any[]
for (const m of [...GPT, ...GEMINI]) {
  const colorRows = rows.filter((r) => r.key === 'garment.color-lock' && JSON.parse(r.models || '[]').includes(m))
  console.log(`  ${m}: 色彩锁可用版本 ${colorRows.length} 个`)
}
db.close()
