/** 精简功能回归：node scripts/verify-feature-removal.mjs [http://localhost:3000] */
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const removed = ['themes', 'works', 'prompt-workshop', 'expert', 'suite-prompt', 'suite-gen']
for (const route of removed) {
  assert.ok(!read('src/router/index.ts').includes(`path: '/${route}'`), `用户路由仍存在: ${route}`)
  assert.ok(!read('src/configs/navigation.ts').includes(`item('/${route}'`), `导航仍存在: ${route}`)
  assert.ok(!existsSync(new URL(`../src/views/${route}`, import.meta.url)), `页面目录仍存在: ${route}`)
}
for (const route of ['works', 'prompt-cases', 'prompt-modules', 'sg-assets']) {
  assert.ok(!read('src/admin/router/index.ts').includes(`path: '/${route}'`), `独立后台路由仍存在: ${route}`)
  assert.ok(!read('src/router/index.ts').includes(`path: '/admin/${route}'`), `内嵌后台路由仍存在: ${route}`)
}
for (const file of ['src/components/TaskPanel.vue', 'src/components/TaskDetailDialog.vue', 'src/views/free-gen/FreeGenResults.vue']) {
  assert.ok(!/PublishWorkDialog|@publish|发布到作品库/.test(read(file)), `发布作品入口残留: ${file}`)
}
assert.ok(!/editInWorkshop|createStructured/.test(read('src/views/prompts/PromptLibraryPage.vue')))
for (const route of ['free-gen', 'workspace', 'photography', 'buyer-show', 'toolbox', 'templates', 'prompts', 'results', 'canvas-projects']) {
  assert.ok(read('src/router/index.ts').includes(`path: '/${route}'`), `误删保留路由: ${route}`)
}
const retiredApis = ['works', 'themes', 'prompt-cards', 'prompt-cases', 'sg/assets/themes', 'sg/suites', 'sg/analyze/garment', 'admin/works', 'admin/prompt-cases', 'admin/prompt-modules', 'admin/sg/themes', 'admin/sg-extra/themes']
if (process.argv[2]) {
  for (const path of retiredApis) {
    for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
      const response = await fetch(`${process.argv[2]}/api/${path}`, { method })
      assert.equal(response.status, 404, `${method} /api/${path} 仍可访问`)
    }
  }
  for (const path of ['templates', 'prompts', 'generations', 'models/catalog']) {
    const response = await fetch(`${process.argv[2]}/api/${path}`)
    assert.ok([200, 401].includes(response.status), `保留接口异常: ${path} ${response.status}`)
  }
}
console.log('PASS: 已移除页面、双后台路由、发布入口及保留功能检查' + (process.argv[2] ? '；48 项已移除 API 方法检查及 4 项保留 API 检查' : ''))
