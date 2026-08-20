import path from 'node:path'
import { db } from './index.js'
import { config } from '../config.js'
import { encryptKey, resolveKeyPlain, maskKey } from '../utils/crypto.js'
import { CANONICAL_LOGICAL_MODELS } from './logicalModels.js'

/**
 * AI 接入体系重构（ai-provider）· 数据库迁移与种子。
 *
 * T1 逻辑模型种子（ai_logical_models ×7：4 生图 + 3 文字，能力取自原前端 MODELS/TEXT_MODELS）
 * T2 toapis 平台渠道（共享 Key → 渠道主 Key）
 * T3 toapis 渠道模型 ×7（定价取自原 utils/pricing.ts）
 * T4 个人 ToAPIs Key → 用户渠道（每用户一条渠道 + Key + 4 生图模型）
 * T5 历史任务回填（provider_code / provider_task_id / channel_* / task_no）
 * T6 平台渠道 Key 密文 → 明文（后台可查看/复制；无标记，按 key_iv 为空幂等）
 * T7 fixed-channels 收尾：api_provider_keys 加 priority/exhausted_at、拆主 Key 约束、
 *    删除全部用户渠道（历史任务外键置空）、DROP user_toapis_keys
 *
 * 幂等标记（system_config）：seed_ai_provider_v1（T1-T3）、migrate_user_keys_v1（T4）、
 * migrate_tasks_v1（T5）、migrate_fixed_channels_v1（T7）。T5 支持断点续跑（按 task_no IS NULL）。
 * 迁移前自动备份（VACUUM INTO），备份失败中止启动。
 * MIGRATION_DRY_RUN=1 时仅输出影响行数与抽样，不写库。
 */

const DRY_RUN = process.env.MIGRATION_DRY_RUN === '1'

function flag(name: string): string | undefined {
  const row = db.prepare(`SELECT value FROM system_config WHERE key = ?`).get(name) as { value: string } | undefined
  return row?.value
}

function setFlag(name: string): void {
  db.prepare(`INSERT INTO system_config (key, value) VALUES (?, 'done')
              ON CONFLICT(key) DO UPDATE SET value = 'done'`).run(name)
}

// ── 种子常量（原 src/types/adapter.ts MODELS/TEXT_MODELS + server/src/utils/pricing.ts）──
// 逻辑模型清单已收敛至 logicalModels.ts（代码内置，唯一事实源）

/** toapis 渠道模型种子：model_id / 逻辑模型 / 定价（原 pricing.ts） */
const TOAPIS_CHANNEL_MODELS: Array<{ modelId: string; displayName: string; kind: 'image' | 'text'; pricing: Record<string, number> | null }> = [
  { modelId: 'gpt-image-2', displayName: 'GPT-Image-2', kind: 'image', pricing: { '1K': 3, '2K': 4, '4K': 5 } },
  { modelId: 'gemini-3-pro-image-preview', displayName: 'Gemini 3 Pro Image', kind: 'image', pricing: { '1K': 10, '2K': 12, '4K': 16 } },
  { modelId: 'gemini-3.1-flash-image-preview', displayName: 'Gemini 3.1 Flash Image', kind: 'image', pricing: { '512': 5, '1K': 6, '2K': 8, '4K': 12 } },
  { modelId: 'gemini-2.5-flash-image-preview', displayName: 'Gemini 2.5 Flash Image', kind: 'image', pricing: { '1K': 2.4 } },
  { modelId: 'gpt-5.5', displayName: 'GPT-5.5', kind: 'text', pricing: null },
  { modelId: 'gemini-3-flash', displayName: 'Gemini 3 Flash', kind: 'text', pricing: null },
  { modelId: 'gemini-3.1-flash-lite', displayName: 'Gemini 3.1 Flash Lite', kind: 'text', pricing: null },
]

// ── DDL ──

