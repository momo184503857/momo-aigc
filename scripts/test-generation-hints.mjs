import assert from 'node:assert/strict'
import fs from 'node:fs'
const read = p => fs.readFileSync(p, 'utf8')
const panel = read('src/components/design-system/composites/DsParameterPanel.vue')
assert.match(panel, /reasonDisplay: 'tooltip'/, '生成参数区默认使用悬浮原因，页面无需单独开启')
const action = read('src/components/design-system/composites/DsActionBar.vue')
assert.match(action, /props\.disabled \|\| props\.busy/, '仅在不可提交时显示提示')
assert.match(action, /onDeactivated\(\(\) => \{ tooltipOpen\.value = false \}\)/, '缓存页面离开时关闭浮层')
for (const file of ['BatchClothesSwapPage', 'BatchPoseSwapPage', 'BatchFaceSwapPage']) {
  const source = read(`src/views/tools/${file}.vue`)
  assert.match(source, /:reason="isSubmitting[^\"]*blockingHint"/)
  assert.doesNotMatch(source, /<span[^>]*blockingHint/, `${file} 不得重复渲染常驻禁用原因`)
}
console.log('生成提示契约通过：公共默认悬浮、禁用门控、页面切换关闭、批量页面无重复常驻原因。')
