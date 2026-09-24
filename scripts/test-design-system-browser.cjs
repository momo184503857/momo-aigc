/* 使用已启动的 Vite；全部 API 在浏览器测试中拦截，绝不访问真实业务。 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.UI_TEST_URL || 'http://localhost:5273'
const output = process.env.UI_TEST_OUTPUT || path.join(os.tmpdir(), 'momo-ui-acceptance')
fs.mkdirSync(output,{recursive:true})
;(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true})
 const errors=[]
 async function createPage(role='admin'){
  const page=await browser.newPage({viewport:{width:1366,height:1000}})
  page.on('pageerror',e=>errors.push(e.message))
  await page.addInitScript(()=>localStorage.setItem('auth_token','ui-test-fixture'))
  await page.route('**/api/**',async route=>{
   const url=route.request().url(); let data={}
   if(url.includes('/generations')||url.includes('/tasks'))data={records:[],total:0}
   else if(url.endsWith('/me'))data={id:1,username:'UI验收',role,points:100}
   else if(url.includes('/models/catalog'))data={groups:[],textModels:[]}
   await route.fulfill({json:{success:true,data}})
  })
  return page
 }
 const page=await createPage()
 for(const entry of ['/admin.html#/ui-components','/#/admin/ui-components']){
  await page.goto(base+entry)
  await page.getByRole('heading',{name:'UI 组件库',exact:true}).waitFor()
  await page.reload()
  await page.getByRole('heading',{name:'UI 组件库',exact:true}).waitFor()
 }
 for(const width of [1366,1920,390]){
  await page.setViewportSize({width,height:1000})
  for(const mode of ['light','dark']){
   if(await page.locator('.ds-theme').last().getAttribute('data-theme')!==mode)await page.getByRole('button',{name:mode==='dark'?'切换深色':'切换浅色',exact:true}).click()
   await page.waitForTimeout(350) // 等待主题颜色过渡结束后截图
   await page.screenshot({path:path.join(output,`${mode}-${width}.png`),fullPage:true})
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`横向溢出 ${width}`)
  }
 }
 await page.setViewportSize({width:1366,height:1000})
 await page.getByRole('button',{name:'基础组件',exact:true}).click()
 await page.getByRole('button',{name:'打开对话框',exact:true}).click()
 const dialog=page.getByRole('dialog')
 await dialog.waitFor()
 assert.equal(await dialog.evaluate(el=>el.closest('[data-theme]')?.getAttribute('data-theme')),'dark')
 await page.keyboard.press('Escape')
 assert(await page.getByRole('button',{name:'打开对话框',exact:true}).evaluate(el=>el===document.activeElement))
 await page.getByRole('combobox',{name:'分辨率'}).click()
 assert.equal(await page.getByRole('option',{name:'高清 2K',exact:true}).evaluate(el=>el.closest('[data-theme]')?.getAttribute('data-theme')),'dark')
 await page.getByRole('option',{name:'高清 2K',exact:true}).click()
 await page.getByRole('button',{name:'显示通知',exact:true}).click()
 await page.getByText('操作已完成（模拟）',{exact:true}).waitFor()
 assert.equal(await page.getByText('操作已完成（模拟）',{exact:true}).count(),1,'Toast 不应串到旧宿主')
 await page.getByRole('button',{name:'打开图片预览',exact:true}).click()
 await page.getByRole('button',{name:'下一张',exact:true}).click()
 await page.getByText('2 / 2',{exact:true}).waitFor()
 await page.keyboard.press('Escape')
 for(const s of ['loading','disabled','error','empty','long','default']){
  await page.getByRole('combobox',{name:'示例状态'}).click()
  const labels={loading:'加载中',disabled:'禁用',error:'错误',empty:'空态',long:'长内容',default:'默认'}
  await page.getByRole('option',{name:labels[s],exact:true}).click()
 }
 await page.getByRole('button',{name:'公共组合',exact:true}).click()
 const fileChooser=page.waitForEvent('filechooser')
 await page.getByRole('button',{name:'选择 / 替换图片',exact:true}).click()
 await (await fileChooser).setFiles({name:'demo.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')})
 await page.getByText('demo.svg（仅本地选择，未上传）',{exact:true}).waitFor()
 await page.getByRole('button',{name:'页面模式',exact:true}).click()
 await page.screenshot({path:path.join(output,'patterns.png'),fullPage:true})
 await page.getByRole('button',{name:'扩展组件',exact:true}).click()
 await page.getByRole('button',{name:'4 星',exact:true}).click()
 await page.getByText('4 / 5',{exact:true}).waitFor()
 await page.getByRole('button',{name:'提交表单',exact:true}).click()
 await page.getByText('请填写商品名称',{exact:true}).waitFor()
 await page.getByLabel('商品名称').fill('商品测试')
 await page.getByRole('button',{name:'提交表单',exact:true}).click()
 await page.getByText('表单校验通过（模拟）',{exact:true}).waitFor()
 await page.getByRole('combobox',{name:'第 1 级分类'}).click()
 await page.getByRole('option',{name:'服装',exact:true}).click()
 await page.getByRole('combobox',{name:'第 2 级分类'}).click()
 await page.getByRole('option',{name:'连衣裙',exact:true}).click()
 await page.getByRole('combobox',{name:'自动完成'}).fill('自然')
 await page.getByRole('option',{name:'自然光',exact:true}).click()
 await page.getByRole('textbox',{name:'聊天内容'}).fill('测试对话')
 await page.getByRole('button',{name:'发送',exact:true}).click()
 await page.getByText('已收到。这是本地模拟回复，没有调用模型。',{exact:true}).waitFor()
 await page.getByRole('button',{name:'移除记录',exact:true}).click()
 await page.getByRole('button',{name:'确认',exact:true}).click()
 await page.getByText('已确认（模拟）',{exact:true}).waitFor()
 await page.getByRole('button',{name:'切换折线 / 柱形',exact:true}).click()
 await page.getByRole('img',{name:'最近生成量',exact:true}).waitFor()
 await page.screenshot({path:path.join(output,'extended.png'),fullPage:true})
 const user=await createPage('user')
 for(const entry of ['/admin.html#/ui-components','/#/admin/ui-components']){
  await user.goto(base+entry); await user.waitForTimeout(500)
  assert.equal(await user.getByRole('heading',{name:'UI 组件库',exact:true}).count(),0,'普通用户不能访问展厅')
 }
 // Theme scope cannot change existing shell variables.
 const admin=await createPage()
 await admin.goto(base+'/admin.html#/ui-components')
 await admin.locator('.ds-theme').last().waitFor()
 const oldPrimary=await admin.locator('body').evaluate(el=>getComputedStyle(el).getPropertyValue('--primary'))
 await admin.getByRole('button',{name:'切换深色',exact:true}).click()
 assert.equal(await admin.locator('body').evaluate(el=>getComputedStyle(el).getPropertyValue('--primary')),oldPrimary)
 await page.emulateMedia({reducedMotion:'reduce'})
 assert.equal(await page.locator('.ds-theme').last().evaluate(el=>getComputedStyle(el.querySelector('button')).animationName),'none')
 assert.deepEqual(errors,[])
 await browser.close()
 console.log(`浏览器通过：双入口/刷新/权限、明暗/三种宽度、浮层/焦点恢复、通知隔离、选择器、图片预览、文件选择器、状态切换、主题隔离。截图：${output}`)
})().catch(e=>{console.error(e);process.exit(1)})
