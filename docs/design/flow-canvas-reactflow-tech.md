# AI画布 Pro+（React Flow 版）· 技术方案

> 面向 AI 实施者。需求依据 `docs/requirements/flow-canvas-reactflow.md`（R1–R10 / N1–N5，本文引用其编号）。本文给出可执行的架构、契约与改动点；除数据结构/接口形状外不含实现代码。

## 0. 阅读顺序与总览

实施顺序 = §10。先做 §4 构建配置验证（空壳），再做 §6/§7 后端，然后前端骨架 → 节点 → 引擎 → UX。

```
Vue 应用（主壳）
 └─ src/views/rf-canvas/RfEditorPage.vue        # KeepAlive 缓存的薄壳（defineOptions name）
     └─ onMounted → createRoot → <RfApp/>       # React island（懒加载 chunk）
         ├─ @xyflow/react ReactFlow 画布 + zustand store + 引擎（纯 TS，移植自旧画布）
         └─ api.ts（独立 axios，读 localStorage 'auth_token'）
              ↓ 仅走既有 API（全部服务端编排，零新增业务逻辑）
             /api/rf-canvas/*（新增，仅项目 CRUD）
             /api/models/catalog  /api/canvas-ai/chat
             /api/generations(+/:id/status)  /api/oss/(mode|upload|upload-token)
```

## 1. 画布隔离

> 注：「AI画布 Pro（Node-RED 版）」已于 2026-09-03 整体移除（git 65c0e2f 可追溯），本表 Pro 列仅作历史对照保留。

| | 旧画布 | Pro（Node-RED，已移除） | Pro+（本方案） |
|---|---|---|---|
| 前端 | `src/views/canvas/` + `src/modules/workflow/` | ~~`src/views/flow-canvas/`（iframe 壳）~~ | `src/views/rf-canvas/`（React 壳）+ `src/rf-canvas/`（React 源码） |
| 后端 | `routes/canvas.ts`，表 `canvas_projects`/`canvas_assets` | ~~`routes/flowCanvas.ts`，表 `nr_canvas_projects`，`nodered/` 子进程~~ | `routes/rfCanvas.ts`（新增），表 `rf_canvas_projects`（新增） |
| 依赖 | `@vue-flow/core` | ~~`node-red`/`http-proxy`~~ | `react`/`react-dom`/`@xyflow/react`/`zustand` |

与旧画布共存；Pro+ 不 import 任何 Vue 模块（`src/rf-canvas/` 内禁止出现 `@/stores`、`@/services`、`vue` 引用——它们经 `http.ts`/Pinia 绑定 Vue）。

## 2. 决策记录

