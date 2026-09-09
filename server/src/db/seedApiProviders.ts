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

    // 定价种子须写旧单位（新库冷启动由 migration_credits_v2 统一 ×0.035 换算）：20/7 ×0.035 = 新单位全档 0.1
    db.prepare(`
      INSERT OR IGNORE INTO ai_models
        (provider_id, model_id, display_name, supports_vision, supports_image_gen, supports_chat,
         logical_model_id, pricing, cost_pricing, status, remark, created_at, updated_at)
        VALUES (?, 'gpt-image-2', 'GPT-Image-2', 1, 1, 0,
                (SELECT id FROM ai_logical_models WHERE code = 'gpt-image-2'),
                ?, ?, 'active', '上游 gpt-image-2；4K 档实际出图长边 3840', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(
        provider.id,
        JSON.stringify({ '1K': 20 / 7, '2K': 20 / 7, '4K': 20 / 7 }),
        JSON.stringify({ '1K': 20 / 7, '2K': 20 / 7, '4K': 20 / 7 }),
      )

    db.prepare(`
      INSERT INTO system_config (key, value) VALUES ('seed_yilian_channel_v1', 'done')
      ON CONFLICT(key) DO UPDATE SET value = 'done'
    `).run()
  })
  tx()

  console.log('[DB] Seeded api_providers (yilian)')
}

/**
 * 为既有与新建数据库补齐 image2.5 的首个渠道映射。
 *
 * ToAPIs 将 gpt-image-2.5 定义为系列名，实际请求必须使用完整模型名；这里采用
 * 普通异步版 gpt-image-2.5-sunburst。价格按文档 USD 档位以
 * 1 USD ≈ 7 积分换算，并按当前账务精度取两位小数。
 */
export function seedToapisGptImage25(): void {
  const flag = db.prepare(`SELECT value FROM system_config WHERE key = 'seed_toapis_gpt_image_25_v4'`).get() as { value: string } | undefined
  if (flag?.value === 'done') return

  const provider = db.prepare(`SELECT id FROM api_providers WHERE code = 'toapis' AND owner_user_id IS NULL`).get() as { id: number } | undefined
  const logical = db.prepare(`SELECT id FROM ai_logical_models WHERE code = 'gpt-image-2.5'`).get() as { id: number } | undefined
  if (!provider || !logical) {
    console.warn('[DB] seedToapisGptImage25 skipped：toapis 渠道或 gpt-image-2.5 逻辑模型不存在')
    return
  }

  const costPricing = JSON.stringify({ '1K': 0.11, '2K': 0.14, '4K': 0.18 })
  const salePricing = JSON.stringify({ '1K': 0.2, '2K': 0.25, '4K': 0.4 })
  db.transaction(() => {
    db.prepare(`
      INSERT INTO ai_models
        (provider_id, model_id, display_name, supports_vision, supports_image_gen, supports_chat,
         logical_model_id, pricing, cost_pricing, status, remark, created_at, updated_at)
      VALUES (?, 'gpt-image-2.5-sunburst', 'GPT-Image-2.5 Sunburst', 1, 1, 0,
              ?, ?, ?, 'active', 'ToAPIs 普通异步版；quality=max；按 resolution 计价', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(provider_id, model_id) DO UPDATE SET
        display_name = excluded.display_name,
        supports_vision = 1,
        supports_image_gen = 1,
        supports_chat = 0,
        logical_model_id = excluded.logical_model_id,
        pricing = excluded.pricing,
        cost_pricing = excluded.cost_pricing,
        status = 'active',
        remark = excluded.remark,
        updated_at = CURRENT_TIMESTAMP
    `).run(provider.id, logical.id, costPricing, costPricing)
    // 早期开发版本曾短暂写入 Flare；明确停用，确保自动路由只会选择 Sunburst。
    db.prepare(`
      UPDATE ai_models
      SET status = 'disabled', remark = '已改用 gpt-image-2.5-sunburst', updated_at = CURRENT_TIMESTAMP
      WHERE provider_id = ? AND model_id = 'gpt-image-2.5-flare'
    `).run(provider.id)
    // 没有历史引用时直接清理开发期 Flare 行；已有任务引用则保留为 disabled 以维护审计关系。
    db.prepare(`
      DELETE FROM ai_models
      WHERE provider_id = ? AND model_id = 'gpt-image-2.5-flare'
        AND NOT EXISTS (SELECT 1 FROM generation_tasks t WHERE t.channel_model_id = ai_models.id)
        AND NOT EXISTS (SELECT 1 FROM generation_route_attempts a WHERE a.channel_model_id = ai_models.id)
    `).run(provider.id)
    db.prepare(`
      UPDATE ai_logical_models
      SET sale_pricing = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(salePricing, logical.id)
    db.prepare(`
      INSERT INTO system_config (key, value) VALUES ('seed_toapis_gpt_image_25_v4', 'done')
      ON CONFLICT(key) DO UPDATE SET value = 'done'
    `).run()
  })()

  console.log('[DB] Seeded ToAPIs gpt-image-2.5-sunburst channel model')
}

