import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
const root = 'src/components/design-system'
const registry = JSON.parse(fs.readFileSync(`${root}/registry.json`, 'utf8'))
const walk = dir => fs.readdirSync(dir, {withFileTypes:true}).flatMap(e => e.isDirectory() ? walk(path.join(dir,e.name)) : [path.join(dir,e.name)])
const findings = []
for (const file of walk('src').filter(f => /\.(vue|ts|css)$/.test(f) && !f.includes('/prototype/'))) {
  const source = fs.readFileSync(file,'utf8')
  const publicLibrary = file.startsWith(root)
  const theme = file.includes('/styles/') || file.endsWith('/theme.css')
  const lowLevel = file.startsWith(`${root}/primitives/`) || file.startsWith('src/components/ui/')
  const asset = file.endsWith('/examples/sample.ts')
  // 展厅文案可显示十六进制说明，不视为 CSS 值。
  const textOnlyColor = file.endsWith('/AdminUiComponents.vue')
  const rules = [
    ['visual-override', /(?:class|:class)=["'][^"']*(?:bg-\[|text-\[|rounded-\[|shadow-\[|#[\da-fA-F]{3,8})[^"']*["']/g, !lowLevel && !publicLibrary],
    ['literal-color', /#[\da-fA-F]{3,8}\b|\brgba?\(\s*\d/g, !theme && !asset && !textOnlyColor],
    ['deep-override', /:deep\([^)]*\)|::v-deep/g, !lowLevel && !theme],
    ['native-control', /<(?:button|input|select|textarea)\b/g, !lowLevel && !file.endsWith('/DsUpload.vue')],
    ['legacy-import', /from\s+['"]@\/components\/ui(?:\/[^'"]*)?['"]/g, !file.startsWith('src/components/ui/')],
  ]
  for (const [rule, regex, applies] of rules) if(applies) {
    for(const match of source.matchAll(regex)) findings.push({file,rule,text:match[0]})
  }
  if(publicLibrary) {
    assert(!source.includes('@/services/'), `${file}: 公共组件不能请求业务接口`)
    assert(!source.includes('<Teleport to="body">'), `${file}: 浮层不能逃离主题`)
  }
}
const baselinePath = 'scripts/design-system-baseline.json'
// 显式刷新只允许维护存量清单；CI/默认检查绝不自动接受新增问题。
if(process.argv.includes('--write-baseline')) {
  const legacy = findings.filter(f => !f.file.startsWith(root) && !f.file.endsWith('/AdminUiComponents.vue'))
  fs.writeFileSync(baselinePath, JSON.stringify(legacy,null,2)+'\n')
}
const baseline = JSON.parse(fs.readFileSync(baselinePath,'utf8'))
const remaining = [...baseline]
const violations = findings.filter(f => {
 const i = remaining.findIndex(b => JSON.stringify(b) === JSON.stringify(f))
 if(i < 0) return true
 remaining.splice(i,1); return false
})
for(const dir of fs.readdirSync(`${root}/primitives`,{withFileTypes:true}).filter(d => d.isDirectory())) assert(registry.some(r => r.source === `primitives/${dir.name}`), `未登记组件族 ${dir.name}`)
for(const file of fs.readdirSync(`${root}/composites`)) assert(registry.some(r => r.source === `composites/${file}`), `未登记组合 ${file}`)
for(const file of fs.readdirSync(`${root}/extended`).filter(f=>f.endsWith('.vue'))) assert(registry.some(r=>r.source === `extended/${file}`), `未登记扩展 ${file}`)
for(const entry of registry) {
 assert(fs.existsSync(`${root}/${entry.source}`), `登记路径不存在 ${entry.source}`)
 const example = fs.readFileSync(`${root}/examples/${entry.example === 'primitive' ? 'PrimitiveExample' : entry.example === 'extended' ? 'ExtendedExample' : 'CompositeExample'}.vue`,'utf8')
 assert(example.includes(`'${entry.family}'`), `未实现示例 ${entry.family}`)
}
assert.equal(new Set(registry.map(x => x.id)).size,registry.length,'登记 id 重复')
if (process.argv.includes('--prune-baseline') && !violations.length) {
 const actual = [...findings]
 const kept = baseline.filter(entry => { const i = actual.findIndex(f => JSON.stringify(f) === JSON.stringify(entry)); if(i < 0) return false; actual.splice(i,1); return true })
 fs.writeFileSync(baselinePath, JSON.stringify(kept,null,2)+'\n')
 console.log(`仅移除已解决记录：${baseline.length - kept.length} 项`)
}
if(violations.length) { console.error(violations); process.exitCode=1 }
else console.log(`UI 检查通过：${registry.length} 项登记；存量基线 ${baseline.length} 项，待清理 ${findings.length} 项。`)
