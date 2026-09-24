/* 正式路由全量主题矩阵：所有 API/媒体均在浏览器内模拟，不访问业务服务器。 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright')
const base=process.env.UI_TEST_URL||'http://127.0.0.1:5273'
const output=process.env.UI_TEST_OUTPUT||path.resolve('.ui-test-output/full')
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="320" height="240" fill="orange"/><text x="30" y="120">UI fixture</text></svg>'
const image='/api/files/ui-fixture.svg'
const model={id:1,code:'fixture',name:'验收模型',kind:'image',enabled:1,pricing:{'1K':1,'2K':2},capabilities:{resolutions:['1K','2K'],aspectRatios:['1:1','3:4'],maxReferenceImages:9,maxPromptChars:32000}}
const task={id:1,task_no:'fixture-1',taskNo:'fixture-1',status:'completed',progress:100,prompt:'商品摄影',model:'fixture',logical_model_id:1,resolution:'1K',aspect_ratio:'1:1',count:1,n:1,feature_id:'free-gen',created_at:'2026-09-24T08:00:00Z',result_image_urls:[image],input_image_urls:[],client_business_id:'free-gen:fixture',points_cost:1,username:'模拟用户'}
const template={id:1,name:'验收模板',public_url:image,thumbnail_url:image,url:image,tags:[],is_starred:false,created_at:'2026-09-24',username:'模拟用户',original_filename:'fixture.svg'}
const project={id:1,name:'验收画布',description:'画布测试',notes:'',thumbnail:null,node_count:0,workflow_data:JSON.stringify({id:'1',name:'验收画布',nodes:[],edges:[],updatedAt:'2026-09-24T08:00:00Z'}),created_at:'2026-09-24',updated_at:'2026-09-24'}
const userRoutes=['free-gen','workspace','assets/templates','assets/results','assets/prompts','canvas-projects','ai-canvas/1','photography','toolbox','buyer-show','settings','my-quota','my-consumption','pricing','toolbox/batch-clothes-swap','toolbox/batch-pose-swap','toolbox/batch-spreadsheet','toolbox/batch-face-swap']
const adminRoutes=['users','dashboard','templates','feature-prompts','photography','ai-config']
function fixture(u,empty){
 const p=u.pathname
 if(p==='/api/me')return {id:1,username:'模拟用户',email:'fixture@example.test',role:'admin',points:100}
 if(p==='/api/models/catalog')return {models:u.searchParams.get('kind')==='text'?[]:[model],platform:[]}
 if(p==='/api/templates')return {records:empty?[]:[template],total:empty?0:1,tags:[]}
 if(p==='/api/admin/templates')return empty?[]:[template]
 if(p==='/api/admin/users')return {list:empty?[]:[{id:1,username:'验收用户',email:'fixture@example.test',status:'active',role:'user',points:100,created_at:'2026-09-24'}],total:empty?0:1}
 if(p==='/api/tasks'||p==='/api/generations'||p==='/api/admin/tasks'||p==='/api/admin/activity')return {records:empty?[]:[task],total:empty?0:1,page:1,pageSize:20}
 if(p==='/api/prompts')return empty?[]:[{id:'1',name:'验收提示词',content:'自然光',tags:['商品'],is_starred:false,segments:{}}]
 if(p==='/api/canvas/projects')return empty?[]:[project]
 if(p==='/api/canvas/projects/1')return project
 if(p==='/api/canvas/assets')return {assets:[],total:0,page:1,totalPages:0}
 if(p==='/api/photography/elements'||p==='/api/admin/photography/elements')return empty?[]:[{id:1,name:'商品',code:'product',type:'product',sort_order:1,is_required:1,max_count:3,enabled:1}]
 if(p==='/api/buyer-show')return {records:empty?[]:[{...template,image_url:image,prompt:'自然光',tag_names:[]}],total:empty?0:1}
 if(p==='/api/admin/ai-config/providers')return empty?[]:[{id:1,name:'模拟服务商',code:'fixture',base_url:'https://example.test',adapter:'openai',status:'active',models:[{id:1,provider_id:1,model_id:'fixture',display_name:'模拟渠道模型',supports_image:1,supports_text:1,supports_vision:1,status:'active',cost_pricing:{'1K':0.5}}],keys:[]}]
 if(p==='/api/admin/ai-config/logical-models')return empty?[]:[{...model,display_name:'验收模型',model_type:'image',sale_pricing:{'1K':1},routes:[]}]
 if(p==='/api/admin/stats/users')return empty?[]:[{user_id:1,username:'模拟用户',role:'user',total_tasks:1,completed_tasks:1,failed_tasks:0,total_cost:1,total_points:1}]
 if(p==='/api/admin/stats/daily'||p==='/api/points/me/daily')return empty?[]:[{date:'2026-09-24',total_tasks:1,completed_tasks:1,failed_tasks:0,total_cost:1,total_points:1}]
 if(p==='/api/buyer-show-batch/items')return empty?[]:[{id:1,batchId:'fixture',productId:'商品001',mainImageUrl:image,prompt:'自然光',taskId:1,status:'completed',progress:100,resultImageUrls:[image],sortOrder:1}]
 if(p==='/api/buyer-show-batch/batches')return empty?[]:[{id:1,batchId:'fixture',name:'模拟批次',status:'archived',itemCount:1,completedCount:1,failedCount:0,createdAt:'2026-09-24'}]
 if(p==='/api/me/quota')return {platform:{credits:100,yuan:100},recentTransactions:empty?[]:[{id:1,amount:-1,balance_after:100,reason:'generation',note:'模拟流水',created_at:'2026-09-24'}]}
 if(p==='/api/points/me')return {points:100,total_recharge:100,total_consumption:1,total_tasks:1,shared:{count:1,cost:1},personal:{count:0,cost:0}}
 if(p.includes('/transactions'))return {records:[],total:0}
 if(p.includes('/stats/summary'))return {total_tasks:1,completed_tasks:1,failed_tasks:0,total_cost:1,total_users:1}
 if(p.endsWith('/storage'))return {mode:'direct',oss:{}}
 if(p.includes('default-vision-model'))return null
 return []
}
;(async()=>{
 fs.mkdirSync(output,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true});const reports=[]
 try{
 const targets=[...userRoutes.map(r=>({url:'/#/'+r,name:r})),...adminRoutes.flatMap(r=>[{url:'/admin.html#/'+r,name:'standalone-'+r},{url:'/#/admin/'+r,name:'embedded-'+r}])]
 for(const target of targets){
  const context=await browser.newContext();await context.addInitScript(()=>localStorage.setItem('auth_token','fixture'))
  const errors=[],writes=[],requests=new Set();let state='data'
  await context.route('**/api/**',async route=>{
   const req=route.request(),u=new URL(req.url());requests.add(u.pathname)
   if(u.pathname.startsWith('/api/files/'))return route.fulfill({contentType:'image/svg+xml',body:svg})
   if(req.method()!=='GET'){writes.push({url:u.pathname,method:req.method(),body:req.postData()});return route.fulfill({status:402,json:{success:false,error:'模拟拒绝写入'}})}
   if(state==='error'&&u.pathname!=='/api/me')return route.fulfill({status:500,json:{success:false,error:'模拟加载失败'}})
   return route.fulfill({json:{success:true,data:fixture(u,state==='empty')}})
  })
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000)
  await page.goto(base+target.url);await page.locator('.application-theme').waitFor();await page.waitForTimeout(300)
  assert.equal(await page.locator('.legacy-surface').count(),0)
  const overflows=[]
  for(const width of [320,768,1024,1440])for(const mode of ['light','dark'])for(const density of ['comfortable','compact']){
   await page.setViewportSize({width,height:1000})
   await page.evaluate(v=>{localStorage.setItem('momo_ui_appearance_v1',JSON.stringify(v));window.dispatchEvent(new StorageEvent('storage',{key:'momo_ui_appearance_v1'}))},{mode,density})
   await page.waitForFunction(v=>{const e=document.querySelector('.application-theme');return e?.dataset.theme===v.mode&&e?.dataset.density===v.density},{mode,density})
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))overflows.push({width,mode,density})
  }
  await page.screenshot({path:path.join(output,target.name.replaceAll('/','-')+'.png'),fullPage:true})
  for(state of ['empty','error']){await page.reload();await page.locator('.application-theme').waitFor();await page.waitForTimeout(180)}
  const report={...target,states:16,errors:[...new Set(errors)],overflows,requests:[...requests],writes};reports.push(report)
  console.log(target.name,JSON.stringify({errors:report.errors,overflows:overflows.length}))
  await context.close()
 }
 fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(reports,null,2))
 assert.equal(reports.filter(r=>r.errors.length||r.overflows.length).length,0,'逐页异常见 report.json')
 console.log(`正式页面主题矩阵通过：${reports.length} 个入口，数据/空/失败夹具；不代表专项业务操作全部完成。`)
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1})
