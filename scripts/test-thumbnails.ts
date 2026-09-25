/** 无数据库、无上游调用，全部文件落在系统临时目录。 */
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import http from 'node:http'
import sharp from 'sharp'
import { createThumbnailService, createThumbnailRouter, IMAGE_CACHE_CONTROL } from '../server/src/utils/thumbnails.js'
import { thumbnailUrl, OSS_THUMBNAIL_PROCESS } from '../src/utils/imageDisplay.js'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'momo-thumbnails-'))
const uploads = path.join(root, 'uploads')
const cache = path.join(root, 'cache')
await fs.mkdir(path.join(uploads, 'results', '1'), { recursive: true })
const service = createThumbnailService(uploads, cache)
async function fixture(name: string, width: number, height: number, options: { alpha?: boolean; orientation?: number } = {}) {
  let image = sharp({ create: { width, height, channels: options.alpha ? 4 : 3, background: options.alpha ? { r: 80, g: 160, b: 120, alpha: 0.3 } : { r: 80, g: 160, b: 120 } } })
  if (options.orientation) image = image.withMetadata({ orientation: options.orientation })
  await image.png().toFile(path.join(uploads, 'results/1', name))
}
let server: ReturnType<ReturnType<typeof express>['listen']> | undefined
try {
  for (const [name, width, height, expected] of [
    ['wide.png', 1600, 800, [400, 200]], ['tall.png', 800, 1600, [200, 400]], ['small.png', 80, 40, [80, 40]],
  ] as const) {
    await fixture(name, width, height)
    const original = await fs.readFile(path.join(uploads, 'results/1', name))
    const file = await service.get(`results/1/${name}`)
    const meta = await sharp(file).metadata()
    assert.deepEqual([meta.width, meta.height], expected)
    assert.equal(meta.format, 'webp')
    assert.deepEqual(await fs.readFile(path.join(uploads, 'results/1', name)), original)
  }
  await fixture('alpha.png', 500, 500, { alpha: true })
  assert.equal((await sharp(await service.get('results/1/alpha.png')).metadata()).hasAlpha, true)
  await fixture('rotated.png', 800, 400, { orientation: 6 })
  const rotated = await sharp(await service.get('results/1/rotated.png')).metadata()
  assert.deepEqual([rotated.width, rotated.height], [200, 400])
  // 两帧 GIF：只生成一帧，原图保留。
  await sharp({ create: { width: 12, height: 24, channels: 3, background: 'red' } }).raw().toBuffer()
    .then(buffer => sharp(buffer, { raw: { width: 12, height: 24, channels: 3, pageHeight: 12 } }).gif().toFile(path.join(uploads, 'results/1/animated.gif')))
  assert.equal((await sharp(await service.get('results/1/animated.gif')).metadata()).pages || 1, 1)
  await fixture('concurrent.png', 1600, 800)
  const first = service.get('results/1/concurrent.png')
  assert.equal(first, service.get('results/1/concurrent.png'), '并发请求应共享同一生成任务')
  const results = await Promise.all(Array.from({ length: 15 }, () => service.get('results/1/concurrent.png')))
  assert.equal(new Set(results).size, 1)
  const stat = await fs.stat(results[0]!)
  await service.get('results/1/concurrent.png')
  assert.equal((await fs.stat(results[0]!)).mtimeMs, stat.mtimeMs, '缓存命中不重新生成')
  await fs.writeFile(path.join(uploads, 'results/1/broken.png'), 'not an image')
  await assert.rejects(async () => service.get('results/1/broken.png'))
  await assert.rejects(async () => service.get('results/1/missing.png'))
  await sharp({ create: { width: 6500, height: 6500, channels: 3, background: 'white' } }).png().toFile(path.join(uploads, 'results/1/oversize.png'))
  await assert.rejects(async () => service.get('results/1/oversize.png'))
  for (const key of ['../secret', 'results/../secret', 'results/.secret', 'results/%2e%2e/secret', 'results/1/a\\b', 'https://example.com/a', '/etc/passwd']) {
    assert.throws(() => service.get(key))
  }
  await fs.symlink(path.join(root, 'secret.png'), path.join(uploads, 'results/1/link.png'))
  await fs.writeFile(path.join(root, 'secret.png'), 'private')
  await assert.rejects(async () => service.get('results/1/link.png'))
  assert.equal(thumbnailUrl('/api/files/results/1/wide.png?t=old'), '/api/thumbnails/v1/results/1/wide.png')
  assert.equal(thumbnailUrl('https://site.test/api/files/templates/1/a.png', 'https://site.test'), '/api/thumbnails/v1/templates/1/a.png')
  const oss = 'https://old-bucket.oss-cn-hangzhou.aliyuncs.com/results/a.png'
  assert.equal(new URL(thumbnailUrl(oss)!).searchParams.get('x-oss-process'), OSS_THUMBNAIL_PROCESS)
  assert.equal(oss, 'https://old-bucket.oss-cn-hangzhou.aliyuncs.com/results/a.png')
  assert.equal(thumbnailUrl(oss), thumbnailUrl(oss))
  for (const source of ['https://example.com/a.png', 'https://evil.aliyuncs.com/a', 'javascript:alert(1)', oss + '?Signature=x', '/api/files/results/%00/a', '/api/files/results/a%2fb%5cc']) assert.equal(thumbnailUrl(source), undefined)

  const app = express()
  app.use('/api/thumbnails', createThumbnailRouter(uploads, cache))
  server = app.listen(0, '127.0.0.1')
  await new Promise<void>(resolve => server!.once('listening', resolve))
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/thumbnails/v1/`
  const response = await fetch(base + 'results/1/wide.png')
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), IMAGE_CACHE_CONTROL)
  assert.match(response.headers.get('content-type') || '', /image\/webp/)
  assert.equal(await new Promise(resolve => { http.get(base + 'results/1/wide.png', { headers: { 'If-None-Match': response.headers.get('etag')! } }, r => { r.resume(); resolve(r.statusCode) }) }), 304)
  for (const [suffix, expected] of [['results/1/missing.png', 404], ['results/1/broken.png', 422], ['results/1/link.png', 400], ['results/1/wide.png?w=1000', 400], ['results/%00/secret', 400], ['results/%FF', 400]] as const) {
    const r = await fetch(base + suffix)
    assert.equal(r.status, expected, suffix)
    assert.equal(r.headers.get('cache-control'), 'no-store')
  }
  const files = await fs.readdir(cache, { recursive: true })
  assert(!files.some(f => f.endsWith('.tmp')), '无残留临时文件')
  console.log('缩略图测试通过：比例/小图/透明/方向/动图首帧/并发复用/原图不变/限制/路径安全/direct+OSS解析/200+304缓存/错误不缓存。')
} finally {
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()))
  await fs.rm(root, { recursive: true, force: true })
}
