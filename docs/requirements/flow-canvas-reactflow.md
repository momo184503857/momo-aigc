# AI画布 Pro+（React Flow 版）· 产品需求文档

> 状态：需求已定稿，待实施。本文档面向 AI 实施者，非人类阅读材料——所有需求均为可判定语句，验收项与 `docs/requirements/flow-canvas-reactflow-acceptance.md` 的编号一一对应。实施技术细节见 `docs/design/flow-canvas-reactflow-tech.md`。

## 1. 定位

「AI画布 Pro+」是本产品的画布入口之一，基于 React Flow（`@xyflow/react`）以页面内嵌 React 根（React island）方式实现。与旧画布**并存且互不影响**（注：曾存在的第二套画布「AI画布 Pro（Node-RED 版）」已于 2026-09-03 整体移除，可追溯 git 提交 65c0e2f；其表 `nr_canvas_projects`、路由 `/flow-canvas`、`/red` 代理均已删除）：

| 维度 | AI画布（旧） | AI画布 Pro+（本文档） |
|---|---|---|
| 技术 | vue-flow 自研 workflow 模块 | React Flow（React island） |
| 执行位置 | 前端页面内引擎 | 前端页面内引擎（自旧画布移植） |
| 数据表 | `canvas_projects` | `rf_canvas_projects`（新建） |
| 入口路由 | `/canvas-projects` + `/ai-canvas/:id` | `/rf-canvas` + `/rf-canvas/:projectId` |

- 执行语义**对齐旧画布**：无环 DAG、拓扑分层、层内并行、失败即停、结果缓存、脏传播（见 §R6）。
- 差异化在 **UX 全面升级**（见 §R4、§R7、§R8）：补齐旧画布已知的体验短板。
- 旧画布与 AI画布 Pro 代码**零改动**（验收回归项 A11）。

## 2. 用户流程

1. 侧边栏「AI生图」组，「AI画布 Pro」之后出现「AI画布 Pro+」→ 进入项目列表页 `/rf-canvas`。
2. 新建项目（名称必填 ≤50 字）→ 跳转编辑器 `/rf-canvas/:projectId`。
3. 编辑器内：从工具栏/右键菜单添加节点 → 连线（端口类型校验）→ 在检查器配置节点 → 顶部工具栏「运行」。
4. 运行过程中节点实时显示状态、边高亮流动；`text-ai` 真实调用文字模型，`image-ai` 走主站统一生图（预扣积分、失败自动退款，服务端规则原样继承）。
5. 图的任何变更 2 秒防抖自动保存；切页/失焦强制落盘；重开项目完整恢复（节点、连线、视口、运行结果、日志）。
6. 生成结果：节点卡片缩略图 + 检查器结果面板 + 点击放大 lightbox；`save` 节点收集产出进项目「成果面板」。

## 3. 功能需求

需求编号 R1–R10，每条为验收判定单位。

### R1 入口与导航

- R1.1 侧边栏「AI生图」组新增菜单项「AI画布 Pro+」，位于「AI画布 Pro」之后，图标沿用同组风格。
- R1.2 路由 `/rf-canvas`（项目列表，菜单可见）与 `/rf-canvas/:projectId`（编辑器，`hideInMenu`），均为登录态路由。
- R1.3 编辑器页签（tabs）标题显示「AI画布 Pro+ · 项目名」，随项目切换更新；keep-alive 语义：切走再切回，画布状态（React 树）不丢失。

### R2 项目管理（列表页）

- R2.1 列表展示：色板缩略（名称 hash → 预设色板，与旧画布同规则）、项目名、节点数（nodeCount）、相对更新时间（刚刚/N 分钟前/N 小时前/N 天前，超 30 天显示日期）。
- R2.2 操作：新建（弹窗，仅名称必填）、重命名、复制（生成「{原名} 副本」，图内容随副本）、删除（危险确认弹窗，不可恢复）。
- R2.3 空态：无项目时显示引导文案 + 新建入口。
- R2.4 项目数据完全隔离在 `rf_canvas_projects` 表，不读写 `canvas_projects`（旧画布表）。

