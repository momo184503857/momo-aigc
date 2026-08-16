/**
 * suite-gen 服务端冒烟测试（验收 M1 / M2 后端部分 + sg_suites）。
 * 前置：后端已运行于 http://localhost:3000（npm run dev:server）。
 * 运行：npx tsx scripts/smoke-sg.ts
 */
import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.resolve(__dirname, '../server/data/momo.db')
const BASE = 'http://localhost:3000/api'

let passed = 0, failed = 0
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { passed++; console.log(`  ✅ ${name}`) }
  else { failed++; console.error(`  ❌ ${name}`, detail !== undefined ? detail : '') }
}

// ── 0. 准备测试用户（直接写 dev 库，幂等） ──
const db = new Database(DB_PATH)
function ensureUser(username: string, role = 'user'): number {
  const exist = db.prepare('SELECT id FROM users WHERE username = ?').get(username) as any
  if (exist) return exist.id
  const hash = bcrypt.hashSync('test123456', 10)
  const r = db.prepare(
    'INSERT INTO users (username, password_hash, role, points, created_at, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)'
  ).run(username, hash, role, role === 'user' ? 100000 : 0)
  console.log(`  [setup] 已创建测试用户 ${username} (id=${r.lastInsertRowid})`)
  return Number(r.lastInsertRowid)
}
const adminId = (db.prepare("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1").get() as any)?.id
ensureUser('sgtest_a')
ensureUser('sgtest_b')

async function login(account: string): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account, password: 'admin123' }),
  })
  if (!res.ok) throw new Error(`admin login failed: ${res.status}`)
  const j: any = await res.json()
  return j.data.token
}
async function userToken(username: string): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: username, password: 'test123456' }),
  })
  if (!res.ok) throw new Error(`${username} login failed: ${res.status}`)
  const j: any = await res.json()
  return j.data.token
}
async function api(token: string, method: string, url: string, body?: unknown) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let json: any = null
  try { json = await res.json() } catch { /* 非 JSON */ }
  return { status: res.status, json }
}