function runDdl(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_logical_models (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      code           VARCHAR(100) NOT NULL UNIQUE,
      name           VARCHAR(100) NOT NULL DEFAULT '',
      kind           VARCHAR(20)  NOT NULL DEFAULT 'image',
      default_params TEXT NOT NULL DEFAULT '{}',
      status         VARCHAR(20)  NOT NULL DEFAULT 'active',
      remark         TEXT NOT NULL DEFAULT '',
      created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  // api_providers：渠道归属（NULL=平台渠道；非空=用户自建渠道）
  try { db.exec(`ALTER TABLE api_providers ADD COLUMN owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE`) } catch { /* column exists */ }
  try { db.exec(`ALTER TABLE api_providers ADD COLUMN balance_check_interval_sec INTEGER NOT NULL DEFAULT 60`) } catch { /* column exists */ }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_providers_owner ON api_providers(owner_user_id);`)

  // ai_models：渠道模型（逻辑模型映射 + 能力覆盖 + 定价 + 文字标记）
  try { db.exec(`ALTER TABLE ai_models ADD COLUMN logical_model_id INTEGER REFERENCES ai_logical_models(id)`) } catch { /* column exists */ }
  try { db.exec(`ALTER TABLE ai_models ADD COLUMN param_overrides TEXT`) } catch { /* column exists */ }
  try { db.exec(`ALTER TABLE ai_models ADD COLUMN pricing TEXT`) } catch { /* column exists */ }
  try { db.exec(`ALTER TABLE ai_models ADD COLUMN supports_chat INTEGER NOT NULL DEFAULT 0`) } catch { /* column exists */ }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_models_logical ON ai_models(logical_model_id);`)

  // generation_tasks：任务键切换（内部任务号收口；toapis_task_id 停写）
  try { db.exec(`ALTER TABLE generation_tasks ADD COLUMN task_no VARCHAR(64)`) } catch { /* column exists */ }
  try { db.exec(`ALTER TABLE generation_tasks ADD COLUMN provider_task_id VARCHAR(255)`) } catch { /* column exists */ }
  try { db.exec(`ALTER TABLE generation_tasks ADD COLUMN channel_model_id INTEGER REFERENCES ai_models(id)`) } catch { /* column exists */ }
  try { db.exec(`ALTER TABLE generation_tasks ADD COLUMN channel_provider_id INTEGER REFERENCES api_providers(id)`) } catch { /* column exists */ }
  try { db.exec(`ALTER TABLE generation_tasks ADD COLUMN provider_code VARCHAR(50)`) } catch { /* column exists */ }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_provider_task ON generation_tasks(provider_task_id);`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_channel_model ON generation_tasks(channel_model_id);`)
}

function backupBeforeMigration(): void {
  const dir = path.dirname(config.dbPath)
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(dir, `backup-pre-ai-provider-${ts}.db`)
  try {
    db.prepare(`VACUUM INTO ?`).run(backupPath)
    console.log(`[DB] Pre-migration backup created: ${backupPath}`)
  } catch (e: any) {
    // 备份失败 → 中止启动（迁移手册 §2：迁移不完整不对外服务）
    throw new Error(`迁移前备份失败，已中止启动：${e.message}`)
  }
}

// ── T1-T3：逻辑模型 + toapis 平台渠道 + 渠道模型 ──