### R3 画布编辑

- R3.1 节点添加：工具栏「添加节点」下拉 + 画布右键菜单（鼠标处弹出），节点类型见 §R5。
- R3.2 连线规则（与旧画布一致）：
  - 端口数据类型 `Text` / `Image` / `Any`，`Any` 兼容所有类型，其余必须同类型；
  - 目标输入端口最多 1 条入边（不允许多源汇聚）；
  - 成环拒绝：产生环的连线即时拒绝并提示「不支持循环」。
- R3.3 节点选中（单击）、多选（Shift+框选 / Ctrl+点选）、拖动（结束时记一次撤销步）。
- R3.4 删除：Delete/Backspace 删除选中节点与连线（支持多选批量）。
- R3.5 复制粘贴：Ctrl+C/V 支持多节点（连同被复制节点之间的内部连线），粘贴位置偏移 (+20, +20)，新节点 id 重新生成。
- R3.6 撤销/重做：Ctrl+Z / Ctrl+Shift+Z（Ctrl+Y 等价），历史 ≥50 步，**必须覆盖**：节点/连线增删、节点位置拖动、配置编辑（旧画布明确不覆盖配置编辑，属本需求修复项）、批量删除、粘贴。
- R3.7 撤销/重做**不得回滚**运行态：历史快照剥离节点的 `result` / `logs` / `status`（旧画布 undo 会连带回滚运行结果，属本需求修复项）。
- R3.8 视口：滚轮缩放（min 0.25 / max 1.5）、拖拽平移、「适配视图」按钮、视口位置随图持久化。

### R4 画布视觉升级（旧画布全无，逐项验收）

- R4.1 MiniMap 缩略导航（右下角，可交互跳转视口）。
- R4.2 Controls 控制条（放大/缩小/适配/锁定）。
- R4.3 背景网格（点阵）。
- R4.4 snapToGrid 吸附（拖动节点/连线时对齐网格）。
- R4.5 视觉规范：节点卡片、面板、工具栏全部消费 `--momo-*` CSS 变量（与主站主题一致），禁止硬编码颜色/圆角/阴影。

### R5 节点规格（8 种，语义对齐旧画布 `src/modules/workflow/nodes/`）

通用约定：每个节点有 `title`（默认取类型名，可改）、状态角标（§R7）、检查器配置面板。端口类型标注在连线两端。

| # | 类型 | 输入端口 | 输出端口 | 关键配置 | 运行行为 |
|---|---|---|---|---|---|
| 1 | `text-input` 文本输入 | — | `text: Text` | 正文多行文本 | 输出文本；结果面板可人工编辑，编辑后下游标 dirty |
| 2 | `image-input` 图片输入 | — | `image: Image` | 图片上传（多张，受所选参考上限约束；默认上限 14） | 上传即刻经统一上传落站内存储（direct `/api/files/` 或 oss bucket URL），**不存 base64 进图 JSON**；输出图片列表 `{url, fileName}[]` |
| 3 | `text-ai` 文字 AI | `text: Text`(可选) + `image: Image`(可选，作 vision 输入) | `text: Text` | `channelModelId`（数字 id，见 §R9）、任务指令 taskPrompt、补充指令 detailPrompt、temperature/maxTokens（可选）、运行后暂停 pauseAfterRun | 按 `[Task]/[Details]/[Upstream text]` 结构拼 prompt；有图时图片走 `images` 参数（多模态）；调 `/api/canvas-ai/chat`；**不计积分**；空返回视为失败 |
| 4 | `prompt-splitter` 提示词拆分 | `text: Text` | 动态 `output_1..N: Text` | 分隔符（默认 `---`）、剥除 `<think>` 块开关（默认开）、pauseAfterRun | 按分隔符拆成 N 段，动态生成 N 个输出口；支持人工改写各段（editedOutputs），改写后下游标 dirty |
| 5 | `image-ai` 图片 AI | `prompt: Text`(必填) + `image_1..N: Image`(可选，N 动态=已连参考图数，上限=所选逻辑模型 `capabilities.maxReferenceImages`) | `image: Image` | `logicalModelId`（数字 id）、宽高比 aspectRatio、分辨率 resolution（两者按目录 `aspectRatiosByResolution` 联动约束）、张数 n(1–5) | 提交 `POST /api/generations`（`featureId:'rf-canvas'`）后阻塞轮询 `/status`（3s×120，上限 6 分钟）；预扣 `sale_pricing[resolution] × n` 积分，失败/超时自动全额退款（服务端继承）；输出图片列表 + taskNo |
| 6 | `text-preview` 文本预览 | `text: Text` | `text: Text` | — | 透传并展示文本 |
| 7 | `image-preview` 图片预览 | `image: Image` | `image: Image` | — | 透传并展示缩略图；点击放大 lightbox |
| 8 | `save` 保存 | `image: Image` 或 `text: Text`（至少接一个） | — | — | 收集输入图片/文本写入本项目「成果面板」条目（前端态，随图持久化）；**不写** `canvas_assets` 表（避免与旧画布项目 id 序列混用） |

