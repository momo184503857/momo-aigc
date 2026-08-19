#!/usr/bin/env node
/** M2-03 变体：异步渠道（toapis 协议）提交失败 → 任务 failed；用户渠道不扣积分。 */
const BASE = 'http://localhost:3000'
async function api(method, path, token, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, json: await res.json().catch(() => null) }
}
const login = async (u, p) => (await api('POST', '/api/auth/login', null, { account: u, password: p })).json.data.token
const userA = await login('usera_aptest', 'Test12345!')

// 建一个 toapis 协议用户渠道（坏 Key）
let chId
{
  const existing = (await api('GET', '/api/my/channels', userA)).json.data.find((c) => c.name === '坏Key渠道-toapis')
  if (existing) chId = existing.id
  else chId = (await api('POST', '/api/my/channels', userA, { name: '坏Key渠道-toapis', adapter: 'toapis', baseUrl: 'https://toapis.com', key: 'sk-invalid-key-for-test' })).json.data.id
}
// 加 gpt-image-2 模型
const meta = (await api('GET', '/api/my/meta', userA)).json.data
const gptLm = meta.logicalModels.find((l) => l.code === 'gpt-image-2')
const models = (await api('GET', `/api/my/channels/${chId}/models`, userA)).json.data
let modelId = models.find((m) => m.modelId === 'gpt-image-2')?.id
if (!modelId) {
  modelId = (await api('POST', `/api/my/channels/${chId}/models`, userA, { model_id: 'gpt-image-2', display_name: 'GPT-Image-2', logical_model_id: gptLm.id, supports_image_gen: true })).json.data.id
}
console.log(`渠道=${chId} 模型=${modelId}`)

const bal0 = (await api('GET', '/api/points/me', userA)).json.data.balance
const sub = await api('POST', '/api/generations', userA, { channelModelId: modelId, prompt: '失败路径验收', aspectRatio: '1:1', resolution: '1K' })
console.log(`提交：${sub.status} tasks=${JSON.stringify(sub.json?.data?.tasks || sub.json?.error)}`)
if (sub.status === 200) {
  const id = sub.json.data.tasks[0].id
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    const s = (await api('GET', `/api/generations/${id}/status`, userA)).json.data
    if (['completed', 'failed'].includes(s.status)) {
      console.log(`终态：${s.status} err=${s.errorMessage}`)
      break
    }
  }
  const bal1 = (await api('GET', '/api/points/me', userA)).json.data.balance
  console.log(`余额：${bal0} → ${bal1}（用户渠道期望不变）`)
}
