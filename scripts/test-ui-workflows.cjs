/* 公共上传/项目/后台写操作回归。所有网络操作只落入测试夹具。 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path')
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright')
const base=process.env.UI_TEST_URL||'http://127.0.0.1:5373'
const output=path.resolve('.ui-test-output/workflows')
const XLSX=require('xlsx')
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=','base64')
const model={id:1,code:'fixture',name:'验收模型',kind:'image',enabled:1,pricing:{'1K':1},capabilities:{resolutions:['1K'],aspectRatios:['1:1'],maxReferenceImages:9,maxPromptChars:32000}}
;(async()=>{
 fs.mkdirSync(output,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true})
 try{
 const context=await browser.newContext();await context.addInitScript(()=>localStorage.setItem('auth_token','fixture'))
 let project={id:1,name:'验收项目',description:'',notes:'',thumbnail:null,node_count:0,workflow_data:JSON.stringify({id:'1',name:'验收项目',nodes:[],edges:[],updatedAt:new Date().toISOString()}),created_at:new Date().toISOString(),updated_at:new Date().toISOString()}
 const writes=[],errors=[]
 await context.route('**/api/**',async route=>{
  const req=route.request(),u=new URL(req.url());let data=[]
  if(req.method()!=='GET'){
   const body=req.postData()?req.postDataJSON():null;writes.push({url:u.pathname,method:req.method(),body})
   if(u.pathname==='/api/canvas/projects'){project={...project,...body,workflow_data:body.workflowData};data=project}
   else if(u.pathname==='/api/canvas/projects/1'){project={...project,...body,workflow_data:body.workflowData||project.workflow_data};data=project}
   else if(u.pathname==='/api/admin/users')data={id:2,...body}
   else return route.fulfill({status:402,json:{success:false,error:'模拟拒绝生图'}})
  }else{
   if(u.pathname==='/api/me')data={id:1,username:'验收管理员',role:'admin',points:100}
   else if(u.pathname==='/api/models/catalog')data={models:u.searchParams.get('kind')==='text'?[]:[model],platform:[]}
   else if(u.pathname==='/api/canvas/projects')data=[project]
   else if(u.pathname==='/api/canvas/projects/1')data=project
   else if(u.pathname==='/api/admin/users')data={list:[{id:1,username:'验收用户',status:'active',role:'user',points:100}],total:1}
   else if(u.pathname.includes('/templates'))data={records:[],total:0,tags:[]}
   else if(u.pathname==='/api/tasks'||u.pathname==='/api/generations')data={records:[],total:0}
  }
  return route.fulfill({json:{success:true,data}})
 })
 const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message))
 await page.goto(base+'/#/workspace');await page.getByRole('button',{name:'点击上传',exact:true}).first().waitFor()
 let chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'点击上传',exact:true}).first().click();await(await chooser).setFiles({name:'one.png',mimeType:'image/png',buffer:png})
 await page.getByRole('button',{name:'替换图片1',exact:true}).waitFor()
 chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'替换图片1',exact:true}).click();await(await chooser).setFiles({name:'two.png',mimeType:'image/png',buffer:png})
 await page.getByRole('button',{name:'删除图片1',exact:true}).click();assert.equal(await page.getByRole('button',{name:'替换图片1',exact:true}).count(),0)
 await page.getByRole('textbox',{name:'搜索功能'}).fill('换背景');await page.getByRole('button',{name:'换背景',exact:true}).click();await page.getByRole('heading',{name:'换背景',exact:true}).waitFor()
 await page.screenshot({path:path.join(output,'workspace.png')})
 // A populated spreadsheet exercises the hidden chooser component, parsing, selection and detail dialog.
 await page.goto(base+'/#/toolbox/batch-spreadsheet')
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['文件名','提示词','图片链接'],['fixture-row','自然光商品图','https://example.test/fixture.png']]),'任务')
 chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'上传表格',exact:true}).click()
 await(await chooser).setFiles({name:'fixture.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:XLSX.write(wb,{type:'buffer',bookType:'xlsx'})})
 await page.getByText('fixture-row',{exact:true}).first().waitFor()
 assert.equal(await page.getByRole('checkbox').count()>0,true)
 await page.screenshot({path:path.join(output,'spreadsheet.png')})
 await page.goto(base+'/#/canvas-projects');await page.getByRole('button',{name:'新建项目',exact:true}).click()
 await page.getByLabel('项目名称',{exact:false}).fill('新建验收项目')
 await page.getByRole('dialog').getByRole('button',{name:'创建',exact:true}).click()
 await page.waitForURL('**/#/ai-canvas/1');await page.locator('.vue-flow').waitFor()
 assert.equal(writes.filter(w=>w.url==='/api/canvas/projects').length,1)
 const add=page.getByRole('button',{name:/添加节点/})
 if(await add.count())await add.first().click()
 else {const pane=page.locator('.vue-flow__pane');await pane.click({button:'right',position:{x:150,y:150}})}
 await page.getByText('文本输入',{exact:true}).first().click();await page.locator('.vue-flow__node').waitFor()
 await page.getByRole('button',{name:'放大画布',exact:true}).click();await page.getByRole('button',{name:'缩小画布',exact:true}).click();await page.getByRole('button',{name:'适配画布',exact:true}).click()
 const node=page.locator('.vue-flow__node').first();await page.waitForTimeout(300);const box=await node.boundingBox();await page.mouse.move(box.x+50,box.y+20);await page.mouse.down();await page.mouse.move(box.x+120,box.y+70,{steps:8});await page.mouse.up()
 await page.screenshot({path:path.join(output,'canvas.png')})
 await page.goto(base+'/admin.html#/users');await page.getByRole('button',{name:'创建用户',exact:true}).click()
 await page.getByRole('dialog').getByRole('textbox').first().fill('fixture-created')
 await page.getByRole('dialog').locator('input[type=password]').fill('fixture-password')
 await page.getByRole('dialog').getByRole('button',{name:'创建',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'})
 const create=writes.filter(w=>w.url==='/api/admin/users');assert.equal(create.length,1);assert.equal(create[0].body.username,'fixture-created')
 await page.screenshot({path:path.join(output,'admin-users.png')})
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({result:'passed',writes},null,2))
 console.log('工作流回归通过：图片添加/替换/删除、功能切换、Excel导入校对、项目创建、画布加节点和拖动、后台创建用户；所有写请求为模拟。')
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1})
