/** 独立 HTTP 服务 + 正式构建产物；不连接数据库、不调用上游，浏览器缓存保持启用。 */
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
import express from 'express'
import sharp from 'sharp'
import { createThumbnailRouter } from '../server/src/utils/thumbnails.js'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'momo-image-browser-'))
const output = path.resolve('.ui-test-output/images')
await fs.mkdir(output, { recursive: true })
const uploads = path.join(root, 'uploads')
await fs.mkdir(path.join(uploads, 'results/1'), { recursive: true })
// 可复现的纹理图片：不是用极小纯色图虚报“优化效果”。
const width = 1600, height = 1200
const pixels = Buffer.alloc(width * height * 3)
let seed = 42
for (let i = 0; i < pixels.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; pixels[i] = seed >>> 24 }
const original = await sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer()
for (let i = 1; i <= 20; i++) await fs.writeFile(path.join(uploads, `results/1/${i}.png`), original)
const originals = Array.from({ length: 20 }, (_, i) => `/api/files/results/1/${i + 1}.png`)
const counts: Record<string, number> = {}
const app = express()
let fail = false
let baselineOriginals = false
app.use((req, _res, next) => { counts[req.path] = (counts[req.path] || 0) + 1; next() })
app.use('/api/thumbnails', (req, res, next) => {
  if (baselineOriginals) { res.set('Cache-Control', 'no-store').sendFile(path.join(uploads, req.path.replace(/^\/v1\//, ''))); return }
  if (fail) { res.set('Cache-Control', 'no-store').status(422).end(); return }
  next()
}, createThumbnailRouter(uploads, path.join(root, 'thumbs')))
app.use('/api/files', express.static(uploads, { maxAge: '365d', immutable: true }))
const tasks = originals.map((url, i) => ({ id: i + 1, task_no: `fixture-${i + 1}`, status: 'completed', prompt: `测试图片 ${i + 1}`, model: 'fixture', resolution: '1K', aspect_ratio: '4:3', n: 1, feature_id: 'free-gen', created_at: '2026-09-25T08:00:00Z', result_image_urls: [url], input_image_urls: [originals[1]], points_cost: 1 }))
app.use('/api', (req, res) => {
  res.set('Cache-Control', 'no-store')
  if (req.method !== 'GET') { res.status(405).end(); return }
  let data: unknown = []
  if (req.path === '/me') data = { id: 1, username: '隔离验收', role: 'admin', points: 100 }
  if (req.path === '/models/catalog') data = { models: [], platform: [] }
  if (req.path === '/templates') data = { records: originals.map((url, i) => ({ id: i + 1, name: `测试模板 ${i + 1}`, public_url: url, tags: [], original_filename: `${i + 1}.png`, size_bytes: original.length, width, height, created_at: '2026-09-25', is_starred: 0 })), total: 20 }
  if (req.path === '/tasks' || req.path === '/generations') data = { records: tasks, total: 20, page: 1, pageSize: 20 }
  res.json({ success: true, data })
})
app.use(express.static(path.resolve('dist'), { setHeaders(res, file) { res.set('Cache-Control', file.endsWith('.html') ? 'no-cache' : 'public, max-age=31536000, immutable') } }))
app.get('*', (_req, res) => { res.set('Cache-Control', 'no-cache').sendFile(path.resolve('dist/index.html')) })
const server = app.listen(0, '127.0.0.1')
await new Promise<void>(resolve => server.once('listening', resolve))
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const report: Record<string, unknown> = { fixture: '20 张合成纹理 PNG；同一正式页面、视口、操作，以原图响应与缩略图响应对照；非线上节省率', originalBytes: original.length }
async function newPage() {
  const context = await browser.newContext({ viewport: { width: 390, height: 800 }, acceptDownloads: true })
  await context.addInitScript(() => localStorage.setItem('auth_token', 'isolated-fixture'))
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (e: Error) => errors.push(e.message))
  page.setDefaultTimeout(15000)
  return { context, page, errors }
}
async function settled(page: any) { await page.waitForTimeout(500); await page.waitForLoadState('networkidle') }
async function imageStats(page: any) {
  return page.evaluate(() => {
    const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
    const images = entries.filter(e => /\/api\/(files|thumbnails)\//.test(e.name))
    return { count: images.length, transferBytes: images.reduce((n, e) => n + e.transferSize, 0), encodedBytes: images.reduce((n, e) => n + e.encodedBodySize, 0), originalCount: images.filter(e => e.name.includes('/api/files/')).length, cachedCount: images.filter(e => e.transferSize === 0 && e.decodedBodySize > 0).length }
  })
}
try {
  const baseline = await newPage()
  baselineOriginals = true
  await baseline.page.goto(base + '/#/assets/templates'); await baseline.page.locator('img[data-thumbnail]').first().waitFor(); await settled(baseline.page)
  report.baselineFirstScreen = await imageStats(baseline.page)
  await baseline.context.close()
  baselineOriginals = false
  for (const route of ['templates', 'results']) {
    const { context, page, errors } = await newPage()
    await page.goto(base + '/#/assets/' + route)
    await page.locator('img[data-thumbnail]').first().waitFor()
    await settled(page)
    const before = await imageStats(page)
    assert.equal(before.originalCount, 0)
    assert(before.count > 0)
    assert(await page.locator('img[data-thumbnail]').first().evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth <= 400 && e.naturalWidth > 0))
    report[route + 'FirstScreen'] = before
    await page.screenshot({ path: path.join(output, route + '.png') })
    await page.locator('[data-thumbnail]').last().scrollIntoViewIfNeeded(); await settled(page)
    const scrolled = await imageStats(page)
    assert(scrolled.count > before.count, '滚动应加载新缩略图')
    assert.equal(scrolled.originalCount, 0)
    report[route + 'Scrolled'] = scrolled
    const first = page.locator('img[data-thumbnail]').first()
    await first.scrollIntoViewIfNeeded(); await first.click()
    const preview = page.locator('.ds-image-preview-stage img')
    await preview.waitFor(); await settled(page)
    assert.equal(await preview.getAttribute('src'), originals[0])
    assert.equal((await imageStats(page)).originalCount, 1)
    assert.equal(await preview.evaluate((e: HTMLImageElement) => e.naturalWidth), width)
    await page.getByRole('button', { name: '关闭', exact: true }).click()
    await settled(page)
    assert.equal(await page.locator('.ds-image-preview-stage img').count(), 0)
    if (route === 'results') {
      const downloadPromise = page.waitForEvent('download')
      await page.locator('article').filter({ has: page.locator('img[data-thumbnail]') }).first().hover()
      await page.getByRole('button', { name: '下载', exact: true }).first().click()
      const download = await downloadPromise
      const saved = await download.path()
      assert.deepEqual(await fs.readFile(saved), original, '下载必须与原始文件逐字节一致')
      report.downloadOriginalBytesVerified = true
    }
    await page.reload(); await page.locator('img[data-thumbnail]').first().waitFor(); await settled(page)
    const cached = await imageStats(page)
    assert.equal(cached.originalCount, 0)
    assert(cached.cachedCount > 0)
    report[route + 'Reload'] = cached
    // 模拟 HTML 重新获取，资源 URL 与缓存目录不变；不是线上部署证明。
    await page.goto(base + '/?release=fixture-2#/assets/' + route); await settled(page)
    const release = await imageStats(page)
    assert(release.cachedCount > 0)
    report[route + 'ReleaseSimulation'] = release
    assert.deepEqual(errors, [])
    await context.close()
  }
  // 错误响应 no-store；重试同一地址，且不触发原图回退。
  fail = true
  const failed = await newPage()
  await failed.page.goto(base + '/#/assets/results')
  await failed.page.getByRole('button', { name: '重试缩略图' }).first().waitFor(); await settled(failed.page)
  assert.equal((await imageStats(failed.page)).originalCount, 0)
  await failed.page.locator('.ds-thumbnail-placeholder > svg').first().click()
  await failed.page.locator('.ds-image-preview-stage img').waitFor()
  await failed.page.getByRole('button', { name: '关闭', exact: true }).click()
  await failed.page.evaluate(() => performance.clearResourceTimings())
  fail = false
  await failed.page.getByRole('button', { name: '重试缩略图' }).first().click()
  await failed.page.locator('img[data-thumbnail]').first().waitFor(); await settled(failed.page)
  assert.equal((await imageStats(failed.page)).originalCount, 0)
  await failed.page.locator('img[data-thumbnail]').first().click(); await failed.page.locator('.ds-image-preview-stage img').waitFor()
  report.failureRetryWithoutOriginalFallback = true
  await failed.context.close()
  // 公共展厅的本地 SVG -> 400px WebP、内置卡片预览。
  const gallery = await newPage()
  await gallery.page.goto(base + '/admin.html#/ui-components')
  await gallery.page.getByRole('heading', { name: 'UI 组件库', exact: true }).waitFor()
  await gallery.page.getByRole('textbox', { name: '搜索组件' }).fill('图片缩略图')
  await settled(gallery.page)
  report.galleryLocalThumbnailCount = await gallery.page.locator('img[data-thumbnail][src^="data:image/webp"]').count()
  assert(Number(report.galleryLocalThumbnailCount) > 0)
  await gallery.page.getByRole('button', { name: '预览原图', exact: true }).click()
  await gallery.page.locator('.ds-image-preview-stage img').waitFor()
  assert((await gallery.page.locator('.ds-image-preview-stage img').getAttribute('src')).startsWith('data:image/svg+xml'))
  await gallery.page.getByRole('button', { name: '关闭', exact: true }).click()
  assert.deepEqual(gallery.errors, [])
  await gallery.context.close()
  report.serverImageRequests = Object.fromEntries(Object.entries(counts).filter(([key]) => /\/api\/(files|thumbnails)\//.test(key)))
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
} finally {
  await browser.close()
  await new Promise<void>(resolve => server.close(() => resolve()))
  await fs.rm(root, { recursive: true, force: true })
}