- **D1 React island（页面内嵌 React 根），不用 iframe 微应用**。单应用单构建，共享路由/标签页/登录态/主题；React 子树随路由懒加载，主包不增大（N1）。iframe 方案（Pro 的模式）需第二套构建与跨窗通信，被否——React 与 Vue 同源同页，无隔离收益。
- **D2 React 19 + `@xyflow/react` v12**。v12 是 React Flow 当前主版本（Svelte 版独立包，勿装错）。React 19 类型无全局 JSX 命名空间，必须 automatic runtime（见 D7）。
- **D3 状态用 zustand（单 store）**。节点/连线/选中/运行态/撤销栈被 Toolbar、Inspector、Canvas 三方共享，Context+useReducer 会引发全树重渲染；zustand 选择器订阅与 React Flow 官方推荐一致。
- **D4 引擎移植而非重写**。旧画布引擎（`src/modules/workflow/engine/executor.ts` 等）是纯 TS、语义即需求 R6，按 §9 锚点表移植并剥离 Vue/Electron 依赖，禁止重设计语义。
- **D5 新表独立、save 不写 canvas_assets**。`canvas_projects` 与 `rf_canvas_projects` 的 id 是两条独立自增序列，若 Pro+ 复用 `/api/canvas/assets`（按 project_id 过滤），两序列撞号会把两套项目的素材混在一起。故成果面板为前端态随 graph 持久化（R5.4）。
- **D6 `featureId='rf-canvas'`**。不复用旧画布的 `'canvas'`（任务面板会串标签），在 `featureConfig.ts` 增加 label 条目使 `getFeatureLabel` 显示「AI画布 Pro+」（R9.3）。
- **D7 根 `tsconfig.json` 全局改 `jsx:react-jsx`**。现仓库 `src/` 无任何 `.tsx/.jsx`（已核验），`.vue` 模板不受 compilerOptions.jsx 影响，全局改安全；比新建子 tsconfig + references 少一套配置。必须同时设 `jsxImportSource: "react"`（React 19 类型要求）。
- **D8 `@vitejs/plugin-react` 且 include 限定**到 `src/rf-canvas/**/*.tsx`：提供 HMR，且 babel 不触碰其余 `.ts`（避免与 Vue 构建交叉）。`manualChunks` 抽 `rf-vendor`（react/react-dom/@xyflow/react/zustand），保证 N1 可断言。
- **D9 自动保存 = dirty 标记 + 2s 防抖**（R8.1），替代旧画布 30s 定时全量 PUT。触发源：nodes/edges/viewport/config 变更统一走 store 的 `markDirty()`。
- **D10 历史快照剥离运行态**（R3.7）：入栈的是 `{nodes, edges}` 的深拷贝且每个节点剔除 `status/result/logs/inputs`，undo 恢复时保留现值中的运行态字段。
- **D11 上传双模式在 React 侧复刻**（R10.1）：生产当前运行 OSS 模式，只实现 direct 会在生产直接坏。逻辑对齐 `src/services/ossApi.ts` 的 `upload()`。

## 3. 依赖（仅此 7 个，N5）

| 包 | 版本 | 类型 | 用途 |
|---|---|---|---|
| `react` | ^19 | deps | 运行时 |
| `react-dom` | ^19 | deps | createRoot |
| `@xyflow/react` | ^12 | deps | React Flow 画布 |
| `zustand` | ^5 | deps | 状态/撤销/运行态 |
| `@types/react` | ^19 | devDeps | 类型 |
| `@types/react-dom` | ^19 | devDeps | 类型 |
| `@vitejs/plugin-react` | ^5 | devDeps | tsx 转换 + HMR |

## 4. 构建配置改动点

### 4.1 `vite.config.ts`（现状 43 行）

1. `plugins: [vue()]` → `[vue(), react({ include: ['src/rf-canvas/**/*.tsx'] })]`（`import react from '@vitejs/plugin-react'`）。
2. `build.rollupOptions` 增 `output.manualChunks: { 'rf-vendor': ['react', 'react-dom', '@xyflow/react', 'zustand'] }`（保留现有 `input` 双入口不动）。

### 4.2 根 `tsconfig.json`（现状 20 行）

| 位置 | 现值 | 目标值 |
|---|---|---|
| `compilerOptions.jsx` | `"preserve"` | `"react-jsx"` |
| `compilerOptions.jsxImportSource` | （无） | `"react"` |
| `include` | `["src/**/*.ts", "src/**/*.d.ts", "src/**/*.vue"]` | 追加 `"src/**/*.tsx"` |

不新建 tsconfig、不动 `tsconfig.node.json` 与 `server/tsconfig.json`。React Flow 样式 `@xyflow/react/dist/style.css` 在 `src/rf-canvas/` 入口 import（进 Pro+ chunk，勿放 `src/main.ts`）。

### 4.3 其他零改动

无 lint 配置；`/api` 代理已存在；Nginx/PM2 无变化（无 iframe、无新端口、无 WS）。

## 5. 前端目录

