import assert from 'node:assert/strict'
import fs from 'node:fs'
const read = p => fs.readFileSync(p, 'utf8')
const panel = read('src/components/design-system/composites/DsParameterPanel.vue')
assert.doesNotMatch(panel, /@\/(services|stores)\//, '公共参数区不得耦合业务接口和目录')
assert(!panel.includes('<slot />'), '标准四项控件不再交给页面自行拼装')
for (const label of ['模型', '画面比例', '生成数量', '分辨率']) assert(panel.includes(`aria-label="${label}"`))
assert(panel.indexOf("emit('update:modelId', id)") < panel.indexOf("emit('model-change', id)"), '先更新模型，再执行能力联动')
assert(panel.indexOf("emit('update:resolution', value)") < panel.indexOf("emit('resolution-change', value)"), '先更新分辨率，再执行比例联动')
assert.match(panel, /taskCount !== undefined/, '批量任务数量必须支持零并保持只读')
const pages = ['src/components/FeatureForm.vue', 'src/components/PhotographyForm.vue', 'src/components/GenerationForm.vue', 'src/views/buyer-show/MakeBuyerShowPanel.vue', ...['BatchClothesSwapPage', 'BatchPoseSwapPage', 'BatchFaceSwapPage', 'BatchSpreadsheetPage'].map(n => `src/views/tools/${n}.vue`)]
for (const page of pages) {
  const source = read(page)
  assert.match(source, /:models="generationModels"/)
  assert.match(source, /@model-change="handleModelChange"/)
  assert.match(source, /@resolution-change="handleResolutionChange"/)
  assert.doesNotMatch(source, /class="ds-parameter"/, `${page} 不得重复拼四项控件`)
}
console.log('标准参数区契约通过：8 个页面数据化接入、纯 UI 边界、事件顺序、批量只读数量。')
