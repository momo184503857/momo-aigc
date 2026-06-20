// 一次性补退：所有 status='failed' 且 points_cost>0 的历史任务，按「失败不扣费」规则退还。
// 幂等：只处理 points_cost>0 的；已退过的（=0）自动跳过，可安全重复执行。
//
// 用法：
//   node scripts/refund-failed-tasks.mjs            # DRY RUN，只预览，不写入
//   APPLY=1 node scripts/refund-failed-tasks.mjs     # 实际执行
import Database from 'better-sqlite3'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = process.env.DB_PATH
  ? path.resolve(process.cwd(), process.env.DB_PATH)
  : path.resolve(__dirname, '../server/data/momo.db')
const DRY_RUN = !process.env.APPLY

const db = new Database(dbPath, { readonly: DRY_RUN })
if (!DRY_RUN) db.pragma('journal_mode = WAL')

const tasks = db.prepare(`
  SELECT id, user_id, points_cost
  FROM generation_tasks
  WHERE status = 'failed' AND points_cost > 0
  ORDER BY id
`).all()

const byUser = new Map()
let total = 0
for (const t of tasks) {
  total += t.points_cost
  byUser.set(t.user_id, (byUser.get(t.user_id) || 0) + t.points_cost)
}

console.log(`模式：${DRY_RUN ? 'DRY RUN（预览，不写入）' : 'APPLY（实际写入）'}`)
console.log(`待退款失败任务：${tasks.length} 笔，合计 ${total} 积分（≈¥${(total * 0.035).toFixed(2)}），涉及 ${byUser.size} 个用户`)
for (const [uid, amt] of byUser) {
  const u = db.prepare('SELECT username FROM users WHERE id = ?').get(uid)
  console.log(`  用户 ${uid}${u ? `(${u.username})` : '(已删除)'}: ${amt} 积分（≈¥${(amt * 0.035).toFixed(2)}）`)
}

if (DRY_RUN) {
  console.log('\n确认无误后执行：APPLY=1 node scripts/refund-failed-tasks.mjs')
  process.exit(0)
}

const refundOne = db.transaction((t) => {
  const user = db.prepare('SELECT points FROM users WHERE id = ?').get(t.user_id)
  if (!user) { console.log(`  跳过任务 ${t.id}：用户 ${t.user_id} 不存在`); return }
  const newBalance = Math.round(((Number(user.points) || 0) + t.points_cost) * 1000) / 1000
  db.prepare('UPDATE users SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newBalance, t.user_id)
  db.prepare('UPDATE generation_tasks SET points_cost = 0, points_balance_after = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newBalance, t.id)
  db.prepare(`INSERT INTO points_transactions (user_id, amount, balance_after, reason, reference_type, reference_id, note, created_at) VALUES (?, ?, ?, 'refund', 'generation_task', ?, '失败补退(历史)', CURRENT_TIMESTAMP)`).run(t.user_id, t.points_cost, newBalance, t.id)
})

let done = 0
for (const t of tasks) { refundOne(t); done++ }
console.log(`\n完成：已退款 ${done} 笔，合计 ${total} 积分。`)
db.close()