/** 将 ToAPIs 的 image2 / banana pro 渠道映射切换到指定 VIP 模型名。 */
export function migrateToapisVipModelIds(): void {
  const flag = db.prepare(`SELECT value FROM system_config WHERE key = 'migrate_toapis_vip_model_ids_v1'`).get() as { value: string } | undefined
  if (flag?.value === 'done') return

  const provider = db.prepare(`SELECT id FROM api_providers WHERE code = 'toapis' AND owner_user_id IS NULL`).get() as { id: number } | undefined
  if (!provider) {
    console.warn('[DB] migrateToapisVipModelIds skipped：toapis 渠道不存在')
    return
  }

  const mappings = [
    {
      logicalCode: 'gpt-image-2',
      oldModelId: 'gpt-image-2',
      newModelId: 'gpt-image-2-vip',
      displayName: 'GPT-Image-2 VIP',
      remark: 'ToAPIs VIP 异步版；quality=low',
    },
    {
      logicalCode: 'gemini-3-pro-image-preview',
      oldModelId: 'gemini-3-pro-image-preview',
      newModelId: 'gemini-3-pro-image-preview-vip',
      displayName: 'Gemini 3 Pro Image Preview VIP',
      remark: 'ToAPIs VIP 异步版',
    },
  ]

  db.transaction(() => {
    for (const mapping of mappings) {
      const logical = db.prepare(`SELECT id FROM ai_logical_models WHERE code = ?`).get(mapping.logicalCode) as { id: number } | undefined
      const source = db.prepare(`SELECT * FROM ai_models WHERE provider_id = ? AND model_id = ?`).get(provider.id, mapping.oldModelId) as any
      const target = db.prepare(`SELECT * FROM ai_models WHERE provider_id = ? AND model_id = ?`).get(provider.id, mapping.newModelId) as any
      if (!logical || (!source && !target)) {
        throw new Error(`ToAPIs 模型映射缺失：${mapping.logicalCode}`)
      }

      if (!target && source) {
        // 原地改名可保留渠道模型主键及所有历史任务/路由记录关联。
        db.prepare(`
          UPDATE ai_models
          SET model_id = ?, display_name = ?, logical_model_id = ?, status = 'active', remark = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(mapping.newModelId, mapping.displayName, logical.id, mapping.remark, source.id)
      } else {
        db.prepare(`
          UPDATE ai_models
          SET display_name = ?, logical_model_id = ?, supports_vision = 1, supports_image_gen = 1,
              status = 'active', pricing = COALESCE(pricing, ?), cost_pricing = COALESCE(cost_pricing, ?),
              remark = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(mapping.displayName, logical.id, source?.pricing ?? null, source?.cost_pricing ?? null, mapping.remark, target.id)
        if (source && source.id !== target.id) {
          db.prepare(`UPDATE ai_models SET status = 'disabled', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(source.id)
        }
      }
    }
    db.prepare(`
      INSERT INTO system_config (key, value) VALUES ('migrate_toapis_vip_model_ids_v1', 'done')
      ON CONFLICT(key) DO UPDATE SET value = 'done'
    `).run()
  })()

  console.log('[DB] Migrated ToAPIs image2 / banana pro channel models to VIP ids')
}

/** 将存量 ToAPIs 平台渠道的中国大陆入口切换为 toapis.cn。 */
export function migrateToapisBaseUrl(): void {
  const flag = db.prepare(`SELECT value FROM system_config WHERE key = 'migrate_toapis_base_url_cn_v1'`).get() as { value: string } | undefined
  if (flag?.value === 'done') return

  db.transaction(() => {
    const result = db.prepare(`
      UPDATE api_providers
      SET base_url = 'https://toapis.cn', updated_at = CURRENT_TIMESTAMP
      WHERE code = 'toapis' AND owner_user_id IS NULL
    `).run()
    if (result.changes === 0) throw new Error('ToAPIs 平台渠道不存在，无法更新入口')
    db.prepare(`
      INSERT INTO system_config (key, value) VALUES ('migrate_toapis_base_url_cn_v1', 'done')
      ON CONFLICT(key) DO UPDATE SET value = 'done'
    `).run()
  })()

  console.log('[DB] Migrated ToAPIs base URL to https://toapis.cn')
}
