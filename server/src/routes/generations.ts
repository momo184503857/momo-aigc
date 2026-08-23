import { Router } from 'express'
import { db } from '../db/index.js'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'
import { getImageAdapter } from '../providers/index.js'
import type { ImageGenRequest, GeneratedImage } from '../providers/types.js'
import { importResultToOss, generateResultObjectKey, uploadToOss } from '../utils/oss.js'
import { bjDateRangeClause } from '../utils/datetime.js'
import {
  getChannelModelCapabilities,
  aspectRatiosAtResolution,
  resolveProviderContext,
  withKeyFailover,
  ProviderContextError,
} from '../utils/channelModel.js'

/**
 * 生图编排层（ai-provider 重构核心）。
 *
 * POST /api/generations          校验 → 计价预扣 → 落库 → 派发（async 同步提交 / sync 后台执行）
 * GET  /api/generations/:id/status  单次查上游 + 落库 + 转存（importing 抢占式）
 * POST /api/generations/:id/reimport  已完成任务重跑转存
 * GET  /api/generations          任务列表（替代旧 /api/tasks，字段兼容 + taskNo/渠道信息）
 *
 * 业务主键 = 内部任务号 task_no（gen-YYYYMMDDHHRRRR，北京时间年月日时+4位随机数）；
 * provider_task_id = 渠道侧任务号（仅异步渠道如 toapis 有，随任务返回供展示/排查）。
 * 扣退事务口径与原 tasks.ts 一致（预扣 generation / 失败 refund / completed 不回退）。
 */

export const generationsRouter = Router()
generationsRouter.use(authMiddleware)

const TERMINAL = ['completed', 'failed']
const ACTIVE_PRE_IMPORT = ['submitted', 'queued', 'in_progress']

/** 每用户同步渠道在途任务上限（超限任务保持 submitted，由轮询端点补派发） */
const SYNC_PER_USER_LIMIT = 5

// ── 工具 ──

function isOssResultUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false
  try {
    return new URL(url).hostname.endsWith('.aliyuncs.com')
  } catch {
    return false
  }
}

function parseTaskRow(row: any): any {
  if (!row) return row
  const parsed = { ...row }
  for (const key of ['template_image_ids', 'input_image_urls', 'result_image_urls', 'raw_error', 'supplementary_images', 'prompt_segments']) {
    if (typeof parsed[key] === 'string') {
      try { parsed[key] = JSON.parse(parsed[key]) } catch { /* keep as-is */ }
    }
  }
  if ('suite_id' in parsed) { parsed.suiteId = parsed.suite_id; delete parsed.suite_id }
  if ('point_index' in parsed) { parsed.pointIndex = parsed.point_index; delete parsed.point_index }
  if ('aspect_ratio' in parsed) { parsed.aspectRatio = parsed.aspect_ratio; delete parsed.aspect_ratio }
  if ('supplementary_images' in parsed) {
    parsed.supplementaryImages = parsed.supplementary_images
    delete parsed.supplementary_images
  }
  // 展示层仅暴露已转存的 OSS 永久 URL；未转存的原始上游 URL 不外泄（S5：提示重新加载）
  if (Array.isArray(parsed.result_image_urls)) {
    parsed.result_image_urls = parsed.result_image_urls.filter(isOssResultUrl)
  }
  return parsed
}

function loadTask(id: number | string | string[]) {
  return db.prepare(`SELECT * FROM generation_tasks WHERE id = ?`).get(String(id)) as any
}

function loadChannelModel(channelModelId: number) {
  return db.prepare(`
    SELECT m.id, m.provider_id, m.model_id, m.display_name, m.logical_model_id, m.param_overrides,
           m.pricing, m.supports_vision, m.supports_image_gen, m.supports_chat, m.status AS model_status,
           p.id AS p_id, p.code AS p_code, p.name AS p_name, p.base_url AS p_base_url, p.adapter AS p_adapter,
           p.status AS p_status
    FROM ai_models m JOIN api_providers p ON p.id = m.provider_id
    WHERE m.id = ?
  `).get(channelModelId) as any
}

