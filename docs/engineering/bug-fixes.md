# Bug Fixes

重要 bug 记录和解决经验，按时间倒序。

---

## 2026-06-08 — AI摄影：photography_elements 表每次重启产生重复数据

**现象**：AI摄影配置页出现多份重复元素（如 8 份"人脸"、8 份"姿势"…），共 40 条记录。

**影响范围**：AI摄影配置管理页（`/admin/photography`）和用户端元素列表。

**根因**：`photography_elements` 表创建时 `name` 字段没有 UNIQUE 约束。种子数据使用 `INSERT OR IGNORE` 但无约束可冲突 → 每次 `tsx watch` 重启都插入一套完整的 5 个元素。重启 8 次 = 40 条。

**解决方案**：
1. 手动清理重复数据：`DELETE ... WHERE id NOT IN (SELECT MIN(id) GROUP BY name)`
2. 创建唯一索引：`CREATE UNIQUE INDEX IF NOT EXISTS idx_photography_elements_name ON photography_elements(name)`
3. 表定义中 `name` 字段改为 `VARCHAR(100) NOT NULL UNIQUE`
4. 添加迁移代码兼容已有数据库

**涉及文件**：`server/src/db/schema.ts`

**预防方式**：
- 任何使用 `INSERT OR IGNORE` 的种子数据，表上必须有对应的 UNIQUE 约束
- 新增表时如果 seed 逻辑依赖去重，表定义中必须显式声明 UNIQUE
- 可以考虑用 `INSERT ... ON CONFLICT DO NOTHING` 替代 `INSERT OR IGNORE`（语义更明确，但需要 SQLite 3.24+）

---

## 2026-06-08 — AI摄影：重新编辑/重新生成无法还原图片和元素分配 **[未完全解决，见下方]**

**现象**：
1. 从任务列表点"重新编辑"，只还原了模型/分辨率/参数，图片池和元素分配为空
2. 从任务列表点"重新生成"没有反应

**根因**：
1. `PhotographyForm.setParams()` 原始实现只回复基本参数，注释写着"完全恢复需下载图片，后续优化"
2. `useTaskManager.handleRegenerate()` 对 AI摄影任务只 emit `copyParamsEvent` 而不实际调用 `handleGenerate`

**解决方案**：
1. 重写 `setParams()`：从 `supplementaryImages`（`[{name:"人脸", url:"..."}, ...]`）反推 — 去重 URL 创建图片池 → 按元素标签名匹配元素 ID → 重建 elementAssignments
2. `handleRegenerate()` 对摄影任务直接复用已存 `task.prompt` + `task.input_image_urls` 调用 `generateImage`

**涉及文件**：`src/components/PhotographyForm.vue`、`src/views/photography/PhotographyPage.vue`、`src/composables/useTaskManager.ts`

**剩余问题**：502 生成失败 — 见下方记录。

---

## 2026-06-08 — AI摄影：生成任务 502 报错 **[未解决，待验证]**

**现象**：AI摄影页面点击「生成图片」后，所有任务返回 `Request failed with status code 502`。

**影响范围**：AI摄影功能（其他功能如生图工作台是否受影响待确认）。

**已排除**：
- ToAPIs API 本身正常（curl 测试，带长中文 prompt + reference_images 均返回 200）
- OSS 上传通道正常（完整链路：upload-token → OSS PostObject → public URL 均可成功）
- 服务端路由正常（`/api/photography/elements` 返回正确数据）

**当前进展**：
- 在 `server/src/routes/toapis-proxy.ts` 增加了详细错误日志（记录 model/promptLen/imageCount + 写入 `/tmp/momoaigc-debug.log`）
- 服务器已重启、数据库已清理重复元素
- **等待用户再次测试生成后查看 debug log 定位根因**

**涉及文件**：`server/src/routes/toapis-proxy.ts`（临时调试日志）

---

## 2026-06-05 — Bug #8: 图片对比弹窗上下键切换任务失效

**现象**：在图片对比弹窗中按 ↑ ↓ 方向键无法切换任务。之前功能正常。

**影响范围**：`ImageCompareDialog.vue` 的键盘导航。

**根因**：Bug #4 修复（commit `786e6b4`）将 `currentTask` computed 改为优先通过 `props.taskId` 查找任务，但 `navigateDetail()` 只更新了 `currentIndex`，没有同步更新 `taskId` 锚点。原任务仍在数组中，`currentTask` 始终返回同一个任务，导航看似失效。

**解决方案**：引入本地 `activeTaskId` ref——弹窗打开时从 `props.taskId` 初始化，键盘导航时同步更新为新任务 ID。`currentTask` computed 改为用 `activeTaskId` 查找。弹窗关闭时重置。

**涉及文件**：`src/components/ImageCompareDialog.vue`

**预防方式**：当 computed 使用多种查找策略（ID 优先 + 索引兜底）时，确保所有修改路径都能触发正确的查找结果。如果一个策略改变了，另一个策略的"失效"可能表现为静默 bug。

---

## 2026-06-05 — Bug #7: 参考图提交顺序与用户在 UI 中拖拽排序不一致

