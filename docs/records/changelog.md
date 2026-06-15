# Changelog

按时间倒序记录功能层面的变更。

---

## 2026-06-15 — 积分与 Key 计费体系（用户自带 Key + 新积分双单位）

### 背景

原系统只有「管理员共享 Key + 积分（实为元）」一种模式，且「积分」「元」1:1 混用、与 ToAPIs `credits` 撞名。两轮改动合并落地一套完整的计费体系：① 允许用户自带 Key（不消耗平台积分）；② 计费统一为「新积分」（1 新积分 = ¥0.035），元作为副单位展示。权威需求见 `docs/requirements/billing.md`。

### 变更

- **用户自带 Key（改动一）**：新增 `user_toapis_keys` 表（AES-256-GCM 服务端加密存储）、`/api/me/toapis/*` 端点（key-config / key / key-mode / test / balance）、`resolveUserApiKey(userId)` 按用户解析 Key；`toapis-proxy` 的 create-task / task-status / upload 改用解析到的 Key；`/api/toapis/health` 增返 `personalKeyConfigured` / `personalKeyActive`。`POST /api/tasks` 个人模式 `cost=0` 跳过余额校验/扣减/流水，仍写任务记录。前端 `serverStatus` 增 `canGenerate` / `usingPersonalKey`；新增 `/settings` 页（个人 Key 配置 + 模式切换）；9 处生成开关、6 处价格文案、4 处批量余额校验按个人模式放宽/隐藏。
- **新积分体系（改动二）**：存储与扣费统一改为「新积分」。`pricing.ts` + `adapter.ts` 定价改整数（3/4/5/10/20，2.5-flash=2.4）；`calculateCost`/扣费逻辑零改动（语义跟随列）。一次性幂等迁移 `migration_credits_v1`（`×200/7`）转换 `users.points` / `points_transactions` / `generation_tasks` 历史数据（`toapis_balance_history` 不迁）。新增 `credits.ts`（常量 + 换算 + `fetchKeyCredits` 占位）、`/api/me/quota` 聚合端点、前端 `formatCredits()` 统一双显、21 处展示统一改写。新增 `/my-quota`、`/pricing` 两页 + 头像下拉入口。
- **顺手修复**：`BatchSpreadsheetPage` 按钮缺失的 `usingPersonalKey` 分支；`AdminToApisKey` / `UserSettingsPage` 的 ToAPIs `credits` 文案「积分」→「credits」避免与新积分撞名。
- **安全**：新增 env `ENCRYPTION_KEY`（缺失时从 `JWT_SECRET` HKDF 派生兜底，不破坏已有部署）。

### 边界（维持现状）

- 计费在任务创建时扣除，**失败不退款**（与买家秀一致）。
- `canvas-ai` 文字模型不接入个人 Key。
- Key 的「新积分」由独立上游接口提供，**待接入**（当前 `fetchKeyCredits()` 占位返回 ToAPIs CNY，标注「新积分待接口」）。

### 涉及文件

| 文件 | 变更 |
|------|------|
| `server/src/utils/credits.ts` | 新增 — 换算常量 + `fetchKeyCredits` 占位 |
| `server/src/utils/crypto.ts` | 新增 — AES-256-GCM 加解密 |
| `server/src/utils/toapis.ts` | `createTask/getTaskStatus/uploadImage/getBalance` 加可选 `apiKey`；`resolveUserApiKey` |
| `server/src/utils/pricing.ts` | 定价改新积分整数 |
| `server/src/routes/me-toapis-key.ts` | 新增 — 用户 Key CRUD/test/balance |
| `server/src/routes/me.ts` | 新增 `GET /quota` |
| `server/src/routes/toapis-proxy.ts` | 按用户取 Key；`/health` 增字段 |
| `server/src/routes/tasks.ts` | 个人模式 cost=0 分支 |
| `server/src/db/schema.ts` | `user_toapis_keys` 表 + `migration_credits_v1` 迁移 |
| `server/src/config.ts` / `.env.example` | `ENCRYPTION_KEY` |
| `src/types/adapter.ts` | 定价改新积分 + `formatCredits` / `creditsToYuan` |
| `src/stores/serverStatus.ts` | `canGenerate` / `usingPersonalKey` |
| `src/services/{userKeyApi,pointsApi}.ts` | 用户 Key API + `getMyQuota` |
| `src/views/user/{UserSettingsPage,MyQuotaPage,PricingPage}.vue` | 新增三页 |
| `src/components/{SidebarMenu,GenerationForm,FeatureForm,PhotographyForm,TaskPanel}.vue`、`src/views/tools/Batch*.vue`、`src/views/buyer-show/MakeBuyerShowPanel.vue`、`src/views/admin/*` | 展示统一 `formatCredits` 双显 + 个人模式分支 |
| `src/router/index.ts` | `/settings` `/my-quota` `/pricing` |

