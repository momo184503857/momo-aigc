'use strict'

const momoApi = require('./momo-api.js')

/**
 * 文字 AI 节点：调主进程 /api/canvas-ai/chat（渠道适配器 + Key 轮换，不扣积分）。
 * 输入：msg.payload = 上游文本（可空）；msg.image / msg.images = 参考图（vision）。
 * 输出：msg.payload = 模型返回文本。
 */

function collectImageUrls(msg) {
  const urls = []
  const push = (u) => {
    if (typeof u === 'string' && (u.startsWith('http') || u.startsWith('/')) && !urls.includes(u)) {
      urls.push(u)
    }
  }
  if (msg.image && msg.image.url) push(msg.image.url)
  if (Array.isArray(msg.images)) {
    for (const it of msg.images) {
      if (it && it.url) push(it.url)
    }
  }
  if (msg.payload && typeof msg.payload === 'object' && Array.isArray(msg.payload.images)) {
    for (const u of msg.payload.images) push(u)
  }
  return urls
}

module.exports = function (RED) {
  momoApi.register(RED)

  function MomoTextAi(config) {
    RED.nodes.createNode(this, config)
    const node = this

    node.on('input', async (msg, send, done) => {
      try {
        const taskPrompt = (config.taskPrompt || '').trim()
        const detailPrompt = (config.detailPrompt || '').trim()
        const upstream =
          typeof msg.payload === 'string' ? msg.payload : ''

        const imageUrls = collectImageUrls(msg)
        if (!taskPrompt && !detailPrompt && !upstream.trim() && imageUrls.length === 0) {
          throw new Error('缺少有效提示内容：请填写任务提示词或接入上游文本/图片')
        }

        const prompt = [
          '[Task]', taskPrompt, '',
          '[Details]', detailPrompt, '',
          '[Upstream text]', upstream, '',
        ].join('\n')

        // 参考图转 base64（canvas-ai chat 的 images 契约，支持多模态 vision）
        const images = []
        for (const url of imageUrls.slice(0, 8)) {
          node.status({ fill: 'blue', shape: 'dot', text: `下载参考图 ${images.length + 1}/${imageUrls.length}…` })
          images.push(await momoApi.downloadImageAsBase64(url))
        }

        let channelModelId = Number(config.channelModelId) || 0
        if (!channelModelId) {
          const models = await momoApi.fetchCatalog('text')
          channelModelId = models[0] ? models[0].id : 0
        }
        if (!channelModelId) throw new Error('暂无可用文字模型，请联系管理员配置渠道')

        node.status({ fill: 'blue', shape: 'dot', text: '文字模型生成中…' })
        const result = await momoApi.apiFetch('/api/canvas-ai/chat', {
          method: 'POST',
          body: {
            channelModelId,
            messages: [{ role: 'user', content: prompt }],
            images,
          },
        })

        if (!result || !result.text || !result.text.trim()) {
          throw new Error('文字模型返回空内容')
        }
        msg.payload = result.text
        node.status({ fill: 'green', shape: 'dot', text: `完成 · ${result.text.length} 字` })
        send(msg)
        done()
      } catch (err) {
        node.status({ fill: 'red', shape: 'ring', text: String((err && err.message) || err).slice(0, 40) })
        done(err instanceof Error ? err : new Error(String(err)))
      }
    })
  }

  RED.nodes.registerType('momo-text-ai', MomoTextAi)
}
