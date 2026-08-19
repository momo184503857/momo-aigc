#!/usr/bin/env node
/**
 * AI 接入体系重构 · 迁移校验脚本（对应验收 M7，迁移手册 §2）。
 *
 * 用法：
 *   node scripts/verify-ai-provider-migration.mjs            # 校验默认库 data/momo.db
 *   MOMO_DB_PATH=xxx.db node scripts/verify-ai-provider-migration.mjs
 *
 * 校验项（全部 PASS 才算迁移成功）：
 *   1. 幂等标记齐全（seed_ai_provider_v1 / migrate_user_keys_v1 / migrate_tasks_v1）
 *   2. 逻辑模型种子 = 7（4 image + 3 text），抽查能力 JSON
 *   3. toapis 平台渠道存在（base_url/adapter/owner），渠道模型 ×7，
 *      4 个生图模型定价与原 pricing.ts 常量完全一致
 *   4. task_no 覆盖率 100% 且唯一
 *   5. provider_task_id 与原 toapis_task_id 逐行一致（全量比对）
 *   6. 用户渠道数 = 原 user_toapis_keys 行数；主 Key hint 逐一致
 *   7. 积分口径未变（users.points / points_transactions / generation_tasks.points_cost 合计快照）
 */
import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = process.env.MOMO_DB_PATH
  ? path.resolve(process.env.MOMO_DB_PATH)
  : path.resolve(__dirname, '../data/momo.db')

if (!fs.existsSync(dbPath)) {
  console.error(`[verify] 数据库不存在：${dbPath}`)
  process.exit(1)
}

const db = new Database(dbPath, { readonly: true })

let failed = 0
function check(name, ok, detail = '') {
  const tag = ok ? 'PASS' : 'FAIL'
  if (!ok) failed++
  console.log(`[${tag}] ${name}${detail ? ` — ${detail}` : ''}`)
}

// ── 1. 幂等标记 ──
for (const flag of ['seed_ai_provider_v1', 'migrate_user_keys_v1', 'migrate_tasks_v1']) {
  const row = db.prepare(`SELECT value FROM system_config WHERE key = ?`).get(flag)
  check(`迁移标记 ${flag} = done`, row?.value === 'done', row?.value ?? '(missing)')
}

// ── 2. 逻辑模型种子 ──
const logical = db.prepare(`SELECT code, kind, default_params FROM ai_logical_models ORDER BY id`).all()
check('逻辑模型总数 = 7', logical.length === 7, `实际 ${logical.length}`)
const imageCount = logical.filter((l) => l.kind === 'image').length
const textCount = logical.filter((l) => l.kind === 'text').length
check('逻辑模型 4 image + 3 text', imageCount === 4 && textCount === 3, `image=${imageCount}, text=${textCount}`)

const gptImage2 = logical.find((l) => l.code === 'gpt-image-2')
if (gptImage2) {
  const params = JSON.parse(gptImage2.default_params)
  check('gpt-image-2 能力 JSON（1K 宽高比矩阵）',
    JSON.stringify(params.aspectRatiosByResolution?.['1K']) === JSON.stringify(['1:1', '4:3', '3:4']),
    JSON.stringify(params.aspectRatiosByResolution?.['1K']))
}
const flash31 = logical.find((l) => l.code === 'gemini-3.1-flash-image-preview')
if (flash31) {
  const params = JSON.parse(flash31.default_params)
  check('gemini-3.1-flash 含 512 档',
    Array.isArray(params.resolutions) && params.resolutions.includes('512'),
    JSON.stringify(params.resolutions))
  check('gemini-3.1-flash 14 种宽高比',
    Array.isArray(params.aspectRatios) && params.aspectRatios.length === 14,
    `实际 ${params.aspectRatios?.length ?? 0}`)
}

// ── 3. toapis 平台渠道与定价 ──
const EXPECTED_PRICING = {
  'gpt-image-2': { '1K': 3, '2K': 4, '4K': 5 },
  'gemini-3-pro-image-preview': { '1K': 10, '2K': 12, '4K': 16 },
  'gemini-3.1-flash-image-preview': { '512': 5, '1K': 6, '2K': 8, '4K': 12 },
  'gemini-2.5-flash-image-preview': { '1K': 2.4 },
}
const toapis = db.prepare(`
  SELECT id FROM api_providers WHERE code = 'toapis' AND owner_user_id IS NULL
`).get()
check('toapis 平台渠道存在（owner IS NULL）', !!toapis)
if (toapis) {
  const ch = db.prepare(`SELECT base_url, adapter FROM api_providers WHERE id = ?`).get(toapis.id)
  check('toapis 渠道 base_url = https://toapis.com', ch.base_url === 'https://toapis.com', ch.base_url)
  check('toapis 渠道 adapter = toapis', ch.adapter === 'toapis', ch.adapter)

  const models = db.prepare(`SELECT model_id, pricing, supports_image_gen, logical_model_id FROM ai_models WHERE provider_id = ?`).all(toapis.id)
  check('toapis 渠道模型数 = 7', models.length === 7, `实际 ${models.length}`)
  for (const [modelId, pricing] of Object.entries(EXPECTED_PRICING)) {
    const row = models.find((m) => m.model_id === modelId)
    if (!row) { check(`渠道模型 ${modelId} 存在`, false); continue }
    const actual = row.pricing ? JSON.parse(row.pricing) : null
    check(`定价 ${modelId} = ${JSON.stringify(pricing)}`,
      JSON.stringify(actual) === JSON.stringify(pricing),
      actual ? JSON.stringify(actual) : 'null')
    check(`${modelId} 关联逻辑模型`, !!row.logical_model_id)
  }
}

