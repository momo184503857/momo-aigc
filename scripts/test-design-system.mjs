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

// 任务面板不能盖住 Portal 中的公共弹窗或其遮罩。
const taskPanel = fs.readFileSync('src/components/TaskPanel.vue', 'utf8')
const panelZ = Number(taskPanel.match(/\.task-panel\s*\{[^}]*z-index:\s*(\d+)/)?.[1])
const backdropZ = Number(taskPanel.match(/\.task-panel-backdrop\s*\{[^}]*z-index:\s*(\d+)/)?.[1])
const dialogOverlay = fs.readFileSync('src/components/design-system/primitives/dialog/DialogOverlay.vue', 'utf8')
const dialogContent = fs.readFileSync('src/components/design-system/primitives/dialog/DialogContent.vue', 'utf8')
const overlayZ = Number(dialogOverlay.match(/\bz-(\d+)\b/)?.[1])
const dialogZ = Number(dialogContent.match(/\bz-(\d+)\b/)?.[1])
assert(backdropZ < panelZ && panelZ < overlayZ && panelZ < dialogZ, '任务面板及其遮罩必须低于公共弹窗层')
console.log('任务面板与公共弹窗层级回归检查通过。')

const linkedPanel = fs.readFileSync('src/components/design-system/composites/DsLinkedPanel.vue', 'utf8')
assert(linkedPanel.includes('aria-hidden="true"'), '关联面板尖角必须是装饰元素')
assert(linkedPanel.includes('anchorOffset?: number') && linkedPanel.includes('name="actions"'), '关联面板须提供通用锚点与动作插槽')
assert(css.includes('left: clamp(var(--ds-space-6), var(--ds-linked-anchor)'), '关联面板尖角必须限制在容器宽度内')
assert(!linkedPanel.includes('HoverCard') && !linkedPanel.includes('Teleport'), '关联面板必须常驻在文档流内')
console.log('关联气泡面板契约与边界检查通过。')
