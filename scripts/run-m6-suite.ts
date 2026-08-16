/**
 * M6 效果评审一键执行脚本（验收文档 M6-01~06）。
 *
 * 用法：
 *   npx tsx scripts/run-m6-suite.ts --key <ToAPIs共享Key>   # 首次：写入共享 Key 并跑双模型各 1 套
 *   npx tsx scripts/run-m6-suite.ts                          # Key 已配置时直接跑
 *   npx tsx scripts/run-m6-suite.ts --model gpt-image-2      # 只跑单模型
 *
 * 流程：写 Key（可选）→ 无参考图时先生成 1 张服装平铺参考图 →
 *      组装 2 模型 × 5 点位套系 Prompt（含 P0 分模型基线话术）→ 提交并轮询 →
 *      结果转存 OSS → 输出评审材料清单 docs/records/sg-m6-materials-<日期>.md
 * 之后由视觉评审（analyze_image）消费该材料清单出具 sg-effect-review 报告。
 */
import Database from 'better-sqlite3'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFileSync } from 'node:fs'
import { buildGptImage2Request } from '../src/adapter/buildGptImage2Request'
import { buildGeminiRequest } from '../src/adapter/buildGeminiRequest'
import { assemble, type PromptEntry, type AssembleContext } from '../src/utils/promptEngine'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.resolve(__dirname, '../server/data/momo.db')
const BASE = 'http://localhost:3000/api'
const MODELS = ['gpt-image-2', 'gemini-3.1-flash-image-preview'] as const
const RESOLUTION = '2K'
const SIZE = '3:4'

// ── 参数 ──
const args = process.argv.slice(2)
const keyIdx = args.indexOf('--key')
const apiKeyArg = keyIdx >= 0 ? args[keyIdx + 1] : undefined
const modelIdx = args.indexOf('--model')
const onlyModel = modelIdx >= 0 ? args[modelIdx + 1] : undefined

const db = new Database(DB_PATH)

async function api(token: string, method: string, url: string, body?: unknown) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json: any = await res.json().catch(() => null)
  if (!res.ok || json?.success === false) {
    throw new Error(`${method} ${url} → ${res.status}: ${json?.error || res.statusText}`)
  }
  return json.data
}

async function login(): Promise<string> {
  const data = await api('', 'POST', '/auth/login', { account: 'admin', password: 'admin123' })
  return data.token
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)) }

// ── DB → 引擎条目（与 sgApi.toPromptEntry 同构） ──
function loadDbEntries(): PromptEntry[] {
  const rows = db.prepare('SELECT * FROM sg_lock_templates WHERE owner_user_id IS NULL AND status = ?').all('active') as any[]
  return rows.map((t) => ({
    key: t.key, name: t.name, grp: t.grp, order: t.order_no, content: t.content,
    condKind: t.cond_kind === 'none' ? undefined : t.cond_kind,
    models: (() => { try { const m = JSON.parse(t.models || '[]'); return m.length ? m : undefined } catch { return undefined } })(),
    scope: (() => { try { const s = JSON.parse(t.scope || '[]'); return s.length ? s : undefined } catch { return undefined } })(),
    origin: 'global' as const,
  }))
}

function loadSeedContext(): AssembleContext {
  const track = db.prepare(`SELECT * FROM sg_tracks WHERE owner_user_id IS NULL AND key='A'`).get() as any
  const theme = db.prepare(`SELECT * FROM sg_themes WHERE owner_user_id IS NULL AND name='中式园林庭院'`).get() as any
  const persona = db.prepare(`SELECT * FROM sg_personas WHERE owner_user_id IS NULL ORDER BY id LIMIT 1`).get() as any
  return {
    persona: { name: persona.name, dna: persona.dna, hair_default: persona.hair_default, fingerprint: [] },
    track: { key: track.key, name: track.name, mood: track.mood, hair: track.hair, light: track.light, acc: track.acc, hand: track.hand },
    theme: { name: theme.name, track_key: theme.track_key, season: JSON.parse(theme.season || '[]'), path: theme.path, points: JSON.parse(theme.points) },
    garment: {
      mainUrl: 'ref', detailUrls: [],
      detail4: { shape: '宽松直筒连衣长裙，及踝长度，七分袖', fabric: '香云纱质感提花面料，哑光垂坠', structure: '立领、侧边暗排盘扣、微收腰', element: '手工盘扣与袖口同色滚边' },
      printText: '裙身暗纹提花，纹样走向与参考图一致', accessories: '无额外配饰',
    },
    model: 'gpt-image-2', feature: 'suite',
  }
}

