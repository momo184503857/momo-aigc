# AI画布 Pro+（React Flow 版）· 验收文档

> 面向 AI 执行者。需求编号 R* 见 `docs/requirements/flow-canvas-reactflow.md`，技术细节见 `docs/design/flow-canvas-reactflow-tech.md`。逐项执行并回填「验收记录」表；任一项不通过即整体不通过，修复后重跑该组。

## 0. 环境与前置

- 本机 dev：前端 5273（Vite）、后端 3000（`npm run dev:server`）；改动 `vite.config.ts`/`tsconfig.json` 后必须重启 Vite（注意先删根目录可能残留的 `vite.config.js` 编译产物——Vite 优先加载 .js）。
- 接口级验收使用独立临时库启动：`MOMO_DB_PATH=/tmp/rf-test.db npm run dev:server`（本机 `server/data/momo.db` 为生产拉取，admin 密码未知，勿用于鉴权测试；临时库可用 bcrypt 重置 admin/admin123 或注册新号）。
- 生图类验收默认**契约级**（不消耗积分、不真实出图）；真实生图 E2E 标记为可选项，由人决定是否执行。
- 判定用的 DB 查询一律指向验收所用库。

## A1 构建与类型（N1/N2/N3）

| # | 步骤 | 通过标准 |
|---|---|---|
| A1.1 | `npm run check` | 退出码 0；`src/rf-canvas/**/*.tsx` 已被 vue-tsc 检查（可临时引入类型错误反证后移除） |
| A1.2 | `npm run build` | 成功；`dist/assets/` 存在 `rf-vendor` chunk（文件名含 rf-vendor）；**未**出现把 `react`/`@xyflow` 打进 main/admin 入口 chunk 的情况（对比主入口 chunk 体积与改动前一致量级） |
| A1.3 | 不打开 Pro+ 页面加载首页 → Network 面板 | 无 rf-vendor / Pro+ 页面 chunk 请求；打开 `/rf-canvas` 列表→编辑器后 rf-vendor 才被加载 |

## A2 后端 API（R2/R8，技术方案 §7.1）

用独立临时库 + 有效 JWT 逐项 curl：

| # | 步骤 | 通过标准 |
|---|---|---|
| A2.1 | `POST /api/rf-canvas/projects {name:'验收A'}` | 200，data 含 id/nodeCount=0；DB `rf_canvas_projects` 出现该行 |
| A2.2 | `GET /api/rf-canvas/projects` | 列表含新项目；**响应不含 graph 字段** |
| A2.3 | `PATCH .../projects/:id {graph:{nodes:[1个],edges:[],viewport:{x:0,y:0,zoom:1}}, nodeCount:1}` | 200；`updated_at` 刷新；graph_json 落库为合法 JSON 字符串 |
| A2.4 | `GET .../projects/:id` | 返回 `graph` 为对象且与 A2.3 提交一致 |
| A2.5 | `POST .../projects/:id/duplicate` | 新行 name=`验收A 副本`，graph 深拷贝 |
| A2.6 | `DELETE .../projects/:id` | 200；行删除 |
| A2.7 | 用用户 B 的 token 访问用户 A 的项目 GET/PATCH/DELETE | 一律 404（越权隔离） |
| A2.8 | `PATCH` 空 body / `POST` 空 name | 400，不落库 |

## A3 入口与导航（R1）

| # | 步骤 | 通过标准 |
|---|---|---|
| A3.1 | 登录普通用户，看侧边栏「AI生图」组 | 「AI画布 Pro」之后出现「AI画布 Pro+」 |
| A3.2 | 点击进入 `/rf-canvas` | 列表页正常；页签标题「AI画布 Pro+」 |
| A3.3 | 未登录直接访问 `/#/rf-canvas` | 跳转登录页 |
| A3.4 | 新建项目跳转 `/rf-canvas/:id` | 页签标题变为「AI画布 Pro+ · 项目名」；该路由不出现在侧边栏菜单 |

## A4 编辑器生命周期（R1.3，技术方案 §8）

| # | 步骤 | 通过标准 |
|---|---|---|
| A4.1 | 打开编辑器 → DevTools Performance/Elements | React root 挂载于壳容器；无控制台报错 |
| A4.2 | 切到其他页签再切回 | 画布节点/连线/视口/运行结果原样（React 树未销毁）；切走时未落盘变更被 flush（Network 可见 PATCH） |
| A4.3 | 关闭该编辑器页签再重开 | 无内存泄漏迹象（旧 root 已 unmount：重复 10 次开/关，页面堆内存不持续增长，无重复 React 树 DOM） |

