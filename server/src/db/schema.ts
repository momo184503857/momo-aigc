import { db } from './index.js'
import { initSuiteGen } from './seedSuiteGen.js'
import { initApiProviders } from './seedApiProviders.js'
import { initAiProviderMigration } from './migrateAiProvider.js'
import { syncCanonicalLogicalModels } from './logicalModels.js'

export function initSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username VARCHAR(64) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'user',
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      last_login_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS template_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      name VARCHAR(255),
      oss_bucket VARCHAR(255) NOT NULL,
      oss_object_key VARCHAR(1024) NOT NULL,
      public_url TEXT NOT NULL,
      original_filename VARCHAR(255),
      mime_type VARCHAR(100),
      size_bytes INTEGER,
      width INTEGER,
      height INTEGER,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at TIMESTAMP NULL
    );

    CREATE TABLE IF NOT EXISTS generation_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      toapis_task_id VARCHAR(255) NOT NULL,
      client_business_id VARCHAR(255),
      model VARCHAR(100) NOT NULL,
      prompt TEXT NOT NULL,
      size VARCHAR(50),
      resolution VARCHAR(50),
      aspect_ratio VARCHAR(50),
      n INTEGER NOT NULL DEFAULT 1,
      template_image_ids TEXT,
      input_image_urls TEXT,
      result_image_urls TEXT,
      status VARCHAR(50) NOT NULL DEFAULT 'submitted',
      progress INTEGER,
      error_code VARCHAR(100),
      error_message TEXT,
      raw_error TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP NULL,
      expires_at TIMESTAMP NULL
    );

    CREATE TABLE IF NOT EXISTS prompt_library (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON generation_tasks(user_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_toapis_id ON generation_tasks(toapis_task_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON generation_tasks(status);
    CREATE TABLE IF NOT EXISTS gallery_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      name VARCHAR(100) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, name)
    );

    CREATE TABLE IF NOT EXISTS template_image_tags (
      template_image_id INTEGER NOT NULL REFERENCES template_images(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES gallery_tags(id) ON DELETE CASCADE,
      PRIMARY KEY (template_image_id, tag_id)
    );

    CREATE INDEX IF NOT EXISTS idx_templates_user_id ON template_images(user_id);
    CREATE INDEX IF NOT EXISTS idx_gallery_tags_user_id ON gallery_tags(user_id);
    CREATE INDEX IF NOT EXISTS idx_template_image_tags_image ON template_image_tags(template_image_id);
  `)

  // Migration: prompt_library 改为用户私有 + 收藏置顶
  // 历史上该表无 user_id、无登录校验，导致所有用户共享同一份提示词（隔离 bug）。
  // 这里仅补 user_id / is_starred 列与索引；历史数据归属迁移放到 system_config 表创建之后执行。
  try { db.exec(`ALTER TABLE prompt_library ADD COLUMN user_id INTEGER`) } catch { /* column already exists */ }
  try { db.exec(`ALTER TABLE prompt_library ADD COLUMN is_starred INTEGER NOT NULL DEFAULT 0`) } catch { /* column already exists */ }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_prompt_library_user ON prompt_library(user_id);`)

  // Migration: add aspect_ratio column if missing
  try {
    db.exec(`ALTER TABLE generation_tasks ADD COLUMN aspect_ratio VARCHAR(50)`)
  } catch { /* column already exists */ }

  // Migration: add feature_id column if missing
  try {
    db.exec(`ALTER TABLE generation_tasks ADD COLUMN feature_id TEXT DEFAULT NULL`)
  } catch { /* column already exists */ }

  // Migration: add user_prompt column if missing
  try {
    db.exec(`ALTER TABLE generation_tasks ADD COLUMN user_prompt TEXT DEFAULT ''`)
  } catch { /* column already exists */ }

  // Migration: add points column to users
  try {
    db.exec(`ALTER TABLE users ADD COLUMN points REAL NOT NULL DEFAULT 0`)
  } catch { /* column already exists */ }

  // Migration: add email column to users（邮箱为登录主标识；旧账号为空，仍可用 username 登录）
  try {
    db.exec(`ALTER TABLE users ADD COLUMN email TEXT`)
  } catch { /* column already exists */ }

  // Migration: add nickname column to users（可修改的展示名）
  try {
    db.exec(`ALTER TABLE users ADD COLUMN nickname TEXT`)
  } catch { /* column already exists */ }

  // email 唯一索引（部分索引：仅非空行参与，保证旧账号 email=NULL 不冲突）
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL`)

  // Email verification codes table（注册/登录/重置密码验证码）
  db.exec(`
    CREATE TABLE IF NOT EXISTS email_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email VARCHAR(128) NOT NULL,
      code VARCHAR(8) NOT NULL,
      purpose VARCHAR(20) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      consumed INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_email_codes_lookup ON email_codes(email, purpose, consumed);`)

  // Migration: add points_cost to generation_tasks
  try {
    db.exec(`ALTER TABLE generation_tasks ADD COLUMN points_cost REAL NOT NULL DEFAULT 0`)
  } catch { /* column already exists */ }

  // Migration: add points_balance_after to generation_tasks
  try {
    db.exec(`ALTER TABLE generation_tasks ADD COLUMN points_balance_after REAL DEFAULT NULL`)
  } catch { /* column already exists */ }

  // Migration: add supplementary_images to generation_tasks (JSON array)
  try {
    db.exec(`ALTER TABLE generation_tasks ADD COLUMN supplementary_images TEXT DEFAULT '[]'`)
  } catch { /* column already exists */ }

  // Points transactions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS points_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      amount REAL NOT NULL,
      balance_after REAL NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      reference_type VARCHAR(50),
      reference_id INTEGER,
      operator_id INTEGER REFERENCES users(id),
      note TEXT DEFAULT '',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_points_txn_user ON points_transactions(user_id);`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_points_txn_created ON points_transactions(created_at);`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_points_txn_reason ON points_transactions(reason);`)

  // ToAPIs balance check history
  db.exec(`
    CREATE TABLE IF NOT EXISTS toapis_balance_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      balance REAL DEFAULT 0,
      currency VARCHAR(10) DEFAULT 'CNY',
      raw_response TEXT DEFAULT '',
      checked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  // Feature prompts table (per-feature per-model system prompts)
  db.exec(`
    CREATE TABLE IF NOT EXISTS feature_prompts (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      feature_id          TEXT NOT NULL,
      model_id            TEXT NOT NULL,
      system_prompt       TEXT NOT NULL DEFAULT '',
      user_prompt_label   TEXT DEFAULT '补充提示词',
      user_prompt_placeholder TEXT DEFAULT '',
      created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(feature_id, model_id)
    );
  `)

  // System config KV table
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );
  `)
  const insertCfg = db.prepare(`INSERT OR IGNORE INTO system_config (key, value) VALUES (?, ?)`)
  insertCfg.run('toapis_api_key', '')

  // 一次性迁移：prompt_library 修复为用户私有后，旧数据无 user_id。
  // 这些提示词是上线前管理员预置的，全部归给第一个管理员；其他用户上线后从空库开始。
  // 幂等守卫：仅当 system_config.migration_prompt_library_owner_v1 未标记 done 时执行。
  const promptOwnerCfg = db.prepare(`SELECT value FROM system_config WHERE key = 'migration_prompt_library_owner_v1'`).get() as { value: string } | undefined
  if (promptOwnerCfg?.value !== 'done') {
    db.prepare(
      `UPDATE prompt_library SET user_id = (SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1) WHERE user_id IS NULL`
    ).run()
    db.prepare(`INSERT INTO system_config (key, value) VALUES ('migration_prompt_library_owner_v1', 'done')
                ON CONFLICT(key) DO UPDATE SET value = 'done'`).run()
  }

  // 用户个人 ToAPIs Key（AES-256-GCM 加密存储，每用户至多一行）
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_toapis_keys (
      user_id            INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      encrypted_key      TEXT NOT NULL,
      key_iv             TEXT NOT NULL,
      key_tag            TEXT NOT NULL,
      key_hint           TEXT NOT NULL DEFAULT '',
      use_personal_key   INTEGER NOT NULL DEFAULT 0,
      encryption_version TEXT NOT NULL DEFAULT 'v1',
      balance_check_interval_sec INTEGER NOT NULL DEFAULT 60,
      created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  // Migration: add balance_check_interval_sec to user_toapis_keys (个人 Key 余额轮询间隔，默认 60s)
  try {
    db.exec(`ALTER TABLE user_toapis_keys ADD COLUMN balance_check_interval_sec INTEGER NOT NULL DEFAULT 60`)
  } catch { /* column already exists */ }

  // Seed feature prompts for all feature × model combinations
  const featureIds = [
    'change-clothes', 'change-bg', 'change-face',
    'detail-pic', 'fabric-pic', 'flat-pic', '3d-pic',
    'model-gen', 'three-view',
  ]
  const modelIds = [
    'gpt-image-2',
    'gemini-3-pro-image-preview',
    'gemini-3.1-flash-image-preview',
    'gemini-2.5-flash-image-preview',
  ]
  const insertFp = db.prepare(`
    INSERT OR IGNORE INTO feature_prompts (feature_id, model_id, created_at, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `)
  for (const fid of featureIds) {
    for (const mid of modelIds) {
      insertFp.run(fid, mid)
    }
  }


  // Canvas projects table
  db.exec(`
    CREATE TABLE IF NOT EXISTS canvas_projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      name VARCHAR(100) NOT NULL DEFAULT '未命名 AI 画布',
      description TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      thumbnail VARCHAR(7) DEFAULT NULL,
      workflow_data TEXT DEFAULT '',
      node_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_canvas_projects_user ON canvas_projects(user_id);`)

  // Canvas assets table (images generated/stored in canvas workflows)
  db.exec(`
    CREATE TABLE IF NOT EXISTS canvas_assets (
      id VARCHAR(64) PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      file_name VARCHAR(255) NOT NULL,
      file_path TEXT NOT NULL,
      preview_url TEXT DEFAULT '',
      size INTEGER DEFAULT 0,
      node_id VARCHAR(100) DEFAULT '',
      node_title VARCHAR(200) DEFAULT '',
      project_id INTEGER DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_canvas_assets_user ON canvas_assets(user_id);`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_canvas_assets_project ON canvas_assets(project_id);`)

  // Migration: add is_starred and sort_order to template_images
  try {
    db.exec(`ALTER TABLE template_images ADD COLUMN is_starred INTEGER NOT NULL DEFAULT 0`)
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE template_images ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`)
  } catch { /* column already exists */ }

  // Photography elements table
  db.exec(`
    CREATE TABLE IF NOT EXISTS photography_elements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name VARCHAR(100) NOT NULL UNIQUE,
      label VARCHAR(100) NOT NULL,
      max_images INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  // Migration: add UNIQUE constraint on name if missing
  try {
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_photography_elements_name ON photography_elements(name)`)
  } catch { /* already exists */ }

  // Photography element prompts (per element per model system prompt)
  db.exec(`
    CREATE TABLE IF NOT EXISTS photography_element_prompts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      element_id INTEGER NOT NULL REFERENCES photography_elements(id) ON DELETE CASCADE,
      model_id VARCHAR(100) NOT NULL,
      system_prompt TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(element_id, model_id)
    );
  `)

  // Seed default photography elements (idempotent: only insert if not exists)
  const defaultElements = [
    { name: 'face', label: '人脸', max_images: 1, sort_order: 1 },
    { name: 'pose', label: '姿势', max_images: 1, sort_order: 2 },
    { name: 'clothes', label: '衣服', max_images: 1, sort_order: 3 },
    { name: 'accessory', label: '配饰', max_images: 2, sort_order: 4 },
    { name: 'background', label: '背景', max_images: 1, sort_order: 5 },
  ]
  const photoModelIds = [
    'gpt-image-2',
    'gemini-3-pro-image-preview',
    'gemini-3.1-flash-image-preview',
    'gemini-2.5-flash-image-preview',
  ]
  const insertElement = db.prepare(`
    INSERT OR IGNORE INTO photography_elements (name, label, max_images, sort_order) VALUES (?, ?, ?, ?)
  `)
  for (const el of defaultElements) {
    insertElement.run(el.name, el.label, el.max_images, el.sort_order)
  }
  // Seed element prompts for each element × model
  const insertElPrompt = db.prepare(`
    INSERT OR IGNORE INTO photography_element_prompts (element_id, model_id, system_prompt)
    SELECT e.id, ?, '' FROM photography_elements e WHERE e.name = ? AND e.status = 'active'
  `)
  for (const el of defaultElements) {
    for (const mid of photoModelIds) {
      insertElPrompt.run(mid, el.name)
    }
  }

  // ── AI 买家秀：素材库 ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS buyer_show_tags (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        VARCHAR(100) NOT NULL UNIQUE,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS buyer_show_materials (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      oss_bucket        VARCHAR(255) NOT NULL,
      oss_object_key    VARCHAR(1024) NOT NULL,
      public_url        TEXT NOT NULL,
      prompt            TEXT NOT NULL,
      original_filename VARCHAR(255),
      mime_type         VARCHAR(100),
      size_bytes        INTEGER,
      width             INTEGER,
      height            INTEGER,
      status            VARCHAR(20) NOT NULL DEFAULT 'active',
      sort_order        INTEGER NOT NULL DEFAULT 0,
      created_by        INTEGER REFERENCES users(id),
      created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at        TIMESTAMP NULL
    );
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS buyer_show_material_tags (
      material_id INTEGER NOT NULL REFERENCES buyer_show_materials(id) ON DELETE CASCADE,
      tag_id      INTEGER NOT NULL REFERENCES buyer_show_tags(id)      ON DELETE CASCADE,
      PRIMARY KEY (material_id, tag_id)
    );
  `)

  db.exec(`CREATE INDEX IF NOT EXISTS idx_buyer_show_materials_status ON buyer_show_materials(status);`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_buyer_show_material_tags_material ON buyer_show_material_tags(material_id);`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_buyer_show_material_tags_tag ON buyer_show_material_tags(tag_id);`)

  // ── AI 买家秀：批量制作（制作买家秀 Tab）──
  // 注意：与上面的 buyer_show_materials（素材库，由另一模块维护）相互独立，
  // 仅用于持久化「上传的表格行 ↔ 生图任务」映射，使刷新后仍能查看/打包下载。
  db.exec(`
    CREATE TABLE IF NOT EXISTS buyer_show_batch_items (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id         INTEGER NOT NULL REFERENCES users(id),
      batch_id        TEXT    NOT NULL,
      product_id      TEXT    NOT NULL,
      main_image_url  TEXT    NOT NULL,
      prompt          TEXT    NOT NULL DEFAULT '',
      task_id         INTEGER NULL REFERENCES generation_tasks(id),
      toapis_task_id  TEXT    NULL,
      status          TEXT    NOT NULL DEFAULT 'pending',
      progress        INTEGER NOT NULL DEFAULT 0,
      error_message   TEXT    NULL,
      sort_order      INTEGER NOT NULL DEFAULT 0,
      created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_buyer_show_batch_user  ON buyer_show_batch_items(user_id);`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_buyer_show_batch_batch ON buyer_show_batch_items(batch_id);`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_buyer_show_batch_task  ON buyer_show_batch_items(task_id);`)

  // ── 一次性数据迁移：元（人民币）→ 新积分（×200/7 ≈ 28.5714）──
  // 幂等守卫：仅当 system_config.migration_credits_v1 未标记 done 时执行。
  const migCfg = db.prepare(`SELECT value FROM system_config WHERE key = 'migration_credits_v1'`).get() as { value: string } | undefined
  if (migCfg?.value !== 'done') {
    const migTxn = db.transaction(() => {
      db.exec(`
        UPDATE users
          SET points = ROUND(points * 200.0 / 7.0, 3);
        UPDATE generation_tasks
          SET points_cost = ROUND(points_cost * 200.0 / 7.0, 3),
              points_balance_after = CASE WHEN points_balance_after IS NULL THEN NULL
                                          ELSE ROUND(points_balance_after * 200.0 / 7.0, 3) END;
        UPDATE points_transactions
          SET amount = ROUND(amount * 200.0 / 7.0, 3),
              balance_after = ROUND(balance_after * 200.0 / 7.0, 3);
      `)
      db.prepare(`INSERT INTO system_config (key, value) VALUES ('migration_credits_v1', 'done')
                  ON CONFLICT(key) DO UPDATE SET value = 'done'`).run()
    })
    migTxn()
    console.log('[DB] Migration credits_v1 done (yuan → credits, ×200/7)')
  }

  // ── 一次性补退：历史上「失败任务已扣未退」的，按「失败不扣费」规则退还 ──
  // 幂等守卫：仅当 system_config.refund_failed_v1 未标记 done 时执行。
  // 与 scripts/refund-failed-tasks.mjs 逻辑一致；本地若已用脚本退过，points_cost 已为 0，此处自动跳过。
  // 云端部署后首次重启即自动执行，无需手动碰数据库。
  const refundCfg = db.prepare(`SELECT value FROM system_config WHERE key = 'refund_failed_v1'`).get() as { value: string } | undefined
  if (refundCfg?.value !== 'done') {
    const failedTasks = db.prepare(`
      SELECT id, user_id, points_cost FROM generation_tasks
      WHERE status = 'failed' AND points_cost > 0
    `).all() as { id: number; user_id: number; points_cost: number }[]

    const stmtUser = db.prepare('SELECT points FROM users WHERE id = ?')
    const stmtUpdUser = db.prepare('UPDATE users SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    const stmtUpdTask = db.prepare('UPDATE generation_tasks SET points_cost = 0, points_balance_after = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    const stmtInsRefund = db.prepare(`
      INSERT INTO points_transactions (user_id, amount, balance_after, reason, reference_type, reference_id, note, created_at)
      VALUES (?, ?, ?, 'refund', 'generation_task', ?, '失败补退(历史)', CURRENT_TIMESTAMP)
    `)
    const stmtSetFlag = db.prepare(`
      INSERT INTO system_config (key, value) VALUES ('refund_failed_v1', 'done')
      ON CONFLICT(key) DO UPDATE SET value = 'done'
    `)

    const migTxn = db.transaction(() => {
      for (const t of failedTasks) {
        const user = stmtUser.get(t.user_id) as { points: number } | undefined
        if (!user) continue // 用户已删除，跳过（极罕见；FK 下不应发生）
        const newBalance = Math.round((Number(user.points) + t.points_cost) * 1000) / 1000
        stmtUpdUser.run(newBalance, t.user_id)
        stmtUpdTask.run(newBalance, t.id)
        stmtInsRefund.run(t.user_id, t.points_cost, newBalance, t.id)
      }
      stmtSetFlag.run()
    })
    migTxn()

    const total = failedTasks.reduce((s, t) => s + t.points_cost, 0)
    console.log(`[DB] Migration refund_failed_v1 done: 退还 ${failedTasks.length} 笔失败任务，合计 ${total} 积分`)
  }

  // ── AI 买家秀：批次元数据（任务历史）──
  // 一个 batch_id = 一个「任务」。status='active' 为当前工作区任务，'archived' 为已进任务历史。
  db.exec(`
    CREATE TABLE IF NOT EXISTS buyer_show_batches (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id),
      batch_id    TEXT NOT NULL UNIQUE,
      name        TEXT NOT NULL DEFAULT '',
      status      TEXT NOT NULL DEFAULT 'active',
      created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      archived_at TIMESTAMP NULL
    );
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_buyer_show_batches_user   ON buyer_show_batches(user_id);`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_buyer_show_batches_status ON buyer_show_batches(status);`)

  // ── 一次性迁移：为现有 buyer_show 批次补建元数据（全部归档为历史）──
  // 幂等守卫：仅当 system_config.migration_buyer_show_batches_v1 未标记 done 时执行。
  // 现有批次都「发生过」，视为历史；工作区从空开始，下次上传即为新的当前任务。
  const bsBatchCfg = db.prepare(`SELECT value FROM system_config WHERE key = 'migration_buyer_show_batches_v1'`).get() as { value: string } | undefined
  if (bsBatchCfg?.value !== 'done') {
    const distinctBatches = db.prepare(`
      SELECT user_id, batch_id, MIN(created_at) AS created_at
      FROM buyer_show_batch_items
      GROUP BY user_id, batch_id
    `).all() as { user_id: number; batch_id: string; created_at: string }[]
    const stmtInsertBatch = db.prepare(`
      INSERT OR IGNORE INTO buyer_show_batches (user_id, batch_id, name, status, created_at, archived_at)
      VALUES (?, ?, '', 'archived', ?, ?)
    `)
    const stmtSetFlag = db.prepare(`
      INSERT INTO system_config (key, value) VALUES ('migration_buyer_show_batches_v1', 'done')
      ON CONFLICT(key) DO UPDATE SET value = 'done'
    `)
    const migTxn = db.transaction(() => {
      for (const b of distinctBatches) {
        stmtInsertBatch.run(b.user_id, b.batch_id, b.created_at, b.created_at)
      }
      stmtSetFlag.run()
    })
    migTxn()
    console.log(`[DB] Migration buyer_show_batches_v1 done: ${distinctBatches.length} 个现有批次归档为历史`)
  }

  // ── 一次性清理：删除已废弃的用户标签功能相关表 ──
  // 用户标签（user_tags / user_tag_mappings）功能已移除，清理遗留表。
  // 幂等守卫：仅当 system_config.drop_user_tags_v1 未标记 done 时执行。
  const dropTagsCfg = db.prepare(`SELECT value FROM system_config WHERE key = 'drop_user_tags_v1'`).get() as { value: string } | undefined
  if (dropTagsCfg?.value !== 'done') {
    db.exec(`DROP TABLE IF EXISTS user_tag_mappings;`)
    db.exec(`DROP TABLE IF EXISTS user_tags;`)
    db.prepare(`INSERT INTO system_config (key, value) VALUES ('drop_user_tags_v1', 'done')
                ON CONFLICT(key) DO UPDATE SET value = 'done'`).run()
    console.log('[DB] Dropped legacy user_tags / user_tag_mappings tables')
  }

  // ── 作品库 ──
  // 用户从已完成的生图任务一键「发布到作品库」，展示结果图 + 模式/模板/提示词/参数，
  // 其他人可浏览学习并「一键同款」复用参数生成。先发后审（admin 可下架）。
  // title 列已废弃（保留以兼容 NOT NULL 约束），统一存空串。
  db.exec(`
    CREATE TABLE IF NOT EXISTS works (
      id                   TEXT PRIMARY KEY,
      user_id              INTEGER NOT NULL REFERENCES users(id),
      title                TEXT NOT NULL DEFAULT '',
      description          TEXT DEFAULT '',
      image_url            TEXT NOT NULL,
      thumb_url            TEXT DEFAULT '',
      prompt               TEXT NOT NULL,
      user_prompt          TEXT DEFAULT '',
      prompt_segments      TEXT DEFAULT '{}',
      negative_prompt      TEXT DEFAULT '',
      model                VARCHAR(100) NOT NULL,
      resolution           VARCHAR(50),
      aspect_ratio         VARCHAR(50),
      feature_id           TEXT,
      reference_image_urls TEXT DEFAULT '[]',
      source_task_id       INTEGER,
      status               TEXT NOT NULL DEFAULT 'published',
      is_official          INTEGER NOT NULL DEFAULT 0,
      like_count           INTEGER NOT NULL DEFAULT 0,
      favorite_count       INTEGER NOT NULL DEFAULT 0,
      reuse_count          INTEGER NOT NULL DEFAULT 0,
      view_count           INTEGER NOT NULL DEFAULT 0,
      created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_works_status_created ON works(status, created_at DESC);`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_works_feature ON works(feature_id);`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_works_user ON works(user_id);`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_works_likes ON works(like_count DESC);`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_works_reuse ON works(reuse_count DESC);`)

  // ── 迁移：works 增加 remark 列（备注，原 description 字段合并至此）──
  try { db.exec(`ALTER TABLE works ADD COLUMN remark TEXT DEFAULT ''`) } catch { /* column already exists */ }

  // ── 迁移：把旧 description 的内容合并到 remark（幂等，仅执行一次）──
  const descMigCfg = db.prepare(`SELECT value FROM system_config WHERE key = 'migration_works_desc_to_remark_v1'`).get() as { value: string } | undefined
  if (!descMigCfg) {
    db.exec(`UPDATE works SET remark = description WHERE (remark IS NULL OR remark = '') AND description IS NOT NULL AND description != ''`)
    db.prepare(`INSERT INTO system_config (key, value) VALUES ('migration_works_desc_to_remark_v1', 'done')
      ON CONFLICT(key) DO UPDATE SET value = 'done'`).run()
    console.log('[DB] Migrated works.description -> remark')
  }

  // 全局作品标签（全局共享，区别于用户私有的 gallery_tags）
  db.exec(`
    CREATE TABLE IF NOT EXISTS work_tags (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        VARCHAR(100) NOT NULL UNIQUE,
      created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS work_tag_relations (
      work_id TEXT NOT NULL REFERENCES works(id) ON DELETE CASCADE,
      tag_id  INTEGER NOT NULL REFERENCES work_tags(id) ON DELETE CASCADE,
      PRIMARY KEY (work_id, tag_id)
    );
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_work_tag_relations_work ON work_tag_relations(work_id);`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_work_tag_relations_tag ON work_tag_relations(tag_id);`)

  // 互动：收藏（联合主键防重）
  db.exec(`
    CREATE TABLE IF NOT EXISTS work_favorites (
      user_id    INTEGER NOT NULL REFERENCES users(id),
      work_id    TEXT NOT NULL REFERENCES works(id) ON DELETE CASCADE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, work_id)
    );
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_work_favorites_user ON work_favorites(user_id);`)

  // 互动：点赞 —— 每人每天可对同一作品点赞一次。
  // 联合主键 (user_id, work_id, like_date) 保证「同一天只能赞一次」，
  // 跨天可重复点赞，like_count 随点赞记录数累加；取消则删除当天记录。
  db.exec(`
    CREATE TABLE IF NOT EXISTS work_likes (
      user_id    INTEGER NOT NULL REFERENCES users(id),
      work_id    TEXT NOT NULL REFERENCES works(id) ON DELETE CASCADE,
      like_date  TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, work_id, like_date)
    );
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_work_likes_work ON work_likes(work_id);`)

  // ── 迁移：work_likes 从「(user_id, work_id) 单次防重」改为「每日可赞一次」──
  // 旧表主键 (user_id, work_id) 限制每人只能赞一次；新版主键 (user_id, work_id, like_date)
  // 允许每天赞一次。幂等守卫，仅在旧结构存在时执行一次。
  const likeMigCfg = db.prepare(`SELECT value FROM system_config WHERE key = 'migration_work_likes_daily_v1'`).get() as { value: string } | undefined
  if (!likeMigCfg) {
    const tableInfo = db.prepare(`PRAGMA table_info(work_likes)`).all() as any[]
    const hasLikeDate = tableInfo.some((c) => c.name === 'like_date')
    if (!hasLikeDate) {
      // 旧结构：按 (user_id, work_id) 单次防重，created_at 为原始点赞时间
      db.exec(`ALTER TABLE work_likes RENAME TO work_likes_old`)
      db.exec(`
        CREATE TABLE work_likes (
          user_id    INTEGER NOT NULL REFERENCES users(id),
          work_id    TEXT NOT NULL REFERENCES works(id) ON DELETE CASCADE,
          like_date  TEXT NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id, work_id, like_date)
        );
      `)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_work_likes_work ON work_likes(work_id);`)
      // 迁移历史点赞：like_date 取 created_at 的日期部分（北京时间）
      db.exec(`
        INSERT INTO work_likes (user_id, work_id, like_date, created_at)
        SELECT user_id, work_id,
          date(created_at, 'modified', '+8 hours') AS like_date,
          created_at
        FROM work_likes_old
      `)
      db.exec(`DROP TABLE work_likes_old`)
    }
    db.prepare(`INSERT INTO system_config (key, value) VALUES ('migration_work_likes_daily_v1', 'done')
      ON CONFLICT(key) DO UPDATE SET value = 'done'`).run()
    console.log('[DB] Migrated work_likes to daily-like model')
  }

  // ── 结构化提示词参考案例库 ──
  // 官方预生成：针对某个结构化字段（如光影）的某个关键词（如「柔光」）配一组参考图，
  // 让用户「看图选词」。prompt_snapshot 为生成该图时的完整 prompt（可复现）。
  db.exec(`
    CREATE TABLE IF NOT EXISTS prompt_cases (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      segment_key     TEXT NOT NULL,
      keyword         TEXT NOT NULL,
      image_url       TEXT NOT NULL,
      prompt_snapshot TEXT DEFAULT '',
      model           VARCHAR(100) DEFAULT '',
      sort_order      INTEGER NOT NULL DEFAULT 0,
      is_official     INTEGER NOT NULL DEFAULT 0,
      created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_prompt_cases_segment ON prompt_cases(segment_key, keyword);`)

  // ── 迁移：prompt_library 增加 segments 列（结构化提示词字段 JSON）──
  // content 仍存最终拼接好的 prompt 文本，segments 存六层结构化字段 JSON。
  // 纯文本提示词 segments='{}'，结构化提示词有值；向后兼容。
  try { db.exec(`ALTER TABLE prompt_library ADD COLUMN segments TEXT DEFAULT '{}'`) } catch { /* column already exists */ }

  // ── 迁移：generation_tasks 增加 prompt_segments / negative_prompt 列 ──
  // 任务提交时若有结构化数据则写入；发布作品时直接拷贝，无需用户手填。
  try { db.exec(`ALTER TABLE generation_tasks ADD COLUMN prompt_segments TEXT DEFAULT '{}'`) } catch { /* column already exists */ }
  try { db.exec(`ALTER TABLE generation_tasks ADD COLUMN negative_prompt TEXT DEFAULT ''`) } catch { /* column already exists */ }

  // ────────────────────────────────────────────────────────────
  //  提示词工坊 · 结构化模块体系（重构版）
  //
  //  prompt_modules   模块定义（要求/元素/禁止出现）
  //  prompt_cards     提示词卡片（公开社区库，带多图 + 置顶 + 备注）
  //  prompt_card_favorites / prompt_card_likes  互动表（参考 works 体系）
  //
  //  「要求」与「禁止出现」为系统内置模块（is_system=1，固定首尾，不可删），
  //  管理员在此基础上自由增删「元素」模块（风格/场景/光影/构图/画质等）。
  // ────────────────────────────────────────────────────────────

  // 模块定义
  db.exec(`
    CREATE TABLE IF NOT EXISTS prompt_modules (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        VARCHAR(100) NOT NULL,
      type        VARCHAR(20)  NOT NULL DEFAULT 'element',   -- requirement | element | forbidden
      sort_order  INTEGER NOT NULL DEFAULT 0,
      is_system   INTEGER NOT NULL DEFAULT 0,                -- 系统内置模块不可删除/改名
      created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_prompt_modules_type ON prompt_modules(type, sort_order);`)

  // 预置系统内置模块 + 常用元素模块（幂等守卫，仅执行一次）
  const seedModulesCfg = db.prepare(`SELECT value FROM system_config WHERE key = 'seed_prompt_modules_v1'`).get() as { value: string } | undefined
  if (seedModulesCfg?.value !== 'done') {
    const insertSystem = db.prepare(`INSERT INTO prompt_modules (name, type, sort_order, is_system) VALUES (?, ?, ?, 1)`)
    const insertElement = db.prepare(`INSERT OR IGNORE INTO prompt_modules (name, type, sort_order, is_system) VALUES (?, 'element', ?, 0)`)
    insertSystem.run('要求', 'requirement', 0)
    // 常用元素模块（管理员后续可改名/删除/新增）
    insertElement.run('风格', 10)
    insertElement.run('场景', 20)
    insertElement.run('光影', 30)
    insertElement.run('构图', 40)
    insertElement.run('画质', 50)
    insertSystem.run('禁止出现', 'forbidden', 9999)
    db.prepare(`INSERT INTO system_config (key, value) VALUES ('seed_prompt_modules_v1', 'done')
                ON CONFLICT(key) DO UPDATE SET value = 'done'`).run()
    console.log('[DB] Seeded prompt modules')
  }

  // 提示词卡片（公开社区库）
  db.exec(`
    CREATE TABLE IF NOT EXISTS prompt_cards (
      id              TEXT PRIMARY KEY,
      user_id         INTEGER NOT NULL REFERENCES users(id),
      module_id       INTEGER REFERENCES prompt_modules(id) ON DELETE SET NULL,
      content         TEXT NOT NULL,
      images          TEXT NOT NULL DEFAULT '[]',            -- JSON 数组（OSS URL），1~10 张
      cover_index     INTEGER NOT NULL DEFAULT 0,            -- 置顶图下标
      remark          TEXT DEFAULT '',
      status          TEXT NOT NULL DEFAULT 'published',     -- published | hidden
      is_official     INTEGER NOT NULL DEFAULT 0,
      like_count      INTEGER NOT NULL DEFAULT 0,
      favorite_count  INTEGER NOT NULL DEFAULT 0,
      reuse_count     INTEGER NOT NULL DEFAULT 0,
      created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_prompt_cards_status_created ON prompt_cards(status, created_at DESC);`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_prompt_cards_module ON prompt_cards(module_id);`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_prompt_cards_user ON prompt_cards(user_id);`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_prompt_cards_likes ON prompt_cards(like_count DESC);`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_prompt_cards_reuse ON prompt_cards(reuse_count DESC);`)

  // 互动：收藏（联合主键防重）
  db.exec(`
    CREATE TABLE IF NOT EXISTS prompt_card_favorites (
      user_id    INTEGER NOT NULL REFERENCES users(id),
      card_id    TEXT NOT NULL REFERENCES prompt_cards(id) ON DELETE CASCADE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, card_id)
    );
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_prompt_card_favorites_user ON prompt_card_favorites(user_id);`)

  // 互动：点赞 —— 每人每天可对同一卡片点赞一次（参考 work_likes 体系）
  db.exec(`
    CREATE TABLE IF NOT EXISTS prompt_card_likes (
      user_id    INTEGER NOT NULL REFERENCES users(id),
      card_id    TEXT NOT NULL REFERENCES prompt_cards(id) ON DELETE CASCADE,
      like_date  TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, card_id, like_date)
    );
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_prompt_card_likes_card ON prompt_card_likes(card_id);`)

  // ────────────────────────────────────────────────────────────
  //  AI 服务商配置
  //
  //  api_providers       服务商（火山引擎 / ToAPIs / DeepSeek ...）
  //  ai_models           模型（provider 1:N model）
  //  api_provider_keys   密钥（provider 1:N key，每服务商唯一一把主 Key，连接用主 Key）
  //  adapter 列指向 providers/ 目录下的适配器实现（协议与调用方式的解耦点）
  // ────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_providers (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      code        VARCHAR(50)  NOT NULL UNIQUE,
      name        VARCHAR(100) NOT NULL,
      base_url    TEXT         NOT NULL,
      adapter     VARCHAR(50)  NOT NULL DEFAULT 'openai_compat',
      remark      TEXT         NOT NULL DEFAULT '',
      status      VARCHAR(20)  NOT NULL DEFAULT 'active',
      created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_models (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_id        INTEGER NOT NULL REFERENCES api_providers(id) ON DELETE CASCADE,
      model_id           VARCHAR(100) NOT NULL,
      display_name       VARCHAR(100) NOT NULL DEFAULT '',
      supports_vision    INTEGER NOT NULL DEFAULT 0,
      supports_image_gen INTEGER NOT NULL DEFAULT 0,
      remark             TEXT    NOT NULL DEFAULT '',
      status             VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(provider_id, model_id)
    );
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ai_models_provider ON ai_models(provider_id);`)

  db.exec(`
    CREATE TABLE IF NOT EXISTS api_provider_keys (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_id     INTEGER NOT NULL REFERENCES api_providers(id) ON DELETE CASCADE,
      name            VARCHAR(100) NOT NULL DEFAULT '',
      encrypted_key   TEXT NOT NULL,
      key_iv          TEXT NOT NULL,
      key_tag         TEXT NOT NULL,
      key_hint        TEXT NOT NULL DEFAULT '',
      is_primary      INTEGER NOT NULL DEFAULT 0,
      status          VARCHAR(20) NOT NULL DEFAULT 'active',
      last_checked_at TIMESTAMP NULL,
      last_check_ok   INTEGER NULL,
      created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_api_provider_keys_provider ON api_provider_keys(provider_id);`)
  // 每个服务商至多一把主 Key（部分唯一索引：仅 is_primary=1 的行参与）
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_api_provider_keys_primary
           ON api_provider_keys(provider_id) WHERE is_primary = 1;`)

  // 种子数据：火山引擎 + 主 Key + doubao-seed-2.1-turbo
  initApiProviders()

  // suite-gen（成套生图与提示词专家）：资产表 + 套系表 + 种子数据
  initSuiteGen()

  // ai-provider（AI 接入体系重构）：逻辑模型/渠道/渠道模型 + 存量数据迁移（幂等）
  initAiProviderMigration()

  // 逻辑模型以代码清单为准（能力/类型/状态随代码同步；管理员仅可改显示名）
  syncCanonicalLogicalModels()

  console.log('[DB] Schema initialized')
}