async function main() {
  const admin = await login('admin')
  const userA = await userToken('sgtest_a')
  const userB = await userToken('sgtest_b')

  console.log('━━━ M1-01/M1-02 种子数据完整性与幂等 ━━━')
  {
    const counts = (table: string) => (db.prepare(`SELECT COUNT(*) c FROM ${table}`).get() as any).c
    check('sg_themes 全局 = 100', counts('sg_themes') >= 100, counts('sg_themes'))
    check('sg_tracks ≥ 7', counts('sg_tracks') >= 7, counts('sg_tracks'))
    check('sg_lock_templates ≥ 19', counts('sg_lock_templates') >= 19, counts('sg_lock_templates'))
    check('sg_garment_features ≥ 30', counts('sg_garment_features') >= 30, counts('sg_garment_features'))
    check('sg_knowledge ≥ 25', counts('sg_knowledge') >= 25, counts('sg_knowledge'))
    const fp = db.prepare("SELECT COUNT(*) c FROM feature_prompts WHERE feature_id IN ('suite-gen','expert-fusion','expert-swap','expert-derive')").get() as any
    check('feature_prompts 新功能行 ≥ 16（4 功能 × ≥4 模型）', fp.c >= 16, fp.c)
    const cfg = db.prepare("SELECT value FROM system_config WHERE key='seed_sg_assets_v1'").get() as any
    check('幂等守卫已标记 done', cfg?.value === 'done')
    const badPoints = db.prepare(`SELECT COUNT(*) c FROM sg_themes WHERE points NOT LIKE '%,%' OR json_array_length(points) != 5`).get() as any
    check('全部主题点位数 = 5', badPoints.c === 0, badPoints)
  }

  console.log('━━━ M1-10~15 双轨权限矩阵 ━━━')
  let userAThemeId = 0
  {
    // M1-10 打开即用：userA 能看到全局资产
    const r1 = await api(userA, 'GET', '/sg/assets/themes?scope=global&pageSize=100')
    check('userA 可见全局主题（打开即用）', r1.status === 200 && r1.json.data.total >= 100, r1.json?.data?.total)

    // userA 建私有主题
    const r2 = await api(userA, 'POST', '/sg/assets/themes', {
      name: 'SMOKE_A 私有庭院', track_key: 'A', season: [], level: 'M',
      path: 'a → b → c → d → e', points: ['1', '2', '3', '4', '5'],
    })
    check('userA 创建私有主题成功', r2.status === 200 && r2.json.success, r2.json)
    userAThemeId = r2.json?.data?.id || 0
    check('私有主题 isGlobal=false', r2.json?.data?.isGlobal === false)

    // M1-12 userB 看不到 userA 的私有主题
    const r3 = await api(userB, 'GET', '/sg/assets/themes?scope=all&pageSize=200')
    const names = (r3.json?.data?.records || []).map((x: any) => x.name)
    check('userB 看不到 userA 私有主题', !names.includes('SMOKE_A 私有庭院'))
    check('userB 能看到全局主题', names.includes('中式园林庭院'))

    // M1-13 userB 改 userA 私有主题 → 403
    const r4 = await api(userB, 'PATCH', `/sg/assets/themes/${userAThemeId}`, { name: ' hacked' })
    check('userB 改他人私有主题 → 403', r4.status === 403, r4.status)

    // M1-15 userA 改全局主题 → 403
    const seedTheme = db.prepare("SELECT id FROM sg_themes WHERE owner_user_id IS NULL LIMIT 1").get() as any
    const r5 = await api(userA, 'PATCH', `/sg/assets/themes/${seedTheme.id}`, { name: 'x' })
    check('userA 改全局主题 → 403', r5.status === 403, r5.status)

    // M1-14 复制为我的
    const r6 = await api(userA, 'POST', `/sg/assets/themes/${seedTheme.id}/copy`)
    check('userA 复制全局主题为私有副本', r6.status === 200 && r6.json?.data?.isGlobal === false, r6.json)
    const origName = db.prepare('SELECT name FROM sg_themes WHERE id = ?').get(seedTheme.id) as any
    check('原全局行未被修改', origName.name !== 'x')

    // M1-17 种子资产禁删
    const r7 = await api(admin, 'DELETE', `/sg/assets/themes/${seedTheme.id}`)
    check('admin 删除种子主题被拒 → 400', r7.status === 400, r7.status)

    // userA 删除全局 → 403
    const r8 = await api(userA, 'DELETE', `/sg/assets/themes/${seedTheme.id}`)
    check('userA 删除全局主题 → 403', r8.status === 403, r8.status)

    // admin 建全局 + 停用
    const r9 = await api(admin, 'POST', '/sg/assets/themes?global=true', {
      name: 'SMOKE_ADMIN 全局测试', track_key: 'A', season: [], points: ['1', '2', '3', '4', '5'], path: 'a → b → c → d → e',
    })
    check('admin 创建全局资产成功', r9.status === 200 && r9.json?.data?.isGlobal === true, r9.json)
    const adminThemeId = r9.json?.data?.id
    const r10 = await api(userA, 'GET', '/sg/assets/themes?scope=all&pageSize=200')
    check('admin 全局资产对 userA 立即可见', (r10.json?.data?.records || []).some((x: any) => x.id === adminThemeId))
    const r11 = await api(admin, 'PATCH', `/sg/assets/themes/${adminThemeId}`, { status: 'disabled' })
    const r12 = await api(userA, 'GET', '/sg/assets/themes?scope=all&pageSize=300')
    check('停用后用户不可见', r11.status === 200 && !(r12.json?.data?.records || []).some((x: any) => x.id === adminThemeId))
    await api(admin, 'DELETE', `/sg/assets/themes/${adminThemeId}`) // 清理（非种子可删）

    // userA 建全局被拒
    const r13 = await api(userA, 'POST', '/sg/assets/themes?global=true', { name: '非法全局', points: [] })
    check('userA 创建全局资产 → 403', r13.status === 403, r13.status)

    // 锁定模板发布为官方卡片（admin）
    const lock = db.prepare("SELECT id FROM sg_lock_templates WHERE owner_user_id IS NULL AND key='neg.hand'").get() as any
    const r14 = await api(admin, 'POST', `/admin/sg-extra/lock-templates/${lock.id}/publish-card`)
    check('锁定模板发布为官方卡片', r14.status === 200 && r14.json?.data?.cardId, r14.json)
    db.prepare('DELETE FROM prompt_cards WHERE id = ?').run(r14.json?.data?.cardId) // 清理
  }

  console.log('━━─ M2 套系 CRUD + 任务关联 ━━')
  {
    // 创建草稿
    const r1 = await api(userA, 'POST', '/sg/suites', {
      name: '冒烟套系', feature_source: 'suite',
      track_snapshot: { key: 'A', name: '新中式' },
      theme_snapshot: { name: '中式园林庭院', path: 'a→b→c→d→e', points: ['1', '2', '3', '4', '5'] },
      prompt_common: 'COMMON', prompt_points: ['P1', 'P2', 'P3', 'P4', 'P5'],
      model: 'gpt-image-2', resolution: '2K', aspect_ratio: '3:4', n_total: 5,
    })
    check('创建套系草稿', r1.status === 200 && r1.json?.data?.id > 0, r1.json)
    const suiteId = r1.json.data.id

    // 带 suite_id/point_index 建 5 个任务记录（绕过 ToAPIs，直接写 tasks）
    for (let i = 0; i < 5; i++) {
      const t = await api(userA, 'POST', '/tasks', {
        toapis_task_id: `smoke-${suiteId}-${i}`, model: 'gpt-image-2',
        prompt: `COMMON\nP${i + 1}`, size: '3:4', resolution: '2K',
        feature_id: 'suite-gen', suite_id: suiteId, point_index: i,
      })
      if (t.status !== 200) { check(`任务 ${i + 1} 创建`, false, t.json); break }
      if (i === 4) check('5 个任务创建成功（suite_id/point_index 透传）', true)
    }

    // 套系详情聚合
    const r2 = await api(userA, 'GET', `/sg/suites/${suiteId}`)
    const suite = r2.json?.data
    check('套系详情含 5 点位任务', suite?.points?.length === 5, suite?.points?.length)
    check('点位 taskId 对应正确', suite?.points?.every((p: any, i: number) => p.pointIndex === i && p.taskId))
    check('状态聚合 generating（任务 submitted）', suite?.status === 'generating', suite?.status)

    // tasks 过滤
    const r3 = await api(userA, 'GET', `/tasks?suiteId=${suiteId}&pageSize=20`)
    check('tasks?suiteId 过滤返回 5 条', r3.json?.data?.total === 5, r3.json?.data?.total)

    // 改名
    const r4 = await api(userA, 'PATCH', `/sg/suites/${suiteId}/rename`, { name: '冒烟套系改名' })
    check('套系重命名', r4.status === 200)

    // userB 访问 userA 套系 → 404（隔离）
    const r5 = await api(userB, 'GET', `/sg/suites/${suiteId}`)
    check('userB 访问他人套系 → 404', r5.status === 404, r5.status)

    // 清理：标记任务 completed 后删套系（软删）
    for (const t of (r3.json?.data?.records || [])) {
      await api(userA, 'PATCH', `/tasks/${t.id}`, { status: 'completed', progress: 100, result_image_urls: [] })
    }
    const r6 = await api(userA, 'GET', `/sg/suites/${suiteId}`)
    check('全部完成后状态聚合 completed', r6.json?.data?.status === 'completed', r6.json?.data?.status)
    const r7 = await api(userA, 'DELETE', `/sg/suites/${suiteId}`)
    check('已生成套系删除 → 软删', r7.status === 200)
    // 数据清理
    db.prepare('DELETE FROM generation_tasks WHERE suite_id = ?').run(suiteId)
    db.prepare('DELETE FROM sg_suites WHERE id = ?').run(suiteId)
    db.prepare('DELETE FROM sg_themes WHERE name LIKE ?').run('SMOKE_%')
    db.prepare('DELETE FROM sg_themes WHERE name LIKE ?').run('%（我的副本）')
    console.log('  [cleanup] 冒烟数据已清理')
  }

  console.log(`\n结果：${passed} 通过 / ${failed} 失败`)
  db.close()
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((e) => { console.error('冒烟测试异常：', e); process.exit(1) })
