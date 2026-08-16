// 检查工作台 EXPAND_DEFAULT（默认扩充主题）数量与结构
import fs from 'node:fs'
import path from 'node:path'
const htmlPath = path.resolve('C:/Users/Administrator/Downloads/fashion-image-workbench/app/女装电商生图系统V10.0-工作台.html')
const html = fs.readFileSync(htmlPath, 'utf-8')

function extractConst(name) {
  const startMark = 'const ' + name + '='
  const start = html.indexOf(startMark)
  if (start < 0) throw new Error('not found: ' + name)
  const bodyStart = start + startMark.length
  const open = html[bodyStart]
  const close = open === '[' ? ']' : '}'
  let depth = 0, inStr = null, esc = false
  for (let i = bodyStart; i < html.length; i++) {
    const ch = html[i]
    if (esc) { esc = false; continue }
    if (inStr) {
      if (ch === '\\') esc = true
      else if (ch === inStr) inStr = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue }
    if (ch === open) depth++
    else if (ch === close) {
      depth--
      if (depth === 0) return new Function('return (' + html.slice(bodyStart, i + 1) + ')')()
    }
  }
  throw new Error('bracket mismatch: ' + name)
}

const themes = extractConst('THEMES')
const expand = extractConst('EXPAND_DEFAULT')
console.log('内置 THEMES:', themes.length)
console.log('EXPAND_DEFAULT:', expand.length, '套')
console.log('HTML 内合计:', themes.length + expand.length)
const sample = expand[0]
console.log('扩充字段:', Object.keys(sample).join(','))
console.log('样例:', sample.id, sample.name, '| track:', sample.track, '| season:', sample.season, '| points:', (sample.points || []).length)
const byTrack = {}
for (const t of expand) byTrack[t.track] = (byTrack[t.track] || 0) + 1
console.log('按赛道分布:', JSON.stringify(byTrack))
const badPoints = expand.filter((t) => (t.points || []).length !== 5).length
console.log('点位数≠5 的条数:', badPoints)