### 数据库变更

- 新表 `user_toapis_keys`（user_id PK, encrypted_key, key_iv, key_tag, key_hint, use_personal_key, encryption_version, timestamps）。
- 一次性迁移：`users.points` / `generation_tasks.{points_cost,points_balance_after}` / `points_transactions.{amount,balance_after}` ×(200/7)（`system_config.migration_credits_v1` 守卫）。

---

## 2026-06-15 — AI 生图模块重构为三层架构（高内聚低耦合）

### 背景

AI 生图逻辑此前散落多处：6 个调用方绕过统一入口直接调 `toapisClient.createTask` + `taskApi.create`；轮询逻辑 4 处各自实现（间隔/策略不一）；`importResultUrls` 重复实现 4 份；`buildRequestBody` 在两个文件重复。目标：改一处全局生效，未来各页面只复用函数不重写。

### 变更

- **核心模块** `src/services/imageGeneration.ts` 拆出分步函数：`submitTask`（上传+建任务+写DB）/ `pollTask`（阻塞式轮询，默认 4s×150 次 / 10min 超时）/ `importResultUrls`（逐张转存，单张失败跳过）；`generateImage(params, {poll, import})` 作为高层一键封装。
- **适配器** `src/adapter/toapisClient.ts` 删除重复的 `buildRequestBody`，`createTask` 改为直接接受已构建请求体。
- **UI 层** `useTaskManager.ts`、6 个调用方（工作台/AI摄影/工作流节点/买家秀/批量换衣/换姿势/批量表格）全部迁移到统一入口，删除各自的轮询与 OSS 转存重复实现。
- **删除 deprecated 参数**：`GenerateImageParams` 的 `imageUrls` / `tempImageFiles` / `templateUrls` 一步到位移除，统一用 `refImages`。
- **新增端到端回归测试** `scripts/image-gen-tests/`（真实跑 ToAPIs/OSS，覆盖自由生图、批量换衣共享图不重复上传、买家秀行级轮询、generateImage DB 终态写入）。

### 修复（测试中发现）

- `generateImage` 成功时 DB 写入原被耦合在 `import` 选项里：`generateImage(p, {poll:true})`（不传 import）即使轮询成功，DB 也卡 `submitted`。改为成功无条件写 `completed`、失败/超时无条件写 `failed`，二者对称，DB 总达终态。
- 批量换衣/换姿势：共享衣服图（或模特图）被循环内每次 `submitTask` 重复上传 N 次。改为循环外用 `uploadImage` 解析一次复用 `{url}`。
- `importResultUrls` 单张转存失败即整体抛出，丢失已转存图且 DB 卡死。改为逐张容错。
- `pollTask` 默认 `maxAttempts`/`timeout` 为 `Infinity`，裸 `poll:true` 可能死循环。改为有限默认。

### 行为变化（待确认）

- **买家秀主图** 原直接把阿里 CDN URL 传给 ToAPIs（服务端拉取），现经 `submitUrl` 浏览器端下载后转传到自有 OSS。更可靠但批量时延迟增加、CORS 失败时回退原始 URL。详见 `docs/todo.md`。

### 涉及文件

| 文件 | 变更 |
|------|------|
| `src/services/imageGeneration.ts` | 三层 API，删除 deprecated 参数 |
| `src/adapter/toapisClient.ts` | 删 `buildRequestBody`，`createTask(body)` |
| `src/composables/useTaskManager.ts` | 改用核心模块函数，剥离生图逻辑 |
| `src/modules/workflow/nodes/image-ai/index.ts` | 用 `generateImage({poll,import})` 一键调用 |
| `src/views/buyer-show/MakeBuyerShowPanel.vue` | 统一入口，保留 5s 快速失败重试 |
| `src/views/tools/Batch{Clothes,Pose,Spreadsheet}SwapPage.vue` | 用 `submitTask`，共享图循环外上传 |
| `src/views/{workspace,photography}/*.vue`、`src/components/{Generation,Feature}Form.vue` | 参数签名跟随 `refImages` 化 |
| `scripts/image-gen-tests/` | 新增回归测试套件 |

---

## 2026-06-14 — AI 买家秀（素材库 + 制作买家秀）

### 新增

