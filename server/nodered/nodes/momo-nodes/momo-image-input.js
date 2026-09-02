'use strict'

/**
 * 图片输入节点：配置面板上传一张图（→ /api/oss/upload），inject 时作为参考图输出。
 * 输出：msg.image = { url, fileName }，msg.images = [该图]；msg.payload 原样保留。
 * 下游文字 AI 节点读取 msg.image / msg.images 做多模态输入。
 */

module.exports = function (RED) {
  function MomoImageInput(config) {
    RED.nodes.createNode(this, config)
    const node = this

    node.on('input', function (msg, send, done) {
      try {
        const url = config.imageUrl || ''
        if (!url) throw new Error('请先在节点配置中上传图片')
        const image = { url, fileName: config.fileName || 'image.png' }
        msg.image = image
        msg.images = [image]
        node.status({ fill: 'green', shape: 'dot', text: config.fileName || '已输出图片' })
        send(msg)
        done()
      } catch (err) {
        node.status({ fill: 'red', shape: 'ring', text: String((err && err.message) || err).slice(0, 40) })
        done(err instanceof Error ? err : new Error(String(err)))
      }
    })
  }

  RED.nodes.registerType('momo-image-input', MomoImageInput)
}
