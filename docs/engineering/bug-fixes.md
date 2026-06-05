# Bug Fixes

重要 bug 记录和解决经验，按时间倒序。

---

## 2026-06-05 — Bug #4: 图片对比对话框参考图不显示

**现象**：任务列表显示了参考图缩略图（`input_image_urls`），但打开图片对比对话框时参考图侧显示空白（或"无参考图"）。刷新页面后恢复正常。

**影响范围**：通过任何方式打开的图片对比对话框（TaskPanel 中的 `@compare-images` 事件触发）。

**根因**：`ImageCompareDialog.vue` 的 `currentTask` 通过 `props.tasks[currentIndex]` 按索引取任务。当 `useTaskManager` 的 `loadHistory()` 替换整个 `tasks.value` 数组后，同一索引可能对应不同的任务对象（尤其是数组被 `unshift` 或排序后）。对话框持有的旧任务对象上的 `input_image_urls` 可能为空（任务创建时的初始值），而新数组中间接任务已更新，但 computed 不会主动用新数组中间对象替换旧引用。

**解决方案**：`showCompare()` 调用时记录目标任务 ID（`compareTaskId`），`ImageCompareDialog` 的 `currentTask` computed 改为优先通过 `taskId` 在 `props.tasks` 中查找，绕过索引依赖。

**涉及文件**：
- `src/composables/useTaskManager.ts` — 新增 `compareTaskId` ref，`showCompare` 中赋值
- `src/components/TaskPanel.vue` — 传递 `:task-id` prop
- `src/components/ImageCompareDialog.vue` — `currentTask` computed 改为 taskId 查找

**预防方式**：
- 任何依赖数组索引获取对象的 computed/watcher，都要考虑数组被整体替换的场景
- `useTaskManager` 的 `loadHistory` 会整体替换 `tasks.value`，所有下游消费方应对此有预期

---

## 2026-06-05 — Bug #3: 下载按钮打开新标签页而非触发下载

**现象**：点击任务列表/结果页/详情弹窗中的"下载"按钮，图片在新标签页打开，而不是下载到本地。

**影响范围**：所有下载按钮（TaskList、ResultsPage、BatchSpreadsheetPage、TaskDetailDialog）。

**根因**：浏览器对 `<a href="跨域URL" download>` 会忽略 `download` 属性（安全策略）。之前的下载代码直接用跨域 URL（OSS/ToAPIs）作为 `<a>` 的 `href`，导致浏览器打开新标签页而非下载。

**解决方案**：创建 `src/utils/download.ts`，通过以下步骤触发真正的下载：
1. `POST /api/proxy/image` 服务端代理获取图片 blob（同源请求，无 CORS 问题）
2. `URL.createObjectURL(blob)` 创建同源 blob URL
3. 创建临时 `<a>` 元素，`href` 指向 blob URL，`download` 设为文件名，`click()` 触发下载
4. 延迟 60 秒后 `revokeObjectURL`（给浏览器足够时间开始下载）

**设计决策**：全部走代理，不先尝试直接 fetch OSS URL。原因见 `docs/engineering/decision-log.md` — "下载功能全部走代理"。

**涉及文件**：
- `src/utils/download.ts` — 新增，共享下载工具
- `src/composables/useTaskManager.ts` — 替换 `downloadUrl`
- `src/views/results/ResultsPage.vue` — 替换 `downloadUrl`
- `src/views/tools/BatchSpreadsheetPage.vue` — 替换 `downloadUrl`
- `src/components/TaskDetailDialog.vue` — 替换 `handleDownload`

---

## 2026-06-05 — Bug #2: FC Worker 返回 "Unauthorized" / "Cannot parse body"

**现象**：部署到阿里云 FC 3.0 的 Worker 无法正常工作：
- 带 Authorization header 的请求返回 `{"error":"Unauthorized"}`
- 去掉 Authorization header 后返回 `{"error":"Missing taskId, userId, ..."}`（body 未能解析）

**影响范围**：结果图无法转存到 OSS，降级保留 ToAPIs URL。

**根因**：
1. FC 3.0 HTTP trigger 传给 handler 的第一个参数不是标准的 `http.IncomingMessage`，而是一个 **Buffer**，内容是 FC event envelope JSON。格式为 `{ version, rawPath, headers: {...}, body: "<json-string>" }`。
2. `event.headers` 存在但 Authorization 值为空（FC 不转发自定义 HTTP headers 给 handler）。
3. 请求体在 `event.body` 字段中，是 JSON 字符串，需要二次 `JSON.parse(event.body)`。而原始代码直接从 `event` 读取字段，导致 parse 出的 payload 为空对象。

**调试过程**：部署了多次调试版本，通过返回 `event` 的 `Object.keys` 和类型信息，逐步发现 FC 传参格式。关键发现：`Object.keys(event)` 返回 `["0","1","2",...]`（有数字索引），且 `hasHeaders: false`。这确认了 `event` 是 Buffer/字符串而非对象。

**解决方案**：
1. 修改 Worker 的请求体解析：Buffer → `JSON.parse(event.toString('utf8'))` → `JSON.parse(eventObj.body)` 两层解析
2. 移除 `assertAuthorized` 鉴权（Authorization header 为空，无法传 secret）
3. 安全替代：依赖 Worker URL 保密 + `targetObjectKey` 前缀校验

**涉及文件**：
- `workers/oss-result-import-worker.mjs` — 重写 handler 和 body 解析
- `server/src/utils/oss.ts` — 移除 Authorization header 发送

**预防方式**：
- 部署到 serverless 平台前，先在本地测试 handler 的参数格式。阿里云 FC 的 HTTP trigger handler 格式与标准 Node.js HTTP handler 不同
- 如果使用 `@serverless-devs/s`，可以用 `s local invoke` 本地测试

---

## 2026-06-05 — Bug #1: 服务器部署后结果图仍是 ToAPIs URL

**现象**：本地测试结果图是 OSS URL（`momo-aigc.oss-cn-hangzhou.aliyuncs.com`），但部署到服务器后变成 `files.toapis.com` URL。

**影响范围**：服务器生产环境。

**根因**：服务器 `.env` 缺少 `OSS_RESULT_IMPORT_WORKER_URL` 和 `OSS_RESULT_IMPORT_WORKER_SECRET` 两个变量。`importResultToOss` 发现 `resultImportWorkerUrl` 为空，抛出 `"OSS_RESULT_IMPORT_WORKER_URL is not configured"`，前端 catch 后降级使用原始 ToAPIs URL。

**解决方案**：
1. 在服务器 `.env` 追加 Worker 配置
2. PM2 重启时使用 `--update-env` 参数（否则不重新加载 `.env`）

**涉及文件**：服务器 `.env`（运维操作，不在代码仓库中）

**预防方式**：
- `.env.example` 已包含 Worker 相关变量模板
- 每次新增 `.env` 变量后，部署时需要同时更新服务器配置
- 文档 `docs/engineering/deployment.md` 已更新包含新变量