- **AI 买家秀页面**（`/buyer-show`）：在「AI生图」菜单组下新增页面，顶部两个 Tab：
  1. **素材库**（本会话实现·已验证）：管理员维护「图 + 提示词 + 标签」案例库；普通用户查看、放大、复制提示词。支持网格/列表（默认网格）、标签筛选、多选、批量上传（整批共用一组标签）、编辑（提示词/标签/替换图片）、批量软删、多选一键复制多条提示词（`\n` 拼接，表格粘贴每条一格）、右下角通用分页。
  2. **制作买家秀**（已实现·构建通过·待端到端验证）：从 Excel（商品ID/主图链接/提示词）批量生图，默认比例 9:16、张数 1，`feature_id='buyer-show'` 复用 `generation_tasks`；批次持久化到 `buyer_show_batch_items`，支持对比弹窗、按商品ID 打包 zip、**提交后 5s 内失败自动重试（上限 2）**。
- **OSS `materials` scope**：`utils/oss.ts` / `routes/oss.ts` / `services/ossApi.ts` 新增上传作用域，OSS key 前缀 `materials/<userId>/...`。
- **`useClipboard` 组合式函数**：抽取剪贴板复制（Clipboard API + 隐藏 textarea 兜底），供素材库复用。
- **`npm run check`**：新增脚本，前端 `vue-tsc -b` + 服务端 `tsc --noEmit` 类型检查。

### 权限

- 素材库：管理员 CRUD（`/api/admin/buyer-show`，`authMiddleware + adminMiddleware`）；普通用户只读（`/api/buyer-show`）。公开 GET 仅返回公开列，不泄漏 `created_by/original_filename`。

### 图片流量约束（硬性）

- 素材图片**浏览器直传 OSS**（`ossApi.upload` → `POST /api/oss/upload-token` 仅签 policy，不收字节）；展示/放大直连 OSS public URL。禁用经服务器的 multer 上传与下载代理。详见 `docs/records/decision-log.md`。

### 涉及文件

| 文件 | 变更 |
|------|------|
| `src/views/buyer-show/BuyerShowPage.vue` | 占位页改为 `el-tabs` 外壳（制作买家秀 + 素材库） |
| `src/components/buyer-show/MaterialLibrary.vue` | 新增 — 素材库主面板 |
| `src/components/buyer-show/MaterialCard.vue` | 新增 — 素材卡片（网格/列表） |
| `src/components/buyer-show/MaterialUploadDialog.vue` | 新增 — 批量上传弹窗 |
| `src/components/buyer-show/MaterialEditDialog.vue` | 新增 — 编辑弹窗（含替换图片） |
| `src/components/buyer-show/MaterialTagInput.vue` | 新增 — 标签选择（allow-create） |
| `src/services/buyerShowApi.ts` | 新增 — 素材库 API（公开 + 管理员） |
| `src/composables/useClipboard.ts` | 新增 — 剪贴板复制 |
| `src/views/buyer-show/MakeBuyerShowPanel.vue` | 新增（用户） — 制作买家秀面板 |
| `src/services/buyerShowBatchApi.ts` | 新增（用户） — 批量制作 API |
| `server/src/routes/buyerShow.ts` | 新增 — 素材库双路由（公开只读 + 管理员 CRUD） |
| `server/src/routes/buyerShowBatch.ts` | 新增（用户） — 批量制作路由 `/api/buyer-show-batch` |
| `server/src/db/schema.ts` | 修改 — 新增 `buyer_show_tags` / `buyer_show_materials` / `buyer_show_material_tags` / `buyer_show_batch_items` |
| `server/src/index.ts` | 修改 — 挂载三条新路由 |
| `server/src/utils/oss.ts` `server/src/routes/oss.ts` `src/services/ossApi.ts` | 修改 — 新增 `materials` scope |
| `src/router/index.ts` `src/components/SidebarMenu.vue` | 修改 — 新增 `/buyer-show` 路由与菜单项 |
| `package.json` | 修改 — 新增 `check` 脚本 |

### 数据库变更

- `buyer_show_tags`：id, name(UNIQUE), sort_order, created_at（全局标签）
- `buyer_show_materials`：id, oss_bucket, oss_object_key, public_url, prompt(必填), original_filename, mime_type, size_bytes, width, height, status(默认 active，软删), sort_order, created_by(FK users), created_at, updated_at, deleted_at
- `buyer_show_material_tags`：material_id(FK cascade), tag_id(FK cascade), 复合主键
- `buyer_show_batch_items`：id, user_id, batch_id, product_id, main_image_url, prompt, task_id, toapis_task_id, status, progress, error_message, sort_order, created_at, updated_at（制作买家秀模块；`model/resolution/result_image_urls` 等展示字段由 `GET /items` 左联 `generation_tasks` 取得，非本表列）

