/* 真实界面 + 全量 API 拦截；不使用业务账号，不写业务数据。 */
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.UI_TEST_URL || 'http://localhost:5273'

;(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  let serverTheme = 'orange'
  const writes = []

  async function createPage(width = 1440) {
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    await context.addInitScript(() => localStorage.setItem('auth_token', 'appearance-browser-fixture'))
    await context.route('**/api/**', async route => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.pathname === '/api/me' && request.method() === 'GET') {
        return route.fulfill({ json: { success: true, data: { id: 1, username: '主题验收用户', role: 'admin', points: 100, theme_color: serverTheme } } })
      }
      if (url.pathname === '/api/me/appearance' && request.method() === 'PUT') {
        const body = request.postDataJSON()
        writes.push(body)
        if (body.theme_color === 'rose') return route.fulfill({ status: 500, json: { success: false, error: '模拟保存失败' } })
        serverTheme = body.theme_color
        return route.fulfill({ json: { success: true, data: { theme_color: serverTheme } } })
      }
      if (url.pathname === '/api/auth/logout') return route.fulfill({ json: { success: true } })
      return route.fulfill({ json: { success: true, data: {} } })
    })
    return { context, page: await context.newPage() }
  }

  try {
    const first = await createPage()
    const page = first.page
    await page.goto(`${base}/#/settings`)
    await page.getByRole('button', { name: '设置', exact: true }).waitFor()
    assert.equal(await page.locator('.application-theme').getAttribute('data-accent'), 'orange')

    await page.getByRole('button', { name: '设置', exact: true }).focus()
    await page.keyboard.press('Enter')
    await page.getByRole('menuitem', { name: '主题色', exact: true }).click()
    await page.getByRole('menuitemradio', { name: '蓝色', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('.application-theme')?.dataset.accent === 'blue')
    assert.equal(await page.locator('.application-theme').evaluate(el => getComputedStyle(el).getPropertyValue('--primary').trim()), '#2563eb')
    assert.deepEqual(writes.at(-1), { theme_color: 'blue' })

    await page.goto(`${base}/#/admin/toolbox`)
    const adminAppearance = page.getByRole('button', { name: '外观设置', exact: true }).first()
    await adminAppearance.click()
    await page.getByRole('combobox', { name: '主题色', exact: true }).click()
    await page.getByRole('option', { name: '紫色', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('.application-theme')?.dataset.accent === 'violet')
    assert.deepEqual(writes.at(-1), { theme_color: 'violet' })

    await page.getByRole('combobox', { name: '主题色', exact: true }).click()
    await page.getByRole('option', { name: '玫红', exact: true }).click()
    await page.getByText('服务异常，请稍后重试', { exact: true }).waitFor()
    assert.equal(await page.locator('.application-theme').getAttribute('data-accent'), 'violet', '保存失败应回滚')
    await page.getByRole('combobox', { name: '颜色模式', exact: true }).click()
    await page.getByRole('option', { name: '深色', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('.application-theme')?.dataset.theme === 'dark')
    assert.equal(await page.locator('.application-theme').evaluate(el => getComputedStyle(el).getPropertyValue('--accent').trim()), '#2e1065')

    await page.reload()
    await page.getByRole('button', { name: '外观设置', exact: true }).first().waitFor()
    assert.equal(await page.locator('.application-theme').getAttribute('data-accent'), 'violet')

    const second = await createPage(320)
    await second.page.goto(`${base}/#/settings`)
    await second.page.getByRole('button', { name: '设置', exact: true }).waitFor()
    assert.equal(await second.page.locator('.application-theme').getAttribute('data-accent'), 'violet', '新设备应从账号恢复主题')
    assert.equal(await second.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, '320px 不应水平溢出')

    await second.page.getByRole('button', { name: '设置', exact: true }).click()
    await second.page.getByRole('menuitem', { name: '退出登录', exact: true }).click()
    await second.page.getByRole('button', { name: '登录', exact: true }).waitFor()
    assert.equal(await second.page.locator('.application-theme').getAttribute('data-accent'), 'orange', '退出后应恢复默认橙色')

    await first.context.close()
    await second.context.close()
    console.log('主题色浏览器验收通过：用户端键盘入口、后台共享、刷新/跨设备恢复、失败回滚、320px 布局、退出重置。')
  } finally {
    await browser.close()
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
