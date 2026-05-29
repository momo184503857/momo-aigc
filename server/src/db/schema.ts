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

  console.log('[DB] Schema initialized')
}
