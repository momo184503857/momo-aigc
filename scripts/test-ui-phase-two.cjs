/* 第二阶段样板回归：全量拦截 API；不访问真实业务，不调用付费服务。 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.UI_TEST_URL || 'http://localhost:5273'
const output = process.env.UI_TEST_OUTPUT || path.resolve('.ui-test-output/phase-two')
const svg = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="linen"/><circle cx="150" cy="150" r="70" fill="coral"/></svg>').toString('base64')
const models = [{ id:1, modelId:'fixture', displayName:'验收模型', logicalCode:'fixture', kind:'image', pricing:{'1K':0.1,'2K':0.2}, capabilities:{resolutions:['1K','2K'],aspectRatios:['1:1','3:4'],maxReferenceImages:9,maxPromptChars:32000} }]
const statuses = ['completed','failed','in_progress','importing']
const records = statuses.map((status,i)=>({id:i+1,task_no:`gen-fixture-${i}`,taskNo:`gen-fixture-${i}`,status,progress:status==='in_progress'?45:0,prompt:`验收描述 ${i}`,model:'fixture',logical_model_id:1,resolution:'1K',aspect_ratio:'1:1',aspectRatio:'1:1',count:i===0?5:1,n:i===0?5:1,feature_id:'free-gen',created_at:`2026-09-24T08:0${i}:00Z`,result_image_urls:i===0?Array.from({length:5},()=>'/api/files/ui-fixture.svg'):[],input_image_urls:[],client_business_id:`free-gen:fixture-${i}`,error_message:status==='failed'?'模拟生成失败':null}))
records.push({...records[0],id:5,task_no:'gen-reimport',taskNo:'gen-reimport',result_image_urls:['/api/files/ui-fixture.svg'],error_message:'模拟转存失败',client_business_id:'free-gen:reimport',created_at:'2026-09-24T07:00:00Z'})
let debugPage
;(async()=>{
 fs.mkdirSync(output,{recursive:true})
 const browser=await chromium.launch({channel:'chrome',headless:true})
 const errors=[], writes=[]
 async function createPage(role='admin', appearance=null) {
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true})
  await context.addInitScript(value=>{localStorage.setItem('auth_token','ui-fixture'); if(value)localStorage.setItem('momo_ui_appearance_v1',JSON.stringify(value))},appearance)
  await context.route('**/api/**',async route=>{
   const req=route.request(),u=new URL(req.url()); let data={};
   if(u.pathname==='/api/files/ui-fixture.svg')return route.fulfill({contentType:'image/svg+xml',body:Buffer.from(svg.split(',')[1],'base64')})
   if(req.method()!=='GET') {writes.push({url:u.pathname,body:req.postData()?req.postDataJSON():null}); if(u.pathname.endsWith('/reimport'))return route.fulfill({json:{success:true,data:{resultUrls:['/api/files/ui-fixture.svg']}}}); return route.fulfill({status:402,json:{success:false,error:'积分不足',message:'积分不足'}})}
   if(u.pathname==='/api/me')data={id:1,username:'验收用户',role,points:100}
   else if(u.pathname==='/api/models/catalog')data={models:u.searchParams.get('kind')==='text'?[]:models,platform:[]}
   else if(u.pathname==='/api/generations'||u.pathname==='/api/tasks')data={records,total:records.length,page:1,pageSize:20}
   else if(u.pathname.includes('/status')){const task=records.find(r=>r.id===Number(u.pathname.split('/')[3]))||records[2];data={status:task.status,progress:task.progress,resultUrls:task.result_image_urls,errorMessage:task.error_message}}
   else if(u.pathname.includes('prompts')||u.pathname.includes('/tags'))data=[]
   else if(u.pathname.includes('templates'))data={records:[],items:[],total:0,tags:[]}
   await route.fulfill({json:{success:true,data}})
  })
  const page=await context.newPage();page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR:',e.message)});return page
 }
 const page=await createPage(); debugPage=page; page.setDefaultTimeout(10000)
 await page.goto(base+'/#/free-gen')
 await page.getByRole('textbox',{name:'画面描述',exact:true}).waitFor()
 await page.getByRole('combobox',{name:'模型',exact:true}).waitFor()
 assert.equal(await page.getByRole('navigation',{name:'已打开页面'}).count(),0)
 assert.equal(await page.locator('main > header').count(),0)
 assert.equal(await page.getByRole('navigation',{name:'主导航'}).getByRole('button').count(),3)
 await page.getByRole('button',{name:'设置',exact:true}).click()
 await page.getByRole('menuitem',{name:'个人设置',exact:true}).waitFor()
 assert.equal(await page.getByRole('menuitem',{name:'管理后台',exact:true}).count(),0)
 await page.keyboard.press('Escape')
 assert.equal(await page.getByRole('button',{name:'切换导航',exact:true}).count(),0)
 assert.equal(await page.getByRole('button',{name:'外观设置',exact:true}).count(),0)
 await page.getByRole('button',{name:'资产',exact:true}).click()
 for(const title of ['生图记录','模板图库','提示词库']) {
  await page.getByRole('navigation',{name:'资产分类'}).getByRole('button',{name:title,exact:true}).click()
  assert.equal(await page.getByRole('button',{name:'资产',exact:true}).getAttribute('aria-current'),'page')
 }
 await page.getByRole('button',{name:'创作工作台',exact:true}).click()
 await page.getByRole('textbox',{name:'画面描述',exact:true}).fill('样板验收，切换页面后保留')
 await page.getByRole('navigation',{name:'创作模式'}).getByRole('button',{name:'快速生图',exact:true}).click()
 await page.getByRole('heading',{name:'换衣服',exact:true}).waitFor()
 assert.equal(await page.locator('.legacy-surface').count(),0)
 await page.getByRole('navigation',{name:'创作模式'}).getByRole('button',{name:'自由生图',exact:true}).click()
 assert.equal(await page.getByRole('textbox',{name:'画面描述',exact:true}).inputValue(),'样板验收，切换页面后保留')
 for(const [name,option] of [['画面比例','3:4'],['生成数量','2张'],['分辨率','2K']]){
  await page.getByRole('combobox',{name,exact:true}).click();await page.getByRole('option',{name:option,exact:true}).click()
 }
 const chooser=page.waitForEvent('filechooser')
 await page.getByRole('button',{name:'添加参考图片',exact:true}).click()
 await (await chooser).setFiles({name:'sample.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=','base64')})
 await page.getByRole('button',{name:'预览sample.png',exact:true}).waitFor()
 await page.getByRole('button',{name:'删除sample.png',exact:true}).click()
 assert.equal(await page.getByRole('button',{name:'预览sample.png',exact:true}).count(),0)
 // 用户端已移除外观入口；用测试夹具验证历史外观偏好仍兼容。
 async function setAppearance(mode,density) {
  await page.evaluate(value=>{
   localStorage.setItem('momo_ui_appearance_v1',JSON.stringify(value))
   window.dispatchEvent(new StorageEvent('storage',{key:'momo_ui_appearance_v1'}))
  },{mode,density})
  await page.waitForFunction(({mode,density})=>{const el=document.querySelector('.application-theme');return el?.dataset.theme===mode && el?.dataset.density===density},{mode,density})
 }
 await setAppearance('dark','compact')
 await page.reload();await page.getByRole('textbox',{name:'画面描述',exact:true}).waitFor()
 assert.equal(await page.locator('.application-theme').getAttribute('data-theme'),'dark')
 assert.equal(await page.locator('.application-theme').getAttribute('data-density'),'compact')
 await page.getByRole('button',{name:'从提示词库选择',exact:true}).click()
 await page.getByRole('dialog').waitFor()
 assert.equal(await page.getByRole('dialog').evaluate(el=>el.closest('[data-theme]').getAttribute('data-theme')),'dark')
 await page.keyboard.press('Escape')
 await page.getByRole('dialog').waitFor({state:'detached'})
 assert(await page.getByRole('button',{name:'从提示词库选择',exact:true}).evaluate(el=>el===document.activeElement))
 await page.getByRole('navigation',{name:'创作模式'}).getByRole('button',{name:'快速生图',exact:true}).click()
 await page.getByRole('heading',{name:'换衣服',exact:true}).waitFor()
 assert.equal(await page.locator('.legacy-surface').count(),0)
 assert.equal(await page.locator('.application-theme').getAttribute('data-theme'),'dark')
 await page.getByRole('navigation',{name:'创作模式'}).getByRole('button',{name:'自由生图',exact:true}).click()
 for(const width of [320,768,1024,1440]){
  await page.setViewportSize({width,height:1000})
  for(const mode of ['light','dark']){
   for(const density of ['comfortable','compact']){
    await setAppearance(mode,density)
    if(width <= 800) assert(await page.evaluate(()=>document.querySelector('.ds-composer').getBoundingClientRect().bottom <= document.querySelector('.ds-results-panel').getBoundingClientRect().top),'窄屏表单和结果区不能重叠')
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width}/${mode}/${density} 页面溢出`)
    await page.screenshot({path:path.join(output,`sample-${width}-${mode}-${density}.png`)})
   }
  }
 }
 await page.setViewportSize({width:1440,height:1000})
 const strip=page.locator('.ds-result-strip').filter({has:page.locator('.ds-result-image')}).first()
 assert.equal(await strip.locator('.ds-result-tile').count(),5)
 assert(await strip.evaluate(el=>el.scrollWidth>el.clientWidth),'第五张图片横向滚动')
 const downloaded=page.waitForEvent('download')
 await strip.locator('.ds-result-tile').first().hover()
 await strip.locator('.ds-result-tile').first().getByRole('button',{name:'下载',exact:true}).click()
 await (await downloaded).saveAs(path.join(output,'download-fixture.png'))
 await page.locator('.ds-result-image').first().click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape')
 await page.locator('.ds-result-actions').first().getByRole('button',{name:'详情',exact:true}).focus()
 await page.locator('.ds-result-actions').first().getByRole('button',{name:'详情',exact:true}).click()
 await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape')
 await page.getByRole('button',{name:'打开任务面板',exact:true}).click()
 await page.getByRole('button',{name:'收起任务面板',exact:true}).waitFor()
 await page.getByRole('button',{name:'收起任务面板',exact:true}).click()
 await page.setViewportSize({width:320,height:1000})
 await page.getByRole('button',{name:'打开任务面板',exact:true}).click()
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'窄屏任务面板不撑出页面')
 await page.screenshot({path:path.join(output,'task-panel-320.png')})
 await page.locator('.task-panel button[title=收起]').click()
 await page.setViewportSize({width:1440,height:1000})
 for(const entry of ['/admin.html#/ui-components','/#/admin/ui-components']){
  await page.goto(base+entry);await page.getByRole('heading',{name:'UI 组件库',exact:true}).waitFor()
  assert.equal(await page.locator('.application-theme').count(),1)
  await page.getByRole('button',{name:'基础组件',exact:true}).click()
  await page.getByRole('textbox',{name:'搜索组件',exact:true}).fill('input')
  const galleryInput=page.locator('.ds-sample [data-slot=input]').first()
  const lightControl=await galleryInput.evaluate(el=>getComputedStyle(el).backgroundColor)
  assert.equal(lightControl,'rgba(0, 0, 0, 0)','浅色展厅不继承应用深色控件样式')
  await page.getByRole('button',{name:'切换深色',exact:true}).click()
  assert.equal(await page.locator('.application-theme').getAttribute('data-theme'),'dark')
  await page.reload();await page.getByRole('heading',{name:'UI 组件库',exact:true}).waitFor()
  assert.equal(await page.locator('.ds-theme').last().getAttribute('data-theme'),'light')
 }
 const user=await createPage('user')
 for(const entry of ['/admin.html#/ui-components','/#/admin/ui-components']){
  await user.goto(base+entry);await user.waitForTimeout(400)
  assert.equal(await user.getByRole('heading',{name:'UI 组件库',exact:true}).count(),0)
 }
 const invalid=await createPage('admin',{mode:'invalid',density:'invalid'})
 await invalid.goto(base+'/#/free-gen');await invalid.getByRole('textbox',{name:'画面描述',exact:true}).waitFor()
 assert.equal(await invalid.locator('.application-theme').getAttribute('data-theme'),'light')
 assert.equal(await invalid.locator('.application-theme').getAttribute('data-density'),'comfortable')
 assert.equal(writes.length,0,'浏览页面不应提交业务写入')
 const rejected=await createPage()
 await rejected.goto(base+'/#/free-gen')
 await rejected.getByRole('textbox',{name:'画面描述',exact:true}).fill('模拟提交验证')
 await rejected.getByRole('button',{name:'生成图片 · 0.10 积分',exact:true}).click()
 await rejected.getByText('积分不足',{exact:true}).waitFor()
 assert.equal(await rejected.getByText('积分不足',{exact:true}).count(),1,'一个业务通知宿主')
 assert.equal(writes.length,1)
 assert.equal(writes[0].body.logicalModelId,1)
 assert.equal(writes[0].body.prompt,'模拟提交验证')
 assert.equal(writes[0].body.n,1)
 const retry=await createPage()
 await retry.goto(base+'/#/free-gen')
 const failed=retry.getByRole('article',{name:'图片 gen-fixture-1-1',exact:true})
 await failed.hover();await failed.getByRole('button',{name:'详情',exact:true}).click()
 await retry.getByRole('button',{name:'重试生成',exact:true}).click()
 await retry.getByText('积分不足',{exact:true}).waitFor()
 assert.equal(writes.length,2)
 assert.equal(writes[1].body.prompt,'验收描述 1')
 const reimport=await createPage()
 await reimport.goto(base+'/#/free-gen')
 const imported=reimport.getByRole('article',{name:'图片 gen-reimport-1',exact:true})
 await imported.hover();await imported.getByRole('button',{name:'详情',exact:true}).click()
 await reimport.getByRole('button',{name:'重新导入',exact:true}).click()
 await reimport.getByText('图片已刷新',{exact:true}).waitFor()
 assert.equal(writes[2].url,'/api/generations/5/reimport')

 assert.deepEqual(errors,[])
 await browser.close()
 console.log('样板浏览器验收通过：双入口/权限、主题持久化/非法值、16 种布局、真实文件选择器、下拉/焦点恢复、无页签的页面草稿缓存、批次图片、任务面板；只读路径无业务写入，模拟提交/重试 402 单次通知、重新导入成功、图片下载均通过。')
})().catch(async e=>{console.error(e); if(debugPage){await debugPage.screenshot({path:path.join(output,'failure.png')}).catch(()=>{}); fs.writeFileSync(path.join(output,'failure.html'),await debugPage.content());} process.exit(1)})