```
src/rf-canvas/                     # React 源码（自包含；禁止 import vue/@/services/@/stores）
  api.ts        # 独立 axios（baseURL /api，请求拦截读 localStorage 'auth_token'，401 → 清 token 跳 /#/login）
                #   fetchImageCatalog/fetchTextCatalog（60s 模块级缓存）
                #   chat(channelModelId, promptText, images?) → { text }
                #   generateImage(params) → 提交 + 3s×120 轮询 → { resultUrls, taskNo }（AbortSignal 可取消）
                #   uploadImage(file) → { url }（双模式，D11）
                #   projectApi：rfCanvas CRUD（编辑器内自动保存用）
  types.ts      # GraphJSON / RFNodeData / NodeStatus / PortType / 各节点 config 类型 / LogEntry
  store.ts      # zustand：nodes/edges/selection/viewport、undo/redo 栈（D10）、dirty+自动保存（D9）、
                #   运行态（runner 借 store 写节点 status/result/logs）、成果面板条目
  engine/
    graph.ts    # 移植：topologicalSort / findAncestors / findDescendants / detectCycles / resolveNodeInputs
    runner.ts   # 移植：四模式运行、层内并行、重试、缓存 hash、脏传播、暂停、软停止（§9）
    nodes/      # registry.ts + 8 个节点 def（config 默认值 + run + Panel 组件引用）
  components/
    RfApp.tsx   # 根：ReactFlowProvider + 布局（工具栏/画布/检查器/成果面板/lightbox）
    FlowCanvas.tsx   # <ReactFlow>：nodeTypes、isValidConnection(R3.2)、MiniMap/Controls/Background/snap、
                     #   右键菜单、快捷键（Ctrl+Z/Y/C/V、Delete）、onConnect/onNodeDragStop
    NodeCard.tsx     # 通用节点卡：标题/状态角标/Handle(左入右出，含类型标签)/内联摘要/缩略图
    InspectorPanel.tsx  # 右侧检查器（配置/端口/结果/日志，R7.3；可折叠）
    Toolbar.tsx        # 添加节点/运行四模式/停止/适配视图/成果面板开关/保存状态指示
    ImageLightbox.tsx  # R7.4
    panels/            # 各节点配置面板（模型下拉/上传/比例分辨率联动/pauseAfterRun 等）
  styles/rf.css  # 消费 --momo-*（N3）
src/views/rf-canvas/
  RfProjectsPage.vue   # defineOptions({ name: 'RfCanvasProjects' })；镜像 FlowProjectsPage 的卡片列表
  RfEditorPage.vue     # defineOptions({ name: 'RfCanvasEditor' })
                      #   onMounted: createRoot(el).render(<RfApp projectId/>)（import RfApp 使其入懒 chunk）
                      #   onDeactivated: 触发 store flush 保存；onBeforeUnmount: root.unmount()
src/services/rfCanvasApi.ts   # Vue 侧 axios 薄客户端（仅列表页 CRUD 用）
```

## 6. 数据模型

### 6.1 新表（`server/src/db/schema.ts` 追加，`CREATE TABLE IF NOT EXISTS` 启动即建，风格对齐 `canvas_projects`）

```sql
CREATE TABLE IF NOT EXISTS rf_canvas_projects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  name        TEXT    NOT NULL,
  graph_json  TEXT    NOT NULL DEFAULT '{}',
  node_count  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rf_canvas_projects_user ON rf_canvas_projects(user_id);
```

`graph_json` 存 JSON 字符串，服务端只做透传存储，不解析语义；API 层收发均为对象（`graph`），落库时 stringify、读取时 parse（坏 JSON → 返回空图 `{}`，不 500）。

### 6.2 GraphJSON 形状（`src/rf-canvas/types.ts` 的契约）

