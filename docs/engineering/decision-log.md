# Decision Log

技术决策记录，按时间倒序。

---

## 2026-06-05 — 下载功能：全部走服务端代理，不直接 fetch 跨域 URL

**背景**：用户点击下载按钮时，`<a href="跨域URL" download>` 不生效——浏览器忽略跨域 URL 的 `download` 属性，直接打开新标签页。

**决策**：下载全部走 `POST /api/proxy/image` 服务端代理，不先尝试浏览器直连 fetch。

**原因**：
- OSS Bucket 的 CORS 配置不确定是否允许浏览器 GET（只确认了 POST 上传可工作）
- 服务端代理是同源请求，不受 CORS 限制，100% 可靠
- 对内部工具来说服务端中转图片流量的额外负载可忽略

**放弃的方案**：先尝试 `fetch(url)` 直连 → 失败再走代理 → 再失败 `window.open`。这种三层降级看似最优，实际第一层就常被 CORS 拦截，增加不必要的延迟和用户困惑。

**后续影响**：如果 OSS Bucket 配置了 GET CORS 且性能敏感，可以重新引入直连优先。当前阶段直连 fetch 被移除了。

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
