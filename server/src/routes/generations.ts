import { Router } from 'express'
import { db } from '../db/index.js'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'
import { getImageAdapter } from '../providers/index.js'
import { ProviderCallError } from '../providers/http.js'
import type { ImageGenRequest, GeneratedImage } from '../providers/types.js'
import { saveImage, importResultFromUrl, isStoredUrl } from '../utils/storage.js'
import { bjDateRangeClause } from '../utils/datetime.js'
import { roundCredits } from '../utils/credits.js'
import {
  getChannelModelCapabilities,
  aspectRatiosAtResolution,
  resolveProviderContext,
  ProviderContextError,
  parseParams,
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
  // 展示层仅暴露已持久化的 URL（OSS 公网地址或本站 /api/files/ 本地地址）；未转存的原始上游 URL 不外泄（S5：提示重新加载）
  if (Array.isArray(parsed.result_image_urls)) {
    parsed.result_image_urls = parsed.result_image_urls.filter(isStoredUrl)
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

// 异步任务兜底超时（分钟）：超过仍未终态 → 失败退款（正常 toapis 任务数分钟内完成）
const ASYNC_TASK_TIMEOUT_MIN = 30
// 上游 task_not_exist 宽限期（分钟）：刚提交的任务可能因上游写入延迟短暂查不到，宽限后判任务丢失
const TASK_NOT_EXIST_GRACE_MIN = 10

/** 失败退款：非终态 → failed 且已扣费则全额退款（completed 不回退，防套退） */
function failTaskAndRefund(taskId: number | string, errorCode: string, errorMessage: string): void {
  const task = loadTask(taskId)
  if (!task || TERMINAL.includes(task.status)) return
  const refund = Number(task.points_cost) || 0

  const tx = db.transaction(() => {
    if (refund > 0) {
      const user = db.prepare(`SELECT points FROM users WHERE id = ?`).get(task.user_id) as any
      if (user) {
        const newBalance = roundCredits(Number(user.points) + refund)
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

// ── 转存（服务端统一执行，D12；direct=落本机磁盘，oss=经 Worker，见 utils/storage.ts）──

async function importImages(
  task: any,
  images: GeneratedImage[],
): Promise<{ imported: string[]; rawUrls: string[] }> {
  const imported: string[] = []
  const rawUrls: string[] = []
  for (const img of images) {
    if (img.url) {
      rawUrls.push(img.url)
      if (isStoredUrl(img.url)) {
        // 上游直接给了已持久化地址（如渠道回环配置）——直接可用
        imported.push(img.url)
        continue
      }
      try {
        const res = await importResultFromUrl({ userId: task.user_id, taskNo: task.task_no, sourceUrl: img.url })
        imported.push(res.url)
      } catch (e: any) {
        console.warn(`[generations] 转存失败（任务 ${task.task_no}）：${img.url} → ${e.message}`)
      }
    } else if (img.base64) {
      try {
        const buffer = Buffer.from(img.base64, 'base64')
        const stored = await saveImage({
          scope: 'results',
          userId: task.user_id,
          buffer,
          mimeType: img.mimeType || 'image/png',
        })
        imported.push(stored.url)
      } catch (e: any) {
        console.warn(`[generations] base64 结果保存失败（任务 ${task.task_no}）：${e.message}`)
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
        result_image_urls = ?, error_message = '结果转存失败，请点击重新加载',
        completed_at = COALESCE(completed_at, ?), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(JSON.stringify(rawUrls), now, task.id)
  }
}

// ── 自动路由执行 ──

const routeInFlight = new Map<number, Promise<void>>()
const routeUserActive = new Map<number, number>()

function routeSlotsAvailable(userId: number): boolean {
  return (routeUserActive.get(userId) ?? 0) < SYNC_PER_USER_LIMIT
}

function loadLogicalModel(id: number) {
  return db.prepare(`SELECT * FROM ai_logical_models WHERE id = ?`).get(id) as any
}

function eligibleChannelModels(task: any): any[] {
  const attemptedProviders = new Set((db.prepare(`SELECT provider_id FROM generation_route_attempts WHERE task_id = ?`).all(task.id) as any[]).map((r) => r.provider_id))
  const rows = db.prepare(`
    SELECT m.id, m.provider_id, m.model_id, m.display_name, m.logical_model_id, m.param_overrides,
           m.cost_pricing, m.supports_image_gen, m.status AS model_status,
           p.id AS p_id, p.code AS p_code, p.name AS p_name, p.base_url AS p_base_url,
           p.adapter AS p_adapter, p.status AS p_status
    FROM ai_models m JOIN api_providers p ON p.id = m.provider_id
    WHERE m.logical_model_id = ? AND m.supports_image_gen = 1
      AND m.status = 'active' AND p.status = 'active'
      AND EXISTS (SELECT 1 FROM api_provider_keys k WHERE k.provider_id = p.id AND k.status = 'active')
  `).all(task.logical_model_id) as any[]
  return rows.filter((cm) => {
    if (attemptedProviders.has(cm.p_id)) return false
    const costs = parseParams(cm.cost_pricing) as Record<string, number> | null
    const cost = costs?.[task.resolution]
    if (typeof cost !== 'number' || !Number.isFinite(cost) || cost < 0) return false
    const caps = getChannelModelCapabilities(cm)
    if (!caps?.resolutions.includes(task.resolution)) return false
    const ratios = aspectRatiosAtResolution(caps, task.resolution)
    if (ratios.length > 0 && !ratios.includes(task.aspect_ratio)) return false
    if (parseJsonArray(task.input_image_urls).length > (caps.maxReferenceImages ?? 14)) return false
    if (String(task.prompt || '').length > (caps.maxPromptChars ?? 32000)) return false
    cm.route_cost = cost
    return true
  }).sort((a, b) => a.route_cost - b.route_cost || a.id - b.id)
    .filter((cm, index, all) => all.findIndex((candidate) => candidate.p_id === cm.p_id) === index)
}

function startRouteAttempt(taskId: number, cm: any, keyId: number | null): number {
  const next = db.prepare(`SELECT COALESCE(MAX(attempt_no), 0) + 1 AS n FROM generation_route_attempts WHERE task_id = ?`).get(taskId) as any
  const result = db.prepare(`
    INSERT INTO generation_route_attempts
      (task_id, attempt_no, channel_model_id, provider_id, provider_key_id, cost_price, status)
    VALUES (?, ?, ?, ?, ?, ?, 'started')
  `).run(taskId, next.n, cm.id, cm.p_id, keyId, cm.route_cost)
  return Number(result.lastInsertRowid)
}

function finishRouteAttempt(id: number, status: 'succeeded' | 'failed', errorCode?: string, errorMessage?: string): void {
  const safeMessage = errorMessage
    ? String(errorMessage).replace(/Bearer\s+[^\s,;]+/gi, 'Bearer ***').replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, 'sk-***').slice(0, 2000)
    : null
  db.prepare(`
    UPDATE generation_route_attempts
    SET status = ?, error_code = ?, error_message = ?, finished_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(status, errorCode ?? null, safeMessage, id)
}

function clearCurrentRoute(taskId: number): void {
  db.prepare(`
    UPDATE generation_tasks SET status = 'submitted', progress = 0,
      provider_task_id = NULL, provider_key_id = NULL, provider_code = NULL,
      channel_model_id = NULL, channel_provider_id = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(taskId)
}

function failCurrentRouteAndContinue(task: any, errorCode: string, errorMessage: string): void {
  const attempt = db.prepare(`
    SELECT id FROM generation_route_attempts
    WHERE task_id = ? AND channel_model_id = ? AND status = 'started'
    ORDER BY attempt_no DESC LIMIT 1
  `).get(task.id, task.channel_model_id) as { id: number } | undefined
  const cleared = db.prepare(`
    UPDATE generation_tasks SET status = 'submitted', progress = 0,
      provider_task_id = NULL, provider_key_id = NULL, provider_code = NULL,
      channel_model_id = NULL, channel_provider_id = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND channel_model_id = ? AND provider_task_id IS ?
  `).run(task.id, task.channel_model_id, task.provider_task_id ?? null)
  if (cleared.changes === 0) return
  if (attempt) finishRouteAttempt(attempt.id, 'failed', errorCode, errorMessage)
  dispatchRoutedTask(task.id, task.user_id)
}

async function runRoutedTask(taskId: number): Promise<void> {
  let task = loadTask(taskId)
  if (!task || TERMINAL.includes(task.status) || !task.logical_model_id || task.provider_task_id) return
  let lastError = '没有可用渠道'

  while (true) {
    task = loadTask(taskId)
    if (!task || TERMINAL.includes(task.status) || task.provider_task_id) return
    const cm = eligibleChannelModels(task)[0]
    if (!cm) {
      failTaskAndRefund(task.id, 'ROUTES_EXHAUSTED', `所有可用渠道均执行失败：${lastError}`)
      return
    }

    let attemptId: number | null = null
    try {
      // 同一渠道只使用优先级最高的启用 Key；失败后直接跨渠道，不调用 withKeyFailover。
      const ctx = resolveProviderContext(cm.p_id, 'image')
      attemptId = startRouteAttempt(task.id, cm, ctx.config.keyId ?? null)
      db.prepare(`
        UPDATE generation_tasks SET status = 'in_progress', provider_code = ?,
          channel_model_id = ?, channel_provider_id = ?, provider_key_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(cm.p_code, cm.id, cm.p_id, ctx.config.keyId ?? null, task.id)

      const adapter = getImageAdapter(cm.p_adapter)
      const result = await adapter.submitImageTask(buildImageGenRequest(task, cm), ctx.config)
      if (cm.p_adapter === 'toapis') {
        if (!result.providerTaskId) throw new Error('异步渠道未返回任务号')
        db.prepare(`UPDATE generation_tasks SET status = 'submitted', provider_task_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
          .run(result.providerTaskId, task.id)
        return
      }
      if (!result.images?.length) throw new Error('上游未返回任何图片')
      db.prepare(`UPDATE generation_tasks SET status = 'importing', progress = 100, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(task.id)
      const fresh = loadTask(task.id)
      const { imported, rawUrls } = await importImages(fresh, result.images)
      commitImportResult(fresh, imported, rawUrls)
      finishRouteAttempt(attemptId, 'succeeded')
      return
    } catch (e: any) {
      lastError = e?.message || String(e)
      if (attemptId === null) attemptId = startRouteAttempt(task.id, cm, null)
      finishRouteAttempt(attemptId, 'failed', e instanceof ProviderContextError ? 'KEY_UNAVAILABLE' : 'UPSTREAM_ERROR', lastError)
      clearCurrentRoute(task.id)
      console.warn(`[generations] 渠道 ${cm.p_name} 执行失败，切换下一渠道（任务 ${task.task_no}）：${lastError}`)
    }
  }
}

function dispatchRoutedTask(taskId: number, userId: number): void {
  if (routeInFlight.has(taskId)) return
  if (!routeSlotsAvailable(userId)) return
  routeUserActive.set(userId, (routeUserActive.get(userId) ?? 0) + 1)
  const promise = runRoutedTask(taskId)
    .catch((e) => {
      console.error(`[generations] routed task ${taskId} crashed:`, e)
      failTaskAndRefund(taskId, 'ROUTER_ERROR', e?.message || String(e))
    })
    .finally(() => {
      routeInFlight.delete(taskId)
      routeUserActive.set(userId, Math.max(0, (routeUserActive.get(userId) ?? 1) - 1))
    })
  routeInFlight.set(taskId, promise)
}

function buildImageGenRequest(task: any, cm: any): ImageGenRequest {
  return {
    model: cm.model_id,
    logicalCode: logicalCodeOf(cm),
    prompt: task.prompt || '',
    negativePrompt: task.negative_prompt || undefined,
    aspectRatio: task.aspect_ratio || '1:1',
    resolution: task.resolution || '1K',
    n: 1,
    imageUrls: parseJsonArray(task.input_image_urls),
    sizeClamp: parseParams(cm.param_overrides)?.sizeClamp,
  }
}

function parseJsonArray(v: any): string[] {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') { try { const a = JSON.parse(v); return Array.isArray(a) ? a : [] } catch { return [] } }
  return []
}

// ── POST /api/generations（提交）──

generationsRouter.post('/', (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const {
    logicalModelId, channelModelId, prompt, userPrompt, systemPrompt,
    aspectRatio, resolution, n, refImageUrls, templateImageIds,
    featureId, supplementaryImages, promptSegments, negativePrompt,
    suiteId, pointIndex, clientBusinessId,
  } = req.body || {}

  let resolvedLogicalId = Number(logicalModelId) || 0
  if (!resolvedLogicalId && channelModelId) resolvedLogicalId = Number(loadChannelModel(Number(channelModelId))?.logical_model_id) || 0
  if (!resolvedLogicalId || typeof prompt !== 'string') {
    res.status(400).json({ success: false, error: '缺少必要参数：logicalModelId, prompt' })
    return
  }
  const logical = loadLogicalModel(resolvedLogicalId)
  if (!logical || logical.kind !== 'image' || logical.status !== 'active') {
    res.status(404).json({ success: false, error: '逻辑模型不存在或已停用' }); return
  }
  const caps = parseParams(logical.default_params)
  if (!caps?.resolutions?.length) {
    res.status(400).json({ success: false, error: '该模型未配置有效能力，请联系管理员' }); return
  }
  const effResolution = resolution || caps.resolutions[0]
  if (!caps.resolutions.includes(effResolution)) {
    res.status(400).json({ success: false, error: `该模型不支持分辨率 ${effResolution}` }); return
  }
  const allowedRatios = aspectRatiosAtResolution(caps, effResolution)
  const effRatio = aspectRatio || allowedRatios[0] || '1:1'
  if (allowedRatios.length > 0 && !allowedRatios.includes(effRatio)) {
    res.status(400).json({ success: false, error: `分辨率 ${effResolution} 下不支持宽高比 ${effRatio}` }); return
  }
  const refUrls = Array.isArray(refImageUrls) ? refImageUrls.filter((u: unknown) => typeof u === 'string') : []
  if (refUrls.length > (caps.maxReferenceImages ?? 14)) {
    res.status(400).json({ success: false, error: `参考图最多 ${caps.maxReferenceImages ?? 14} 张` }); return
  }
  const finalPrompt = prompt.trim()
  if (finalPrompt.length > (caps.maxPromptChars ?? 32000)) {
    res.status(400).json({ success: false, error: `提示词最长 ${caps.maxPromptChars ?? 32000} 字` }); return
  }
  if (!finalPrompt && refUrls.length === 0 && !(systemPrompt && String(systemPrompt).trim())) {
    res.status(400).json({ success: false, error: '请输入提示词，描述你想要生成的效果' }); return
  }
  const salePricing = parseParams(logical.sale_pricing) as Record<string, number> | null
  const unitPrice = salePricing?.[effResolution]
  if (typeof unitPrice !== 'number' || !Number.isFinite(unitPrice) || unitPrice < 0) {
    res.status(400).json({ success: false, error: `该模型未配置 ${effResolution} 分辨率售卖价，请联系管理员` }); return
  }
  const candidateProbe = {
    id: -1, logical_model_id: resolvedLogicalId, resolution: effResolution, aspect_ratio: effRatio,
    input_image_urls: refUrls, prompt: finalPrompt,
  }
  if (eligibleChannelModels(candidateProbe).length === 0) {
    res.status(400).json({ success: false, error: '当前模型与参数没有可用渠道，请联系管理员' }); return
  }
  const count = Math.max(1, Math.min(5, Number(n) || 1))

  let created: Array<{ id: number; taskNo: string }>
  try {
    const tx = db.transaction(() => {
      const user = db.prepare(`SELECT points FROM users WHERE id = ?`).get(userId) as any
      if (!user) throw { status: 404, error: '用户不存在' }
      const currentBalance = Number(user.points) || 0
      const totalCost = roundCredits(unitPrice * count)
      if (currentBalance < totalCost) throw {
        status: 402,
        error: `积分不足，需要 ${totalCost} 积分，当前仅有 ${roundCredits(currentBalance)} 积分`,
        data: { required: totalCost, available: roundCredits(currentBalance) },
      }
      const insert = db.prepare(`
        INSERT INTO generation_tasks (
          task_no, user_id, toapis_task_id, client_business_id, model, prompt, size, resolution, aspect_ratio, n,
          template_image_ids, input_image_urls, status, progress, feature_id, user_prompt,
          points_cost, points_balance_after, supplementary_images, prompt_segments, negative_prompt,
          suite_id, point_index, logical_model_id
        ) VALUES (?, ?, '', ?, ?, ?, ?, ?, ?, 1, ?, ?, 'submitted', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      const deduct = db.prepare(`UPDATE users SET points = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      const txnLog = db.prepare(`
        INSERT INTO points_transactions (user_id, amount, balance_after, reason, reference_type, reference_id, note, created_at)
        VALUES (?, ?, ?, 'generation', 'generation_task', ?, '', CURRENT_TIMESTAMP)
      `)
      const rows: Array<{ id: number; taskNo: string }> = []
      let balance = currentBalance
      for (let i = 0; i < count; i++) {
        const cost = roundCredits(unitPrice)
        balance = roundCredits(balance - cost)
        const no = generateTaskNo()
        const result = insert.run(
          no, userId, clientBusinessId || null, logical.code, finalPrompt, effRatio, effResolution, effRatio,
          templateImageIds ? JSON.stringify(templateImageIds) : null, JSON.stringify(refUrls),
          featureId || null, userPrompt || '', cost, balance,
          JSON.stringify(supplementaryImages || []), JSON.stringify(promptSegments || {}), negativePrompt || '',
          suiteId ? Number(suiteId) : null,
          pointIndex !== undefined && pointIndex !== null ? Number(pointIndex) : null,
          resolvedLogicalId,
        )
        const id = Number(result.lastInsertRowid)
        if (cost > 0) { deduct.run(balance, userId); txnLog.run(userId, -cost, balance, id) }
        rows.push({ id, taskNo: no })
      }
      return rows
    })
    created = tx() as Array<{ id: number; taskNo: string }>
  } catch (e: any) {
    if (e?.status && e?.error) { res.status(e.status).json({ success: false, error: e.error, data: e.data }); return }
    throw e
  }

  for (const task of created) dispatchRoutedTask(task.id, userId)
  res.json({ success: true, data: { tasks: created.map((t) => ({ ...t, status: loadTask(t.id)?.status ?? 'submitted' })), inputImageUrls: refUrls } })
})

function logicalCodeOf(cm: any): string | undefined {
  if (!cm.logical_model_id) return undefined
  return (db.prepare(`SELECT code FROM ai_logical_models WHERE id = ?`).get(cm.logical_model_id) as any)?.code
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

  // 尚未绑定渠道：后台派发可能仍在排队，轮询时补派发。
  if (!task.channel_model_id) {
    dispatchRoutedTask(task.id, task.user_id)
    snapshot()
    return
  }
  const cm = loadChannelModel(task.channel_model_id)
  if (!cm) {
    failCurrentRouteAndContinue(task, 'CHANNEL_GONE', '当前渠道模型已被删除')
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

    // 异步任务整体超时兜底：创建超过 30 分钟仍未终态 → 失败退款。
    // 覆盖上游集群故障丢任务（轮询永远 task_not_exist）、上游进度停滞等一切卡死场景，
    // 不设兜底时任务会永久挂在 submitted/in_progress 且积分不退。
    const taskAgeMin = (Date.now() - new Date(String(task.created_at).replace(' ', 'T') + 'Z').getTime()) / 60_000
    if (taskAgeMin > ASYNC_TASK_TIMEOUT_MIN) {
      const attempt = db.prepare(`SELECT id FROM generation_route_attempts WHERE task_id = ? AND status = 'started' ORDER BY attempt_no DESC LIMIT 1`).get(task.id) as any
      if (attempt) finishRouteAttempt(attempt.id, 'failed', 'TASK_TIMEOUT', '任务超时，无法确认上游最终状态')
      failTaskAndRefund(task.id, 'TASK_TIMEOUT', '任务超时未返回结果，已自动退款')
      snapshot()
      return
    }
    try {
      // 轮询路径不接入 Key 切换（S3）：任务已在上游，换 Key 无济于事；异常记警告、下轮重试。
      // 但必须用任务提交时的 Key 查询：toapis 任务按 Key 隔离，用错 Key 会得到 task_not_exist
      const ctx = resolveProviderContext(cm.p_id, 'image', { preferKeyId: task.provider_key_id })
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
        const attempt = db.prepare(`SELECT id FROM generation_route_attempts WHERE task_id = ? AND channel_model_id = ? AND status = 'started' ORDER BY attempt_no DESC LIMIT 1`).get(task.id, task.channel_model_id) as any
        if (attempt) finishRouteAttempt(attempt.id, 'succeeded')
        snapshot()
        return
      }

      if (result.status === 'failed') {
        failCurrentRouteAndContinue(task, result.errorCode || 'UPSTREAM_FAILED', result.errorMessage || '生成失败')
        snapshot()
        return
      }

      // 进行中：同步上游状态/进度
      db.prepare(`UPDATE generation_tasks SET status = ?, progress = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(result.status, result.progress ?? 0, task.id)
      snapshot()
      return
    } catch (e: any) {
      if (e instanceof ProviderContextError) {
        failCurrentRouteAndContinue(task, 'CHANNEL_UNAVAILABLE', e.message)
        snapshot()
        return
      }
      // 上游明确表示任务不存在：多为上游集群故障把任务弄丢（三入口均查不到），
      // 重试永远无果。留 10 分钟宽限（防上游写入延迟误杀）后判终态失败退款。
      const notExist =
        (e instanceof ProviderCallError && (e.raw as any)?.code === 'task_not_exist') ||
        /task_not_exist/i.test(String(e?.message ?? ''))
      if (notExist && taskAgeMin > TASK_NOT_EXIST_GRACE_MIN) {
        failCurrentRouteAndContinue(task, 'UPSTREAM_TASK_LOST', '上游任务丢失（task_not_exist）')
        snapshot()
        return
      }
      // 上游查询异常（网络抖动等）：不动任务状态，返回快照
      console.warn(`[generations] 轮询上游失败（${task.task_no}）：${e.message}`)
      snapshot()
      return
    }
  }

  // 同步渠道：submitted 且未完成 → 补派发（如重启后/并发超限）
  if (task.status === 'submitted') {
    dispatchRoutedTask(task.id, task.user_id)
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
  if (existing.filter(isStoredUrl).length > 0) {
    res.json({ success: true, data: { resultUrls: existing.filter(isStoredUrl) } })
    return
  }

  // 优先用库里的原始 URL 重试；没有则查上游（异步渠道）
  const rawUrls = existing.filter((u) => !isStoredUrl(u))
  let images: GeneratedImage[] = rawUrls.map((url) => ({ url }))

  if (images.length === 0 && task.provider_task_id && task.channel_model_id) {
    try {
      const cm = loadChannelModel(task.channel_model_id)
      const ctx = resolveProviderContext(cm.p_id, 'image', { preferKeyId: task.provider_key_id })
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
    SELECT t.*, lm.code AS logical_code
    FROM generation_tasks t
    LEFT JOIN ai_logical_models lm ON lm.id = t.logical_model_id
    ${where} ORDER BY t.created_at DESC LIMIT ? OFFSET ?
  `).all(...params, pageSize, (page - 1) * pageSize) as any[]

  res.json({
    success: true,
    data: {
      records: rows.map((r) => {
        const parsed = parseTaskRow(r)
        parsed.taskNo = r.task_no
        parsed.logicalCode = r.logical_code
        delete parsed.provider_task_id
        delete parsed.provider_key_id
        delete parsed.provider_code
        delete parsed.channel_model_id
        delete parsed.channel_provider_id
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
      const task = loadTask(t.id)
      if (task?.logical_model_id) failCurrentRouteAndContinue(task, 'RESTART_LOST', '服务重启导致当前渠道结果丢失')
      else failTaskAndRefund(t.id, 'RESTART_LOST', '服务重启导致结果丢失，已自动退款')
    }
  }

  // 2. async 进行中且有 provider_task_id → 无需处理（轮询自然恢复），
  //    但超龄（>ASYNC_TASK_TIMEOUT_MIN）仍无终态 → 失败退款：
  //    覆盖前端已关页无人轮询的场景（上游集群故障丢任务等卡死兜底，与轮询路径同口径）
  const staleAsync = db.prepare(`
    SELECT t.id FROM generation_tasks t
    WHERE t.status IN ('submitted','queued','in_progress')
      AND t.provider_task_id IS NOT NULL AND t.provider_task_id != ''
      AND t.created_at <= datetime('now', '-${ASYNC_TASK_TIMEOUT_MIN} minutes')
  `).all() as any[]
  for (const t of staleAsync) {
    const attempt = db.prepare(`SELECT id FROM generation_route_attempts WHERE task_id = ? AND status = 'started' ORDER BY attempt_no DESC LIMIT 1`).get(t.id) as any
    if (attempt) finishRouteAttempt(attempt.id, 'failed', 'TASK_TIMEOUT', '任务超时，无法确认上游最终状态')
    failTaskAndRefund(t.id, 'TASK_TIMEOUT', '任务超时未返回结果，已自动退款')
  }

  // 3. 无渠道任务号的自动路由任务重新派发；旧任务维持失败退款。
  const orphans = db.prepare(`
    SELECT t.id, t.channel_model_id FROM generation_tasks t
    WHERE t.status IN ('submitted','queued','in_progress') AND (t.provider_task_id IS NULL OR t.provider_task_id = '')
  `).all() as any[]
  for (const t of orphans) {
    const task = loadTask(t.id)
    if (task?.logical_model_id) {
      if (task.channel_model_id) failCurrentRouteAndContinue(task, 'RESTART_LOST', '服务重启导致当前渠道调用中断')
      else dispatchRoutedTask(task.id, task.user_id)
    } else {
      failTaskAndRefund(t.id, 'RESTART_LOST', '服务重启导致任务中断，已自动退款')
    }
  }

  if (importing.length > 0 || orphans.length > 0 || staleAsync.length > 0) {
    console.log(`[generations] 启动清扫：importing 复位 ${importing.length} 条，中断任务标失败 ${orphans.length} 条，超时任务标失败 ${staleAsync.length} 条`)
  }
}

/** 优雅停机：等待在途同步任务落库（最多 10s） */
export async function waitForSyncTasks(): Promise<void> {
  const tasks = [...routeInFlight.values()]
  if (tasks.length === 0) return
  console.log(`[generations] 等待 ${tasks.length} 个同步渠道在途任务完成…`)
  await Promise.race([
    Promise.allSettled(tasks),
    new Promise((resolve) => setTimeout(resolve, 10_000)),
  ])
}
