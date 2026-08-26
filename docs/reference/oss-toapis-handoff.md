# OSS + ToAPIs 链路改造交接文档

## 背景

项目是内部 AI 生图 Web 应用，原 PRD 里的目标是：图片文件尽量不经过业务服务器，业务服务器只保存任务、链接、状态等元信息。

用户提出的新方案：

```text
用户浏览器 -> OSS 输入图
OSS 输入图 URL -> ToAPIs
ToAPIs 生成结果 URL -> 转存到 OSS
用户浏览器展示 OSS 结果图
```

目标是让主业务服务器不传输图片字节，只处理图片链接、任务记录和鉴权。

## 已确认的事实

### 1. PRD 方案

PRD 里第一版设计是：

- 临时参考图由浏览器直接上传 ToAPIs。
- ToAPIs 返回结果 URL 后，浏览器直接展示/下载。
- 模板图长期存在阿里云 OSS。
- 业务服务器只保存任务元信息。

相关文档：

- `docs/requirements/prd.md`
- `docs/reference/handoff.md`
- `docs/reference/deployment.md`

### 2. 改造前代码实际情况

改造前代码不是 PRD 的纯直连方案，而是后端代理方案：

- 临时图上传：前端请求 `/api/toapis/upload`，后端接收文件后上传 ToAPIs。
- 创建任务：前端请求 `/api/toapis/create-task`，后端调用 ToAPIs。
- 查询状态：前端请求 `/api/toapis/task-status/:id`，后端调用 ToAPIs。
- 模板图上传：前端请求 `/api/oss/upload`，后端接收文件后上传 OSS。
- 下载结果图：前端请求 `/api/proxy/image`，后端代理下载图片流。

主要代码：

- `src/services/imageGeneration.ts`
- `src/services/toapisProxyApi.ts`
- `src/adapter/toapisClient.ts`
- `server/src/routes/toapis-proxy.ts`
- `server/src/utils/toapis.ts`
- `server/src/routes/oss.ts`
- `server/src/routes/proxy.ts`

## 实测结果

### OSS URL 给 ToAPIs 读取

已实测通过。

测试方式：

1. 用 `.env` 中配置的 OSS 凭证，将一张测试 PNG 上传到 `momo-aigc` bucket。
2. 公开 URL `HEAD` 返回 `200`。
3. 用本地 ToAPIs Key 调 `gemini-2.5-flash-image-preview`。
4. 请求体中传入 OSS 图片 URL。
5. ToAPIs 成功创建并完成任务。

实测任务：

```text
tsk_img_01KSWX9YZJREDY9Q5W361KR8QW
```

结论：ToAPIs 能读取 OSS 公共 URL，输入图链路可行。

### 浏览器直接 fetch ToAPIs 结果 URL

实测发现 ToAPIs 结果 URL 没有返回 CORS 头：

```text
access-control-allow-origin: none
```

结论：

- `<img src="ToAPIs结果URL">` 大概率可以展示。
- 浏览器 `fetch(resultUrl).blob()` 大概率会被 CORS 拦截。
- 所以“浏览器下载 ToAPIs 结果图再直传 OSS”不可靠。

因此决定使用 Worker/云函数做结果转存。

## 最终采用的架构

```text
用户浏览器
  -> 业务服务器：请求 OSS 上传凭证
  <- 业务服务器：返回 PostObject policy
  -> OSS：浏览器直传输入图

用户浏览器/业务服务器
  -> ToAPIs：创建任务，image_urls 使用 OSS 输入图 URL
  -> ToAPIs：轮询状态

ToAPIs completed 后：
业务服务器
  -> 结果导入 Worker：发送 taskId、userId、sourceUrl、targetObjectKey
Worker
  -> ToAPIs 结果 URL：下载图片
  -> OSS：写入 results/{userId}/...
业务服务器
  <- Worker：返回 OSS 结果 URL

用户浏览器
  -> OSS：展示/下载结果图
```

主业务服务器不传输图片字节。

## 已完成的代码改造

### 1. OSS 直传接口

新增/改造：

- `server/src/routes/oss.ts`
- `server/src/utils/oss.ts`
- `src/services/ossApi.ts`

新接口：

```http
POST /api/oss/upload-token
```

请求：

```json
{
  "filename": "image.png",
  "mimeType": "image/png",
  "sizeBytes": 12345,
  "scope": "inputs"
}
```

返回：

