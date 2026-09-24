import fs from 'node:fs'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
execFileSync(process.execPath,['scripts/verify-design-system.mjs'],{stdio:'inherit'})
const css=fs.readFileSync('src/components/design-system/theme.css','utf8')
assert(!/:root\s*\{/.test(css),'主题不得改变根节点')
assert(css.includes('prefers-reduced-motion'))
assert(!/(--[\w-]+):\s*var\(\1\)/.test(css), '主题变量不得自引用')
function luminance(hex){const v=hex.replace('#','').match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return v[0]*.2126+v[1]*.7152+v[2]*.0722}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
for(const [text,bg] of [['#201a15','#ff7a00'],['#625b54','#f6f6f5'],['#625b54','#ffffff'],['#c0b7ad','#201e1b'],['#974000','#ffffff'],['#ffb66e','#201e1b']])assert(contrast(text,bg)>=4.5,`${text}/${bg} 对比不足`)
const user=fs.readFileSync('src/router/index.ts','utf8')
assert(/path: '\/admin\/ui-components'[\s\S]{0,250}requiresAdmin: true/.test(user))
const admin=fs.readFileSync('src/admin/router/index.ts','utf8');assert(admin.includes("alias: '/admin/ui-components'"));assert(admin.includes('if (!auth.isAdmin)'))
console.log('主题隔离、核心对比度、登记完整性与路由权限静态测试通过。浏览器交互另行验证。')
