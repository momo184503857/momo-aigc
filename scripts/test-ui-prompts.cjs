/* 提示词库：只使用有数据的模拟 API，写请求不发送至服务器。 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.UI_TEST_URL || 'http://127.0.0.1:5273'
const output = process.env.UI_TEST_OUTPUT || path.resolve('.ui-test-output/prompts')
;(async()=>{
 fs.mkdirSync(output,{recursive:true})
 const browser=await chromium.launch({channel:'chrome',headless:true})
 try {
  const context=await browser.newContext()
  await context.addInitScript(()=>localStorage.setItem('auth_token','ui-fixture'))
  let items=Array.from({length:12},(_,i)=>({id:String(i+1),user_id:1,name:`示例提示词${i+1}`,content:'自然光商品摄影',tags:[i%2?'人像':'商品'],is_starred:false,segments:{},sort_order:i,created_at:'2026-09-24',updated_at:'2026-09-24'}))
  const writes=[],errors=[]
  await context.route('**/api/**',async route=>{
   const req=route.request(),u=new URL(req.url()),method=req.method()
   if(method!=='GET') {
    const body=req.postData()?req.postDataJSON():null;writes.push({url:u.pathname,method,body})
    if(u.pathname==='/api/prompts')items.unshift({...items[0],...body,id:'new'})
    else if(u.pathname.endsWith('/favorite'))items.find(i=>i.id===u.pathname.split('/')[3]).is_starred=body.is_starred
    else if(method==='DELETE')items=items.filter(i=>i.id!==u.pathname.split('/')[3])
    else if(method==='PATCH')Object.assign(items.find(i=>i.id===u.pathname.split('/')[3]),body)
    return route.fulfill({json:{success:true,data:{}}})
   }
   let data=[]
   if(u.pathname==='/api/me')data={id:1,username:'模拟用户',role:'user',points:100}
   else if(u.pathname==='/api/prompts')data=items
   else if(u.pathname==='/api/tasks'||u.pathname==='/api/generations')data={records:[],total:0}
   else if(u.pathname==='/api/models/catalog')data={models:[],platform:[]}
   return route.fulfill({json:{success:true,data}})
  })
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
  await page.goto(base+'/#/assets/prompts');await page.getByRole('heading',{name:'示例提示词1',exact:true}).waitFor()
  assert.equal(await page.locator('.legacy-surface').count(),0)
  for(const width of [320,768,1024,1440])for(const mode of ['light','dark'])for(const density of ['comfortable','compact']){
   await page.setViewportSize({width,height:960})
   await page.evaluate(v=>{localStorage.setItem('momo_ui_appearance_v1',JSON.stringify(v));window.dispatchEvent(new StorageEvent('storage',{key:'momo_ui_appearance_v1'}))},{mode,density})
   await page.waitForFunction(v=>{const e=document.querySelector('.application-theme');return e.dataset.theme===v.mode&&e.dataset.density===v.density},{mode,density})
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width}/${mode}/${density}`)
  }
  await page.getByRole('textbox',{name:'搜索提示词'}).fill('不存在')
  await page.getByText('暂无提示词',{exact:true}).waitFor()
  await page.getByRole('textbox',{name:'搜索提示词'}).fill('示例提示词12')
  await page.getByRole('heading',{name:'示例提示词12',exact:true}).waitFor()
  await page.getByRole('button',{name:'收藏示例提示词12',exact:true}).click()
  await page.getByRole('button',{name:'取消收藏示例提示词12',exact:true}).waitFor()
  await page.getByRole('button',{name:'编辑',exact:true}).click()
  await page.getByRole('dialog').waitFor()
  assert.equal(await page.getByRole('dialog').evaluate(e=>e.closest('[data-theme]').dataset.theme),'dark')
  await page.getByLabel(/^名称/).fill('')
  await page.getByRole('button',{name:'保存',exact:true}).click()
  await page.getByRole('alert').filter({hasText:'请输入名称'}).waitFor()
  assert.equal(writes.length,1)
  await page.getByLabel(/^名称/).fill('已编辑提示词')
  await page.getByRole('button',{name:'保存',exact:true}).click()
  await page.getByRole('dialog').waitFor({state:'detached'})
  assert.equal(writes[1].method,'PATCH');assert.equal(writes[1].body.name,'已编辑提示词')
  await page.getByRole('textbox',{name:'搜索提示词'}).fill('已编辑提示词')
  await page.getByRole('heading',{name:'已编辑提示词',exact:true}).waitFor()
  await page.getByRole('button',{name:'删除',exact:true}).click()
  await page.getByRole('alertdialog').getByRole('button',{name:'取消',exact:true}).click()
  assert.equal(writes.length,2)
  await page.getByRole('button',{name:'删除',exact:true}).click()
  await page.getByRole('alertdialog').getByRole('button',{name:'删除',exact:true}).click()
  await page.getByText('暂无提示词',{exact:true}).waitFor();assert.equal(writes[2].method,'DELETE')
  await page.getByRole('button',{name:'新建提示词',exact:true}).click()
  await page.getByLabel(/^名称/).fill('新建示例')
  await page.getByLabel(/^内容/).fill('模拟新建内容')
  await page.getByLabel('标签',{exact:true}).fill('测试标签')
  await page.getByLabel('标签',{exact:true}).press('Enter')
  assert.equal(writes.length,3,'标签 Enter 不得提交表单')
  await page.getByRole('button',{name:'保存',exact:true}).click()
  await page.getByRole('dialog').waitFor({state:'detached'})
  assert.deepEqual(writes[3].body,{name:'新建示例',content:'模拟新建内容',tags:['测试标签']})
  await page.getByRole('textbox',{name:'搜索提示词'}).fill('')
  await page.getByRole('button',{name:'新建提示词',exact:true}).click();await page.keyboard.press('Escape')
  await page.getByRole('dialog').waitFor({state:'detached'})
  assert(await page.getByRole('button',{name:'新建提示词',exact:true}).evaluate(e=>e===document.activeElement))
  assert.equal(await page.locator('[data-sonner-toaster]').evaluate(el=>getComputedStyle(el).position),'fixed')
  await page.screenshot({path:path.join(output,'prompts.png'),fullPage:true})
  assert.deepEqual(errors,[])
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({states:16,writes,result:'passed'},null,2))
  console.log('提示词库模拟浏览器通过：16种布局、搜索、收藏、编辑校验、创建、删除确认/取消、主题浮层、Escape与焦点恢复。')
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1})
