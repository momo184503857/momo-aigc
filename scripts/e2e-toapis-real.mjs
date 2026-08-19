#!/usr/bin/env node
/**
 * M2 真实链路验收：toapis 异步渠道（真实 Key）完整生图。
 * POST /api/generations → 轮询 → 服务端转存 OSS → completed（M2-01/02）。
 */
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

const admin = await login('admin', 'admin123')

// 找 toapis 渠道下的 gpt-image-2 渠道模型 id
const cat = (await api('GET', '/api/models/catalog?kind=image', admin)).json.data
const gpt = cat.platform.flatMap((g) => g.models).find((m) => m.modelId === 'gpt-image-2' && m.pricing)
if (!gpt) { console.error('目录中未找到 toapis gpt-image-2'); process.exit(1) }
console.log(`目标渠道模型：id=${gpt.id} ${gpt.displayName} pricing=${JSON.stringify(gpt.pricing)}`)

// admin 余额
const bal0 = (await api('GET', '/api/points/me', admin)).json.data.balance
console.log(`admin 余额：${bal0}`)

// 提交（2K · 1:1 · 无参考图 · n=1 → 预扣 4 积分）
const sub = await api('POST', '/api/generations', admin, {
  channelModelId: gpt.id,
  prompt: '一只可爱的橘猫，摄影棚白底，商业产品摄影，高清细节',
  aspectRatio: '1:1',
  resolution: '2K',
  n: 1,
})
if (sub.status !== 200) { console.error('提交失败：', sub.status, sub.json); process.exit(1) }
const task = sub.json.data.tasks[0]
console.log(`提交成功：id=${task.id} taskNo=${task.taskNo} status=${task.status}`)

const bal1 = (await api('GET', '/api/points/me', admin)).json.data.balance
console.log(`预扣后余额：${bal1}（期望扣 ${gpt.pricing['2K']}）`)

// 轮询到终态（最长 3 分钟）
const started = Date.now()
let final = null
while (Date.now() - started < 180_000) {
  await new Promise((r) => setTimeout(r, 5000))
  const s = (await api('GET', `/api/generations/${task.id}/status`, admin)).json.data
  process.stdout.write(`  [${Math.round((Date.now() - started) / 1000)}s] status=${s.status} progress=${s.progress}\n`)
  if (['completed', 'failed'].includes(s.status)) { final = s; break }
}

if (!final) { console.error('超时未到终态'); process.exit(1) }
console.log(`\n终态：${final.status}`)
if (final.status === 'completed') {
  console.log(`结果图：${JSON.stringify(final.resultUrls, null, 1)}`)
  const isOss = (final.resultUrls || []).every((u) => u.includes('aliyuncs.com'))
  console.log(`M2-01（OSS 永久 URL）：${isOss ? 'PASS' : 'FAIL（非 OSS URL）'}`)
} else {
  console.error(`失败：${final.errorMessage} (${final.errorCode})`)
  // M2-03：失败自动退款
}
const bal2 = (await api('GET', '/api/points/me', admin)).json.data.balance
console.log(`终态后余额：${bal2}（completed 不退款，期望 = ${bal1}）`)