补充规则：

- R5.1 `image-ai` 的模型下拉显示逻辑模型 `displayName` 与所选分辨率售价（积分/张），**存储数字 id**（`logicalModelId`），不得存模型名字符串（旧画布存名字、改名/下架即静默失效，属本需求修复项）。
- R5.2 `text-ai` 模型下拉来自文字目录（渠道分组），存储 `channelModelId` 数字 id。
- R5.3 分辨率变更时若当前宽高比不在 `aspectRatiosByResolution[resolution]` 内，自动回退到该分辨率第一个可用比例。
- R5.4 「成果面板」：编辑器内可开合的面板，列出本项目所有 save 节点产出（图带缩略/点击放大，文带复制），清空按钮。

### R6 执行引擎语义（对齐旧画布，验收按此判定）

- R6.1 执行前校验：成环拒绝；`image-ai` 缺 prompt、必填配置缺失等本地校验失败直接终止并标注错误节点，不发起任何网络请求。
- R6.2 调度：Kahn 拓扑分层；**层内节点并行**（Promise.allSettled），**层间顺序执行**。
- R6.3 四种运行模式：运行全部、运行到选中（含其全部上游）、从选中继续（含其全部下游）、单节点运行（仅该节点）。
- R6.4 失败即停：任一节点失败（含重试耗尽）终止本次运行，失败节点标红并给出可读错误；下游不执行。修复后可「重跑此节点」（该节点 + 下游 dirty 链路重跑）。
- R6.5 失败重试：网络/上游类错误自动重试 2 次（间隔 1s）；本地校验类错误不重试。
- R6.6 结果缓存：节点（类型+配置+输入）hash 未变且上次 `success` 时跳过重跑，状态显示「缓存复用」；任何输入/配置变化使该节点及下游标 dirty，dirty 节点运行时重跑。
- R6.7 暂停/继续：`pauseAfterRun`（text-ai / prompt-splitter）在层边界暂停，状态 `paused`，检查器提供「继续」。
- R6.8 停止：软停止（置标志，当前阻塞中的调用自然结束后停止，未开始节点回到 idle）。
- R6.9 刷新/关闭页面即中止本次运行（引擎在页面内，无服务端编排）；已完成节点的结果与日志保留在图中。

### R7 运行状态可视化

- R7.1 节点状态角标/边框色：`idle` 灰、`running` 主题色+旋转、`success` 绿、`failed` 红、`paused` 橙、`dirty` 黄、`cached` 蓝灰。
- R7.2 边状态：执行经过时流动动画（animated）；来源节点 success 后着绿、failed 后着红（旧画布定义了状态色但从未使用，属本需求修复项）。
- R7.3 检查器四页签：配置 / 端口（输入端口 + 来源节点）/ 结果（文本可编辑、图片缩略+放大）/ 日志（终端风格，按时间列出 info/warn/error，`image-ai` 日志含 taskNo 且可一键复制，支持清空）。
- R7.4 图片 lightbox：节点卡片缩略图、结果面板、成果面板、图片预览节点中的图片均可点击放大（遮罩层，滚轮缩放，Esc 关闭）。
- R7.5 运行期间工具栏显示运行中状态，「运行」按钮变「停止」。