**现象**：用户在生图表单中拖拽排好参考图顺序，但任务列表中的 `input_image_urls` 顺序不同——模板图（URL）总是排在本地文件前面，穿插顺序丢失。

**影响范围**：所有涉及参考图排序的场景（自由生图、功能模式）。

**根因**：`GenerationForm.handleGenerate()` 和 `FeatureForm.handleGenerate()` 将参考图拆成 `templateUrls`（sourceUrl 不为空）和 `tempImageFiles`（本地文件）两个独立数组。`imageGeneration.generateImage()` 先处理所有 URL，再处理所有文件。无论用户在 UI 中如何排序，最终 URL 全部排在文件前面。

例如：用户排序 `[模板A, 本地B, 模板C]` → 提交时拆成 `templateUrls=[A, C]` + `tempImageFiles=[B]` → `allImageUrls=[A, C, B]`。

**解决方案**：在 `GenerateImageParams` 中新增 `refImages?: Array<{url?: string, file?: File}>` 有序列表。当 `refImages` 存在时，`generateImage()` 按列表顺序逐一处理（URL 直推、文件上传），完全尊重用户拖拽顺序。旧的 `imageUrls`/`tempImageFiles` 分拆参数保留向下兼容。

**涉及文件**：`src/services/imageGeneration.ts`、`src/composables/useTaskManager.ts`、`src/components/GenerationForm.vue`、`src/components/FeatureForm.vue`、`src/views/workspace/WorkspacePage.vue`

**预防方式**：不要用多个平级数组传递有顺序关系的数据。用单一有序列表，或带 `position` 字段的结构体。

---

## 2026-06-05 — Bug #6: 任务完成但结果图区域不显示图片（显示静态图标）

**现象**：任务状态已显示"已完成"，但缩略图区域不是结果图，也不是转圈动画，而是一个静态的图片占位图标。有时过一会儿图片才出来。

**影响范围**：任务列表（列表视图和网格视图）的缩略图区域。

**根因**：两个独立问题叠加：

1. **`submitted`/`queued` 状态无转圈**：缩略图区域的条件只判断了 `task.status === 'in_progress'` 才显示转圈。`submitted`（已提交）和 `queued`（排队中）掉到 `v-else`，显示静态 `<Picture />` 图标。修复：改用 `isActive(task.status)` 覆盖三个活跃状态。

2. **任务完成但图片还在下载**：`pollTask()` 中 `task.status = 'completed'` 在先（第 327 行），`importResultUrls()` 异步 OSS 导入在后（第 330 行）。导入期间状态已是 completed 但 `result_image_urls` 为空。修复：新增 `importing` 过渡状态——OSSS 导入期间显示"下载中"转圈，导入完成后再切 `completed`。

**解决方案**：
- 新增 `importing` 状态，加入 `ACTIVE_STATUSES` 列表和 `isActive()` 判断
- `pollTask()` 重构：ToAPIs 返回 completed → 状态先切到 `importing` → 等待 `importResultUrls()` → 再切到 `completed`
- 缩略图区域增加 `importing` 状态的专用展示（转圈 + "正在下载图片..."）
- `completed` 但无结果图时显示刷新按钮，支持手动重试导入
- 新增 `retryImportTask()` 方法：重新从 ToAPIs 拉取结果 URL → 导入 OSS → 更新任务

**涉及文件**：`src/composables/useTaskManager.ts`、`src/components/TaskList.vue`、`src/components/TaskPanel.vue`、`src/components/TaskDetailDialog.vue`、`src/components/ImageCompareDialog.vue`

---

## 2026-06-05 — Bug #5: 下载按钮走远端 URL 而非本地缓存

**现象**：任务列表已显示缩略图（图片已加载到浏览器），但点击下载按钮时仍重新从 OSS/ToAPIs 请求图片数据，下载慢。

**根因**：`downloadUrl()` 旧实现直接 `fetch(url)` 远端 URL。即使浏览器已通过 `<img>` 标签加载了同一张图，`fetch` 也不共享 `<img>` 的像素缓存。且 ToAPIs URL 无 CORS 头，`fetch` 直接失败，需走服务端代理（更慢）。

**解决方案**：改为四层降级策略：
1. **DOM Canvas 提取**：查找页面中已加载的同 URL `<img>` 元素，通过 Canvas 提取像素数据 → Blob → 下载。零网络开销。
2. **HTTP 缓存 fetch**：`fetch(url, {cache: 'force-cache'})` 复用浏览器 HTTP 缓存。
3. **服务端代理**：`POST /api/proxy/image`。
4. **新标签页**：`window.open`。

同时给 OSS URL 的 `<img>` 标签添加 `crossorigin="anonymous"`，使 Canvas 不被标记为 tainted——这是策略1能命中的前提。ToAPIs URL 不加（ToAPIs 无 CORS，加了反而图片不显示）。

**涉及文件**：`src/utils/download.ts`、`src/components/TaskList.vue`

**预防方式**：涉及图片下载的功能，优先考虑复用浏览器已缓存的像素数据，而非重新请求。注意 Canvas 在跨域无 CORS 时会 taint，需配合 `crossorigin` 属性使用。

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