```
GraphJSON = {
  nodes: RFNode[]        // React Flow Node 序列化：{ id, type, position:{x,y}, data: RFNodeData }
  edges: RFEdge[]        // React Flow Edge 序列化：{ id, source, sourceHandle, target, targetHandle }（无 data）
  viewport: { x: number, y: number, zoom: number }
}

RFNodeData = {
  title: string                      // 默认取类型标题，可改
  status: 'idle'|'running'|'success'|'failed'|'paused'|'dirty'|'disabled'|'cached'
  config: Record<string, unknown>    // 每节点自有字段（需求 §R5 表）
  result?: { dataType: 'Text'|'Image', value: string | { imageList: {url,fileName}[], taskNo?: string } }
  inputs?: Record<portId, unknown>   // 上游结果快照（端口页签展示 + 缓存 hash 输入）
  logs?: Array<{ time: string, level: 'info'|'warn'|'error', message: string }>
}

端口 id 约定（registry 单一来源）：
  输入：'prompt' | 'text' | 'image' | 'image_1'..'image_N'
  输出：'text' | 'image' | 'output_1'..'output_N'（prompt-splitter 动态）
端口类型 PortType = 'Text' | 'Image' | 'Any'，由 registry 按 node.type+portId 查得（连线校验/着色共用）。
```

## 7. API 契约

### 7.1 新增：`server/src/routes/rfCanvas.ts`，挂载 `/api/rf-canvas`（`index.ts` 在既有挂载点后追加一行）

全部 `authMiddleware`；响应统一 `{ success: true, data }` / 错误 `{ success: false, error }`；资源不存在或非本人项目 → 404。

| 方法 | 路径 | 请求 | data 返回 |
|---|---|---|---|
| GET | `/rf-canvas/projects` | — | `[{ id, name, nodeCount, createdAt, updatedAt }]`（**不含 graph**） |
| POST | `/rf-canvas/projects` | `{ name }`（trim 后非空，≤50） | `{ id, name, nodeCount: 0, createdAt, updatedAt }` |
| GET | `/rf-canvas/projects/:id` | — | `{ id, name, graph: GraphJSON, nodeCount, createdAt, updatedAt }` |
| PATCH | `/rf-canvas/projects/:id` | `{ name? , graph?, nodeCount? }` 局部更新，任一命中即刷新 `updated_at` | `{ id, updatedAt }` |
| POST | `/rf-canvas/projects/:id/duplicate` | — | 新项目（name = `{原名} 副本`，graph 深拷贝） |
| DELETE | `/rf-canvas/projects/:id` | — | `{ ok: true }` |

实现模式镜像 `server/src/routes/canvas.ts`（better-sqlite3 同步写、`WHERE id=? AND user_id=?` 双条件）。

### 7.2 复用（零修改，形状以现源码为准）

**模型目录** `GET /api/models/catalog?kind=image|text`（`server/src/routes/models.ts`）：

```
image → data.models: [{ id(=逻辑模型id，即 logicalModelId), modelId, displayName, logicalCode,
                         capabilities: { resolutions: string[], aspectRatiosByResolution: Record<res, ratio[]>,
                                         maxReferenceImages: number, maxPromptChars: number },
                         pricing: Record<resolution, 积分/张>, kind: 'image' }]
text  → data.platform: [{ providerId, providerName(渠道展示别名，如 TA/CA), adapter,
                          models: [{ id(=渠道模型id，即 channelModelId), modelId, displayName, kind: 'text' }] }]
```

**文字 AI** `POST /api/canvas-ai/chat`（`server/src/routes/canvas-ai.ts`）：请求 `{ channelModelId: number, messages, temperature?, maxTokens?, images?: [{ mimeType, base64 }] }` → `data: { text }`。注意：服务端把 messages 拍平为纯文本，**图片必须走 images 字段**而非多模态 content。错误：400 缺参 / 404 模型不可用 / 500 上游错误（error 文案可直接展示）。不计积分。axios timeout ≥ 120s。