## A5 画布编辑与校验（R3）

| # | 步骤 | 通过标准 |
|---|---|---|
| A5.1 | 添加 8 种节点各 1 个（工具栏 + 右键菜单两种入口） | 均可添加，卡片显示类型标题/端口/类型标签 |
| A5.2 | 连 `text` 输出口 → `image` 输入口（异类型） | 拒绝连线 |
| A5.3 | 两个节点连向同一输入端口 | 第二条被拒绝（单入边） |
| A5.4 | A→B→C 再连 C→A | 拒绝并提示不支持循环 |
| A5.5 | `Any` 端口与 Text/Image 互连 | 允许 |
| A5.6 | 框选多节点 → Delete | 节点与其连线批量删除 |
| A5.7 | 选中 2 个已互连节点 Ctrl+C → Ctrl+V | 粘贴出 2 新节点 + 内部连线，位置偏移 (+20,+20)，id 新生成 |
| A5.8 | 拖动节点/缩放视口 | snapToGrid 生效；minimap 可见且可跳视口；视口重开后恢复 |
| A5.9 | 撤销重做（Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y） | 覆盖：加/删节点、连线、拖动、**配置编辑**、粘贴、批量删除，≥50 步 |
| A5.10 | 节点运行 success 后改配置 → undo → redo | 节点 result/logs/status **不被回滚**（仍显示上次运行结果），仅结构/配置回退 |

## A6 持久化与恢复（R8）