// ── ToAPIs 任务提交与轮询（走本地代理，与前端共享模式同路径） ──
function buildBody(model: string, prompt: string, refUrls: string[]) {
  const params = { prompt, size: SIZE, resolution: RESOLUTION, imageUrls: refUrls }
  return model === 'gpt-image-2' ? buildGptImage2Request(params) : buildGeminiRequest({ model, ...params })
}

async function createAndPoll(token: string, model: string, prompt: string, refUrls: string[], label: string) {
  const created = await api(token, 'POST', '/toapis/create-task', buildBody(model, prompt, refUrls))
  const toapisId = created.id
  const deadline = Date.now() + 10 * 60 * 1000
  while (Date.now() < deadline) {
    await sleep(5000)
    const st = await api(token, 'GET', `/toapis/task-status/${toapisId}`)
    if (st.status === 'completed') return { toapisId, urls: st.resultUrls || [] }
    if (st.status === 'failed') throw new Error(`${label} 失败: ${st.errorMessage || '未知'}`)
    console.log(`    [${label}] ${st.status} ${st.progress ?? 0}%`)
  }
  throw new Error(`${label} 轮询超时`)
}

async function main() {
  // 1. 写入共享 Key（可选）
  if (apiKeyArg) {
    db.prepare(`INSERT INTO system_config (key, value) VALUES ('toapis_api_key', ?)
                ON CONFLICT(key) DO UPDATE SET value = ?`).run(apiKeyArg, apiKeyArg)
    console.log('[1/6] 共享 Key 已写入 system_config')
  }

  const token = await login()
  const health = await api(token, 'GET', '/toapis/health')
  console.log('[2/6] Key 状态:', JSON.stringify(health))
  if (!health.sharedKeyConfigured && !health.personalKeyActive) {
    console.error('❌ 未配置可用 Key。用法: npx tsx scripts/run-m6-suite.ts --key <ToAPIs Key>')
    db.close()
    process.exitCode = 2
    return
  }

  // 2. 参考图：已有则复用，否则先生成一张服装平铺图
  let refUrl = ''
  const refRow = db.prepare(`SELECT value FROM system_config WHERE key='sg_m6_ref_url'`).get() as any
  if (refRow?.value) {
    refUrl = refRow.value
    console.log('[3/6] 复用已有参考图:', refUrl.slice(0, 80))
  } else {
    console.log('[3/6] 生成服装参考图（新中式香云纱连衣裙平铺，gpt-image-2）…')
    const refPrompt = '服装平铺图（flat lay），一件新中式宽松直筒香云纱连衣长裙正面朝上平铺：立领、暗排盘扣、微收腰、七分袖、裙身暗纹提花，橄榄绿低饱和色调，白色背景，商业电商服装详情图，无模特无人。'
    const r = await createAndPoll(token, 'gpt-image-2', refPrompt, [], '参考图')
    const srcUrl = r.urls[0]
    if (!srcUrl) throw new Error('参考图生成未返回 URL')
    // 转存为 ToAPIs 上传 URL（reference_images 需要 toapis 域图片）
    const blob = await (await fetch(srcUrl)).blob()
    const form = new FormData()
    form.append('file', new File([blob], 'm6-garment-ref.png', { type: blob.type || 'image/png' }))
    const up = await fetch(`${BASE}/toapis/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
    const upJson: any = await up.json().catch(() => null)
    if (!up.ok || !upJson?.data?.url) throw new Error(`参考图上传失败: ${up.status} ${upJson?.error || ''}`)
    refUrl = upJson.data.url
    db.prepare(`INSERT INTO system_config (key, value) VALUES ('sg_m6_ref_url', ?)
                ON CONFLICT(key) DO UPDATE SET value = ?`).run(refUrl, refUrl)
    console.log('    参考图就绪:', refUrl.slice(0, 80))
  }

  // 3. 组装套系 Prompt（含 P0 分模型话术）
  const ctxBase = loadSeedContext()
  const dbEntries = loadDbEntries()
  console.log(`[4/6] 锁定模板 ${dbEntries.length} 条已加载（含分模型基线）`)

  const models = onlyModel ? [onlyModel] : [...MODELS]
  const materials: Array<{ model: string; point: number; toapisId: string; urls: string[]; ossUrl?: string }> = []
  const suiteIds: Record<string, number> = {}

  for (const model of models) {
    console.log(`[5/6] ══ ${model} 套系（5 点位）══`)
    const ctx = { ...ctxBase, model }
    const result = assemble(dbEntries, [], ctx, 5)
    const suite = await api(token, 'POST', '/sg/suites', {
      name: `M6评审 · ${ctxBase.theme?.name} · ${model}`,
      feature_source: 'suite',
      theme_snapshot: ctx.theme, track_snapshot: ctx.track, persona_snapshot: ctx.persona,
      garment: { refUrls: [refUrl] },
      prompt_common: result.commonText, prompt_points: result.pointTexts,
      model, resolution: RESOLUTION, aspect_ratio: SIZE, n_total: 5,
    })
    suiteIds[model] = suite.id
    for (let i = 0; i < 5; i++) {
      const label = `${model} P${i + 1}`
      try {
        const r = await createAndPoll(token, model, result.fullTexts[i], [refUrl], label)
        // 落库任务记录（带套系/点位，进历史与积分统计）
        await api(token, 'POST', '/tasks', {
          toapis_task_id: r.toapisId, model, prompt: result.fullTexts[i],
          size: SIZE, resolution: RESOLUTION, feature_id: 'suite-gen',
          suite_id: suite.id, point_index: i,
          prompt_segments: { sgType: 'suite-m6', theme: ctx.theme?.name, model },
        })
        // 转存 OSS（评审材料用稳定 URL）
        let ossUrl: string | undefined
        try { ossUrl = (await api(token, 'POST', '/oss/import-result', { taskId: r.toapisId, sourceUrl: r.urls[0] })).publicUrl } catch { /* 转存失败用原始 URL */ }
        materials.push({ model, point: i + 1, toapisId: r.toapisId, urls: r.urls, ossUrl })
        console.log(`    ✅ ${label} 完成 → ${ossUrl || r.urls[0]}`.slice(0, 140))
      } catch (e: any) {
        console.error(`    ❌ ${label}: ${e.message}`)
        materials.push({ model, point: i + 1, toapisId: '', urls: [] })
      }
    }
  }

  // 4. 输出评审材料清单
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const done = materials.filter((m) => m.urls.length > 0)
  const lines = [
    `# M6 效果评审材料（${today}）`,
    '',
    `- 参考图（服装）：${refUrl}`,
    `- 主题：中式园林庭院（5 点位）｜人设：${ctxBase.persona?.name}｜分辨率：${RESOLUTION} ${SIZE}`,
    `- 套系 ID：${JSON.stringify(suiteIds)}`,
    `- 完成率：${done.length}/${materials.length}`,
    '',
    '## 结果图清单（评审用）',
    '',
    '| 模型 | 点位 | 结果图 URL |',
    '|---|---|---|',
    ...materials.map((m) => `| ${m.model} | P${m.point} | ${m.ossUrl || m.urls[0] || '（失败）'} |`),
    '',
    '## 评审项对照（M6）',
    '- M6-01 服装还原度：逐张对照参考图评 版型/颜色/印花（≥80% 达标）',
    '- M6-02 模特一致性：每套 5 张互评同一人（≥4/5 达标）',
    '- M6-03 场景连续性：每套判定同场地不同机位',
    '- M6-04 翻车率：六指/畸形/多人/乱码（合计 ≤3/10）',
    '- M6-06 分模型对比：两模型各 5 张横向对比，沉淀话术调优结论',
  ]
  const outPath = path.resolve(__dirname, `../docs/records/sg-m6-materials-${today}.md`)
  writeFileSync(outPath, lines.join('\n'), 'utf-8')
  console.log(`[6/6] 评审材料已输出: ${outPath}（完成 ${done.length}/${materials.length}）`)
  db.close()
  process.exitCode = done.length >= Math.max(1, materials.length - 2) ? 0 : 1
}

main().catch((e) => { console.error('M6 执行异常:', e); db.close(); process.exit(1) })