---

## 2026-06-07/08 — AI摄影功能

### 新增

- **AI摄影页面**（`/photography`）：在"AI生图"菜单组下新增独立页面。核心流程：
  1. 用户上传最多 10 张参考图（图片池，标记图一~图十，可拖拽排序）
  2. 将图片拖拽到管理员配置的"元素"（人脸、姿势、衣服、配饰、背景等）
  3. 同一张图可拖到多个元素（如全身照同时作为姿势和衣服参考，图片池中保留副本语义）
  4. 选择模型/分辨率/宽高比/数量，输入提示词，点击生成
- **AI摄影配置管理页**（`/admin/photography`）：管理员可增删改查元素，设置每元素最大图片数，为每元素×每模型独立配置 system_prompt
- **摄影任务与全局任务列表共用**：`feature_id='ai-photography'`，任务出现在与生图工作台相同的 TaskPanel 中，支持功能筛选
- **Prompt 自动拼接（方案 B）**：每个元素独立 system_prompt，生成时按 sort_order 拼接，自动附加"参考图映射"描述段告知 AI 第几张图对应哪个元素。图片去重：一图多元素引用时只发一次给 API
- **重新编辑**：从任务列表点击"重新编辑"可还原图片池和元素分配（通过 supplementaryImages 字段反向恢复）
- **重新生成**：AI摄影任务支持直接重新生成（复用已存 prompt + 图片 URL）

### 涉及文件

| 文件 | 变更 |
|------|------|
| `src/views/photography/PhotographyPage.vue` | 新增 — 主页面 |
| `src/components/PhotographyForm.vue` | 新增 — 核心表单（图片池、元素拖放、prompt 构建） |
| `src/views/admin/AdminPhotography.vue` | 新增 — 管理后台 |
| `src/services/photographyApi.ts` | 新增 — API 调用封装 |
| `server/src/routes/photography.ts` | 新增 — 公开 API |
| `server/src/routes/admin/photography.ts` | 新增 — 管理 API |
| `server/src/db/schema.ts` | 修改 — 新增 photography_elements / photography_element_prompts 表 |
| `server/src/index.ts` | 修改 — 挂载摄影路由 |
| `src/router/index.ts` | 修改 — 新增 /photography /admin/photography 路由 |
| `src/components/SidebarMenu.vue` | 修改 — 新增菜单项 |
| `src/configs/featureConfig.ts` | 修改 — 注册 ai-photography |
| `src/composables/useTaskManager.ts` | 修改 — handleCopyParams/handleRegenerate 支持摄影任务导航 |

### 数据库变更

- `photography_elements`：id, name(UNIQUE), label, max_images, sort_order, status, timestamps
- `photography_element_prompts`：id, element_id(FK), model_id, system_prompt, timestamps, UNIQUE(element_id, model_id)
- 种子数据：5 个默认元素（人脸/姿势/衣服/配饰/背景）× 4 个模型

---

## 2026-06-05/06 — 任务状态流优化 + 下载性能优化 + 多项 bug 修复

### 新增

- **`importing` 任务状态**：ToAPIs 生成完成后、OSS 导入完成前显示"下载中"。缩略图显示转圈 + "正在下载图片..."文字。导入完成后再切到 `completed`。
- **结果图手动刷新按钮**：已完成但无结果图时，缩略图上显示刷新按钮，点击后从 ToAPIs 重新拉取结果并导入 OSS，不刷新页面。
- **下载四层降级策略**：DOM Canvas 提取 → HTTP 缓存 fetch → 服务端代理 → 新标签页。正常情况（OSS URL + 已显示缩略图）直接零网络下载。
- **下载诊断日志**：控制台输出 `[下载] ✅ 策略1: 从DOM缓存提取 (零网络)` 等标记，方便排查缓存命中情况。

### 修改

- **`downloadUrl()`**：从纯代理模式改为四层降级，优先复用浏览器已有数据
- **OSS 缩略图** `<img>` 标签添加 `crossorigin="anonymous"`（仅 OSS URL），使 Canvas 提取不被 taint
- **`pollTask()`** 重构：推迟设置 `completed` 状态到 OSS 导入完成后，导入期间设为 `importing`
- **`isActive()` / `ACTIVE_STATUSES`**：加入 `importing`，统一使用常量数组
- **`retryImportTask()`** 新方法：用 `getTaskStatus` 重取 ToAPIs 结果 → `importResultUrls` → OSS → 更新任务

