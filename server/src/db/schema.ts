import { db } from './index.js'

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

  // Migration: add tags column to users (JSON array)
  try {
    db.exec(`ALTER TABLE users ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'`)
  } catch { /* column already exists */ }

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

  // User tags definition table
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name VARCHAR(64) NOT NULL UNIQUE,
      color VARCHAR(7) DEFAULT '#409EFF',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  // User-tag mappings (many-to-many)
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_tag_mappings (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES user_tags(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, tag_id)
    );
  `)

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

  console.log('[DB] Schema initialized')
}