**生图** `POST /api/generations`（React 侧提交字段）：`{ logicalModelId: number, prompt, size: 宽高比, resolution, refImages: [{ url }]（React 侧已上传为站内 URL 后传入）, featureId: 'rf-canvas', n: 1..5 }` → `data: { taskNo, dbTaskId, tasks: [{ id, taskNo, status }], inputImageUrls }`。轮询 `GET /api/generations/:id/status` → `data: { status: 'queued'|'in_progress'|'completed'|'failed', progress, resultUrls: string[], errorMessage?, errorCode? }`。余额不足 → HTTP 402；失败自动退款为服务端既有行为。

**上传**：`GET /api/oss/mode` → `data: { mode: 'direct'|'oss', ossHost }`；direct → `POST /api/oss/upload`（FormData: file, scope='inputs'）→ `data: { objectKey, publicUrl: '/api/files/...' }`；oss → `POST /api/oss/upload-token` `{ filename, mimeType, sizeBytes, scope }` → `{ uploadUrl, objectKey, publicUrl, ossBucket, fields }` → 浏览器 PostObject（FormData = fields + file）。逻辑对齐 `src/services/ossApi.ts` 的 `upload()`。

## 8. 前端接线点

| 文件 | 改动 |
|---|---|
| `src/router/index.ts` | 增两条懒加载路由：`/rf-canvas` → `RfProjectsPage.vue`；`/rf-canvas/:projectId` → `RfEditorPage.vue`（meta：`title:'AI画布 Pro+'`、`requiresAuth`、编辑器加 `hideInMenu`） |
| `src/stores/tabs.ts` | `ROUTE_META_MAP['/rf-canvas'] = { title:'AI画布 Pro+', componentName:'RfCanvasProjects', ... }`；动态正则 `/^\/rf-canvas\/\d+$/` → `componentName:'RfCanvasEditor'`（照抄 `/flow-canvas/:id` 现有模式） |
| `src/components/SidebarMenu.vue` | 「AI生图」组「AI画布 Pro」之后增「AI画布 Pro+」 |
| `src/configs/featureConfig.ts` | `FEATURE_CONFIGS` 增 `'rf-canvas': { id:'rf-canvas', label:'AI画布 Pro+', imageSlots: [], hasUserPrompt: true, hasSupplementaryImages: false }` |
| `server/src/index.ts` | `app.use('/api/rf-canvas', rfCanvasRouter)` |

KeepAlive 生命周期映射（R1.3）：MainLayout 的 KeepAlive 按 componentName 缓存的是 Vue 壳；壳不销毁 ⇒ React 树存活；`onDeactivated` ⇒ 调 React 侧 flush 保存（经壳持有的句柄或自定义事件）；`onBeforeUnmount` ⇒ `root.unmount()`。编辑器页签标题更新走既有 `updateTabTitle` 模式（项目加载后改 title）。

## 9. 引擎移植规格（D4）

来源锚点（`src/modules/workflow/`，移植时以现场代码为准）：

| 目标（src/rf-canvas/engine/） | 来源 | 移植改造 |
|---|---|---|
| `graph.ts` topologicalSort | `engine/executor.ts:30-73`（Kahn 分层） | 原样 |
| `graph.ts` findAncestors / findDescendants | `engine/executor.ts:250-312` | 原样（runToCurrent / runFromCurrent 用） |
| `graph.ts` detectCycles | `engine/validator.ts:88-124` | 原样 |
| `graph.ts` resolveNodeInputs | `engine/basicRunner.ts:15-35` | 数据结构从 WorkflowModel 换 GraphJSON（edges 的 sourceHandle/targetHandle 即旧 sourcePortId/targetPortId） |
| `graph.ts` computeInputHash | `engine/executor.ts:142-155` | 原样（缓存键 = type+config+inputs） |
| `runner.ts` 层执行/失败终止 | `engine/executor.ts:314-339` | 原样（allSettled 层内并行） |
| `runner.ts` 重试 | `engine/executor.ts:12-13, 375-381` | RETRY=2、间隔 1s；本地校验错误不重试 |
| `runner.ts` 缓存复用/脏传播 | `engine/executor.ts:346-359` + `stores/workflowStore.ts:625-633` | 脏传播从 Pinia action 改 store 方法 |
| `runner.ts` 暂停/继续 | `engine/executor.ts:210-222, 330-335, 440-445` | 原样（层边界暂停） |
| `runner.ts` 软停止 | `engine/executor.ts:202-208` | 原样 + 生图轮询接受 AbortSignal，停止后不再发起下一次轮询 |
| 节点 run 逻辑 | `nodes/*/index.ts`（8 种） | 见下表替换依赖 |

