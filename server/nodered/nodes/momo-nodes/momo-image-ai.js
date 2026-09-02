'use strict'

const momoApi = require('./momo-api.js')

/**
 * 图片 AI 节点：调主进程 /api/generations（预扣积分→派发→轮询→转存，失败自动退款）。
 * 提交走 logicalModelId（model-routing 重构后统一售价/服务端自选渠道）。
 * 输入：msg.payload = 提示词文本（必填）。
 * 参考图在节点配置里上传（静态输入，最多张数受模型能力约束）。
 * 输出：msg.payload = { images: string[], taskNos: string[] }。
 */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

module.exports = function (RED) {
  function MomoImageAi(config) {
    RED.nodes.createNode(this, config)
    const node = this
    let closed = false

    node.on('close', function () {
      closed = true
    })

    node.on('input', async (msg, send, done) => {
      try {
        const prompt = typeof msg.payload === 'string' ? msg.payload.trim() : ''
        if (!prompt) {
          throw new Error('缺少 Prompt：上游 msg.payload 必须是文本（接 inject / 文字AI 等）')
        }

        const logicalModelId = Number(config.logicalModelId) || Number(config.channelModelId) || 0
        if (!logicalModelId) throw new Error('请先在节点配置中选择生图模型')

        const resolution = config.resolution || '1K'
        const aspectRatio = config.aspectRatio || '1:1'
        const n = Math.max(1, Math.min(5, Number(config.n) || 1))
        const refImageUrls = (Array.isArray(config.refImages) ? config.refImages : [])
          .map((r) => (r && r.url ? r.url : ''))
          .filter(Boolean)

        node.status({ fill: 'blue', shape: 'dot', text: '提交生图任务…' })
        const submit = await momoApi.apiFetch('/api/generations', {
          method: 'POST',
          body: {
            logicalModelId,
            prompt,
            aspectRatio,
            resolution,
            n,
            refImageUrls,
            featureId: 'canvas',
          },
        })

        const tasks = (submit && submit.tasks) || []
        if (tasks.length === 0) throw new Error('生图任务提交失败：未返回任务')

        const urls = []
        for (const t of tasks) {
          let last = null
          for (let i = 0; i < 200; i++) {
            if (closed) throw new Error('节点已关闭，生图中止')
            await sleep(3000)
            last = await momoApi.apiFetch('/api/generations/' + t.id + '/status')
            if (last.status === 'completed') {
              urls.push(...(last.resultUrls || []))
              break
            }
            if (last.status === 'failed') {
              throw new Error(last.errorMessage || '生图失败')
            }
            node.status({
              fill: 'blue',
              shape: 'dot',
              text: `${t.taskNo} ${last.status}${last.progress ? ' ' + last.progress + '%' : ''}`,
            })
          }
          if (!last || (last.status !== 'completed' && last.status !== 'failed')) {
            throw new Error(`生图超时（10 分钟）：${t.taskNo}`)
          }
        }

        if (urls.length === 0) throw new Error('生图完成但未返回图片')

        msg.payload = { images: urls, taskNos: tasks.map((t) => t.taskNo) }
        node.status({ fill: 'green', shape: 'dot', text: `完成 · ${urls.length} 张` })
        send(msg)
        done()
      } catch (err) {
        if (closed) return
        node.status({ fill: 'red', shape: 'ring', text: String((err && err.message) || err).slice(0, 40) })
        done(err instanceof Error ? err : new Error(String(err)))
      }
    })
  }

  RED.nodes.registerType('momo-image-ai', MomoImageAi)
}
