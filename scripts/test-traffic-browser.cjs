/* 隔离浏览器流量回归：全部 API 拦截，不访问生产或付费渠道。 */
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

const base = process.env.UI_TEST_URL || 'http://127.0.0.1:5273'
const model = { id: 1, modelId: 'fixture', displayName: '验收模型', logicalCode: 'fixture', kind: 'image', pricing: { '1K': 0.1 }, capabilities: { resolutions: ['1K'], aspectRatios: ['1:1'], maxReferenceImages: 9, maxPromptChars: 32000 } }
const task = { id: 1, task_no: 'gen-traffic-1', taskNo: 'gen-traffic-1', status: 'in_progress', progress: 45, prompt: '流量验收', model: 'fixture', logical_model_id: 1, resolution: '1K', aspect_ratio: '1:1', aspectRatio: '1:1', feature_id: 'free-gen', created_at: '2026-10-01T08:00:00Z', result_image_urls: [], input_image_urls: [], error_message: '' }
const completedTask = { ...task, id: 2, task_no: 'gen-traffic-2', taskNo: 'gen-traffic-2', status: 'completed', progress: 100, result_image_urls: ['/api/files/traffic.svg'] }

;(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    await context.addInitScript(() => localStorage.setItem('auth_token', 'traffic-fixture'))
    const reads = []
    await context.route('**/api/**', async route => {
      const request = route.request()
      const url = new URL(request.url())
      reads.push(url.pathname)
      let data = {}
      if (url.pathname === '/api/files/traffic.svg') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" />' })
      if (url.pathname === '/api/me') data = { id: 1, username: '流量验收用户', role: 'user', points: 100 }
      else if (url.pathname === '/api/models/catalog') data = { models: [model], platform: [] }
      else if (url.pathname === '/api/generations') data = { records: [completedTask, task], total: 2, page: 1, pageSize: 20 }
      else if (url.pathname === '/api/generations/summary') data = { queued: 0, generating: 1, importing: 0, active: 1 }
      else if (url.pathname === '/api/generations/1/status') data = { status: 'in_progress', progress: 45, resultUrls: [] }
      else if (url.pathname === '/api/tasks/2') data = { ...completedTask, supplementaryImages: [{ name: '参考', url: 'https://example.test/a.png' }], prompt_segments: { scene: 'studio' } }
      else if (url.pathname.includes('templates')) data = { records: [], total: 0, tags: [] }
      else if (url.pathname.includes('prompts') || url.pathname.includes('/tags')) data = []
      await route.fulfill({ json: { success: true, data } })
    })

    const page = await context.newPage()
    page.setDefaultTimeout(12_000)
    await page.goto(base + '/#/free-gen')
    await page.getByRole('textbox', { name: '画面描述', exact: true }).waitFor()
    await page.waitForTimeout(500)
    const listBaseline = reads.filter(path => path === '/api/generations').length
    await page.waitForTimeout(9_000)
    assert.equal(reads.filter(path => path === '/api/generations').length, listBaseline, '9 秒内不得重载任务历史列表')
    assert(reads.filter(path => path === '/api/generations/1/status').length >= 1, '可见页面应轮询进行中任务')

    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await page.waitForTimeout(300)
    const beforeHidden = reads.filter(path => path === '/api/generations/1/status').length
    await page.waitForTimeout(5_000)
    assert.equal(reads.filter(path => path === '/api/generations/1/status').length, beforeHidden, '隐藏页面必须停止状态轮询')
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await page.waitForTimeout(1_500)
    assert(reads.filter(path => path === '/api/generations/1/status').length > beforeHidden, '恢复可见后必须立即同步状态')

    const openPanel = page.getByRole('button', { name: /打开任务面板/ })
    if (await openPanel.count()) await openPanel.click()
    const detailButton = page.getByRole('button', { name: '详情', exact: true }).first()
    await detailButton.waitFor()
    await detailButton.evaluate(element => element.click())
    await page.getByRole('dialog').getByText('任务详情', { exact: true }).waitFor()
    await page.keyboard.press('Escape')
    await detailButton.evaluate(element => element.click())
    await page.getByRole('dialog').getByText('任务详情', { exact: true }).waitFor()
    assert.equal(reads.filter(path => path === '/api/tasks/2').length, 1, '任务详情必须命中缓存，不得重复下载')

    await context.close()
    console.log('浏览器流量回归通过：历史不轮询、隐藏暂停、恢复同步、详情缓存。')
  } finally {
    await browser.close()
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