function seedAiProvider(): void {
  if (flag('seed_ai_provider_v1') === 'done') return

  if (DRY_RUN) {
    console.log('[dry-run] T1 逻辑模型种子：7 行；T2 toapis 平台渠道：1 行；T3 渠道模型：7 行')
    return
  }

  const tx = db.transaction(() => {
    // T1 逻辑模型
    const insertLogical = db.prepare(`
      INSERT OR IGNORE INTO ai_logical_models (code, name, kind, default_params, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `)
    for (const m of CANONICAL_LOGICAL_MODELS) {
      insertLogical.run(m.code, m.name, m.kind, JSON.stringify(m.default_params))
    }

    // T2 toapis 平台渠道（幂等：code 唯一）
    db.prepare(`
      INSERT OR IGNORE INTO api_providers (code, name, base_url, adapter, remark, status, created_at, updated_at)
      VALUES ('toapis', 'ToAPIs', 'https://toapis.com', 'toapis', '平台主渠道（迁移自共享 Key 体系）', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run()
    const channel = db.prepare(`SELECT id FROM api_providers WHERE code = 'toapis' AND owner_user_id IS NULL`).get() as { id: number }

    // T2 共享 Key → 渠道主 Key（原 system_config.toapis_api_key 保留不动，双写一个版本便于回滚）
    const sharedKey = (db.prepare(`SELECT value FROM system_config WHERE key = 'toapis_api_key'`).get() as { value: string } | undefined)?.value || ''
    if (sharedKey) {
      const hasKey = db.prepare(`SELECT id FROM api_provider_keys WHERE provider_id = ? AND is_primary = 1`).get(channel.id)
      if (!hasKey) {
        const enc = encryptKey(sharedKey)
        db.prepare(`
          INSERT INTO api_provider_keys (provider_id, name, encrypted_key, key_iv, key_tag, key_hint, is_primary, status, created_at, updated_at)
          VALUES (?, '主 Key（迁移自共享 Key）', ?, ?, ?, ?, 1, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(channel.id, enc.ciphertext, enc.iv, enc.tag, maskKey(sharedKey))
      }
    }

    // T3 渠道模型 ×7
    const insertModel = db.prepare(`
      INSERT OR IGNORE INTO ai_models
        (provider_id, model_id, display_name, supports_vision, supports_image_gen, supports_chat, logical_model_id, pricing, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, (SELECT id FROM ai_logical_models WHERE code = ?), ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `)
    for (const m of TOAPIS_CHANNEL_MODELS) {
      const isImage = m.kind === 'image'
      insertModel.run(
        channel.id, m.modelId, m.displayName,
        isImage ? 1 : 0,   // 生图模型必支持识图（沿用管理端校验口径）
        isImage ? 1 : 0,
        isImage ? 0 : 1,
        m.modelId,
        m.pricing ? JSON.stringify(m.pricing) : null,
      )
    }

    setFlag('seed_ai_provider_v1')
  })
  tx()
  console.log('[DB] ai-provider seed_v1 done（逻辑模型×7 + toapis 平台渠道 + 渠道模型×7）')
}

// ── T4：个人 ToAPIs Key → 用户渠道 ──

