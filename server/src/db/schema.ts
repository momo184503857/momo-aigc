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

  // Feature prompts table (per-feature per-model system prompts)
  db.exec(`
    CREATE TABLE IF NOT EXISTS feature_prompts (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      feature_id          TEXT NOT NULL,
      model_id            TEXT NOT NULL,
      system_prompt       TEXT NOT NULL DEFAULT '',
      user_prompt_label   TEXT DEFAULT '补充描述',
      user_prompt_placeholder TEXT DEFAULT '',
      created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(feature_id, model_id)
    );
  `)

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


  console.log('[DB] Schema initialized')
}
