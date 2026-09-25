import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { webcrypto } from 'node:crypto'

// 模拟普通 HTTP 浏览器：有 getRandomValues，没有 randomUUID；加载真实浏览器版 uuid。
Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) } })
const { default: uuidv4 } = await import('../node_modules/uuid/dist/esm-browser/v4.js')
assert.equal(typeof crypto.randomUUID, 'undefined')
const source = fs.readFileSync('src/composables/useTaskManager.ts', 'utf8')
const statement = source.match(/const submissionId = [^\n]+/)[0]
assert.throws(() => vm.runInNewContext('crypto.randomUUID()', { crypto }), /not a function/)
const ids = new Set()
for (let i = 0; i < 1000; i++) {
  const id = vm.runInNewContext(`${statement}; submissionId`, { params: {featureId:'free-gen'}, uuidv4 })
  assert.match(id, /^free-gen:[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/)
  ids.add(id)
}
assert.equal(ids.size, 1000)
assert.equal(vm.runInNewContext(`${statement}; submissionId`, {params:{featureId:'change-clothes'},uuidv4}), undefined)
assert(source.indexOf(statement) < source.indexOf('for (let i = 0; i < cnt; i++)'), '同一次提交的多张图必须共用批次 ID')
console.log('普通 HTTP 自由生图批次 ID 回归通过：旧调用复现异常，新调用1000次无重复，快速生图路径不变；未请求上游。')
