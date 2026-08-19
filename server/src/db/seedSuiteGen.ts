/**
 * suite-gen（成套生图与提示词专家）数据库初始化 + 种子数据。
 *
 * 资产双轨约定：owner_user_id NULL = 全局（管理员维护，全员可用）；
 * owner_user_id = X = 用户 X 私有。种子数据由 scripts/extract-workbench.mjs
 * 从《女装电商生图工作台 V10.0》提取生成（suiteGenSeed.json）。
 */
import { db } from './index.js'
import seedData from './data/suiteGenSeed.json'
import { themeSeasonsFor, themeStylesFor, buildPointDetails } from './themeMeta.js'

export function initSuiteGen(): void {
  // ───────────────────────── 资产表（六类，统一双轨字段） ─────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS sg_themes (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name          VARCHAR(100) NOT NULL,
      track_key     VARCHAR(50)  NOT NULL DEFAULT '',
      season        TEXT NOT NULL DEFAULT '[]',   -- JSON 数组：["春","夏"]…；[] = 全季
      styles        TEXT NOT NULL DEFAULT '[]',   -- 适合风格 JSON 数组（新中式国风/文艺风/…）
      images        TEXT NOT NULL DEFAULT '[]',   -- 主题图片 URL JSON 数组（≤5 张）
      level         VARCHAR(10)  NOT NULL DEFAULT 'M',
      path          VARCHAR(255) NOT NULL DEFAULT '',
      points        TEXT NOT NULL DEFAULT '[]',
      point_details TEXT NOT NULL DEFAULT '[]',  -- 点位三字段 JSON：[{name,scene,camera}]（数据源；points 由其派生同步）
      status        VARCHAR(20) NOT NULL DEFAULT 'active',
      use_count     INTEGER NOT NULL DEFAULT 0,
      sort_order    INTEGER NOT NULL DEFAULT 0,
      source        VARCHAR(20) NOT NULL DEFAULT 'user',
      is_public     INTEGER NOT NULL DEFAULT 0,     -- 用户主题是否公开到主题库（全局主题全员可见，不依赖此列）
      favorite_count INTEGER NOT NULL DEFAULT 0,    -- 收藏数（sg_theme_favorites 计数冗余）
      created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_sg_themes_scope ON sg_themes(owner_user_id, season, status);

    CREATE TABLE IF NOT EXISTS sg_tracks (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      key           VARCHAR(50)  NOT NULL,
      name          VARCHAR(100) NOT NULL,
      emoji         VARCHAR(20)  NOT NULL DEFAULT '',
      mood          TEXT NOT NULL DEFAULT '',
      hair          TEXT NOT NULL DEFAULT '',
      light         TEXT NOT NULL DEFAULT '',
      acc           TEXT NOT NULL DEFAULT '',
      hand          TEXT NOT NULL DEFAULT '',
      status        VARCHAR(20) NOT NULL DEFAULT 'active',
      use_count     INTEGER NOT NULL DEFAULT 0,
      sort_order    INTEGER NOT NULL DEFAULT 0,
      source        VARCHAR(20) NOT NULL DEFAULT 'user',
      created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sg_personas (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name          VARCHAR(100) NOT NULL,
      avatar_url    TEXT NOT NULL DEFAULT '',
      dna           TEXT NOT NULL DEFAULT '',
      hair_default  TEXT NOT NULL DEFAULT '',
      fingerprint   TEXT NOT NULL DEFAULT '[]',
      note          TEXT NOT NULL DEFAULT '',
      status        VARCHAR(20) NOT NULL DEFAULT 'active',
      use_count     INTEGER NOT NULL DEFAULT 0,
      source        VARCHAR(20) NOT NULL DEFAULT 'user',
      created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sg_lock_templates (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      key           VARCHAR(100) NOT NULL,
      name          VARCHAR(100) NOT NULL,
      grp           VARCHAR(50)  NOT NULL,
      order_no      INTEGER NOT NULL DEFAULT 100,
      content       TEXT NOT NULL,
      cond_kind     VARCHAR(50) NOT NULL DEFAULT 'none',
      models        TEXT NOT NULL DEFAULT '[]',
      scope         TEXT NOT NULL DEFAULT '[]',
      status        VARCHAR(20) NOT NULL DEFAULT 'active',
      use_count     INTEGER NOT NULL DEFAULT 0,
      source        VARCHAR(20) NOT NULL DEFAULT 'user',
      created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_sg_locks_scope ON sg_lock_templates(owner_user_id, grp, status);

    CREATE TABLE IF NOT EXISTS sg_garment_features (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      grp           VARCHAR(50)  NOT NULL,
      name          VARCHAR(100) NOT NULL,
      match_tags    TEXT NOT NULL DEFAULT '[]',
      detail_hint   TEXT NOT NULL DEFAULT '',
      status        VARCHAR(20) NOT NULL DEFAULT 'active',
      sort_order    INTEGER NOT NULL DEFAULT 0,
      source        VARCHAR(20) NOT NULL DEFAULT 'user',
      created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sg_knowledge (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      kind          VARCHAR(50) NOT NULL,
      field         VARCHAR(50) NOT NULL,
      content       TEXT NOT NULL,
      status        VARCHAR(20) NOT NULL DEFAULT 'active',
      source        VARCHAR(20) NOT NULL DEFAULT 'user',
      updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sg_suites (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id         INTEGER NOT NULL REFERENCES users(id),
      name            VARCHAR(150) NOT NULL DEFAULT '',
      feature_source  VARCHAR(20) NOT NULL DEFAULT 'suite',
      track_snapshot  TEXT NOT NULL DEFAULT '{}',
      theme_snapshot  TEXT NOT NULL DEFAULT '{}',
      persona_snapshot TEXT NOT NULL DEFAULT '{}',
      garment         TEXT NOT NULL DEFAULT '{}',
      prompt_common   TEXT NOT NULL DEFAULT '',
      prompt_points   TEXT NOT NULL DEFAULT '[]',
      enabled_locks   TEXT NOT NULL DEFAULT '[]',
      model           VARCHAR(100) NOT NULL DEFAULT '',
      resolution      VARCHAR(50)  NOT NULL DEFAULT '2K',
      aspect_ratio    VARCHAR(50)  NOT NULL DEFAULT '3:4',
      n_total         INTEGER NOT NULL DEFAULT 5,
      status          VARCHAR(20) NOT NULL DEFAULT 'draft',
      created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_sg_suites_user ON sg_suites(user_id, status, created_at DESC);
  `)

  // ───────────────────────── generation_tasks 迁移列 ─────────────────────────
  try { db.exec(`ALTER TABLE generation_tasks ADD COLUMN suite_id INTEGER`) } catch { /* column already exists */ }
  try { db.exec(`ALTER TABLE generation_tasks ADD COLUMN point_index INTEGER`) } catch { /* column already exists */ }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_suite ON generation_tasks(suite_id)`)

  // ───────────────────────── sg_themes 迁移列 + season 数据迁移 ─────────────────────────
  // 旧库补 styles / images 列（新库建表已含）
  try { db.exec(`ALTER TABLE sg_themes ADD COLUMN styles TEXT NOT NULL DEFAULT '[]'`) } catch { /* column already exists */ }
  try { db.exec(`ALTER TABLE sg_themes ADD COLUMN images TEXT NOT NULL DEFAULT '[]'`) } catch { /* column already exists */ }
  // season 旧值（ss/aw/all 单选）→ 中文季节 JSON 数组；WHERE 条件保证幂等
  db.exec(`UPDATE sg_themes SET season = '["春","夏"]' WHERE season = 'ss'`)
  db.exec(`UPDATE sg_themes SET season = '["秋","冬"]' WHERE season = 'aw'`)
  db.exec(`UPDATE sg_themes SET season = '[]' WHERE season IN ('all', '')`)

  // ───────────────────────── 主题库（用户端 /themes）：公开标记 + 收藏 ─────────────────────────
  // 旧库补 is_public / favorite_count 列（新库建表已含）
  try { db.exec(`ALTER TABLE sg_themes ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0`) } catch { /* column already exists */ }
  try { db.exec(`ALTER TABLE sg_themes ADD COLUMN favorite_count INTEGER NOT NULL DEFAULT 0`) } catch { /* column already exists */ }
  // 收藏（联合主键防重）；theme_id 级联删除（主题删除时收藏随之清理）
  db.exec(`
    CREATE TABLE IF NOT EXISTS sg_theme_favorites (
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      theme_id   INTEGER NOT NULL REFERENCES sg_themes(id) ON DELETE CASCADE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, theme_id)
    );
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sg_theme_favorites_user ON sg_theme_favorites(user_id);`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sg_theme_favorites_theme ON sg_theme_favorites(theme_id);`)

  // ── 主题元数据回填：适合风格 + 差异化季节（一次性；新库种子已带元数据，此处为 0 行） ──
  // 仅补全局行：styles 为空的补推导风格；season 仍是整半年（["春","夏"]/["秋","冬"]）的按名称打散。
  // 幂等守卫：seed_sg_theme_meta_v1，执行后管理员手工维护的值不再被覆盖。
  const metaCfg = db.prepare(`SELECT value FROM system_config WHERE key = 'seed_sg_theme_meta_v1'`).get() as { value: string } | undefined
  if (metaCfg?.value !== 'done') {
    const rows = db.prepare(
      `SELECT id, name, track_key, season, styles FROM sg_themes WHERE owner_user_id IS NULL`
    ).all() as Array<{ id: number; name: string; track_key: string; season: string; styles: string }>
    const upd = db.prepare(`UPDATE sg_themes SET styles = ?, season = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    db.transaction(() => {
      for (const r of rows) {
        const styles = r.styles === '[]' ? themeStylesFor(r.name, r.track_key) : JSON.parse(r.styles || '[]')
        const season = (r.season === '["春","夏"]' || r.season === '["秋","冬"]')
          ? themeSeasonsFor(r.name, r.season)
          : JSON.parse(r.season || '[]')
        upd.run(JSON.stringify(styles), JSON.stringify(season), r.id)
      }
      db.prepare(`INSERT INTO system_config (key, value) VALUES ('seed_sg_theme_meta_v1', 'done')
                  ON CONFLICT(key) DO UPDATE SET value = 'done'`).run()
    })()
    console.log(`[DB] Backfilled sg_themes meta (styles/season) for ${rows.length} global themes`)
  }

  // ── 点位三字段回填：把旧动态生成逻辑的输出固化为主题数据（一次性） ──
  // 对所有 point_details 为空的主题（全局 + 用户）按 name/path/points 生成
  // {name,scene,camera}；幂等守卫：seed_sg_theme_point_details_v1 + 行级 point_details='[]' 条件，
  // 之后用户/管理员编辑过的三字段不会再被覆盖。
  try { db.exec(`ALTER TABLE sg_themes ADD COLUMN point_details TEXT NOT NULL DEFAULT '[]'`) } catch { /* column already exists */ }
  const pdCfg = db.prepare(`SELECT value FROM system_config WHERE key = 'seed_sg_theme_point_details_v1'`).get() as { value: string } | undefined
  if (pdCfg?.value !== 'done') {
    const rows = db.prepare(
      `SELECT id, name, path, points, point_details FROM sg_themes WHERE point_details IN ('[]', '')`
    ).all() as Array<{ id: number; name: string; path: string; points: string; point_details: string }>
    if (rows.length > 0) {
      const upd = db.prepare(`UPDATE sg_themes SET point_details = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      db.transaction(() => {
        for (const r of rows) {
          let pts: string[] = []
          try { pts = JSON.parse(r.points || '[]') } catch { /* 非法 JSON 按空处理 */ }
          upd.run(JSON.stringify(buildPointDetails(r.name, r.path, pts)), r.id)
        }
      })()
      console.log(`[DB] Backfilled sg_themes point_details for ${rows.length} themes`)
    }
    db.prepare(`INSERT INTO system_config (key, value) VALUES ('seed_sg_theme_point_details_v1', 'done')
                ON CONFLICT(key) DO UPDATE SET value = 'done'`).run()
  }

  // ───────────────────────── 种子数据（幂等守卫） ─────────────────────────
  const cfg = db.prepare(`SELECT value FROM system_config WHERE key = 'seed_sg_assets_v1'`).get() as { value: string } | undefined
  if (cfg?.value === 'done') return

  const data = seedData as {
    tracks: any[]; themes: any[]; personas: any[]
    lockTemplates: any[]; garmentFeatures: any[]; knowledge: any[]
  }

  db.transaction(() => {
    const insTrack = db.prepare(`
      INSERT INTO sg_tracks (owner_user_id, key, name, emoji, mood, hair, light, acc, hand, sort_order, source)
      VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed')
    `)
    for (const t of data.tracks) {
      insTrack.run(t.key, t.name, t.emoji, t.mood, t.hair, t.light, t.acc, t.hand, t.sort_order || 0)
    }

    const insTheme = db.prepare(`
      INSERT INTO sg_themes (owner_user_id, name, track_key, season, styles, level, path, points, point_details, sort_order, source)
      VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed')
    `)
    for (const t of data.themes) {
      insTheme.run(
        t.name, t.track_key,
        JSON.stringify(themeSeasonsFor(t.name, t.season)),
        JSON.stringify(themeStylesFor(t.name, t.track_key)),
        t.level, t.path, JSON.stringify(t.points),
        JSON.stringify(buildPointDetails(t.name, t.path, t.points)),
        t.sort_order || 0,
      )
    }

    const insPersona = db.prepare(`
      INSERT INTO sg_personas (owner_user_id, name, dna, hair_default, note, source)
      VALUES (NULL, ?, ?, ?, ?, 'seed')
    `)
    for (const p of data.personas) {
      insPersona.run(p.name, p.dna, p.hair_default, p.note)
    }

    const insLock = db.prepare(`
      INSERT INTO sg_lock_templates (owner_user_id, key, name, grp, order_no, content, cond_kind, models, scope, source)
      VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, 'seed')
    `)
    for (const l of data.lockTemplates) {
      insLock.run(l.key, l.name, l.grp, l.order_no, l.content, l.cond_kind || 'none',
        JSON.stringify(l.models || []), JSON.stringify(l.scope || []))
    }

    const insFeat = db.prepare(`
      INSERT INTO sg_garment_features (owner_user_id, grp, name, match_tags, detail_hint, sort_order, source)
      VALUES (NULL, ?, ?, ?, ?, ?, 'seed')
    `)
    for (const f of data.garmentFeatures) {
      insFeat.run(f.grp, f.name, JSON.stringify(f.match_tags || []), f.detail_hint, f.sort_order || 0)
    }

    const insKnow = db.prepare(`
      INSERT INTO sg_knowledge (owner_user_id, kind, field, content, source)
      VALUES (NULL, ?, ?, ?, 'seed')
    `)
    for (const k of data.knowledge) {
      insKnow.run(k.kind, k.field, JSON.stringify(k.content))
    }

    // feature_prompts：新功能 × 现有模型（供管理后台按模型调话术）
    const featureIds = ['suite-gen', 'expert-fusion', 'expert-swap', 'expert-derive']
    const modelRows = db.prepare(`SELECT DISTINCT model_id FROM feature_prompts`).all() as { model_id: string }[]
    const modelIds = modelRows.length > 0
      ? modelRows.map((r) => r.model_id)
      : ['gpt-image-2', 'gemini-3-pro-image-preview', 'gemini-3.1-flash-image-preview', 'gemini-2.5-flash-image-preview']
    const insFp = db.prepare(`
      INSERT OR IGNORE INTO feature_prompts (feature_id, model_id, created_at, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `)
    for (const fid of featureIds) {
      for (const mid of modelIds) insFp.run(fid, mid)
    }

    db.prepare(`INSERT INTO system_config (key, value) VALUES ('seed_sg_assets_v1', 'done')
                ON CONFLICT(key) DO UPDATE SET value = 'done'`).run()
  })()

  console.log(`[DB] Seeded suite-gen assets: ${data.themes.length} themes, ${data.tracks.length} tracks, ` +
    `${data.personas.length} personas, ${data.lockTemplates.length} locks, ` +
    `${data.garmentFeatures.length} garment features, ${data.knowledge.length} knowledge entries`)
}
