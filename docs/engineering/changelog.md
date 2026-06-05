# Changelog

按时间倒序记录功能层面的变更。

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