```json
{
  "uploadUrl": "https://momo-aigc.oss-cn-hangzhou.aliyuncs.com",
  "objectKey": "inputs/1/2026/05/uuid.png",
  "publicUrl": "https://momo-aigc.oss-cn-hangzhou.aliyuncs.com/inputs/1/2026/05/uuid.png",
  "ossBucket": "momo-aigc",
  "fields": {
    "policy": "...",
    "signature": "...",
    "OSSAccessKeyId": "...",
    "key": "inputs/1/2026/05/uuid.png",
    "success_action_status": "200"
  }
}
```

前端现在使用 `fetch(uploadUrl, { method: 'POST', body: formData })` 直传 OSS。

### 2. 临时参考图改为先传 OSS

改造文件：

- `src/services/imageGeneration.ts`
- `src/adapter/toapisClient.ts`

变化：

- 原来临时图调用 `toapisProxyApi.upload(file)`。
- 现在调用 `ossApi.upload(file, 'inputs')`。
- 然后把返回的 `publicUrl` 放入 ToAPIs 请求的 `image_urls`。

### 3. 模板图上传改为 OSS 直传

改造文件：

- `src/views/templates/TemplatesPage.vue`

变化：

- 模板图库上传现在调用 `ossApi.upload(file, 'templates')`。
- 保存模板记录时使用返回的真实 `ossBucket`。

### 4. 结果转存 Worker 接入

新增 Worker 示例：

- `workers/oss-result-import-worker.mjs`

新增文档：

- `docs/reference/oss-result-import-worker.md`

新增配置：

- `.env.example`
- `server/src/config.ts`

需要配置：

```env
OSS_RESULT_IMPORT_WORKER_URL=https://your-function-url
OSS_RESULT_IMPORT_WORKER_SECRET=use-a-long-random-string
```

Worker 需要配置：

```env
OSS_ENDPOINT=oss-cn-hangzhou.aliyuncs.com
OSS_BUCKET=momo-aigc
OSS_ACCESS_KEY_ID=...
OSS_ACCESS_KEY_SECRET=...
OSS_RESULT_IMPORT_WORKER_SECRET=use-the-same-long-random-string
```

Worker 请求：

```json
{
  "taskId": "tsk_img_xxx",
  "userId": 1,
  "sourceUrl": "https://toapis-result-url",
  "targetObjectKey": "results/1/2026/05/uuid.png"
}
```

Worker 返回：

```json
{
  "success": true,
  "taskId": "tsk_img_xxx",
  "objectKey": "results/1/2026/05/uuid.png",
  "publicUrl": "https://momo-aigc.oss-cn-hangzhou.aliyuncs.com/results/1/2026/05/uuid.png",
  "contentType": "image/png",
  "sizeBytes": 156329
}
```

### 5. 结果展示/下载改为 OSS URL

改造文件：

- `src/composables/useTaskManager.ts`
- `src/views/results/ResultsPage.vue`
- `src/views/tools/BatchSpreadsheetPage.vue`
- `src/modules/workflow/nodes/image-ai/index.ts`

变化：

- ToAPIs completed 后，先尝试调用 `/api/oss/import-result`。
- 成功则保存 OSS 结果 URL。
- 如果 Worker 未配置或转存失败，降级保存 ToAPIs 原始结果 URL，避免任务显示“状态未知”。
- 下载不再请求 `/api/proxy/image`，改为直接下载结果 URL。

## 已修复的问题

### 任务已成功但页面显示“状态未知”

用户提供任务：

```text
tsk_img_01KSWYQ9TXAXQK67J46K44A820
```

ToAPIs 后台显示成功，但本地显示状态未知。

排查结果：

- 本地 `.env` 中 `OSS_RESULT_IMPORT_WORKER_URL` 是空的。
- 前端轮询到 ToAPIs completed 后，调用结果转存接口失败。
- 外层 catch 将任务状态标成 `unknown`。

已修复：

- 结果转存失败时，不再把任务标成 `unknown`。
- 会保存 ToAPIs 原始结果 URL，并标记任务为 `completed`。

该任务已手动同步到本地数据库：

```json
{
  "id": 19,
  "status": "completed",
  "progress": 100,
  "result_image_urls": [
    "https://files.toapis.com/images/tsk_img_01KSWYQ9TXAXQK67J46K44A820/1780161991_c9091b0f.png"
  ]
}
```

## 当前状态（2026-06-05 更新）

### 1. 部署结果导入 Worker ✅ 已完成

