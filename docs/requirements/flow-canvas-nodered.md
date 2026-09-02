# AI画布 Pro（Node-RED 版）

最后更新：2026-09-02
状态：已实现 · 本机端到端验收通过（编辑器加载 / 节点配置 / Deploy 持久化 / 实例回收恢复 / WS / 回环 AI 调用）
菜单位置：侧边栏「AI生图 → AI画布 Pro」（列表 `/flow-canvas` → 编辑器 `/flow-canvas/:projectId`，iframe 嵌入 Node-RED 编辑器）

---

## 1. 概述

AI 画布的 Node-RED 重构版，与旧 vue-flow 画布（「AI画布」）**并存互不影响**。
以 [Node-RED 4.1](https://nodered.org/) 为节点编辑器与流程运行时，用户在浏览器里拖拽节点、连线、点「部署」即保存并让流程在服务端常驻运行。

核心架构（关键决策见 §6）：

```
浏览器
  └─ Vue 页面 /flow-canvas/:projectId（iframe）
       src = /red/u/<userId>/p/<projectId>/?access_token=<instanceToken>
            ↓ Nginx /red/（含 WS upgrade）或 Vite dev proxy /red(ws) → 主进程 :3000
主进程 (Express)
  ├─ /api/flow-canvas/*         项目 CRUD + 会话（routes/flowCanvas.ts）
  ├─ nodered/proxy.ts           反向代理 + 鉴权闸门（HTTP + WebSocket）
  ├─ nodered/manager.ts         实例生命周期（懒启动 / 空闲回收 / LRU 上限）
  └─ 优雅停机时 killAll 子进程
子进程（每打开的画布项目一个，仅绑 127.0.0.1:191xx）
  └─ nodered/launcher.cjs：Express + RED.init + SQLite 存储 + 看门狗
       ├─ 编辑器 UI（httpAdminRoot = /red/u/<uid>/p/<pid>）
       ├─ 自定义节点 nodes/momo-nodes/（回环调用主进程 /api/*）
       └─ flows 每次 Deploy 实时落库 nr_canvas_projects.flow_json
```

## 2. 实例模型与生命周期

- **每 (userId, projectId) 一个独立子进程**。官方明确不支持单 Node 进程跑多个完整 runtime（模块单例状态），多用户并发编辑必须独立进程。
- 懒启动：`POST /api/flow-canvas/projects/:id/session`（或任何打到该路径的代理请求）触发 `ensureInstance`，fork launcher，等待 stdout 行协议 `NR_READY`（30s 超时）。
- 端口池 19100–19199；**LRU 上限 6 个实例**（`NR_MAX_INSTANCES` 可调），满了淘汰最久未活跃。
- **空闲 30 分钟回收**（`NR_IDLE_MINUTES` 可调，60s 扫一次）。Deploy 时 flows 已实时落库，回收零数据丢失；下次访问自动重启恢复（浏览器端无感，编辑器重新拉 flows）。
- 子进程看门狗：轮询 ppid，主进程死亡（tsx watch 重启 / PM2 重启 / 崩溃）即自杀，防孤儿进程。
- 主进程优雅停机钩子里 `killAllNrInstances()`。

## 3. 鉴权链路（三层）

| 层 | 机制 |
|----|------|
| 主进程代理层 | `/red/u/:userId/p/:projectId/*` 请求带凭证（Authorization Bearer 或 `?access_token`）时校验应用 JWT 且 userId 必须匹配路径；不带凭证（编辑器静态资源、comms WS 升级）透传 |
| 子进程 adminAuth | `adminAuth.tokens` 对 token 做**精确字符串比对**——只接受本实例的 instanceToken（主进程 spawn 时为该用户签发的应用 JWT，7d），跨用户/跨实例必被拒 |
| 编辑器免登录桥接 | session 接口返回 `{ editorUrl, accessToken }`，iframe 以 `?access_token=` 打开；编辑器存入 localStorage（按路径后缀隔离）后对所有 admin API 自动带 Bearer |

注：comms WebSocket 的 token 在连接建立后以 auth 包发送（Node-RED 机制），升级阶段无凭证，依赖子进程内 adminAuth 校验。

## 4. 自定义节点（`server/nodered/nodes/momo-nodes/`，目录自带 `"type":"commonjs"`）

| 节点 | 作用 | 回环 API |
|------|------|----------|
| 文字 AI | 文字模型生成文案/提示词，支持参考图多模态（images 字段），不扣积分 | `POST /api/canvas-ai/chat` |
| 图片 AI | 生图：模型下拉（逻辑模型 + 统一售价）→ 分辨率/比例联动 → 参考图上传；计费预扣、失败退款、Key 轮换全部继承 | `POST /api/generations`（`logicalModelId`，`featureId:'canvas'`）+ 轮询 `/status` |
| 图片输入 | 配置面板上传图片（直传 `/api/oss/upload`），输出 `msg.image` / `msg.images` 供文字 AI 做参考图 | — |
| 保存素材 | 收集消息中的图片 URL 入画布素材库（canvas_assets） | `POST /api/canvas/assets` |

- 节点回环调用统一走 `momo-api.js`：`RED.settings.momo`（launcher 注入 apiBase/token/userId/projectId）+ Bearer instanceToken + `AbortSignal.timeout(15min)`。
- 编辑器侧模型目录：节点 HTML 经 `GET <adminRoot>/momo-ctx`（子进程 admin 端点，服务端拉目录缓存 60s）获取；**必须用 jQuery `$.ajax`**（编辑器 `$.ajaxSetup` 只给相对路径自动加 Authorization，bare fetch 会 401）。上传走 `/api/oss/upload`（绝对路径不带编辑器头，显式取 `RED.settings.get('auth-tokens')`）。
- 文本输入/拆分/文本预览用 Node-RED 核心节点（inject/template/split/debug），不自研。
- 图片 AI 的「运行」即部署后触发上游注入消息；生图任务进主任务列表（featureId=canvas，与旧画布一致）。

## 5. 持久化与数据表

- `nr_canvas_projects`（schema.ts）：id / user_id / name / **flow_json**（flows 数组） / creds_json（节点凭据密文） / credential_secret（每项目随机，副本不复制凭据） / node_count / 时间戳。
- launcher 的 storageModule 直写该表（与主进程共享 WAL 库，busy_timeout=5000）。
- **注意 Node-RED storage 契约**：`getFlows()` 返回 flows **数组本体**（rev 由 runtime 内部 sha256 计算）；`saveFlows(flows)` 收到的也是数组。Deploy 用 admin API `POST /flows`（`Node-RED-API-Version: v2`），不是 PUT。
- userDir（`server/nodered/userdir/u<pid>p<uid>/`，已 gitignore）只存节点注册缓存等运行时产物。

## 6. 关键决策记录

1. **每用户子进程实例**（而非单实例+编辑锁/仅管理员）：所有用户可并发编辑各自项目，与旧画布体验对齐；代价是每活跃实例 ~100MB 内存（LRU 上限 6 + 空闲回收控制）。2026-09-02 用户选定。
2. **node-red 4.1.x**：v5 的 ESM 节点支持尚不成熟（社区反馈不稳定）；4.x 的嵌入模式/文档/社区方案全部验证可用。
3. **回环 HTTP 而非进程内调用**：自定义节点调主进程现有 REST API，计费/退款/Key 轮换/存储/鉴权零重构继承。
4. **httpAdminRoot = 完整外部路径** `/red/u/<uid>/p/<pid>`：代理不改写路径，实例内生成的资源链接天然可回环。
5. **代理必须挂在 express.json() 之前**：代理转发原始请求流，被 body parser 消费后 Node-RED 会收到空 body。
6. **节点资源 no-store**（launcher 中间件）：节点 HTML/JS 升级或实例重建后浏览器必须拿新版（否则配置面板跑旧代码）。

## 7. 部署要点

- 依赖：`node-red@^4.1` + `http-proxy@^1.18`（已在 package.json）。
- Nginx：`location /red/` → 127.0.0.1:3000，**必须带 WebSocket upgrade 头**（见 deployment.md）。
- Vite dev：`'/red'` 代理 `ws: true`（已配置）。
- PM2 无变化（子进程由主进程管理）。
- 环境变量（可选）：`NR_MAX_INSTANCES`（默认 6）、`NR_IDLE_MINUTES`（默认 30）。

## 8. 已知边界（v1）

- Node-RED 编辑器是独立产品 UI，iframe 内无法套 `--momo-*` 设计体系。
- 应用 JWT 7 天过期后，长时间开着的编辑器 WS 重连会失败，重开页面即恢复（iframe 重挂载带新 token）；实例重启轮换 token 时同理。
- 复制项目不带节点凭据（credential_secret 重新生成；momo 节点本身不存凭据，影响极小）。
- Node-RED「流程库」菜单依赖 storage library 接口，v1 未实现，导入/导出用画布 JSON 或主菜单 Import/Export 即可。
- 旧画布（vue-flow）完全保留；两套画布项目数据互不相通。

## 9. 验收记录（2026-09-02 本机 dev，临时库=生产库副本+重置 admin）

1. 项目 CRUD（创建/列表/重命名/复制/删除）API 全通。
2. session 懒启动子进程（stdout NR_READY 行协议），编辑器页面 200。
3. 无效 token → 401；用户自身 JWT 直打实例 admin API → 401（子进程只认 instanceToken，纵深防御生效）。
4. `POST /flows`（v2）Deploy → `nr_canvas_projects.flow_json` 落库 → GET 回读一致。
5. 杀子进程 → 重新 session → flows 从 SQLite 完整恢复。
6. WS comms 经代理连通且 auth 包通过（`{"auth":"ok"}`）。
7. `/nodes` 注册核验：41 模块含 momo-text-ai / momo-image-ai / momo-image-input / momo-save。
8. 浏览器端：调色板 Momo AI 分类齐全；拖拽节点；配置面板模型下拉渲染（GPT-5.5 · TA / Gemini 3 Flash · TA / …，逻辑模型含统一售价）；UI Deploy → DB 落库（模型 id=6、提示词持久化）。
9. 文字模型回环真实调用 gpt-5.5 返回文案（不扣积分）。
10. `npm run check`（vue-tsc + tsc）通过。

## 需求变更记录

### 2026-09-02 — 初版

Node-RED 版 AI 画布上线：每 (用户,项目) 独立子进程实例 + 应用内反代（含 WS）+ SQLite 持久化 + 4 个 momo 自定义节点（回环主进程 API，计费/退款/Key 轮换继承）+ 免登录 token 桥接 + LRU/空闲回收。旧 vue-flow 画布保留不动。
