#!/usr/bin/env node
/**
 * Node-RED 画布子进程启动器（AI画布 Pro）
 *
 * 每个打开的画布项目 = 一个独立 Node-RED runtime 子进程，仅监听 127.0.0.1，
 * 由主进程（server/src/nodered/proxy.ts）反向代理到 /red/u/<userId>/p/<projectId>/。
 *
 * 为什么是 .cjs：根 package.json 为 "type":"module"，而 node-red 及自定义节点
 * 均以 CommonJS require 加载，独立脚本必须显式声明 CommonJS。
 *
 * argv[2] = JSON 配置：{ port, userId, projectId, dbPath, apiBase, instanceToken, credentialSecret }
 *   - instanceToken：主进程为该 (userId,projectId) 签发的应用 JWT。编辑器鉴权
 *     （adminAuth.tokens）与自定义节点回环调用主进程 API 均用它，子进程只做
 *     精确字符串比对，不持有 JWT secret。
 * 就绪协议：stdout 输出 `NR_READY` / `NR_ERROR:<msg>`，由 manager.ts 解析。
 */
'use strict'

const http = require('http')
const path = require('path')
const fs = require('fs')
const express = require('express')
const Database = require('better-sqlite3')
const RED = require('node-red')

const cfg = JSON.parse(process.argv[2] || '{}')
const required = ['port', 'userId', 'projectId', 'dbPath', 'apiBase', 'instanceToken', 'credentialSecret']
for (const k of required) {
  if (!cfg[k]) {
    console.log(`NR_ERROR:缺少启动参数 ${k}`)
    process.exit(1)
  }
}

const adminRoot = `/red/u/${cfg.userId}/p/${cfg.projectId}`
const NR_DIR = __dirname
const nodesDir = path.join(NR_DIR, 'nodes')
const userDir = path.join(NR_DIR, 'userdir', `u${cfg.userId}p${cfg.projectId}`)
fs.mkdirSync(userDir, { recursive: true })
// externalModules 依赖 userDir/package.json 存在（palette 已禁装，占位即可）
const userPkg = path.join(userDir, 'package.json')
if (!fs.existsSync(userPkg)) {
  fs.writeFileSync(userPkg, JSON.stringify({ name: 'nr-userdir', version: '1.0.0', private: true }, null, 2))
}

// ─── SQLite 存储（与主进程共享同一 WAL 库，busy_timeout 防多进程写冲突）───

const db = new Database(cfg.dbPath)
db.pragma('busy_timeout = 5000')

function loadRow() {
  return db
    .prepare('SELECT flow_json, creds_json, updated_at FROM nr_canvas_projects WHERE id = ?')
    .get(cfg.projectId)
}

const storageModule = {
  init() {
    return Promise.resolve()
  },
  // Node-RED storage 契约：getFlows 返回 flows 数组本体（rev 由 runtime 内部 sha256 计算）
  getFlows() {
    const row = loadRow()
    return Promise.resolve(row && row.flow_json ? JSON.parse(row.flow_json) : [])
  },
  saveFlows(flows) {
    const arr = Array.isArray(flows) ? flows : (flows && flows.flows) || []
    const now = new Date().toISOString()
    db.prepare(
      'UPDATE nr_canvas_projects SET flow_json = ?, node_count = ?, updated_at = ? WHERE id = ?'
    ).run(JSON.stringify(arr), arr.length, now, cfg.projectId)
    return Promise.resolve()
  },
  getCredentials() {
    const row = loadRow()
    return Promise.resolve(row && row.creds_json ? JSON.parse(row.creds_json) : {})
  },
  saveCredentials(credentials) {
    db.prepare('UPDATE nr_canvas_projects SET creds_json = ? WHERE id = ?').run(
      JSON.stringify(credentials || {}),
      cfg.projectId
    )
    return Promise.resolve()
  },
  getSettings() {
    return Promise.resolve({})
  },
  saveSettings() {
    return Promise.resolve()
  },
}

// ─── Node-RED 设置 ───

const settings = {
  httpAdminRoot: adminRoot,
  // httpNode 路由刻意不挂载：AI 画布不需要对外暴露 http-in 端点
  httpNodeRoot: `${adminRoot}-httpnode`,
  disableEditor: false,
  userDir,
  nodesDir,
  storageModule,
  credentialSecret: cfg.credentialSecret,
  flowFile: 'flows.json',
  flowFilePretty: false,
  functionGlobalContext: {},
  externalModules: {
    autoInstall: false,
    palette: { allowInstall: false, allowUpload: false },
  },
  editorTheme: {
    tours: false,
    header: { title: 'AI画布 Pro', hideMenuItems: [] },
    palette: {
      // Momo AI 分类置顶；未列出的分类自动追加在后
      categories: { order: ['Momo AI'] },
    },
    projects: { enabled: false },
  },
  diagnosticReporting: { enabled: false },
  logging: {
    console: { level: 'info', metrics: false, audit: false },
  },
  // 编辑器鉴权：仅接受本实例的 instanceToken（主进程签发的应用 JWT）。
  // 代理层已先行校验 token 与路径 userId 一致，此处为纵深防御。
  adminAuth: {
    tokens(token) {
      if (token === cfg.instanceToken) {
        return Promise.resolve({ username: `u${cfg.userId}`, permissions: '*' })
      }
      return Promise.resolve(null)
    },
  },
  // 自定义节点回环调用主进程 API 所需上下文（服务端对象，不序列化给编辑器）
  momo: {
    apiBase: cfg.apiBase,
    token: cfg.instanceToken,
    userId: cfg.userId,
    projectId: cfg.projectId,
  },
}

// ─── 父进程看门狗：主进程死亡（tsx watch 重启 / PM2 重启 / 崩溃）即自杀，防孤儿 ───

const parentPid = process.ppid
if (parentPid) {
  const watchdog = setInterval(() => {
    try {
      process.kill(parentPid, 0)
    } catch {
      console.error('[nr-launcher] parent process gone, exiting')
      process.exit(0)
    }
  }, 5000)
  watchdog.unref()
}

// ─── 启动 ───

const app = express()
const server = http.createServer(app)

// 节点资源（/nodes、编辑器 JS）禁缓存：节点升级/实例重建后浏览器必须拿新版
app.use((req, res, next) => {
  if (req.path === '/nodes' || req.path.startsWith('/nodes/') || req.path.startsWith('/icons/') || req.path.endsWith('.js') || req.path.endsWith('.html')) {
    res.setHeader('Cache-Control', 'no-store')
  }
  next()
})

RED.init(server, settings)
app.use(settings.httpAdminRoot, RED.httpAdmin)

server.listen(cfg.port, '127.0.0.1', () => {
  RED.start()
    .then(() => {
      console.log(`NR_READY u${cfg.userId} p${cfg.projectId} :${cfg.port}`)
    })
    .catch((err) => {
      console.log(`NR_ERROR:Node-RED 启动失败: ${err && err.message ? err.message : err}`)
      process.exit(1)
    })
})

server.on('error', (err) => {
  console.log(`NR_ERROR:监听 ${cfg.port} 失败: ${err.message}`)
  process.exit(1)
})

let closing = false
function shutdown() {
  if (closing) return
  closing = true
  const force = setTimeout(() => process.exit(0), 5000)
  force.unref()
  Promise.resolve(RED.stop ? RED.stop() : null)
    .catch(() => {})
    .finally(() => server.close(() => process.exit(0)))
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