### R8 持久化

- R8.1 自动保存：图变更后 **2s 防抖** PATCH 全量 graph（旧画布为 30s 定时全量 PUT 无 dirty 判断，属本需求修复项）；切路由（keep-alive 失活）/`beforeunload` 时强制 flush 未落盘变更。
- R8.2 graph 内容：节点（含位置、配置、**运行结果与日志**）、连线、视口，一并提供 nodeCount。
- R8.3 恢复：重新打开项目，以上全部完整还原；列表页 nodeCount 与更新时间正确。
- R8.4 复制项目 = 复制完整 graph（含结果）；删除项目不可恢复（确认弹窗）。

### R9 模型选择与计费

- R9.1 模型目录来源 `GET /api/models/catalog`（登录态）：`kind=image` 为逻辑模型平铺（统一售价 `pricing[resolution]`，积分/张；不暴露渠道），`kind=text` 为渠道分组（`id` 即 `channelModelId`；分组名为渠道展示别名如 TA/CA，非真实渠道名）。
- R9.2 生图计费完全继承服务端：提交即预扣 `售价 × n`，余额不足返回 402 → 节点失败并提示余额不足；全部失败自动退款；实际命中渠道对用户不可见（统一售价，不补差不退差）。
- R9.3 生图任务进入主站任务面板（全局 TaskPanel），`featureId='rf-canvas'` 显示标签「AI画布 Pro+」（旧画布显示原始 `canvas` 无中文名，属本需求修复项，仅对新画布生效）。
- R9.4 文字 AI 不计积分（现状继承）。

### R10 图片上传

- R10.1 上传统一入口遵循存储双模式：`GET /api/oss/mode` 为 `direct` 时 `POST /api/oss/upload`（FormData，返回 `/api/files/...` 站内 URL）；为 `oss` 时取 upload-token 后浏览器 PostObject 直传 bucket。**两种模式必须都实现**（生产当前运行 OSS 模式）。
- R10.2 参考图/图片输入上传后持久为站内 URL 存入图 JSON；旧图 URL 重开项目直接可显示。

## 4. 非功能需求

- N1 React 代码独立懒加载 chunk：未访问 Pro+ 页面时主包与既有页面 chunk 不引入 react/react-dom/@xyflow（构建产物断言，验收 A1）。
- N2 全部 React `.tsx` 纳入 `npm run check`（vue-tsc）类型检查，`npm run build` 通过。
- N3 样式只用 `--momo-*` 变量与既有 token；不引入 UI 组件库（Pro+ 面板用原生元素自绘）。
- N4 不修改旧画布（`src/modules/workflow/`、`src/views/canvas/`）任何文件；后端仅新增（表 + 路由文件 + index.ts 挂载），不修改既有路由行为。
- N5 不新增除 §技术方案依赖清单之外的依赖。

## 5. v1 边界（明确不做）

- 循环 / 条件分支 / 多源汇聚入边（拓扑仍拒绝环，目标端口仍单入边）。
- 后端编排执行（引擎在前端页面内，刷新即停）。
- 多人协作、评论、分享。
- 子流程 / 分组框 / 注释节点。
- 旧画布与 Pro 项目数据迁移或互通。
- 素材库（canvas assets）浏览 UI。

## 6. 关联文档

- 技术方案：`docs/design/flow-canvas-reactflow-tech.md`（架构决策、目录、表结构、API 契约、实施顺序）
- 验收文档：`docs/requirements/flow-canvas-reactflow-acceptance.md`（A1–A11 对应 R1–R10 + 回归）
- 参考现状：旧画布功能 `docs/requirements/canvas.md`；模型路由 `docs/requirements/model-routing.md`
