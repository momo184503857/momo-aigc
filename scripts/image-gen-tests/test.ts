/**
 * AI 生图模块（三层重构）端到端回归测试
 *
 * 直接 import 重构后的 submitTask/pollTask/generateImage/importResultUrls，
 * 通过后端共享 Key 跑真实 ToAPIs/OSS。用于验证生图核心逻辑不被回归破坏。
 *
 * 运行（在项目根目录）：
 *   npx tsx scripts/image-gen-tests/test.ts <scenario>
 *
 * scenarios:
 *   ping          只读连通性检查（登录 + taskApi.list，不消耗积分）
 *   free-gen      工作台自由生图（generateImage {poll, import} 全链路）
 *   batch-clothes 批量换衣（验证共享图只上传一次）
 *   buyer-show    买家秀（submitTask + getTaskStatus 行级轮询路径）
 *   fail-check    generateImage 失败/成功时 DB 终态写入（需要触发到一次失败）
 *   all           跑 free-gen + batch-clothes + buyer-show
 *
 * 环境变量（可选，覆盖默认测试图）：
 *   TEST_MODEL_IMAGE   模特图路径
 *   TEST_GARMENT_IMAGE 衣服图路径
 *
 * 前置条件：后端已启动（npm run dev:server，端口 3000），共享 Key 已配置，
 *          admin/admin123 可登录。每次真实生成约消耗 0.084 元（gemini-2.5-flash 1K）。
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// ─── 浏览器环境 polyfill（必须在 import @/ 之前）───
const _store: Record<string, string> = {}
;(globalThis as any).localStorage = {
  getItem: (k: string) => (k in _store ? _store[k] : null),
  setItem: (k: string, v: string) => { _store[k] = String(v) },
  removeItem: (k: string) => { delete _store[k] },
  clear: () => { for (const k of Object.keys(_store)) delete _store[k] },
}
;(globalThis as any).window = { location: { href: '' } }

const HERE = dirname(fileURLToPath(import.meta.url))
const BACKEND = 'http://localhost:3000'
const MODEL = 'gemini-2.5-flash-image-preview'
const RESOLUTION = '1K'
const ASPECT = '9:16'  // 匹配模特竖图
const MODEL_PATH = process.env.TEST_MODEL_IMAGE || join(HERE, 'fixtures/model.png')
const GARMENT_PATH = process.env.TEST_GARMENT_IMAGE || join(HERE, 'fixtures/garment.jpg')

// ─── 日志 ───
const c = { info: '\x1b[36m', ok: '\x1b[32m', fail: '\x1b[31m', step: '\x1b[33m', rst: '\x1b[0m' }
const log = {
  info: (...a: any[]) => console.log(`${c.info}[INFO]${c.rst}`, ...a),
  ok: (...a: any[]) => console.log(`${c.ok}[OK]${c.rst}`, ...a),
  fail: (...a: any[]) => console.log(`${c.fail}[FAIL]${c.rst}`, ...a),
  step: (...a: any[]) => console.log(`\n${c.step}━━━ ${a.join(' ')} ━━━${c.rst}`),
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

let failures = 0
function assert(cond: any, msg: string) {
  if (cond) log.ok(`断言通过：${msg}`)
  else { log.fail(`断言失败：${msg}`); failures++ }
}

async function readFileAsFile(path: string, mimeType: string): Promise<File> {
  const buf = await readFile(path)
  return new File([buf], path.split('/').pop() || 'image', { type: mimeType })
}

// ─── 登录 + 注入 baseURL ───
async function setup() {
  log.step('登录 admin')
  const loginRes = await fetch(`${BACKEND}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  })
  if (!loginRes.ok) throw new Error(`登录失败: ${loginRes.status}`)
  const token = (await loginRes.json()).data?.token
  localStorage.setItem('auth_token', token)

  // 覆盖 axios baseURL（http.ts 硬编码 /api，Node 里需指向后端）
  const { default: http } = await import('@/services/http')
  http.defaults.baseURL = `${BACKEND}/api`
  log.ok('登录成功，baseURL 已指向后端')
}

// ─── 场景 1：工作台自由生图（generateImage 阻塞式全链路）───
async function freeGen() {
  log.step('场景 1：工作台自由生图（generateImage {poll, import}）')
  const { generateImage } = await import('@/services/imageGeneration')
  const { taskApi } = await import('@/services/taskApi')

  const modelFile = await readFileAsFile(MODEL_PATH, 'image/png')
  const garmentFile = await readFileAsFile(GARMENT_PATH, 'image/jpeg')

  log.info('调用 generateImage（上传两张本地图 + 阻塞轮询 + 转存）…')
  const result = await generateImage({
    model: MODEL as any,
    prompt: '将图一模特的衣服换成图二的衣服，保持模特姿态、肤色和背景场景',
    size: ASPECT, resolution: RESOLUTION,
    refImages: [{ file: modelFile }, { file: garmentFile }],
    featureId: 'free-gen', n: 1,
  }, { poll: { interval: 3000, maxAttempts: 80 }, import: true })

  log.info('toapisTaskId:', result.toapisTaskId, 'dbTaskId:', result.dbTaskId)
  log.info('pollResult.status:', result.pollResult?.status)

  assert(result.pollResult?.status === 'completed', '轮询应完成 (completed)')
  assert((result.resultUrls?.length ?? 0) > 0, `应返回结果图（实际 ${result.resultUrls?.length} 张）`)
  assert(result.inputImageUrls.length === 2, `输入图应为 2 张（实际 ${result.inputImageUrls.length}）`)
  assert(result.inputImageUrls.every(u => u.includes('aliyuncs.com')), '输入图应全部转存为 OSS URL')

  const dbTask = (await taskApi.get(result.dbTaskId)).data.data
  assert(dbTask.status === 'completed', `DB 任务应为 completed（实际 ${dbTask.status}）`)
  assert((dbTask.result_image_urls?.length ?? 0) > 0, 'DB 应记录结果图')
  log.ok(`结果图：${result.resultUrls?.[0]}`)
}

// ─── 场景 2：批量换衣（验证共享图只上传一次）───
async function batchClothes() {
  log.step('场景 2：批量换衣（共享衣服图只上传一次）')
  const { submitTask, pollTask, importResultUrls } = await import('@/services/imageGeneration')
  const { uploadImage } = await import('@/adapter/toapisClient')
  const { taskApi } = await import('@/services/taskApi')

  const modelFile = await readFileAsFile(MODEL_PATH, 'image/png')
  const garmentFile = await readFileAsFile(GARMENT_PATH, 'image/jpeg')

  // 模拟页面的 resolveSlotUrl：循环外各自上传一次
  log.info('循环外预上传（模拟 resolveSlotUrl）…')
  const garmentUrl = await uploadImage(garmentFile)
  const modelUrl = await uploadImage(modelFile)

  // 用 {url} 调 submitTask 两次，共享同一 garmentUrl
  const mk = () => submitTask({
    model: MODEL as any,
    prompt: '将图一模特的衣服换成图二的衣服',
    size: ASPECT, resolution: RESOLUTION,
    refImages: [{ url: modelUrl }, { url: garmentUrl }],
    featureId: 'change-clothes', n: 1,
  })
  const r1 = await mk()
  const r2 = await mk()
  log.info('r1.inputImageUrls[1]:', r1.inputImageUrls[1])
  log.info('r2.inputImageUrls[1]:', r2.inputImageUrls[1])

  // 核心断言：{url} 透传，OSS URL 不变（若重复上传会是新 objectKey）
  assert(r1.inputImageUrls[1] === garmentUrl, 'r1 衣服图 URL 应等于预上传 URL（未重复上传）')
  assert(r2.inputImageUrls[1] === garmentUrl, 'r2 衣服图 URL 应等于预上传 URL（共享图未重复上传）')
  assert(r1.inputImageUrls[1] === r2.inputImageUrls[1], '两次调用的衣服图 OSS URL 完全一致')

  // 轮询第 1 个任务拿结果
  const pollRes = await pollTask(r1.toapisTaskId, { interval: 3000, maxAttempts: 80 })
  if (pollRes.status === 'completed') {
    const urls = await importResultUrls(r1.toapisTaskId, pollRes.resultUrls)
    await taskApi.update(r1.dbTaskId, {
      status: 'completed', progress: 100, result_image_urls: urls,
      completed_at: new Date().toISOString(),
    })
    log.ok(`结果图：${urls[0]}`)
  } else {
    log.fail(`第 1 个任务未完成：${pollRes.status} ${pollRes.errorMessage}（Gemini 偶发，可重跑）`)
  }
  assert(!!r2.toapisTaskId && !!r2.dbTaskId, '第 2 个任务应成功提交')
}

// ─── 场景 3：买家秀（submitTask + getTaskStatus 行级轮询）───
async function buyerShow() {
  log.step('场景 3：买家秀（行级轮询路径）')
  const { submitTask, importResultUrls } = await import('@/services/imageGeneration')
  const { getTaskStatus, uploadImage } = await import('@/adapter/toapisClient')
  const { taskApi } = await import('@/services/taskApi')

  const modelFile = await readFileAsFile(MODEL_PATH, 'image/png')
  const mainUrl = await uploadImage(modelFile)

  const r = await submitTask({
    model: MODEL as any,
    prompt: '为这款商品生成一张真实的买家秀照片，模特自然穿着展示，居家或街拍场景，自然光线',
    size: ASPECT, resolution: RESOLUTION,
    refImages: [{ url: mainUrl }],
    featureId: 'buyer-show', n: 1,
  })

  // 模拟 MakeBuyerShowPanel 行级 setInterval 轮询（单次 getTaskStatus）
  let final: any = null
  for (let i = 1; i <= 80; i++) {
    await sleep(3000)
    const st = await getTaskStatus(r.toapisTaskId)
    log.info(`poll #${i}: status=${st.status} progress=${st.progress}%`)
    if (st.status === 'completed' || st.status === 'failed') { final = st; break }
  }

  if (final?.status === 'completed') {
    const urls = await importResultUrls(r.toapisTaskId, final.resultUrls)
    await taskApi.update(r.dbTaskId, {
      status: 'completed', progress: 100, result_image_urls: urls,
      completed_at: new Date().toISOString(), expires_at: final.expiresAt,
    })
    assert(urls.length > 0, `买家秀应产出结果图（${urls.length} 张）`)
    log.ok(`结果图：${urls[0]}`)
  } else {
    log.fail(`买家秀任务未完成：${final?.status}（Gemini 偶发，可重跑）`)
    failures++
  }

  const dbTask = (await taskApi.get(r.dbTaskId)).data.data
  assert(dbTask.feature_id === 'buyer-show', `DB feature_id 应为 buyer-show（实际 ${dbTask.feature_id}）`)
}

// ─── 场景 4：generateImage DB 终态写入（成功必 completed，失败必 failed）───
async function failCheck() {
  log.step('场景 4：generateImage DB 终态写入（DB 状态须等于轮询结果）')
  const { generateImage } = await import('@/services/imageGeneration')
  const { taskApi } = await import('@/services/taskApi')

  const modelFile = await readFileAsFile(MODEL_PATH, 'image/png')
  // 多次尝试，捕获一次失败以验证 failed 分支；若一直成功，至少验证 completed 分支
  for (let attempt = 1; attempt <= 4; attempt++) {
    log.info(`第 ${attempt}/4 次尝试…`)
    const result = await generateImage({
      model: MODEL as any,
      prompt: '生成一张买家秀照片',
      size: ASPECT, resolution: RESOLUTION,
      refImages: [{ file: modelFile }],
      featureId: 'buyer-show', n: 1,
    }, { poll: { interval: 3000, maxAttempts: 60 } })  // 不传 import，专注测 DB 终态

    const status = result.pollResult?.status
    const dbTask = (await taskApi.get(result.dbTaskId)).data.data
    log.info(`poll=${status}, DB=${dbTask.status}`)
    assert(dbTask.status === status, `DB 状态应等于轮询结果（DB=${dbTask.status}, poll=${status}）`)

    if (status === 'failed') {
      log.ok(`✓ 捕获到失败，DB 正确标记 failed：${dbTask.error_message?.slice(0, 40)}`)
      return
    }
  }
  log.fail('连续 4 次都成功，未能实测 failed 分支（completed 分支已验证）')
  failures++
}

// ─── 主入口 ───
const scenario = process.argv[2] ?? 'ping'
log.info(`运行场景: ${scenario}（模型 ${MODEL} / ${RESOLUTION} / ${ASPECT}）`)
try {
  await setup()
  if (scenario === 'ping') {
    const { taskApi } = await import('@/services/taskApi')
    const res = await taskApi.list({ page: 1, pageSize: 3 })
    log.ok(`taskApi.list 成功，返回 ${res.data?.data?.records?.length ?? 0} 条`)
  } else if (scenario === 'free-gen') {
    await freeGen()
  } else if (scenario === 'batch-clothes') {
    await batchClothes()
  } else if (scenario === 'buyer-show') {
    await buyerShow()
  } else if (scenario === 'fail-check') {
    await failCheck()
  } else if (scenario === 'all') {
    await freeGen()
    await batchClothes()
    await buyerShow()
  } else {
    log.fail(`未知场景: ${scenario}`)
    process.exit(1)
  }
  console.log()
  if (failures > 0) { log.fail(`测试结束，${failures} 个断言失败`); process.exit(1) }
  else log.ok('✅ 全部断言通过')
} catch (e: any) {
  log.fail('测试异常:', e?.message || e)
  if (e?.response?.data) console.log('响应:', JSON.stringify(e.response.data, null, 2))
  if (e?.stack) console.log(e.stack.split('\n').slice(0, 5).join('\n'))
  process.exit(1)
}
