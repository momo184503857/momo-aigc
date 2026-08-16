/**
 * 补录工作台 EXPAND_DEFAULT（14 套默认扩充主题）到 sg_themes。
 * 幂等守卫：system_config.seed_sg_expand_v1。
 * 运行：npx tsx scripts/seed-expand-themes.ts
 */
import Database from 'better-sqlite3'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import seed from '../server/src/db/data/suiteGenSeed.json'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const db = new Database(path.resolve(__dirname, '../server/data/momo.db'))

const cfg = db.prepare(`SELECT value FROM system_config WHERE key = 'seed_sg_expand_v1'`).get() as { value: string } | undefined
if (cfg?.value === 'done') {
  console.log('[expand] 默认扩充主题已入库（幂等跳过）')
} else {
  const expand = (seed.themes as any[]).filter((t) => t.sort_order >= 1000)
  const { themeSeasonsFor, themeStylesFor } = await import('../server/src/db/themeMeta.js')
  const ins = db.prepare(`
    INSERT INTO sg_themes (owner_user_id, name, track_key, season, styles, level, path, points, sort_order, source)
    VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, 'seed')
  `)
  db.transaction(() => {
    for (const t of expand) {
      ins.run(
        t.name, t.track_key,
        JSON.stringify(themeSeasonsFor(t.name, t.season)),
        JSON.stringify(themeStylesFor(t.name, t.track_key)),
        t.level, t.path, JSON.stringify(t.points), t.sort_order,
      )
    }
    db.prepare(`INSERT INTO system_config (key, value) VALUES ('seed_sg_expand_v1', 'done')
                ON CONFLICT(key) DO UPDATE SET value = 'done'`).run()
  })()
  console.log(`[expand] 已补录 ${expand.length} 套默认扩充主题`)
}
const total = db.prepare(`SELECT COUNT(*) c FROM sg_themes WHERE owner_user_id IS NULL`).get() as any
console.log('全局主题总数:', total.c)
db.close()