Worker 已部署到阿里云函数计算（FC 3.0）：

| 项目 | 值 |
|------|-----|
| 函数名 | `oss-result-import-worker` |
| 运行时 | Node.js 20 |
| 区域 | `cn-hangzhou` |
| 公网 URL | `https://oss-rest-worker-ykaraoaubf.cn-hangzhou.fcapp.run` |
| 内网 URL | `https://oss-rest-worker-ykaraoaubf.cn-hangzhou-vpc.fcapp.run` |
| 部署工具 | `@serverless-devs/s` v3 (s CLI) |
| 部署配置 | `workers/s.yaml` |
| 入口文件 | `workers/index.mjs` → `workers/oss-result-import-worker.mjs` |

**部署命令**（从 `workers/` 目录执行）：
```bash
export OSS_ENDPOINT=oss-cn-hangzhou.aliyuncs.com
export OSS_BUCKET=momo-aigc
export OSS_ACCESS_KEY_ID=<key>
export OSS_ACCESS_KEY_SECRET=<secret>
s deploy -y
```

**本地 `.env` 配置**：
```env
OSS_RESULT_IMPORT_WORKER_URL=https://oss-rest-worker-ykaraoaubf.cn-hangzhou.fcapp.run
OSS_RESULT_IMPORT_WORKER_SECRET=<与 FC Worker 侧一致的长随机串>
```

> ⚠️ **重要**：服务器部署时必须把这两个变量也配到服务器 `.env` 中，否则 Worker 不会被调用，结果图会降级保留 ToAPIs URL。PM2 重启时加 `--update-env` 才能重新加载 `.env`：
> ```bash
> cat >> .env << 'EOF'
> OSS_RESULT_IMPORT_WORKER_URL=https://oss-rest-worker-ykaraoaubf.cn-hangzhou.fcapp.run
> OSS_RESULT_IMPORT_WORKER_SECRET=<与 FC Worker 侧一致的长随机串>
> EOF
> pm2 restart momo-aigc --update-env
> ```

**FC Worker 技术细节**（调试发现）：
- FC 3.0 HTTP trigger 传给 handler 的第一个参数是一个 **Buffer**，内容是 FC 事件 envelope JSON：`{ version, rawPath, headers: {...}, body: "<json-string>", ... }`
- 实际请求体在 `eventObj.body` 里，是 JSON 字符串，需要二次解析
- 不是标准的 Node.js `(req, resp)` HTTP handler 格式
- 因为 FC 不转发自定义 HTTP headers（如 Authorization），Worker 的 Bearer Token 鉴权已移除。安全性依赖 Worker URL 保密 + `targetObjectKey` 前缀校验

### 2. 配置 OSS CORS ⚠️ 待确认

浏览器上传图片到 OSS（PostObject policy）目前正常工作，说明 OSS Bucket 已配置了必要的 CORS（POST 方法）。

但**浏览器直接 `fetch(url)` 下载图片**可能因 OSS Bucket 未开放 GET CORS 而失败。当前下载功能**不走直接 fetch**，而是通过服务端代理 `POST /api/proxy/image` 绕过 CORS。详见 `docs/records/bug-fixes.md` — Bug #2。

### 3. 参考图 URL 流转

2026-06-05 修复：用户上传的本地文件 → OSS（`ossApi.upload(file, 'inputs')`）→ OSS URL 存入 `input_image_urls`。但来自历史任务结果复用的 ToAPIs URL 也会在 `generateImage()` 中自动 fetch + 重新上传到 OSS。详见 `src/services/imageGeneration.ts` 第 78-92 行。

### 4. 完整本地验收

已通过端到端测试：`POST /api/oss/import-result` → Worker → OSS，成功返回 OSS 公网 URL。结果图可正常展示和下载。

## 已运行验证

已运行并通过：

```bash
npm run build
npm run build:server
```

前端构建有 chunk size 警告，但不是本次改造引入的阻塞问题。

## 注意事项

- `.env` 中已有真实 OSS AccessKey，当前 `.gitignore` 忽略 `.env`，不要提交。
- 之前终端输出中过 OSS AccessKey，稳妥起见建议去阿里云 RAM 控制台轮换。
- `server/src/routes/proxy.ts` 仍保留旧图片代理接口，作为兼容/兜底；新流程不再依赖它。
- `src/services/toapisProxyApi.ts` 仍保留 `/toapis/upload` 方法，作为旧代码兼容；新生成流程不再调用它。