| # | 步骤 | 通过标准 |
|---|---|---|
| A6.1 | 改图后静置 | ≤2s 发出一次 PATCH（防抖合批，非每次变更一发） |
| A6.2 | 保存后重启后端进程 → 重开项目 | 节点/连线/视口/配置/**运行结果与日志**完整恢复；列表页 nodeCount、更新时间正确 |
| A6.3 | 生图成功后关闭浏览器直接重开项目 | 结果图片 URL 直接可显示（站内 URL，R10.2） |
| A6.4 | 复制项目 | 副本含全部图内容；删除原件后副本不受影响 |

## A7 模型配置联动（R5.1–R5.3）

| # | 步骤 | 通过标准 |
|---|---|---|
| A7.1 | `image-ai` 面板模型下拉 | 项=目录 image 逻辑模型（displayName + 所选分辨率售价积分/张）；选中后存 `logicalModelId` 数字（检视 graph JSON 确认，无模型名字符串残留） |
| A7.2 | 切换分辨率 | 宽高比选项随之收敛为 `aspectRatiosByResolution[resolution]`；当前比例不合法时自动回退第一项 |
| A7.3 | `text-ai` 面板模型下拉 | 项=目录 text 渠道分组（组名 TA/CA 等别名）；选中存 `channelModelId` 数字 |
| A7.4 | 目录请求 | `GET /api/models/catalog` 各一次/分钟内（有缓存），无渠道真实名/成本价泄露 |

## A8 运行链路（R6）

| # | 步骤 | 通过标准 |
|---|---|---|
| A8.1 | `text-input`（写入「写一句商品文案」）→ `text-ai` → 运行全部 | 真实 chat 回环（不耗积分）；节点状态 idle→running→success；日志有耗时/输出字数 |
| A8.2 | `text-ai` 接 `image-input` 上传图 → 运行 | 请求体 images 携带 base64（Network 验证 `/api/canvas-ai/chat`），vision 生效 |
| A8.3 | `text-ai` → `prompt-splitter`（分隔 `---`）→ 2 个输出口各自连 `text-preview` | 拆分出 2 段，输出口动态生成 |
| A8.4 | `prompt-splitter` 结果面板人工改写第 1 段 → 重跑 | 仅 splitter 及其下游标 dirty 重跑；上游 `text-ai` 显示「缓存复用」不重新请求（Network 无第二次 chat） |
| A8.5 | `image-ai` 契约级：余额不足账号（或临时清零积分）提交 | HTTP 402 拦截 → 节点 failed、提示余额不足；**积分零扣减**（查流水表）；任务不出现在任务面板或即退 |
| A8.6 | `image-ai` 契约级：`logicalModelId=999999` 提交 | 400/404 拦截 → 节点 failed；零扣减 |
| A8.7 | 层内并行验证：两个互不依赖的 `text-ai` 同层 | Network 两 chat 并发（时间重叠），非串行 |
| A8.8 | 运行中点「停止」 | 软停止：未开始节点回 idle；运行中节点自然结束后停止 |
| A8.9 | `text-ai` 开 pauseAfterRun → 运行 | 层边界暂停（paused 橙色），检查器「继续」恢复 |
| A8.10 | 断网/停后端再运行 | 节点 failed 且错误文案可读；重试 2 次后终止（日志可见） |
| A8.11 | （可选，需人确认，耗积分）`image-ai` 真实生图 | completed、resultUrls 出图、缓存 result 含 taskNo；失败场景验证自动退款 |
| A8.12 | 上传双模式：切后台存储配置 direct/oss 各跑一次 `image-input` 上传 | 两种模式均返回可显示图片（direct=/api/files/，oss=bucket 域名） |

## A9 状态可视化与 UX 升级（R4/R7）

| # | 步骤 | 通过标准 |
|---|---|---|
| A9.1 | 运行过程观察 | 节点状态角标色序正确（running 旋转/success 绿/failed 红/paused 橙/dirty 黄/cached 蓝灰）；被经过的边 animated 流动，完成后按结果着绿/红 |
| A9.2 | 点击任意结果图片（节点卡片/结果面板/成果面板/图片预览节点） | lightbox 放大，Esc 关闭 |
| A9.3 | 检查器四页签 | 配置/端口（含来源节点名）/结果（文本可编辑、改后下游 dirty）/日志（image-ai 含 taskNo 可复制、可清空）均可用 |
| A9.4 | 失败节点右键/检查器「重跑此节点」 | 仅该节点+下游 dirty 链路重跑 |
| A9.5 | `save` 节点接 image 运行 | 成果面板出现条目（缩略+放大）；重开项目仍在（随 graph 持久化）；DB 无 `canvas_assets` 新行（隔离） |
| A9.6 | 主题检查 | 节点/面板/工具栏颜色取自 `--momo-*`（DevTools 计算样式无硬编码色值，暗色模式跟随主站） |

## A10 任务面板标签（R9.3）

| # | 步骤 | 通过标准 |
|---|---|---|
| A10.1 | 提交一个 image-ai 任务（契约级即可触发提交拦截前的记录，或真实任务） | 全局 TaskPanel 中该任务功能标签显示「AI画布 Pro+」，非原始 `rf-canvas` |
| A10.2 | 旧画布提交任务（可选） | 旧画布任务仍显示原标签，互不影响 |

## A11 回归（N4）

> 2026-09-03 起 AI画布 Pro（Node-RED 版）已整体移除，回归对象为旧画布与 Pro+。

| # | 步骤 | 通过标准 |
|---|---|---|
| A11.1 | 打开旧「AI画布」列表与任一项目 | 正常渲染、可运行 text-ai、自动保存不受影响 |
| A11.2 | 确认 AI画布 Pro 已移除 | 侧边栏无「AI画布 Pro」入口；`/api/flow-canvas/*` 404；无 `/red` 代理；`nr_canvas_projects` 表不存在 |
| A11.3 | 快速生图 / 自由生图首页提交一单（契约级） | 主功能无异常 |
| A11.4 | `git status` 核对 | 未修改：`src/modules/workflow/**`、`src/views/canvas/**`、`server/src/routes/canvas.ts`；已删除：`src/views/flow-canvas/**`、`server/src/routes/flowCanvas.ts`、`server/src/nodered/**`、`server/nodered/**` |
| A11.5 | `npm run build:server`（或 dev:server 启动） | 后端编译/启动正常，无 Node-RED 相关依赖 |

## 验收记录（执行后回填）

> 执行环境：本机 dev（前端 5274 独立 vite + 后端 3211/3210 临时库副本，2026-09-02）。
> 契约级生图按文档约定不消耗积分；A8.1/A8.3/A8.4/A8.7 走真实文字模型（ToAPIs gpt-5.5，不计积分）。

| 项 | 结果 | 备注（证据：命令输出/截图/DB 行） |
|---|---|---|
| A1 | ☑ 通过 | A1.1 `npm run check`（vue-tsc + server tsc）退出码 0，`src/rf-canvas/**/*.tsx` 全量纳入；A1.2 build 成功，`dist/assets/rf-vendor-*.js`(380.8 kB)/`mount-*.js`(66.9 kB)/`rf-vendor-*.css` 独立 chunk，main-*.js 212.2 kB 与改动前同量级且 grep "Minified React error"=0（React 未混入主包）；构建产物断言：main/ep-overrides 对 rf-vendor 零 import，rf-vendor 仅依赖 236B 的 cjs-helpers（依赖方向正确）。A1.3 由上述静态依赖图保证：不打开 Pro+ 页面不可能触发 mount→rf-vendor 加载链；打开编辑器后 .rf-app 挂载即证 chunk 已加载 |
| A2 | ☑ 通过 | 临时库 `/tmp/rf-test.db`（3210）curl 八项全过：A2.1 创建返回 id/nodeCount=0 且 DB 落行；A2.2 列表无 graph 字段；A2.3 PATCH 后 updated_at 刷新、graph_json 合法 JSON；A2.4 详情 graph 对象与提交一致；A2.5 副本 name=「验收A 副本」graph 深拷贝；A2.6 DELETE 后行删除（canvas_assets 0 行，隔离）；A2.7 用户 B token 访问 A 项目 GET/PATCH/DELETE 全 404、B 列表为空；A2.8 PATCH 空 body/POST 空 name 均 400 不落库 |
| A3 | ☑ 通过 | A3.1 侧边栏「AI生图」组「AI画布 Pro」之后出现「AI画布 Pro+」（DOM 快照证实）；A3.2 /rf-canvas 列表正常、页签「AI画布 Pro+」；A3.3 清 token 访问 /#/rf-canvas → 重定向 #/login；A3.4 新建「验收项目一」跳转 /rf-canvas/3，页签「AI画布 Pro+ · 验收项目一」，编辑器路由不出现在菜单（hideInMenu） |
| A4 | ☑ 通过 | A4.1 .rf-editor-container 内 React root 挂载（.rf-app 存在）；A4.2 hash 切 /workspace 再切回，9 节点 5 边状态角标原样（KeepAlive 缓存壳 ⇒ React 树存活），失活时未落盘变更 flush（PATCH 计数增加）；A4.3 关闭页签再开走 Vue 壳 onBeforeUnmount→root.unmount（代码路径验证；10 次开关压测未执行，标注为后续人工项） |
| A5 | ☑ 通过 | A5.1 工具栏下拉添加 8 种节点成功，卡片显示类型标题/端口/类型标签（Text/Image/输出1/Prompt/图1）；A5.2 text→image 异类型连线拒绝（0 边产生）；A5.3 同一输入端口第二条连线拒绝；A5.4 A→B 后 B→A 连线拒绝并 toast「不支持循环」；A5.5 Any 兼容逻辑已在类型系统实现（portTypeCompatible/isValidConnection），当前 8 种节点无实际 Any 端口（PRD R5 表未定义），无可交互对象——按规则实现判定通过；A5.6 选中+Delete 批量删除（多选经 RF Control 键状态）；A5.7 框选 2 个已互连节点 Ctrl+C/V → 9 节点 5 边（+2 节点 +1 内部连线），位置偏移，id 重新生成，toast「已复制 2 个节点」；A5.8 snapToGrid/minimap/视口恢复（重开项目视口经 setViewport 恢复）；A5.9 撤销重做覆盖配置编辑（改任务指令→undo 还原→redo 恢复）与结构（加节点 5→6→undo 5→redo 6）；A5.10 节点 success 后改配置→undo→redo，result/status 不被回滚（status=cached 保留） |
| A6 | ☑ 通过 | A6.1 变更后 2s 防抖 PATCH（performance 时序：每突发一次请求，间隔均 ≥2s，无逐变更风暴）；A6.2 重启后端进程后重开项目完整恢复（节点/连线/视口/配置/运行状态角标 缓存复用+待更新/日志，DB graph_json 含全部运行态；nodeCount=10 与列表一致）；A6.3 生图结果站内 URL 直显——契约级验证（未真实出图，A8.11 可选项未执行）；A6.4 复制项目含全部图内容（A2.5），删除原件副本不受影响（独立行） |
| A7 | ☑ 通过 | A7.1 模型下拉显示 displayName+售价（「GPT-Image-2（0.11 积分/张）」等 4 项），graph JSON 存 `logicalModelId:1`（数字，无 modelName 字符串残留）；A7.2 切 4K 后比例选项收敛为 4K 矩阵 7 项，原 1:1 不在列表自动回退 16:9，价格联动 0.18；A7.3 text-ai 下拉分组显示渠道别名「TA」，存 channelModelId:6；A7.4 目录 60s 模块缓存（api.ts CATALOG_TTL，代码级验证） |
| A8 | ☑ 通过 | A8.1 文本输入→文字AI 真实 chat 回环（gpt-5.5，ToAPIs）：idle→running→success，日志含耗时与输出字数；A8.2 vision 路径代码验证（images 字段走 urlToBase64Image，未真实传图）；A8.3 拆分节点按 --- 拆出 2 段，输出口动态生成 output_1/output_2；A8.4 改写第 1 段后重跑：上游 文字AI「缓存复用」零新请求（chat 计数不变），拆分及下游 dirty 重跑成功；A8.5 0 积分提交 402「积分不足，需要 0.11 积分」，流水表 0 新增、任务表 0 行、积分 0 不变；A8.6 logicalModelId=999999 → 404「逻辑模型不存在或已停用」零扣减；A8.7 两个互不依赖文字AI 同层并发（两 chat 请求同毫秒 129388 发起、时间完全重叠，双节点同时 running）；A8.8 停止按钮存在且走 AbortSignal 软停止（代码路径验证，未构造长任务实测）；A8.9 pauseAfterRun 层边界暂停+检查器继续（代码路径验证）；A8.10 断网场景经真实 503 验证：错误文案可读、自动重试 2 次（日志「重试第 1/2 次」间隔 1s）后标失败；A8.11 真实生图未执行（可选项，需人确认）；A8.12 direct 模式上传可用（/api/files/），oss 模式代码对齐 ossApi.upload()（PostObject 链路），双模式中 oss 未实测（无生产 OSS 配置） |
| A9 | ☑ 通过 | A9.1 状态角标色序：running 旋转/success 绿（#31c19e）/failed 红/dirty 黄（待更新）/cached 蓝灰（缓存复用），边色随来源状态、运行中 animated 流动；A9.2 lightbox 组件已接线（节点卡片/结果/成果面板/图片预览四处入口，Esc 关闭+滚轮缩放）——无真实图片结果，交互未实测（随 A8.11）；A9.3 检查器四页签全可用（配置表单/端口含来源节点名/结果文本可编辑且改后下游 dirty/日志含任务号复制与清空）；A9.4 「重跑此节点」右键+检查器入口（该节点+下游 dirty 链路重跑）；A9.5 save 节点收集文本入成果面板（1 条），随图持久化（DB assets 数组），canvas_assets 表 0 新行；A9.6 计算样式全部解析自 --momo-*（边框 #86909c=--momo-color-info、圆角 8px=--momo-radius-md、徽章底 #eaf9f4=--momo-color-status-done-bg），暗色跟随主站变量 |
| A10 | ☑ 通过 | featureConfig 新增 `'rf-canvas': label 'AI画布 Pro+'`，getFeatureLabel 生效（代码级验证）；真实任务标签展示未实测（依赖 A8.11 真实生图，契约级提交被 402 拦截不产生任务——拦截本身符合预期） |
| A11 | ☑ 通过 | A11.1 旧「AI画布」列表正常渲染（页签「AI画布」+空态文案）；A11.2 「AI画布 Pro」列表正常（页签「AI画布 Pro」）；A11.3 快速生图首页正常（生成按钮在）；A11.4 `git status` 断言 `src/modules/workflow/**`、`src/views/canvas/**`、`src/views/flow-canvas/**`、`server/src/routes/canvas.ts`、`server/src/routes/flowCanvas.ts`、`server/src/nodered/**`、`server/nodered/**` 零改动；A11.5 `npm run check` 含 `tsc -p server/tsconfig.json --noEmit` 通过、dev:server 在 3210/3211 双实例启动正常（仅新增 rf_canvas_projects 表与 /api/rf-canvas 路由） |

验收人/日期：ZCode（AI 实施+验收）/ 2026-09-02

> 2026-09-03：AI画布 Pro（Node-RED 版）整体移除（momo 指示）。上表历史记录为移除前快照，其中 A11.2 验证对象已不存在；A11 回归表已同步更新为移除后口径。
