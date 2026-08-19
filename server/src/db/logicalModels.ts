import { db } from './index.js'

/**
 * 逻辑模型清单（平台代码内置，唯一事实源）。
 *
 * code / 类型 / 能力定义 / 状态均以本清单为准，管理员仅可修改显示名（DB name 列）。
 * 启动时 syncCanonicalLogicalModels() 幂等同步进 ai_logical_models：
 *   - 清单内的行：按 code upsert（能力/类型/状态以代码为准，显示名与备注不动）；
 *   - 清单外且无渠道模型关联的行：清除（历史验收/试错残留）；
 *   - 清单外但仍被渠道模型引用的行：保留（避免破坏关联），但不再可管理。
 * 新增/调整逻辑模型 = 修改本清单后重启服务。
 */

const ASPECTS_10 = ['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '5:4', '2:3', '3:2', '21:9']
const ASPECTS_14 = ['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '5:4', '2:3', '3:2', '1:4', '4:1', '1:8', '8:1', '21:9']

export interface LogicalModelSeed {
  code: string
  name: string
  kind: 'image' | 'text'
  default_params: Record<string, unknown>
}

export const CANONICAL_LOGICAL_MODELS: LogicalModelSeed[] = [
  {
    code: 'gpt-image-2',
    name: 'GPT-Image-2',
    kind: 'image',
    default_params: {
      resolutions: ['1K', '2K', '4K'],
      aspectRatiosByResolution: {
        '1K': ['1:1', '4:3', '3:4'],
        '2K': ['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '5:4', '2:3', '3:2', '21:9'],
        '4K': ['16:9', '9:16', '21:9', '4:3', '3:4', '2:3', '3:2'],
      },
      aspectRatios: ASPECTS_10,
      maxReferenceImages: 14,
      maxPromptChars: 32000,
    },
  },
  {
    code: 'gemini-3-pro-image-preview',
    name: 'Gemini 3 Pro Image',
    kind: 'image',
    default_params: {
      resolutions: ['1K', '2K', '4K'],
      aspectRatios: ASPECTS_10,
      maxReferenceImages: 14,
      maxPromptChars: 32000,
    },
  },
  {
    code: 'gemini-3.1-flash-image-preview',
    name: 'Gemini 3.1 Flash Image',
    kind: 'image',
    default_params: {
      resolutions: ['512', '1K', '2K', '4K'],
      aspectRatios: ASPECTS_14,
      maxReferenceImages: 14,
      maxPromptChars: 32000,
    },
  },
  {
    code: 'gemini-2.5-flash-image-preview',
    name: 'Gemini 2.5 Flash Image',
    kind: 'image',
    default_params: {
      resolutions: ['1K'],
      aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'],
      maxReferenceImages: 14,
      maxPromptChars: 1000,
    },
  },
  { code: 'gpt-5.5', name: 'GPT-5.5', kind: 'text', default_params: {} },
  { code: 'gemini-3-flash', name: 'Gemini 3 Flash', kind: 'text', default_params: {} },
  { code: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', kind: 'text', default_params: {} },
]

/** 启动同步：代码清单 → ai_logical_models（幂等） */
export function syncCanonicalLogicalModels(): void {
  const codes = CANONICAL_LOGICAL_MODELS.map((m) => m.code)
  const upsert = db.prepare(`
    INSERT INTO ai_logical_models (code, name, kind, default_params, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(code) DO UPDATE SET
      kind = excluded.kind,
      default_params = excluded.default_params,
      status = 'active',
      updated_at = CURRENT_TIMESTAMP
  `)
  const prune = db.prepare(`
    DELETE FROM ai_logical_models
    WHERE code NOT IN (${codes.map(() => '?').join(', ')})
      AND NOT EXISTS (SELECT 1 FROM ai_models m WHERE m.logical_model_id = ai_logical_models.id)
  `)
  db.transaction(() => {
    for (const m of CANONICAL_LOGICAL_MODELS) {
      upsert.run(m.code, m.name, m.kind, JSON.stringify(m.default_params))
    }
    prune.run(...codes)
  })()
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM ai_logical_models`).get() as any).c
  console.log(`[DB] Canonical logical models synced: ${CANONICAL_LOGICAL_MODELS.length} defined, ${total} rows in table`)
}