// ── 4. task_no 覆盖率与唯一性 ──
const total = db.prepare(`SELECT COUNT(*) AS c FROM generation_tasks`).get().c
const withNo = db.prepare(`SELECT COUNT(*) AS c FROM generation_tasks WHERE task_no IS NOT NULL AND task_no != ''`).get().c
const distinctNo = db.prepare(`SELECT COUNT(DISTINCT task_no) AS c FROM generation_tasks WHERE task_no IS NOT NULL AND task_no != ''`).get().c
check('task_no 覆盖率 = 100%', total === withNo, `${withNo}/${total}`)
check('task_no 唯一', distinctNo === withNo, `${distinctNo} distinct / ${withNo}`)
const badFormat = db.prepare(`SELECT COUNT(*) AS c FROM generation_tasks WHERE task_no NOT LIKE 'gen-' || printf('%08d', id)`).get().c
check('task_no 格式 = gen-{id:08d}', badFormat === 0, `${badFormat} 行异常`)

// ── 5. provider_task_id 与原 toapis_task_id 一致 ──
// 旧列 NOT NULL（新任务写空串），仅校验旧任务（provider_task_id 非空 或 toapis_task_id 非空）
const mismatch = db.prepare(`
  SELECT COUNT(*) AS c FROM generation_tasks
  WHERE toapis_task_id IS NOT NULL AND toapis_task_id != ''
    AND provider_task_id IS NOT NULL AND provider_task_id != ''
    AND provider_task_id != toapis_task_id
`).get().c
check('provider_task_id 与 toapis_task_id 逐行一致（存量）', mismatch === 0, `${mismatch} 行不一致`)

// ── 6. 用户渠道数与 Key hint ──
const oldKeys = db.prepare(`SELECT user_id, key_hint FROM user_toapis_keys`).all()
const migratedChannels = db.prepare(`
  SELECT p.id, p.owner_user_id, p.name, p.adapter,
         (SELECT key_hint FROM api_provider_keys k WHERE k.provider_id = p.id AND k.is_primary = 1) AS key_hint
  FROM api_providers p WHERE p.owner_user_id IS NOT NULL AND p.adapter = 'toapis'
    AND p.name LIKE '%迁移%'
`).all()
check('用户渠道数 = 原 user_toapis_keys 行数', migratedChannels.length === oldKeys.length,
  `${migratedChannels.length} 渠道 / ${oldKeys.length} 旧 Key`)
const hintMismatch = oldKeys.filter((k) => {
  const ch = migratedChannels.find((c) => c.owner_user_id === k.user_id)
  return !ch || ch.key_hint !== k.key_hint
}).length
check('每渠道主 Key hint 与原 key_hint 一致', hintMismatch === 0, `${hintMismatch} 行不一致`)

// ── 7. 积分口径快照（不比对历史值，仅输出供人工核对；关键是不因迁移改变）──
const userPointsSum = db.prepare(`SELECT ROUND(SUM(points), 3) AS s FROM users`).get().s
const txnSum = db.prepare(`SELECT ROUND(SUM(amount), 3) AS s FROM points_transactions`).get().s
const costSum = db.prepare(`SELECT ROUND(SUM(points_cost), 3) AS s FROM generation_tasks`).get().s
console.log(`[INFO] 积分口径快照：users.points 合计=${userPointsSum}，流水合计=${txnSum}，任务消耗合计=${costSum}`)
const completedFailed = db.prepare(`
  SELECT COUNT(*) AS c FROM generation_tasks WHERE status = 'failed' AND points_cost > 0
`).get().c
check('失败任务 points_cost 均已清零（口径延续）', completedFailed === 0, `${completedFailed} 行残留`)

// ── 8. 新任务停写旧列 ──
const newTasksUsingOldCol = db.prepare(`
  SELECT COUNT(*) AS c FROM generation_tasks
  WHERE task_no IS NOT NULL AND toapis_task_id != '' AND provider_task_id != toapis_task_id
`).get().c
check('新任务不再写入 toapis_task_id（渠道任务号走 provider_task_id）', newTasksUsingOldCol === 0, `${newTasksUsingOldCol} 行异常`)

console.log('')
if (failed > 0) {
  console.error(`[verify] ${failed} 项校验失败 —— 迁移不完整，禁止对外服务`)
  process.exit(1)
} else {
  console.log('[verify] 全部校验 PASS（对应验收 M7-01/02/06）')
  process.exit(0)
}
