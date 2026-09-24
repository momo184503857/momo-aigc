/* 认证 UI 迁移回归：所有 API 均拦截，不访问业务服务器。 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.UI_TEST_URL || 'http://127.0.0.1:5273'
const output = process.env.UI_TEST_OUTPUT || path.resolve('.ui-test-output/auth')
;(async () => {
  fs.mkdirSync(output, { recursive: true })
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const reports = [], errors = []
  try {
    for (const route of ['/#/login', '/#/register', '/#/forgot-password', '/admin.html#/login']) {
      const context = await browser.newContext()
      const writes = []
      let release
      await context.route('**/api/**', async intercepted => {
        const req = intercepted.request()
        if (req.method() !== 'GET') {
          writes.push({ url: new URL(req.url()).pathname, body: req.postDataJSON() })
          await new Promise(resolve => { release = resolve })
          return intercepted.fulfill({ status: 400, json: { success: false, error: '模拟认证失败' } })
        }
        return intercepted.fulfill({ json: { success: true, data: [] } })
      })
      const page = await context.newPage()
      page.on('pageerror', e => errors.push(e.message))
      await page.goto(base + route)
      await page.locator('.ds-auth-panel').waitFor()
      assert.equal(await page.locator('.legacy-surface').count(), 0)
      for (const width of [320, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 960 })
        for (const mode of ['light', 'dark']) for (const density of ['comfortable', 'compact']) {
          await page.evaluate(value => {
            localStorage.setItem('momo_ui_appearance_v1', JSON.stringify(value))
            window.dispatchEvent(new StorageEvent('storage', { key: 'momo_ui_appearance_v1' }))
          }, { mode, density })
          await page.waitForFunction(({mode,density}) => {
            const theme = document.querySelector('.application-theme')
            return theme.dataset.theme === mode && theme.dataset.density === density
          }, {mode,density})
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${route}/${width}/${mode}/${density}`)
          assert.equal(await page.locator('input').first().evaluate(el => Math.round(el.getBoundingClientRect().height)), density === 'compact' ? 32 : 36)
        }
      }
      await page.setViewportSize({width: 320, height: 960})
      const fields = page.locator('input')
      for (const field of await fields.all()) {
        assert(await field.getAttribute('id'))
        const id = await field.getAttribute('id')
        assert(await page.evaluate(id => [...document.querySelectorAll('label')].some(label => label.htmlFor === id), id))
      }
      const password = page.locator('input[type=password]').first()
      await password.fill('fixture-password')
      await page.getByRole('button', {name:'显示密码',exact:true}).first().click()
      assert.equal(await page.locator('input[type=password]').count(), route.includes('register') || route.includes('forgot') ? 1 : 0)
      await page.getByRole('button', {name:'隐藏密码',exact:true}).click()
      assert.equal(await password.inputValue(), 'fixture-password')
      if (route.includes('register') || route.includes('forgot')) {
        await page.getByLabel(/^邮箱/).fill('fixture@example.test')
        await page.getByLabel(/^验证码/).fill('123456')
        await page.getByLabel(/^确认密码/).fill('fixture-password')
      } else {
        await page.getByLabel('邮箱 / 用户名').fill('fixture')
      }
      await page.screenshot({path:path.join(output, route.includes('admin')?'admin-login.png':route.split('/').pop()+'.png')})
      await fields.last().press('Enter')
      await page.waitForFunction(() => document.querySelector('button[type=submit]').disabled)
      await fields.last().press('Enter')
      assert.equal(writes.length, 1, `${route}: Enter 不得重复提交`)
      assert.equal(await page.getByRole('button',{name:'显示密码',exact:true}).first().isDisabled(), true)
      release()
      await page.getByText('模拟认证失败', {exact:true}).waitFor()
      await page.waitForFunction(() => !document.querySelector('button[type=submit]').disabled)
      if (!route.includes('admin')) {
        if (route.endsWith('/login')) await page.getByRole('tab',{name:'验证码登录'}).click()
        await page.getByLabel(/^邮箱/).fill('fixture@example.test')
        await page.getByRole('button',{name:'获取验证码'}).click()
        await page.getByRole('button',{name:'发送中…'}).waitFor()
        assert.equal(writes.length,2)
        assert.equal(writes[1].body.purpose, route.includes('register')?'register':route.includes('forgot')?'reset_password':'login')
        release()
        await page.getByRole('button',{name:'获取验证码'}).waitFor()
      }
      reports.push({route,states:16,submission:writes[0].url,result:'passed'})
      await context.close()
    }
    assert.deepEqual(errors, [])
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(reports,null,2))
    console.log('认证页面模拟浏览器验收通过：', JSON.stringify(reports))
  } finally { await browser.close() }
})().catch(error => {console.error(error);process.exitCode=1})
