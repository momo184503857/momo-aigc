'use strict'

/**
 * momo 节点共享工具（服务端，CommonJS）。
 *
 * 节点运行时通过 RED.settings.momo（launcher 注入：apiBase/token/userId/projectId）
 * 回环调用主进程 API —— 计费预扣、失败退款、Key 池轮换、结果转存全部继承。
 */

let RED = null

function ctx() {
  const momo = RED && RED.settings && RED.settings.momo
  if (!momo) throw new Error('Node-RED 实例缺少 momo 上下文（应由 launcher 注入）')
  return momo
}

/** 调主进程 API，统一 Bearer 鉴权与 {success,data,error} 解包 */
async function apiFetch(pathname, options = {}) {
  const momo = ctx()
  const res = await fetch(momo.apiBase + pathname, {
    method: options.method || 'GET',
    headers: {
      Authorization: 'Bearer ' + momo.token,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 900000),
  })
  let json = null
  try {
    json = await res.json()
  } catch {
    /* 非 JSON 响应 */
  }
  if (!res.ok || !json || json.success === false) {
    throw new Error((json && json.error) || `主进程 API ${pathname} 请求失败 (${res.status})`)
  }
  return json.data
}

/** 图片 URL → canvas-ai chat 的 images 契约 {mimeType, base64} */
async function downloadImageAsBase64(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60000) })
  if (!res.ok) throw new Error(`下载参考图失败 (${res.status}): ${String(url).slice(0, 60)}`)
  const buf = Buffer.from(await res.arrayBuffer())
  return { mimeType: res.headers.get('content-type') || 'image/png', base64: buf.toString('base64') }
}

// 模型目录缓存（60s；catalog 是全站模型/定价唯一真源）
// 注意两种 kind 响应结构不同（model-routing 重构后）：
//  - image：{ models: [...] } 逻辑模型平铺（id=logical id，定价=统一售价，渠道不可见）
//  - text ：{ platform: [ {providerId, providerName, models:[...]} ] } 渠道分组（id=渠道模型 id）
const catalogCache = { at: 0, image: null, text: null }

async function fetchCatalog(kind) {
  if (catalogCache[kind] && Date.now() - catalogCache.at < 60000) {
    return catalogCache[kind]
  }
  const data = await apiFetch('/api/models/catalog?kind=' + kind)
  const models = []
  if (kind === 'image') {
    for (const m of data.models || []) {
      const caps = m.capabilities || {}
      models.push({
        id: m.id,
        modelId: m.modelId,
        displayName: m.displayName || m.modelId,
        providerName: '',
        resolutions: caps.resolutions || [],
        aspectRatiosByResolution: caps.aspectRatiosByResolution || null,
        aspectRatios: Array.from(
          new Set(
            caps.aspectRatios ||
              (caps.aspectRatiosByResolution ? Object.values(caps.aspectRatiosByResolution).flat() : [])
          )
        ),
        maxReferenceImages: caps.maxReferenceImages || 14,
        pricing: m.pricing || null,
      })
    }
  } else {
    for (const g of data.platform || []) {
      for (const m of g.models || []) {
        const caps = m.capabilities || {}
        models.push({
          id: m.id,
          modelId: m.modelId,
          displayName: m.displayName || m.modelId,
          providerName: g.providerName,
          resolutions: caps.resolutions || [],
          aspectRatiosByResolution: caps.aspectRatiosByResolution || null,
          aspectRatios: Array.from(
            new Set(
              caps.aspectRatios ||
                (caps.aspectRatiosByResolution ? Object.values(caps.aspectRatiosByResolution).flat() : [])
            )
          ),
          maxReferenceImages: caps.maxReferenceImages || 0,
          pricing: m.pricing || null,
        })
      }
    }
  }
  catalogCache[kind] = models
  catalogCache.at = Date.now()
  return models
}

/**
 * 编辑器上下文端点：GET <adminRoot>/momo-ctx
 * 供节点配置面板（浏览器端）获取 instanceToken 与模型目录。
 * token 回给编辑器无提权风险：调用方必须已持有同一 token（adminAuth 保障），
 * 且该 token 本就是当前用户自己的应用 JWT。
 */
function register(REDInstance) {
  RED = REDInstance
  RED.httpAdmin.get('/momo-ctx', RED.auth.needsPermission('flows.read'), async (req, res) => {
    try {
      const [imageModels, textModels] = await Promise.all([
        fetchCatalog('image'),
        fetchCatalog('text'),
      ])
      res.json({ token: ctx().token, imageModels, textModels })
    } catch (err) {
      res.status(500).json({ error: String((err && err.message) || err) })
    }
  })
}

module.exports = { register, ctx, apiFetch, downloadImageAsBase64, fetchCatalog }
