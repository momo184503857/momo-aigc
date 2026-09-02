'use strict'

const momoApi = require('./momo-api.js')

/**
 * 保存节点：把上游消息里的图片收集入画布素材库（canvas_assets，经主进程 API）。
 * 识别的图片来源：
 *  - msg.payload.images / msg.payload.image.url / msg.payload.url（图片 AI 输出）
 *  - msg.images / msg.image（图片输入节点输出）
 *  - msg.payload 为图片 URL 字符串
 */

function collectImageUrls(msg) {
  const urls = []
  const push = (u) => {
    if (typeof u === 'string' && (u.startsWith('http') || u.startsWith('/')) && !urls.includes(u)) {
      urls.push(u)
    }
  }
  if (msg.payload && typeof msg.payload === 'object') {
    if (Array.isArray(msg.payload.images)) msg.payload.images.forEach(push)
    if (msg.payload.image && msg.payload.image.url) push(msg.payload.image.url)
    if (typeof msg.payload.url === 'string') push(msg.payload.url)
  }
  if (Array.isArray(msg.images)) {
    for (const it of msg.images) {
      if (it && it.url) push(it.url)
    }
  }
  if (msg.image && msg.image.url) push(msg.image.url)
  if (typeof msg.payload === 'string') push(msg.payload)
  return urls
}

module.exports = function (RED) {
  function MomoSave(config) {
    RED.nodes.createNode(this, config)
    const node = this

    node.on('input', async (msg, send, done) => {
      try {
        const urls = collectImageUrls(msg)
        if (urls.length === 0) {
          node.status({ fill: 'yellow', shape: 'ring', text: '未发现可保存图片' })
          send(msg)
          done()
          return
        }
        node.status({ fill: 'blue', shape: 'dot', text: `保存 ${urls.length} 项…` })
        for (const [i, url] of urls.entries()) {
          await momoApi.apiFetch('/api/canvas/assets', {
            method: 'POST',
            body: {
              fileName: (msg.payload && msg.payload.taskNos && msg.payload.taskNos[i]) || url.split('/').pop() || 'image.png',
              filePath: url,
              previewUrl: url,
              nodeId: node.id,
              nodeTitle: node.name || '保存',
              projectId: RED.settings.momo ? RED.settings.momo.projectId : undefined,
            },
          })
        }
        node.status({ fill: 'green', shape: 'dot', text: `已保存 ${urls.length} 项` })
        send(msg)
        done()
      } catch (err) {
        node.status({ fill: 'red', shape: 'ring', text: String((err && err.message) || err).slice(0, 40) })
        done(err instanceof Error ? err : new Error(String(err)))
      }
    })
  }

  RED.nodes.registerType('momo-save', MomoSave)
}
