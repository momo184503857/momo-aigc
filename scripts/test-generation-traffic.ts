import assert from 'node:assert/strict'
import { File as NodeFile } from 'node:buffer'
import Database from 'better-sqlite3'
import { parseTaskListRow, positiveInt, taskListSelect } from '../server/src/utils/taskList.js'
import { resetUserRateLimits, userRateLimit } from '../server/src/middleware/userRateLimit.js'
import { TaskSubmissionValidationError, validateReferenceImageUrls, validateSupplementaryImages } from '../server/src/utils/taskSubmission.js'
import { createStoredImageResolver } from '../src/services/storedImageResolver.js'

// Browser upload resolver also runs under this Node test without a DOM.
Object.defineProperty(globalThis, 'File', { configurable: true, value: NodeFile })

const db = new Database(':memory:')
db.exec(`
  CREATE TABLE generation_tasks (
    id INTEGER PRIMARY KEY, user_id INTEGER, toapis_task_id TEXT, client_business_id TEXT, model TEXT, prompt TEXT,
    size TEXT, resolution TEXT, aspect_ratio TEXT, n INTEGER, template_image_ids TEXT,
    input_image_urls TEXT, result_image_urls TEXT, status TEXT, progress INTEGER,
    error_code TEXT, error_message TEXT, raw_error TEXT, supplementary_images TEXT,
    prompt_segments TEXT, negative_prompt TEXT, user_prompt TEXT, created_at TEXT,
    updated_at TEXT, completed_at TEXT, expires_at TEXT, feature_id TEXT, points_cost REAL,
    points_balance_after REAL, suite_id INTEGER, point_index INTEGER, task_no TEXT,
    logical_model_id INTEGER, remark TEXT
  )
`)
const insert = db.prepare(`
  INSERT INTO generation_tasks (
    user_id, model, prompt, resolution, aspect_ratio, n, template_image_ids,
    input_image_urls, result_image_urls, status, progress, error_message, raw_error,
    supplementary_images, prompt_segments, negative_prompt, user_prompt, created_at,
    updated_at, feature_id, task_no, logical_model_id, remark
  ) VALUES (1, 'fixture', ?, '1K', '1:1', 1, '[]', ?, ?, 'completed', 100, ?, ?, ?, ?, ?, ?,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'free-gen', ?, 1, '')
`)
const embedded = `data:image/png;base64,${'A'.repeat(2 * 1024 * 1024)}`
for (let i = 0; i < 20; i++) {
  insert.run(
    'P'.repeat(2_000),
    JSON.stringify([embedded, 'https://momo-aigc.oss-cn-hangzhou.aliyuncs.com/inputs/a.png']),
    JSON.stringify(['https://momo-aigc.oss-cn-hangzhou.aliyuncs.com/results/a.png']),
    'E'.repeat(2_000),
    embedded,
    JSON.stringify([{ name: '大图', url: embedded }]),
    JSON.stringify({ huge: embedded }),
    'N'.repeat(2_000),
    'U'.repeat(2_000),
    `gen-fixture-${i}`,
  )
}

const rows = db.prepare(`SELECT ${taskListSelect('t')} FROM generation_tasks t ORDER BY id DESC LIMIT 20`).all()
  .map(parseTaskListRow)
const payload = JSON.stringify({ success: true, data: { records: rows, total: 20, page: 1, pageSize: 20 } })
assert(payload.length < 1024 * 1024, `任务列表响应过大: ${payload.length}`)
assert(!payload.includes('data:image/'))
assert.equal(rows[0].prompt.length, 500)
assert.equal(rows[0].prompt_truncated, true)
assert.deepEqual(rows[0].input_image_urls, ['https://momo-aigc.oss-cn-hangzhou.aliyuncs.com/inputs/a.png'])
assert.equal((db.prepare('SELECT supplementary_images FROM generation_tasks WHERE id = 1').get() as any).supplementary_images.includes('data:image/'), true)
assert.equal(positiveInt('10000', 20, 50), 50)
assert.equal(positiveInt('-2', 20, 50), 20)

assert.deepEqual(validateReferenceImageUrls(['https://example.com/a.png', '/api/files/inputs/a.png'], 5), ['https://example.com/a.png', '/api/files/inputs/a.png'])
assert.throws(() => validateReferenceImageUrls([embedded], 5), TaskSubmissionValidationError)
assert.throws(() => validateReferenceImageUrls(['blob:https://example.com/x'], 5), TaskSubmissionValidationError)
assert.deepEqual(validateSupplementaryImages([{ name: '衣服', url: 'https://example.com/a.png' }]), [{ name: '衣服', url: 'https://example.com/a.png' }])
assert.throws(() => validateSupplementaryImages([{ name: '衣服', url: embedded }]), TaskSubmissionValidationError)

resetUserRateLimits()
const limiter = userRateLimit('traffic-test', 30)
function invoke(userId: number) {
  const state: { next: boolean; status?: number; body?: any; headers: Record<string, string> } = { next: false, headers: {} }
  const response = {
    setHeader(name: string, value: string) { state.headers[name] = value },
    status(code: number) { state.status = code; return this },
    json(body: any) { state.body = body; return this },
  }
  limiter({ user: { userId, username: `u${userId}`, role: 'user' } } as any, response as any, () => { state.next = true })
  return state
}
for (let i = 0; i < 30; i++) assert.equal(invoke(1).next, true)
const limited = invoke(1)
assert.equal(limited.status, 429)
assert.match(limited.headers['Retry-After'], /^\d+$/)
assert.equal(limited.body.error, '请求过于频繁，请稍后重试')
assert.equal(invoke(2).next, true, '不同用户必须独立限流')

let uploads = 0
const resolver = createStoredImageResolver({
  ossHost: 'bucket.oss-cn-hangzhou.aliyuncs.com',
  upload: async () => { uploads++; return `https://bucket.oss-cn-hangzhou.aliyuncs.com/inputs/${uploads}.png` },
  fetchImage: async () => new Response(new Blob(['image'], { type: 'image/png' })),
})
const file = new NodeFile(['image'], 'image.png', { type: 'image/png' }) as unknown as File
assert.equal(await resolver.resolveFile(file), await resolver.resolveFile(file))
assert.equal(uploads, 1, '同一 File 只能上传一次')
assert.equal(await resolver.resolveUrl(embedded), await resolver.resolveUrl(embedded))
assert.equal(uploads, 2, '同一 data URL 只能上传一次')
assert.equal(await resolver.resolveUrl('https://bucket.oss-cn-hangzhou.aliyuncs.com/inputs/existing.png'), 'https://bucket.oss-cn-hangzhou.aliyuncs.com/inputs/existing.png')
assert.equal(uploads, 2, '本站存储 URL 不应重复上传')

const failing = createStoredImageResolver({
  ossHost: '',
  upload: async () => { throw new Error('offline') },
  fetchImage: async () => new Response(new Blob(['image'], { type: 'image/png' })),
})
const originalWarn = console.warn
console.warn = () => {}
try {
  await assert.rejects(() => failing.resolveUrl(embedded), /图片上传失败/)
} finally {
  console.warn = originalWarn
}

db.close()
console.log('流量回归测试通过：轻量列表、持久化 URL 校验、分页、用户限流、上传去重与失败阻断。')
