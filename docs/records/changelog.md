# Changelog

按时间倒序记录功能层面的变更。

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
