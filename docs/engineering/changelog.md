# Changelog

按时间倒序记录功能层面的变更。

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
