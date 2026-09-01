import { db } from './index.js'
import { maskKey } from '../utils/crypto.js'

/**
 * 种子数据：AI 服务商配置（api_providers / ai_provider_keys / ai_models）。
 *
 * 首次启动时预置「火山引擎」服务商 + doubao-seed-2.1-turbo 模型；配置了环境变量
 * VOLCENGINE_API_KEY 时顺带预置一把 Key，让配置页开箱即可测试。
 * 幂等守卫：system_config.seed_api_providers_v1 标记后不再执行。
 *
 * 未配置 VOLCENGINE_API_KEY 时只预置服务商与模型，Key 请在管理后台「配置」页添加。
 */
export function initApiProviders(): void {
  // 表由 schema.ts 创建；此处仅做种子数据

  // 开箱默认识图模型（成套生图 AI 识别用）；管理员可在后台「配置」页更换。
  // 放在种子标记守卫之前：旧库已跑过种子时也能补上，且不覆盖管理员已有的配置。
  const visionCfg = db.prepare(`SELECT value FROM system_config WHERE key = 'default_vision_model'`).get() as { value: string } | undefined
  if (!(visionCfg?.value || '').trim()) {
    const seeded = db.prepare(`
      SELECT p.id AS provider_id, m.model_id FROM api_providers p
      JOIN ai_models m ON m.provider_id = p.id AND m.supports_vision = 1 AND m.status = 'active'
      WHERE p.code = 'volcengine' AND p.status = 'active' LIMIT 1
    `).get() as { provider_id: number; model_id: string } | undefined
    if (seeded) {
      db.prepare(`INSERT INTO system_config (key, value) VALUES ('default_vision_model', ?)
                  ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
        .run(`${seeded.provider_id}:${seeded.model_id}`)
    }
  }

  const seedCfg = db.prepare(`SELECT value FROM system_config WHERE key = 'seed_api_providers_v1'`).get() as { value: string } | undefined
  if (seedCfg?.value === 'done') return

  const VOLCENGINE_BASE_URL = 'https://ark.cn-beijing.volces.com/api/coding/v3'
  const VOLCENGINE_KEY = (process.env.VOLCENGINE_API_KEY || '').trim()

  const insertProvider = db.prepare(`
    INSERT INTO api_providers (code, name, base_url, adapter, remark, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `)
  const insertKey = db.prepare(`
    INSERT INTO api_provider_keys (provider_id, name, encrypted_key, key_iv, key_tag, key_hint, priority, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `)
  const insertModel = db.prepare(`
    INSERT INTO ai_models (provider_id, model_id, display_name, supports_vision, supports_image_gen, remark, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `)
  const setFlag = db.prepare(`
    INSERT INTO system_config (key, value) VALUES ('seed_api_providers_v1', 'done')
    ON CONFLICT(key) DO UPDATE SET value = 'done'
  `)

  const tx = db.transaction(() => {
    const result = insertProvider.run(
      'volcengine',
      '火山引擎',
      VOLCENGINE_BASE_URL,
      'volcengine',
      '火山方舟 Ark · Coding Plan 端点（OpenAI 兼容协议）',
    )
    const providerId = Number(result.lastInsertRowid)

    // 平台渠道 Key 明文存储（key_iv 置空），后台可查看/复制；未配置 VOLCENGINE_API_KEY 时跳过
    if (VOLCENGINE_KEY) {
      insertKey.run(providerId, '默认 Key', VOLCENGINE_KEY, '', '', maskKey(VOLCENGINE_KEY))
    }

    // 实测该模型支持图片输入（识图），不支持图片输出
    insertModel.run(providerId, 'doubao-seed-2.1-turbo', 'Doubao Seed 2.1 Turbo', 1, 0, '推理型：回答在 content，思维链在 reasoning_content')

    setFlag.run()
  })
  tx()

  console.log('[DB] Seeded api_providers (volcengine)')
}

/**
 * 种子数据：易联 API 渠道（gpt-image-2，OpenAI Images 兼容中转，同步生图）。
 *
 * 依赖 ai_logical_models 已建表且逻辑模型 gpt-image-2 已同步，须在
 * initAiProviderMigration / syncCanonicalLogicalModels 之后调用（见 schema.ts）。
 * 幂等守卫：system_config.seed_yilian_channel_v1 标记后不再执行；已删过该渠道
 * 不会自动重建，需在管理后台手动添加。
 *
 * 配置了环境变量 YILIAN_API_KEY 且渠道尚无任何 Key 时顺带预置一把（明文），
 * 否则只预置渠道与模型，Key 请在管理后台「配置」页添加。
 */
export function seedYilianChannel(): void {
  const flag = db.prepare(`SELECT value FROM system_config WHERE key = 'seed_yilian_channel_v1'`).get() as { value: string } | undefined
  if (flag?.value === 'done') return

  const YILIAN_KEY = (process.env.YILIAN_API_KEY || '').trim()

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT OR IGNORE INTO api_providers (code, name, base_url, adapter, remark, created_at, updated_at)
      VALUES ('yilian', '易联 API', 'https://yilian.space', 'openai_image', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run('易联中转（OpenAI Images 兼容，同步生图；实测任意 WxH 尺寸，最小边 512，长边超 3840 被上游压回 3840）')
    const provider = db.prepare(`SELECT id FROM api_providers WHERE code = 'yilian'`).get() as { id: number } | undefined
    if (!provider) throw new Error('seedYilianChannel: 渠道插入失败')

    // 平台渠道 Key 明文存储（key_iv 置空），后台可查看/复制；渠道已有 Key（含后台手填）时跳过
    const hasKey = db.prepare(`SELECT 1 FROM api_provider_keys WHERE provider_id = ? LIMIT 1`).get(provider.id)
    if (YILIAN_KEY && !hasKey) {
      db.prepare(`
        INSERT INTO api_provider_keys (provider_id, name, encrypted_key, key_iv, key_tag, key_hint, priority, created_at, updated_at)
        VALUES (?, '默认 Key', ?, '', '', ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(provider.id, YILIAN_KEY, maskKey(YILIAN_KEY))
    }

    // 定价种子须写旧单位（新库冷启动由 migration_credits_v2 统一 ×0.035 换算）：200/7 ×0.035 = 新单位全档 1.0
    db.prepare(`
      INSERT OR IGNORE INTO ai_models
        (provider_id, model_id, display_name, supports_vision, supports_image_gen, supports_chat,
         logical_model_id, pricing, status, remark, created_at, updated_at)
      VALUES (?, 'gpt-image-2', 'GPT-Image-2', 1, 1, 0,
              (SELECT id FROM ai_logical_models WHERE code = 'gpt-image-2'),
              ?, 'active', '上游 gpt-image-2；4K 档实际出图长边 3840', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(provider.id, JSON.stringify({ '1K': 200 / 7, '2K': 200 / 7, '4K': 200 / 7 }))

    db.prepare(`
      INSERT INTO system_config (key, value) VALUES ('seed_yilian_channel_v1', 'done')
      ON CONFLICT(key) DO UPDATE SET value = 'done'
    `).run()
  })
  tx()

  console.log('[DB] Seeded api_providers (yilian)')
}
