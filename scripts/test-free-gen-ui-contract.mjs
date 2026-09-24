import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { parse, compileScript } from '@vue/compiler-sfc'
const form = fs.readFileSync('src/components/GenerationForm.vue', 'utf8')
const picker = fs.readFileSync('src/components/design-system/composites/DsTextPicker.vue', 'utf8')
// Exercise the actual form handler with fake timers; never submit to a provider.
const compiled = compileScript(parse(form).descriptor, { id: 'free-gen-contract' }).content
const handler = compiled.slice(compiled.indexOf('function handleGenerate()'), compiled.indexOf('// Expose'))
const functionSource = handler.slice(0, handler.indexOf('\n}\n') + 3)
let callback, timeout, submitted = 0
const locked = { value: false }
const context = { canGenerate: {value:true}, generateLocked:locked, referenceImages:{value:[]}, selectedModelId:{value:1}, prompt:{value:' test '}, resolution:{value:'1K'}, aspectRatio:{value:'1:1'}, count:{value:1}, promptSegments:{value:{}}, negativePrompt:{value:''}, emit:()=>submitted++, setTimeout:(fn,ms)=>{callback=fn;timeout=ms;return 1}, generateUnlockTimer:undefined }
vm.createContext(context)
vm.runInContext(functionSource+'\nhandleGenerate(); handleGenerate();',context)
assert.equal(submitted,1)
assert.equal(locked.value,true)
assert.equal(timeout,2000)
callback()
vm.runInContext('handleGenerate()',context)
assert.equal(submitted,2)
assert(form.includes(':disabled="!canGenerate || generateLocked"'))
assert(form.includes('onUnmounted(() => clearTimeout(generateUnlockTimer))'))
assert(form.includes('<DsTextPicker'))
assert(!form.includes('hover:border-primary'))
assert(!picker.includes('@/services/'))
assert(picker.includes("@click.stop=\"emit('favorite', item.id)\""))
assert(picker.includes('@click="emit(\'select\', item.id)"'))
assert(picker.includes('<Switch v-model="onlyFavorites" />'))
console.log('自由生图：实际提交处理器两秒锁/重复调用拦截/解锁通过；公共选择器事件与原交互契约通过（无付费请求）。')