### 修复

- **Bug #5**：下载走远端而非缓存（改为四层降级）
- **Bug #6**：任务完成但缩略图空白 / 显示静态图标（新增 importing 状态 + 刷新按钮）
- **Bug #7**：参考图提交顺序与 UI 拖拽不一致（新增 refImages 有序参数）
- **Bug #8**：图片对比弹窗上下键切换失效（activeTaskId 本地跟踪）

### 涉及文件

| 文件 | 变更类型 |
|------|----------|
| `src/utils/download.ts` | 重构（四层降级 + 诊断日志） |
| `src/composables/useTaskManager.ts` | 修改（importing 状态 + retryImportTask + refImages 传递） |
| `src/services/imageGeneration.ts` | 修改（refImages 有序处理） |
| `src/components/TaskList.vue` | 修改（importing UI + 刷新按钮 + crossorigin + 下载优化） |
| `src/components/GenerationForm.vue` | 修改（emit refImages） |
| `src/components/FeatureForm.vue` | 修改（emit refImages） |
| `src/components/ImageCompareDialog.vue` | 修改（keyboard nav fix + importing 状态） |
| `src/components/TaskDetailDialog.vue` | 修改（importing statusMap） |
| `src/components/TaskPanel.vue` | 修改（retryImport 事件） |
| `src/views/workspace/WorkspacePage.vue` | 修改（refImages 透传） |

---

## 2026-06-05 — OSS 全链路通 + 下载/对比修复

### 新增

- **OSS 结果导入 Worker 部署**：`workers/oss-result-import-worker.mjs` 部署到阿里云函数计算，公网 URL `https://oss-rest-worker-ykaraoaubf.cn-hangzhou.fcapp.run`。ToAPIs 任务完成后自动将结果图转存到 OSS `results/{userId}/{yyyy}/{mm}/{uuid}.{ext}`。
- **跨域下载工具** `src/utils/download.ts`：通过服务端代理 `POST /api/proxy/image` 先获取图片 blob → 创建同源 blob URL → 触发 `<a download>` 下载，解决浏览器对跨域 URL 忽略 `download` 属性的问题。
- **非 OSS 参考图 URL 自动中转** `src/services/imageGeneration.ts`：若 `imageUrls` 中包含非 OSS URL（如 ToAPIs 链接、历史结果复用），自动下载后重新上传到 OSS，再存入 `input_image_urls`。
- **FC Worker 部署配置** `workers/s.yaml` 和入口文件 `workers/index.mjs`。

### 修改

- **下载逻辑**：TaskList / ResultsPage / BatchSpreadsheet / TaskDetailDialog 的下载函数全部改用 `src/utils/download.ts`。
- **图片对比对话框** `ImageCompareDialog.vue`：`currentTask` 计算属性优先通过 `taskId` 查找最新任务数据，修复 `loadHistory` 替换 `tasks.value` 数组后引用不更新导致参考图不显示。
- **服务端 Worker 调用** `server/src/utils/oss.ts`：移除对 Worker 的 Authorization header（FC HTTP trigger 不转发自定义 headers）。
- **`.env` 新增变量**：`OSS_RESULT_IMPORT_WORKER_URL`、`OSS_RESULT_IMPORT_WORKER_SECRET`。

### 删除/废弃

- Worker 的 Bearer Token 鉴权（`assertAuthorized` 函数）— FC 不支持，改为依赖 Worker URL 保密 + objectKey 前缀校验。
- `toapisProxyApi.upload`（`/toapis/upload` 代理）— 代码保留但生图流程不再调用，属于死代码。

### 涉及文件

| 文件 | 变更类型 |
|------|----------|
| `src/utils/download.ts` | 新增 |
| `src/services/imageGeneration.ts` | 修改 (+27/-2) |
| `src/components/ImageCompareDialog.vue` | 修改 (+20) |
| `src/components/TaskPanel.vue` | 修改 |
| `src/composables/useTaskManager.ts` | 修改 |
| `src/views/results/ResultsPage.vue` | 修改 |
| `src/views/tools/BatchSpreadsheetPage.vue` | 修改 |
| `src/components/TaskDetailDialog.vue` | 修改 |
| `server/src/utils/oss.ts` | 修改 |
| `workers/oss-result-import-worker.mjs` | 修改 |
| `workers/index.mjs` | 新增 |
| `workers/s.yaml` | 新增 |
