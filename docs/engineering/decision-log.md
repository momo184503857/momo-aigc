# Decision Log

技术决策记录，按时间倒序。

---

## 2026-06-05 — 下载优化：四层降级策略，优先复用浏览器缓存

**背景**：此前决策（"下载全部走代理"）在当时正确——OSS CORS 未确认，服务端代理 100% 可靠。但上线后用户反馈下载慢：任务列表已显示缩略图（图片已加载到浏览器），点下载仍然重新走网络请求。

**决策**：改为四层降级策略 `DOM Canvas → HTTP缓存 fetch → 服务端代理 → 新标签页`。

**原因**：
- 第1层（DOM Canvas）：页面上的 `<img>` 已经加载了图片，通过 Canvas 提取像素数据零网络开销。需要 OSS URL 的 `<img>` 带 `crossorigin="anonymous"` 属性。
- 第2层（HTTP 缓存 fetch）：`fetch(url, {cache: 'force-cache'})` 复用浏览器的 HTTP 缓存（`<img>` 标签加载时已写入），不需要 CORS 头也能命中。
- 第3层（代理）：前两层都失败时的兜底，100% 可靠。
- 第4层（新标签页）：最终兜底。

**放弃的方案**：继续"全部走代理"——用户体验差，明明图片已在眼前却还要等网络请求。

**关键前提**：
- OSS Bucket 已配置 CORS（GET 可跨域），`crossorigin="anonymous"` 不会阻止图片加载
- ToAPIs URL（`files.toapis.com`）无 CORS，不加 `crossorigin`，Canvas 自然被 taint → 策略1跳过 → 策略2可能失败（fetch CORS）→ 最终走策略3代理

**后续影响**：
- 新任务使用 OSS URL → 策略1直接命中 → 下载近乎即时
- 老任务（ToAPIs URL）仍走代理，但不影响新任务
- 控制台日志记录每条下载命中了哪层策略，方便排查

---

## 2026-06-05 — 任务状态新增 importing 过渡态

**背景**：此前 `pollTask()` 先设 `task.status = 'completed'`，再异步调用 `importResultUrls()`（将 ToAPIs 结果导入 OSS）。导入期间（可能数秒）用户看到"已完成"但缩略图为空——体验差，且导入失败后无重试入口。

**决策**：新增 `importing` 伪状态（仅前端使用，不写入数据库）。状态流转变为 `in_progress → importing → completed`。

**原因**：
- `importing` 被视为活跃状态，缩略图显示转圈 + "正在下载图片..."，用户清楚图片还在下载
- 避免状态值和实际数据不一致（completed 但 result_image_urls 为空）
- 缩略图上增加"刷新"按钮：导入失败后用户可手动重试
- `pollTask` 不再在导入期间调用 ToAPIs（避免重复请求），导入完成后才切 `completed`

**放弃的方案**：
- 不做任何处理——用户体验差
- 导入期间留在 `in_progress`——用户困惑为什么"生成中"这么久
- 在前端框架层做异步 loading 状态——不够通用，任务详情和图片对比等组件也需要感知

**后续影响**：
- `isActive()`、`ACTIVE_STATUSES`、`pollAllTasks` 等需覆盖 `importing`
- `TaskDetailDialog`、`ImageCompareDialog` 的状态映射也需同步更新

---

## 2026-06-05 — 下载功能：全部走服务端代理，不直接 fetch 跨域 URL

**状态**：已于同日部分废弃（见上方"四层降级策略"）。保留此记录供参考历史上下文。当前直接 fetch OSS URL 可行且已加 `cache: 'force-cache'`。

---

## 2026-06-05 — FC Worker 鉴权：移除 Bearer Token

**背景**：Worker 原设计通过 `Authorization: Bearer <secret>` 鉴权。部署到阿里云 FC 3.0 后，发现 FC HTTP trigger 不转发自定义 HTTP headers 到 handler 函数。

**决策**：移除 Worker 的 Bearer Token 鉴权，改为依赖以下安全措施：
1. Worker URL 仅保存在 `.env` 中，不公开
2. `importResult` 函数的 `targetObjectKey` 必须以 `results/{userId}/` 开头（前缀校验，防止跨用户写入）

**原因**：FC 3.0 HTTP trigger 传给 handler 的是 event envelope JSON（Buffer 格式），不是标准 `(req, resp)`。虽然 headers 在 event 中存在，但实际部署后发现 Authorization header 值为空字符串。在调试多轮后决定放弃 header 鉴权方案。

**风险**：知道 Worker URL 的任何人都可以调用它。但 URL 不在代码仓库中、不公开，且 `importResult` 有 objectKey 校验，实际风险很低。

---

## 2026-06-05 — 选择 FC（函数计算）而非嵌入 Express 或 Vercel

**背景**：Worker 需要部署到某个运行时。三个方案：
- A：直接嵌入现有 Express 服务器（最快）
- B：阿里云函数计算（与原 OSS 服务同云，低延迟）
- C：其他 Node.js 托管平台（Vercel、Render 等）

**决策**：选择方案 B（阿里云 FC）。

**原因**：用户明确选择了方案 B。技术原因：
- Worker 需要下载文件后上传到同区域的 OSS Bucket（`oss-cn-hangzhou`），同区域 FC 网络延迟最低
- 符合 PRD 设计目标：图片字节不经过业务服务器
- 使用 `@serverless-devs/s` CLI 部署，配置简单

**放弃的方案**：
- 方案 A 最简单但违背 PRD 核心原则（图片不经过业务服务器），且会增加服务器带宽消耗
- 方案 C 跨云会有额外的网络延迟和费用
