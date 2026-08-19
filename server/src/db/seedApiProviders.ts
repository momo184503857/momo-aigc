import { db } from './index.js'
import { maskKey } from '../utils/crypto.js'

/**
 * 种子数据：AI 服务商配置（api_providers / ai_provider_keys / ai_models）。
 *
 * 首次启动时预置「火山引擎」服务商 + 一把主 Key + doubao-seed-2.1-turbo 模型，
 * 让配置页开箱即可测试。幂等守卫：system_config.seed_api_providers_v1 标记后不再执行。
 *
 * 注意：这里的 Key 是开发测试 Key，生产环境请在管理后台「配置」页替换为自己的 Key。
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
  const VOLCENGINE_KEY = process.env.VOLCENGINE_API_KEY || 'REDACTED-VOLCENGINE-KEY'

  const insertProvider = db.prepare(`
    INSERT INTO api_providers (code, name, base_url, adapter, remark, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `)
  const insertKey = db.prepare(`
    INSERT INTO api_provider_keys (provider_id, name, encrypted_key, key_iv, key_tag, key_hint, is_primary, created_at, updated_at)
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

    // 平台渠道 Key 明文存储（key_iv 置空），后台可查看/复制
    insertKey.run(providerId, '默认 Key', VOLCENGINE_KEY, '', '', maskKey(VOLCENGINE_KEY))

    // 实测该模型支持图片输入（识图），不支持图片输出
    insertModel.run(providerId, 'doubao-seed-2.1-turbo', 'Doubao Seed 2.1 Turbo', 1, 0, '推理型：回答在 content，思维链在 reasoning_content')

    setFlag.run()
  })
  tx()

  console.log('[DB] Seeded api_providers (volcengine)')
}
