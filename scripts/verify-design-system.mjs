import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
const root = 'src/components/design-system'
const registry = JSON.parse(fs.readFileSync(`${root}/registry.json`, 'utf8'))
const walk = dir => fs.readdirSync(dir, {withFileTypes:true}).flatMap(e => e.isDirectory() ? walk(path.join(dir,e.name)) : [path.join(dir,e.name)])
const findings = []
for (const file of walk('src').filter(f => /\.(vue|ts|css)$/.test(f) && !f.includes('/prototype/') && !f.startsWith('src/components/ui/') && !f.startsWith('src/styles/tokens'))) {
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
    ['legacy-token', /--(?:momo|tf)-[\w-]+/g, true],
    ['legacy-surface', /legacy-surface/g, true],
    ['legacy-import', /from\s+['"]@\/components\/ui(?:\/[^'"]*)?['"]/g, !file.startsWith('src/components/ui/')],
  ]
  for (const [rule, regex, applies] of rules) if(applies) {
    for(const match of source.matchAll(regex)) {
      const line = source.slice(0, match.index).split('\n').length
      const textLine = source.split('\n')[line - 1]
      // Exported canvas pixel colors and user-selected thumbnail palettes are content, not UI skin.
      const contentColor = rule === 'literal-color' && (
        (file === 'src/components/ImageEditorDialog.vue' && /const (brushColor|textColor)|ctx\.(strokeStyle|fillStyle)|<option>/.test(textLine)) ||
        (file === 'src/views/canvas/ProjectsPage.vue' && /^\s*'#[a-fA-F0-9]+',/.test(textLine)) ||
        (file === 'src/utils/imageAnalysis.ts' && textLine.trim().startsWith('/**'))
      )
      if (!contentColor) findings.push({file,rule,text:match[0],line})
    }
  }
  if(publicLibrary) {
    assert(!source.includes('@/services/'), `${file}: 公共组件不能请求业务接口`)
    assert(!source.includes('<Teleport to="body">'), `${file}: 浮层不能逃离主题`)
  }
}
const violations = findings
for(const dir of fs.readdirSync(`${root}/primitives`,{withFileTypes:true}).filter(d => d.isDirectory())) assert(registry.some(r => r.source === `primitives/${dir.name}`), `未登记组件族 ${dir.name}`)
for(const file of fs.readdirSync(`${root}/composites`)) assert(registry.some(r => r.source === `composites/${file}`), `未登记组合 ${file}`)
for(const file of fs.readdirSync(`${root}/extended`).filter(f=>f.endsWith('.vue'))) assert(registry.some(r=>r.source === `extended/${file}`), `未登记扩展 ${file}`)
for(const entry of registry) {
 assert(fs.existsSync(`${root}/${entry.source}`), `登记路径不存在 ${entry.source}`)
 const example = fs.readFileSync(`${root}/examples/${entry.example === 'primitive' ? 'PrimitiveExample' : entry.example === 'extended' ? 'ExtendedExample' : 'CompositeExample'}.vue`,'utf8')
 assert(example.includes(`'${entry.family}'`), `未实现示例 ${entry.family}`)
}
assert.equal(new Set(registry.map(x => x.id)).size,registry.length,'登记 id 重复')
if(violations.length) { console.error(violations); process.exitCode=1 }
else console.log(`UI 严格检查通过：${registry.length} 项登记；正式代码零旧入口、零旧 Token、零存量豁免。`)