必须剥离的依赖替换表：

| 旧依赖（Vue 侧） | 新实现（src/rf-canvas/） |
|---|---|
| `useModelCatalogStore()`（image-ai/text-ai） | `api.fetchImageCatalog()` / `fetchTextCatalog()`（模块级 60s 缓存；下拉直接用返回数组） |
| `generateImage()`（`src/services/imageGeneration.ts`） | `api.generateImage()`（自实现 submit+poll；refImages 只收 `{url}`，上传在上传时点已完成） |
| `canvasApi.chat()` | `api.chat()` |
| `canvasApi.addAsset()`（save 节点） | 删除 → 写 store 成果面板（D5） |
| RunnerCallbacks → Pinia store 写节点状态 | RunnerCallbacks → zustand store 方法 |
| `window.electronAPI`（`executor.ts:157-185` 死代码） | 不移植 |

## 10. 实施顺序（每步可独立验证）

1. **构建地基**：装依赖 + §4 配置 + `src/rf-canvas/` 放一个空壳 `<RfApp/>`（渲染占位文本）+ Vue 壳挂载/卸载。验证：`npm run check`、`npm run build`，产物断言 rf-vendor 独立 chunk 且主入口 chunk 未变大。
2. **后端**：schema 建表 + `rfCanvas.ts` 路由 + `index.ts` 挂载。验证：curl 六端点 CRUD/越权 404（可用 `MOMO_DB_PATH=/tmp/rf-test.db` 起独立实例，避免污染本机库）。
3. **接线 + 列表页**：router/tabs/SidebarMenu/featureConfig + `RfProjectsPage.vue` + `rfCanvasApi.ts`。验证：入口可见、CRUD 可用。
4. **React 骨架**：RfApp/FlowCanvas/NodeCard/store/自动保存 + `/rf-canvas/:id` 打开真实项目。验证：增删节点连线自动保存、重开恢复（R3/R8 核心）。
5. **节点系统**：registry + 8 节点（含配置面板、模型下拉联动、上传）。验证：R5 各节点配置面。
6. **引擎**：§9 移植 + 四模式运行 + 状态可视化。验证：R6/R7（text-ai 真实回环、image-ai 契约级）。
7. **UX 收尾**：撤销重做（D10）/多选复制粘贴/minimap 等 R4 项/lightbox/成果面板。
8. **验收**：跑 `docs/requirements/flow-canvas-reactflow-acceptance.md` 全量并回填结果。

## 11. 风险与检查点

- **manualChunks 包名漏配** → react 混入业务 chunk，违反 N1：步骤 1 的产物断言必须先过再继续。
- **tsconfig 全局 jsx 改动**：现仓库 0 个 .tsx（已核验），改动后 `npm run check` 全绿即证明无回归；若未来出现 Vue-tsx 组件需再评估。
- **keep-alive 与 React root**：壳的 `onBeforeUnmount` 必须 unmount，否则关页签泄漏整棵 React 树；`onDeactivated` 只 flush 不销毁。
- **上传只做了 direct**：生产 OSS 模式下必坏（当前生产即在 OSS 模式）——验收 A8 含双模式检查。
- **canvas-ai 拍平行为**：多模态图片误放 messages.content 会被丢弃，必须走 `images` 字段。
- **生图轮询阻塞**：单次 status 请求短超时即可，整体 6 分钟上限由轮询次数控制；停止用 AbortSignal 传到 fetch。