function migrateUserKeys(): void {
  if (flag('migrate_user_keys_v1') === 'done') return

  // fixed-channels 后基线不再创建 user_toapis_keys（新库）：无表即无个人 Key 可迁，直接置标记
  const tableExists = !!db.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'user_toapis_keys'
  `).get()
  if (!tableExists) {
    if (!DRY_RUN) setFlag('migrate_user_keys_v1')
    return
  }

  const rows = db.prepare(`
    SELECT k.user_id, k.encrypted_key, k.key_iv, k.key_tag, k.key_hint, k.use_personal_key, k.balance_check_interval_sec
    FROM user_toapis_keys k
    WHERE NOT EXISTS (
      SELECT 1 FROM api_providers p WHERE p.owner_user_id = k.user_id AND p.adapter = 'toapis'
    )
  `).all() as Array<{
    user_id: number
    encrypted_key: string
    key_iv: string
    key_tag: string
    key_hint: string
    use_personal_key: number
    balance_check_interval_sec: number
  }>

  if (DRY_RUN) {
    console.log(`[dry-run] T4 个人 Key → 用户渠道：${rows.length} 行`)
    for (const r of rows.slice(0, 3)) console.log(`  用户 ${r.user_id}：hint=${r.key_hint}，use_personal_key=${r.use_personal_key}`)
    return
  }

  if (rows.length === 0) {
    setFlag('migrate_user_keys_v1')
    return
  }

  const logicalIds = Object.fromEntries(
    (db.prepare(`SELECT id, code FROM ai_logical_models WHERE kind = 'image'`).all() as Array<{ id: number; code: string }>)
      .map((r) => [r.code, r.id])
  )

  const tx = db.transaction(() => {
    const insertProvider = db.prepare(`
      INSERT INTO api_providers (code, name, base_url, adapter, remark, status, owner_user_id, balance_check_interval_sec, created_at, updated_at)
      VALUES (?, 'ToAPIs（迁移）', 'https://toapis.com', 'toapis', '迁移自个人 ToAPIs Key', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `)
    const insertKey = db.prepare(`
      INSERT INTO api_provider_keys (provider_id, name, encrypted_key, key_iv, key_tag, key_hint, is_primary, status, created_at, updated_at)
      VALUES (?, '主 Key（迁移）', ?, ?, ?, ?, 1, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `)
    const insertModel = db.prepare(`
      INSERT OR IGNORE INTO ai_models
        (provider_id, model_id, display_name, supports_vision, supports_image_gen, logical_model_id, pricing, status, created_at, updated_at)
      VALUES (?, ?, ?, 1, 1, ?, NULL, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `)

    for (const r of rows) {
      // 用户渠道 code 自动生成（u{userId}-{6位随机}），避免与平台 code 冲突
      const rand = Math.random().toString(36).slice(2, 8)
      const result = insertProvider.run(
        `u${r.user_id}-${rand}`,
        r.use_personal_key === 1 ? 'active' : 'disabled',
        r.user_id,
        r.balance_check_interval_sec ?? 60,
      )
      const providerId = Number(result.lastInsertRowid)
      // 同 ENCRYPTION_KEY 下密文直接搬移，无需解密重加密
      insertKey.run(providerId, r.encrypted_key, r.key_iv, r.key_tag, r.key_hint)
      for (const m of TOAPIS_CHANNEL_MODELS.filter((x) => x.kind === 'image')) {
        insertModel.run(providerId, m.modelId, m.displayName, logicalIds[m.modelId] ?? null)
      }
    }
    setFlag('migrate_user_keys_v1')
  })
  tx()
  console.log(`[DB] migrate_user_keys_v1 done（${rows.length} 个个人 Key → 用户渠道）`)
}

// ── T5：历史任务回填 ──

function migrateTasks(): void {
  if (flag('migrate_tasks_v1') === 'done') return

  const toapisChannel = db.prepare(`
    SELECT id FROM api_providers WHERE code = 'toapis' AND owner_user_id IS NULL
  `).get() as { id: number } | undefined
  if (!toapisChannel) {
    // 种子未跑（异常路径）：不标记完成，下次启动重试
    console.warn('[DB] migrate_tasks_v1 skipped：toapis 平台渠道不存在')
    return
  }

  const channelModels = db.prepare(`
    SELECT id, model_id FROM ai_models WHERE provider_id = ?
  `).all(toapisChannel.id) as Array<{ id: number; model_id: string }>
  const modelIdMap = new Map(channelModels.map((m) => [m.model_id, m.id]))

  const pending = db.prepare(`
    SELECT COUNT(*) AS c FROM generation_tasks WHERE task_no IS NULL
  `).get() as { c: number }

  if (DRY_RUN) {
    console.log(`[dry-run] T5 历史任务回填：${pending.c} 行待回填`)
    const sample = db.prepare(`SELECT id, model, toapis_task_id FROM generation_tasks WHERE task_no IS NULL LIMIT 3`).all() as any[]
    for (const s of sample) console.log(`  任务 ${s.id}：model=${s.model}，toapis_task_id=${s.toapis_task_id}`)
    return
  }

  const BATCH = 500
  let total = 0
  while (true) {
    const rows = db.prepare(`
      SELECT id, model, toapis_task_id FROM generation_tasks WHERE task_no IS NULL LIMIT ?
    `).all(BATCH) as Array<{ id: number; model: string; toapis_task_id: string }>
    if (rows.length === 0) break

    const tx = db.transaction(() => {
      const update = db.prepare(`
        UPDATE generation_tasks SET
          task_no = 'gen-' || printf('%08d', id),
          provider_code = 'toapis',
          provider_task_id = toapis_task_id,
          channel_provider_id = ?,
          channel_model_id = ?
        WHERE id = ?
      `)
      for (const r of rows) {
        update.run(toapisChannel.id, modelIdMap.get(r.model) ?? null, r.id)
      }
    })
    tx()
    total += rows.length
  }

  // 回填完成后建唯一索引（首次运行时 task_no 全量回填完毕才安全）
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_task_no ON generation_tasks(task_no);`)

  setFlag('migrate_tasks_v1')
  console.log(`[DB] migrate_tasks_v1 done（${total} 条历史任务回填）`)
}

// ── T6：平台渠道 Key 密文 → 明文（后台配置的 Key 不加密、可复制）──

function migratePlatformKeysToPlain(): void {
  // 仅平台渠道（owner_user_id IS NULL）且仍为密文（key_iv 非空）的行；转换后 key_iv 置空，天然幂等
  const rows = db.prepare(`
    SELECT k.id, k.encrypted_key, k.key_iv, k.key_tag
    FROM api_provider_keys k JOIN api_providers p ON p.id = k.provider_id
    WHERE p.owner_user_id IS NULL AND k.key_iv != ''
  `).all() as Array<{ id: number; encrypted_key: string; key_iv: string; key_tag: string }>
  if (rows.length === 0) return

  if (DRY_RUN) {
    console.log(`[dry-run] T6 平台渠道 Key → 明文：${rows.length} 行`)
    return
  }

  // 密文改明文不可逆，首次转换前备份
  backupBeforeMigration()

  const update = db.prepare(`
    UPDATE api_provider_keys SET encrypted_key = ?, key_iv = '', key_tag = '', updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `)
  let ok = 0
  for (const r of rows) {
    try {
      update.run(resolveKeyPlain(r), r.id)
      ok++
    } catch (e) {
      // 解密失败（如 ENCRYPTION_KEY 已轮换）：保留密文行，不影响启动；下次启动重试
      console.warn(`[DB] T6 api_provider_keys#${r.id} 解密失败，保留密文：`, (e as Error).message)
    }
  }
  console.log(`[DB] T6 平台渠道 Key 明文化 done（${ok}/${rows.length}）`)
}

// ── T7：fixed-channels 收尾（Key 池列 + 拆主 Key 约束 + 删用户渠道 + DROP 遗留表）──

function migrateFixedChannels(): void {
  // T7.1 Key 池列（try/catch 幂等；置于标记守卫之外，确保任何路径进来列都已就位）
  try { db.exec(`ALTER TABLE api_provider_keys ADD COLUMN priority INTEGER NOT NULL DEFAULT 100`) } catch { /* column exists */ }
  try { db.exec(`ALTER TABLE api_provider_keys ADD COLUMN exhausted_at TIMESTAMP NULL`) } catch { /* column exists */ }
  if (flag('migrate_fixed_channels_v1') === 'done') return

  const isPrimaryColExists = !!db.prepare(`
    SELECT name FROM pragma_table_info('api_provider_keys') WHERE name = 'is_primary'
  `).get()

  const userProviders = db.prepare(`
    SELECT id, code, name, owner_user_id FROM api_providers WHERE owner_user_id IS NOT NULL ORDER BY id ASC
  `).all() as Array<{ id: number; code: string; name: string; owner_user_id: number }>
  const tasksToNull = userProviders.length
    ? (db.prepare(`
        SELECT COUNT(*) AS c FROM generation_tasks
        WHERE channel_provider_id IN (${userProviders.map(() => '?').join(',')})
      `).get(...userProviders.map((p) => p.id)) as { c: number }).c
    : 0
  const primaryKeys = isPrimaryColExists
    ? (db.prepare(`SELECT COUNT(*) AS c FROM api_provider_keys WHERE is_primary = 1`).get() as { c: number }).c
    : 0

  if (DRY_RUN) {
    console.log(`[dry-run] T7 fixed-channels：待删用户渠道 ${userProviders.length} 个、待置空历史任务 ${tasksToNull} 条、待回填 priority=1 的 Key ${primaryKeys} 行`)
    for (const p of userProviders.slice(0, 5)) console.log(`  渠道 #${p.id} ${p.name}（owner=${p.owner_user_id}）`)
    return
  }

  // T7 含删除性操作（用户渠道/主 Key 约束/遗留表）：已在 initAiProviderMigration 入口
  // 备份（backupBeforeMigration，失败中止启动），此处直接执行
  const tx = db.transaction(() => {
    // T7.2 回填：原主 Key → priority 1；其余保持 DEFAULT 100（选取序与原「删主 Key 按 id 提升」语义一致）
    if (isPrimaryColExists) {
      db.prepare(`UPDATE api_provider_keys SET priority = 1 WHERE is_primary = 1`).run()
    }

    // T7.3 拆除主 Key 约束（DROP COLUMN 依赖 SQLite ≥ 3.35，失败保留死列，代码零引用）
    db.exec(`DROP INDEX IF EXISTS idx_api_provider_keys_primary`)
    if (isPrimaryColExists) {
      try { db.exec(`ALTER TABLE api_provider_keys DROP COLUMN is_primary`) } catch (e: any) {
        console.warn('[DB] T7 DROP COLUMN is_primary 失败（旧 SQLite 保留死列，无引用）：', e.message)
      }
    }

    // T7.4 删除全部用户渠道：历史任务外键先置空（任务记录与展示不受影响），再整链删除
    if (userProviders.length > 0) {
      db.prepare(`
        UPDATE generation_tasks SET channel_model_id = NULL, channel_provider_id = NULL
        WHERE channel_provider_id IN (${userProviders.map(() => '?').join(',')})
      `).run(...userProviders.map((p) => p.id))
      console.log(`[DB] T7 删除用户渠道：${userProviders.map((p) => `#${p.id} ${p.name}(owner=${p.owner_user_id})`).join('、')}`)
      db.prepare(`DELETE FROM api_providers WHERE owner_user_id IS NOT NULL`).run()
    }

    // T7.5 遗留个人 Key 表（T4 数据已随用户渠道删除，无二次利用价值）
    db.exec(`DROP TABLE IF EXISTS user_toapis_keys`)

    setFlag('migrate_fixed_channels_v1')
  })
  tx()
  console.log(`[DB] migrate_fixed_channels_v1 done（用户渠道删除 ${userProviders.length} 个、历史任务置空 ${tasksToNull} 条、主 Key 回填 ${primaryKeys} 行）`)
}

// ── 入口 ──

export function initAiProviderMigration(): void {
  const needSeed = flag('seed_ai_provider_v1') !== 'done'
  const needUserKeys = flag('migrate_user_keys_v1') !== 'done'
  const needTasks = flag('migrate_tasks_v1') !== 'done'
  const needFixedChannels = flag('migrate_fixed_channels_v1') !== 'done'

  if (DRY_RUN) {
    console.log('[DB] MIGRATION_DRY_RUN=1：ai-provider 迁移 dry-run 模式，不写库')
    // DDL 仍执行（IF NOT EXISTS 幂等且不破坏数据），种子与回填仅输出
  } else if (needSeed || needUserKeys || needTasks || needFixedChannels) {
    backupBeforeMigration()
  }

  runDdl()
  seedAiProvider()
  migrateUserKeys()
  migrateTasks()
  migratePlatformKeysToPlain()
  migrateFixedChannels()

  if (!DRY_RUN) {
    // 兜底：即使所有标记已完成，也确保唯一索引存在（如历史中断）
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_task_no ON generation_tasks(task_no);`)
  }
}