/**
 * 系统任务号：gen-YYYYMMDDHHRRRR（北京时间年月日时 + 4 位随机数，如 gen-20260823143847）。
 * 同小时随机空间仅 10000 个，task_no 上有唯一索引，生成前查重、撞号重试；
 * better-sqlite3 同步执行且插入在事务内，查重-写入不会被并发打断。
 */
function generateTaskNo(): string {
  const bj = new Date(Date.now() + 8 * 3600 * 1000)
  const p2 = (n: number) => String(n).padStart(2, '0')
  const stamp = `${bj.getUTCFullYear()}${p2(bj.getUTCMonth() + 1)}${p2(bj.getUTCDate())}${p2(bj.getUTCHours())}`
  const exists = db.prepare(`SELECT 1 FROM generation_tasks WHERE task_no = ?`)
  for (let i = 0; i < 100; i++) {
    const no = `gen-${stamp}${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`
    if (!exists.get(no)) return no
  }
  // 理论极端兜底：同小时号段耗尽，追加时间戳尾数保证唯一
  return `gen-${stamp}${String(Date.now()).slice(-6)}`
}

/** 失败退款：非终态 → failed 且已扣费则全额退款（completed 不回退，防套退） */
function failTaskAndRefund(taskId: number | string, errorCode: string, errorMessage: string): void {
  const task = loadTask(taskId)
  if (!task || TERMINAL.includes(task.status)) return
  const refund = Number(task.points_cost) || 0

  const tx = db.transaction(() => {
    if (refund > 0) {
      const user = db.prepare(`SELECT points FROM users WHERE id = ?`).get(task.user_id) as any
      if (user) {
        const newBalance = Math.round((Number(user.points) + refund) * 1000) / 1000
        db.prepare(`UPDATE users SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(newBalance, task.user_id)
        db.prepare(`
          INSERT INTO points_transactions (user_id, amount, balance_after, reason, reference_type, reference_id, note, created_at)
          VALUES (?, ?, ?, 'refund', 'generation_task', ?, '失败自动退款', CURRENT_TIMESTAMP)
        `).run(task.user_id, refund, newBalance, task.id)
        db.prepare(`
          UPDATE generation_tasks SET status = 'failed', error_code = ?, error_message = ?,
            points_cost = 0, points_balance_after = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(errorCode, errorMessage, newBalance, task.id)
        return
      }
    }
    db.prepare(`
      UPDATE generation_tasks SET status = 'failed', error_code = ?, error_message = ?,
        points_cost = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(errorCode, errorMessage, task.id)
  })
  tx()
  console.log(`[generations] 任务 ${task.task_no || task.id} 失败${refund > 0 ? `，退款 ${refund} 积分` : ''}：${errorMessage}`)
}

// ── 转存（服务端统一执行，D12）──

async function importImages(
  task: any,
  images: GeneratedImage[],
): Promise<{ imported: string[]; rawUrls: string[] }> {
  const imported: string[] = []
  const rawUrls: string[] = []
  for (const img of images) {
    if (img.url) {
      rawUrls.push(img.url)
      if (isOssResultUrl(img.url)) {
        // 上游直接给了 OSS 地址（如渠道回环配置）——直接可用
        imported.push(img.url)
        continue
      }
      try {
        const res = await importResultToOss({ userId: task.user_id, taskId: task.task_no, sourceUrl: img.url })
        imported.push(res.publicUrl)
      } catch (e: any) {
        console.warn(`[generations] 转存失败（任务 ${task.task_no}）：${img.url} → ${e.message}`)
      }
    } else if (img.base64) {
      try {
        const objectKey = generateResultObjectKey(task.user_id, `x.${img.mimeType === 'image/jpeg' ? 'jpg' : 'png'}`)
        const buffer = Buffer.from(img.base64, 'base64')
        const url = await uploadToOss(buffer, objectKey, img.mimeType || 'image/png')
        imported.push(url)
      } catch (e: any) {
        console.warn(`[generations] base64 结果上传失败（任务 ${task.task_no}）：${e.message}`)
      }
    }
  }
  return { imported, rawUrls }
}

/** 转存结果落库：全部失败仍 completed（S5），保留原始 URL 供 reimport 重试 */
function commitImportResult(task: any, imported: string[], rawUrls: string[]): void {
  const now = new Date().toISOString()
  if (imported.length > 0) {
    db.prepare(`
      UPDATE generation_tasks SET status = 'completed', progress = 100,
        result_image_urls = ?, error_message = '', error_code = NULL,
        completed_at = COALESCE(completed_at, ?), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(JSON.stringify(imported), now, task.id)
  } else {
    db.prepare(`
      UPDATE generation_tasks SET status = 'completed', progress = 100,
        result_image_urls = ?, error_message = '结果转存 OSS 失败，请点击重新加载',
        completed_at = COALESCE(completed_at, ?), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(JSON.stringify(rawUrls), now, task.id)
  }
}

// ── 同步渠道后台执行（§4.4）──

const syncInFlight = new Map<number, Promise<void>>()
const syncUserActive = new Map<number, number>()

function syncSlotsAvailable(userId: number): boolean {
  return (syncUserActive.get(userId) ?? 0) < SYNC_PER_USER_LIMIT
}

async function runSyncTask(taskId: number): Promise<void> {
  const task = loadTask(taskId)
  if (!task || TERMINAL.includes(task.status) || !task.channel_model_id) return

  let cm: any
  try {
    cm = loadChannelModel(task.channel_model_id)
    if (!cm || cm.p_status !== 'active' || cm.model_status !== 'active') throw new Error('渠道或模型已停用/删除')
    const adapter = getImageAdapter(cm.p_adapter)

    // 同步渠道执行同样接入 Key 轮换：欠费 → 标记耗尽 → 换 Key 重试本次请求（F3）
    const images = await withKeyFailover(cm.p_id, 'image', (config) =>
      adapter.submitImageTask(buildImageGenRequest(task, cm), config))
    if (!images.images || images.images.length === 0) throw new Error('上游未返回任何图片')

    // 抢占转存权（轮询请求/其他实例可能已处理）
    const claimed = db.prepare(`
      UPDATE generation_tasks SET status = 'importing', progress = 100, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'submitted'
    `).run(task.id)
    if (claimed.changes === 0) return

    const fresh = loadTask(task.id)
    const { imported, rawUrls } = await importImages(fresh, images.images)
    commitImportResult(fresh, imported, rawUrls)
  } catch (e: any) {
    if (e instanceof ProviderContextError) {
      // 无可用 Key（通常为全部耗尽/停用；含首轮渠道无 Key）
      failTaskAndRefund(task.id, 'ALL_KEYS_EXHAUSTED', e.message)
    } else {
      failTaskAndRefund(task.id, 'UPSTREAM_ERROR', e.message || String(e))
    }
  }
}

function dispatchSyncTask(taskId: number, userId: number): void {
  if (syncInFlight.has(taskId)) return
  if (!syncSlotsAvailable(userId)) return // 保持 submitted，由轮询端点补派发
  syncUserActive.set(userId, (syncUserActive.get(userId) ?? 0) + 1)
  const p = runSyncTask(taskId)
    .catch((e) => console.error(`[generations] sync task ${taskId} crashed:`, e))
    .finally(() => {
      syncInFlight.delete(taskId)
      syncUserActive.set(userId, Math.max(0, (syncUserActive.get(userId) ?? 1) - 1))
    })
  syncInFlight.set(taskId, p)
}

function buildImageGenRequest(task: any, cm: any): ImageGenRequest {
  let logicalCode: string | undefined
  if (cm.logical_model_id) {
    const lm = db.prepare(`SELECT code FROM ai_logical_models WHERE id = ?`).get(cm.logical_model_id) as { code: string } | undefined
    logicalCode = lm?.code
  }
  return {
    model: cm.model_id,
    logicalCode,
    prompt: task.prompt || '',
    negativePrompt: task.negative_prompt || undefined,
    aspectRatio: task.aspect_ratio || '1:1',
    resolution: task.resolution || '1K',
    n: 1,
    imageUrls: Array.isArray(task.input_image_urls) ? task.input_image_urls : parseJsonArray(task.input_image_urls),
  }
}

function parseJsonArray(v: any): string[] {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') { try { const a = JSON.parse(v); return Array.isArray(a) ? a : [] } catch { return [] } }
  return []
}

// ── POST /api/generations（提交）──

generationsRouter.post('/', async (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const {
    channelModelId, prompt, userPrompt, systemPrompt,
    aspectRatio, resolution, n, refImageUrls, templateImageIds,
    featureId, supplementaryImages, promptSegments, negativePrompt,
    suiteId, pointIndex, clientBusinessId,
  } = req.body || {}

  if (!channelModelId || !prompt || typeof prompt !== 'string') {
    res.status(400).json({ success: false, error: '缺少必要参数：channelModelId, prompt' })
    return
  }

  // 1. 解析与校验
  const cm = loadChannelModel(Number(channelModelId))
  if (!cm) { res.status(404).json({ success: false, error: '渠道模型不存在' }); return }
  if (cm.p_status !== 'active' || cm.model_status !== 'active') {
    res.status(400).json({ success: false, error: '渠道或模型已停用' }); return
  }
  if (!cm.supports_image_gen) {
    res.status(400).json({ success: false, error: '该模型不支持生图' }); return
  }

  const caps = getChannelModelCapabilities(cm)
  if (!caps || caps.resolutions.length === 0) {
    res.status(400).json({ success: false, error: '该模型未配置有效能力，请联系管理员' }); return
  }
  const effResolution = resolution || caps.resolutions[0]
  if (!caps.resolutions.includes(effResolution)) {
    res.status(400).json({ success: false, error: `该模型不支持分辨率 ${effResolution}` }); return
  }
  const effRatio = aspectRatio || aspectRatiosAtResolution(caps, effResolution)[0] || '1:1'
  const allowedRatios = aspectRatiosAtResolution(caps, effResolution)
  if (allowedRatios.length > 0 && !allowedRatios.includes(effRatio)) {
    res.status(400).json({ success: false, error: `分辨率 ${effResolution} 下不支持宽高比 ${effRatio}` }); return
  }
  const refUrls = Array.isArray(refImageUrls) ? refImageUrls.filter((u: unknown) => typeof u === 'string') : []
  const maxRef = caps.maxReferenceImages ?? 14
  if (refUrls.length > maxRef) {
    res.status(400).json({ success: false, error: `参考图最多 ${maxRef} 张` }); return
  }
  const maxChars = caps.maxPromptChars ?? 32000
  const finalPrompt = prompt.trim()
  if (finalPrompt.length > maxChars) {
    res.status(400).json({ success: false, error: `提示词最长 ${maxChars} 字` }); return
  }
  if (finalPrompt.length === 0 && refUrls.length === 0 && !(systemPrompt && String(systemPrompt).trim())) {
    res.status(400).json({ success: false, error: '请输入提示词，描述你想要生成的效果' }); return
  }
  const count = Math.max(1, Math.min(5, Number(n) || 1))

  // 2. 计价（F5 计费统一：全部渠道模型按平台定价预扣，单轨）
  let unitPrice = 0
  {
    let pricing: Record<string, number> | null = null
    try { pricing = cm.pricing ? JSON.parse(cm.pricing) : null } catch { pricing = null }
    const price = pricing?.[effResolution]
    if (price === undefined || price === null) {
      res.status(400).json({ success: false, error: `该模型未配置 ${effResolution} 分辨率定价，请联系管理员` }); return
    }
    unitPrice = price
  }

  // 3. 落库 + 预扣（一个事务，口径与原 tasks.ts 一致）
  let created: Array<{ id: number; taskNo: string }>
  try {
    const tx = db.transaction(() => {
      const user = db.prepare(`SELECT points FROM users WHERE id = ?`).get(userId) as any
      if (!user) throw { status: 404, error: '用户不存在' }
      const currentBalance = Number(user.points) || 0
      const totalCost = Math.round(unitPrice * count * 1000) / 1000
      if (currentBalance < totalCost) {
        throw {
          status: 402,
          error: `积分不足，需要 ${totalCost} 积分，当前仅有 ${Math.round(currentBalance * 1000) / 1000} 积分`,
          data: { required: totalCost, available: Math.round(currentBalance * 1000) / 1000 },
        }
      }

      const insert = db.prepare(`
        INSERT INTO generation_tasks (
          task_no, user_id, toapis_task_id, client_business_id, model, prompt, size, resolution, aspect_ratio, n,
          template_image_ids, input_image_urls, status, progress, feature_id, user_prompt,
          points_cost, points_balance_after, supplementary_images, prompt_segments, negative_prompt,
          suite_id, point_index, provider_code, channel_model_id, channel_provider_id
        ) VALUES (?, ?, '', ?, ?, ?, ?, ?, ?, 1, ?, ?, 'submitted', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      const deduct = db.prepare(`UPDATE users SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      const txnLog = db.prepare(`
        INSERT INTO points_transactions (user_id, amount, balance_after, reason, reference_type, reference_id, note, created_at)
        VALUES (?, ?, ?, 'generation', 'generation_task', ?, '', CURRENT_TIMESTAMP)
      `)

      const rows: Array<{ id: number; taskNo: string }> = []
      let balance = currentBalance
      for (let i = 0; i < count; i++) {
        const cost = unitPrice
        balance = Math.round((balance - cost) * 1000) / 1000
        const no = generateTaskNo()
        const r = insert.run(
          no, userId, clientBusinessId || null, cm.model_id, finalPrompt, effRatio, effResolution, effRatio,
          templateImageIds ? JSON.stringify(templateImageIds) : null,
          JSON.stringify(refUrls),
          featureId || null, userPrompt || '',
          cost, balance,
          JSON.stringify(supplementaryImages || []),
          JSON.stringify(promptSegments || {}),
          negativePrompt || '',
          suiteId ? Number(suiteId) : null,
          pointIndex !== undefined && pointIndex !== null ? Number(pointIndex) : null,
          cm.p_code, cm.id, cm.p_id,
        )
        const id = Number(r.lastInsertRowid)
        if (cost > 0) {
          deduct.run(balance, userId)
          txnLog.run(userId, -cost, balance, id)
        }
        rows.push({ id, taskNo: no })
      }
      return rows
    })
    created = tx() as Array<{ id: number; taskNo: string }>
  } catch (e: any) {
    if (e?.status && e?.error) {
      res.status(e.status).json({ success: false, error: e.error, data: e.data })
      return
    }
    throw e
  }

  // 4. 派发（事务提交后）。toapis 为异步任务式渠道；openai_image / volcengine_image 同步渠道
  if (cm.p_adapter === 'toapis') {
    const adapter = getImageAdapter(cm.p_adapter)
    for (const t of created) {
      try {
        // 异步提交接入 Key 轮换：欠费 → 标记耗尽 → 换 Key 重试本次请求（F3）
        const submit = await withKeyFailover(cm.p_id, 'image', (config) =>
          adapter.submitImageTask(
            { model: cm.model_id, logicalCode: logicalCodeOf(cm), prompt: finalPrompt, negativePrompt: negativePrompt || undefined, aspectRatio: effRatio, resolution: effResolution, n: 1, imageUrls: refUrls },
            config,
          ))
        db.prepare(`UPDATE generation_tasks SET provider_task_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
          .run(submit.providerTaskId ?? null, t.id)
      } catch (e: any) {
        if (e instanceof ProviderContextError) {
          // 无可用 Key（渠道全部耗尽/停用，或首轮即无 Key）：任务失败 + 全额退款
          failTaskAndRefund(t.id, 'ALL_KEYS_EXHAUSTED', e.message)
        } else {
          failTaskAndRefund(t.id, 'SUBMIT_FAILED', e.message || String(e))
        }
      }
    }
  } else {
    for (const t of created) {
      dispatchSyncTask(t.id, userId)
    }
  }

  res.json({
    success: true,
    data: {
      tasks: created.map((t) => {
        const row = loadTask(t.id)
        return { id: t.id, taskNo: t.taskNo, status: row?.status ?? 'submitted' }
      }),
      inputImageUrls: refUrls,
    },
  })
})

function logicalCodeOf(cm: any): string | undefined {
  if (!cm.logical_model_id) return undefined
  const lm = db.prepare(`SELECT code FROM ai_logical_models WHERE id = ?`).get(cm.logical_model_id) as { code: string } | undefined
  return lm?.code
}

// ── GET /api/generations/:id/status（轮询）──

generationsRouter.get('/:id/status', async (req: AuthRequest, res) => {
  const task = loadTask(req.params.id)
  if (!task || task.user_id !== req.user!.userId) {
    res.status(404).json({ success: false, error: '任务不存在' })
    return
  }

  const snapshot = () => {
    const row = parseTaskRow(loadTask(task.id))
    res.json({
      success: true,
      data: {
        status: row.status,
        progress: row.progress ?? 0,
        resultUrls: row.result_image_urls ?? [],
        errorMessage: row.error_message || undefined,
        errorCode: row.error_code || undefined,
        expiresAt: row.expires_at || undefined,
        taskNo: row.task_no,
        providerTaskId: row.provider_task_id || undefined,
        completedAt: row.completed_at || undefined,
      },
    })
  }

  // 终态 / 转存中：直接返回快照
  if (TERMINAL.includes(task.status) || task.status === 'importing') {
    if (task.status === 'importing') {
      // 他端正在转存：返回进行中快照（前端下次轮询会拿到终态）
      res.json({
        success: true,
        data: { status: 'in_progress', progress: Math.max(task.progress ?? 90, 90), resultUrls: [], taskNo: task.task_no },
      })
      return
    }
    snapshot()
    return
  }

  // 渠道/模型被删：任务无法继续
  if (!task.channel_model_id) {
    failTaskAndRefund(task.id, 'CHANNEL_GONE', '渠道模型已被删除，任务终止')
    snapshot()
    return
  }
  const cm = loadChannelModel(task.channel_model_id)
  if (!cm) {
    failTaskAndRefund(task.id, 'CHANNEL_GONE', '渠道模型已被删除，任务终止')
    snapshot()
    return
  }

  const isAsync = cm.p_adapter === 'toapis'

  if (isAsync) {
    if (!task.provider_task_id) {
      // 提交仍在进行（POST 内同步派发）或上次提交中断：短暂窗口直接返回快照；
      // 崩溃残留由启动清扫处理（§4.5）
      snapshot()
      return
    }
    try {
      // 轮询路径不接入 Key 切换（S3）：任务已在上游，换 Key 无济于事；异常记警告、下轮重试
      const ctx = resolveProviderContext(cm.p_id, 'image')
      const adapter = getImageAdapter(cm.p_adapter)
      const result = await adapter.queryImageTask(task.provider_task_id, ctx.config)

      if (result.status === 'completed') {
        // 抢占转存权
        const claimed = db.prepare(`
          UPDATE generation_tasks SET status = 'importing', progress = 100, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status IN ('submitted','queued','in_progress')
        `).run(task.id)
        if (claimed.changes === 0) {
          snapshot()
          return
        }
        const fresh = loadTask(task.id)
        const { imported, rawUrls } = await importImages(fresh, result.resultUrls.map((url) => ({ url })))
        if (result.expiresAt) {
          db.prepare(`UPDATE generation_tasks SET expires_at = ? WHERE id = ?`).run(result.expiresAt, task.id)
        }
        commitImportResult(fresh, imported, rawUrls)
        snapshot()
        return
      }

      if (result.status === 'failed') {
        db.prepare(`UPDATE generation_tasks SET status = 'failed', error_code = ?, error_message = ?, progress = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status NOT IN ('completed','failed')`)
          .run(result.errorCode || 'UPSTREAM_FAILED', result.errorMessage || '生成失败', result.progress ?? 0, task.id)
        failTaskAndRefund(task.id, result.errorCode || 'UPSTREAM_FAILED', result.errorMessage || '生成失败')
        snapshot()
        return
      }

      // 进行中：同步上游状态/进度
      db.prepare(`UPDATE generation_tasks SET status = ?, progress = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(result.status, result.progress ?? 0, task.id)
      snapshot()
      return
    } catch (e: any) {
      // 上游查询异常（网络抖动等）：不动任务状态，返回快照
      console.warn(`[generations] 轮询上游失败（${task.task_no}）：${e.message}`)
      snapshot()
      return
    }
  }

  // 同步渠道：submitted 且未完成 → 补派发（如重启后/并发超限）
  if (task.status === 'submitted') {
    dispatchSyncTask(task.id, task.user_id)
  }
  snapshot()
})

// ── POST /api/generations/:id/reimport（转存重试）──

generationsRouter.post('/:id/reimport', async (req: AuthRequest, res) => {
  const task = loadTask(req.params.id)
  if (!task || task.user_id !== req.user!.userId) {
    res.status(404).json({ success: false, error: '任务不存在' })
    return
  }
  if (task.status !== 'completed') {
    res.status(400).json({ success: false, error: '任务尚未完成' })
    return
  }
  const existing: string[] = parseJsonArray(task.result_image_urls)
  if (existing.filter(isOssResultUrl).length > 0) {
    res.json({ success: true, data: { resultUrls: existing.filter(isOssResultUrl) } })
    return
  }

  // 优先用库里的原始 URL 重试；没有则查上游（异步渠道）
  const rawUrls = existing.filter((u) => !isOssResultUrl(u))
  let images: GeneratedImage[] = rawUrls.map((url) => ({ url }))

  if (images.length === 0 && task.provider_task_id && task.channel_model_id) {
    try {
      const cm = loadChannelModel(task.channel_model_id)
      const ctx = resolveProviderContext(cm.p_id, 'image')
      const adapter = getImageAdapter(cm.p_adapter)
      const result = await adapter.queryImageTask(task.provider_task_id, ctx.config)
      if (result.status === 'completed') images = result.resultUrls.map((url) => ({ url }))
    } catch (e: any) {
      res.status(502).json({ success: false, error: `重新转存失败：${e.message}` })
      return
    }
  }

  if (images.length === 0) {
    res.status(400).json({ success: false, error: '暂无可转存的结果图' })
    return
  }

  const { imported } = await importImages(task, images)
  if (imported.length === 0) {
    res.status(502).json({ success: false, error: '转存失败，请稍后重试' })
    return
  }
  db.prepare(`UPDATE generation_tasks SET result_image_urls = ?, error_message = '', updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(JSON.stringify(imported), task.id)
  res.json({ success: true, data: { resultUrls: imported } })
})

// ── GET /api/generations（列表，兼容旧 /api/tasks 过滤参数）──

generationsRouter.get('/', (req: AuthRequest, res) => {
  const page = parseInt(req.query.page as string) || 1
  const pageSize = parseInt(req.query.pageSize as string) || 20
  const status = req.query.status as string | undefined
  const model = req.query.model as string | undefined
  const featureId = req.query.feature_id as string | undefined
  const suiteId = req.query.suiteId as string | undefined
  const startDate = req.query.start_date as string | undefined
  const endDate = req.query.end_date as string | undefined

  let where = 'WHERE t.user_id = ?'
  const params: any[] = [req.user!.userId]

  if (status) { where += ' AND t.status = ?'; params.push(status) }
  if (model) { where += ' AND t.model = ?'; params.push(model) }
  if (featureId) { where += ' AND t.feature_id = ?'; params.push(featureId) }
  if (suiteId) { where += ' AND t.suite_id = ?'; params.push(Number(suiteId)) }
  const range = bjDateRangeClause('t.created_at', startDate, endDate)
  if (range.clause) { where += range.clause; params.push(...range.params) }

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM generation_tasks t ${where}`).get(...params) as any
  const rows = db.prepare(`
    SELECT t.*, p.name AS channel_provider_name, m.display_name AS channel_model_display_name, lm.code AS logical_code
    FROM generation_tasks t
    LEFT JOIN api_providers p ON p.id = t.channel_provider_id
    LEFT JOIN ai_models m ON m.id = t.channel_model_id
    LEFT JOIN ai_logical_models lm ON lm.id = m.logical_model_id
    ${where} ORDER BY t.created_at DESC LIMIT ? OFFSET ?
  `).all(...params, pageSize, (page - 1) * pageSize) as any[]

  res.json({
    success: true,
    data: {
      records: rows.map((r) => {
        const parsed = parseTaskRow(r)
        parsed.taskNo = r.task_no
        parsed.channelProviderName = r.channel_provider_name
        parsed.channelModelName = r.channel_model_display_name || r.model
        parsed.logicalCode = r.logical_code
        return parsed
      }),
      total: countRow.total,
      page,
      pageSize,
    },
  })
})

// ── 启动清扫（§4.5）：服务重启不丢任务 ──

export function sweepOrphanTasks(): void {
  // 1. importing 复位：async 凭 provider_task_id 走轮询重入（重复转存仅浪费存储，objectKey uuid 防脏数据）
  const importing = db.prepare(`
    SELECT t.id, t.provider_task_id, t.channel_model_id FROM generation_tasks t WHERE t.status = 'importing'
  `).all() as any[]
  for (const t of importing) {
    if (t.provider_task_id) {
      db.prepare(`UPDATE generation_tasks SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(t.id)
    } else {
      // 同步渠道 importing 中崩溃：结果已丢失（仅存内存）→ 失败退款
      failTaskAndRefund(t.id, 'RESTART_LOST', '服务重启导致结果丢失，已自动退款')
    }
  }

  // 2. async 进行中且有 provider_task_id → 无需处理（轮询自然恢复）
  // 3. submitted 且无 provider_task_id（sync 在途丢失 / async 提交中断）→ 标失败 + 退款
  const orphans = db.prepare(`
    SELECT t.id, t.channel_model_id FROM generation_tasks t
    WHERE t.status IN ('submitted','queued','in_progress') AND (t.provider_task_id IS NULL OR t.provider_task_id = '')
  `).all() as any[]
  for (const t of orphans) {
    failTaskAndRefund(t.id, 'RESTART_LOST', '服务重启导致任务中断，已自动退款')
  }

  if (importing.length > 0 || orphans.length > 0) {
    console.log(`[generations] 启动清扫：importing 复位 ${importing.length} 条，中断任务标失败 ${orphans.length} 条`)
  }
}

/** 优雅停机：等待在途同步任务落库（最多 10s） */
export async function waitForSyncTasks(): Promise<void> {
  const tasks = [...syncInFlight.values()]
  if (tasks.length === 0) return
  console.log(`[generations] 等待 ${tasks.length} 个同步渠道在途任务完成…`)
  await Promise.race([
    Promise.allSettled(tasks),
    new Promise((resolve) => setTimeout(resolve, 10_000)),
  ])
}
