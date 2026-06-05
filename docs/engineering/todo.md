# TODO

待办事项和风险点，按优先级排列。

---

## 需用户操作

### OSS Bucket "强制下载" 设置（用户反馈：稍后处理）

OSS Bucket 当前返回 `Content-Disposition: attachment` 和 `x-oss-force-download: true`，导致浏览器右键"在新标签页打开图片"时触发下载而非显示。需要在阿里云 OSS 控制台关闭"强制下载"开关。

> 用户表示此问题不需要立即处理。

### OSS CORS 配置验证

浏览器直传 OSS（PostObject policy）目前正常工作。但未验证 OSS Bucket 是否允许浏览器**直接** `fetch()` GET 请求。当前下载走服务端代理，不依赖直接 fetch。如果以后想优化性能（直接 fetch OSS URL 创建 blob 下载），需要确认 OSS 已配置 GET CORS。

---

## 后续开发

### `.env` 变量同步

每次本地新增 `.env` 变量后，服务器部署时必须同步更新。建议建立 checklist 或自动化脚本。当前新增变量：
- `OSS_RESULT_IMPORT_WORKER_URL`
- `OSS_RESULT_IMPORT_WORKER_SECRET`

### `toapisProxyApi.upload` 死代码清理

`src/services/toapisProxyApi.ts` 中的 `upload` 方法和对应服务端路由 `POST /toapis/upload` 已不再被生图流程调用。当前保留作为兼容/兜底。如果确认完全不需要，可以清理。

### CSS 设计 Token 规范

CLAUDE.md 要求所有样式使用 `--momo-*` CSS 变量。新增组件（如 `ImageCompareDialog`、`download.ts` 不涉及样式）已遵守此规范。后续新增 UI 时务必遵守。

---

## 待确认

### RAM 用户权限

用于部署 FC Worker 的 RAM 用户 `***REMOVED***` 可能需要的最小权限集：
- `AliyunFCFullAccess` — 函数计算（已授予）
- `AliyunOSSFullAccess` — OSS 读写（已授予）

如果后续需要更精细的权限控制（最小权限原则），可以创建自定义策略，仅授权必需的 API 操作。

### RAM AccessKey 轮换

在终端输出和聊天记录中曾出现明文 OSS AccessKey。建议去阿里云 RAM 控制台轮换后更新 `.env`。

---

## 已知风险

### Worker 冷启动延迟

阿里云 FC 函数在长时间无调用后会冷启动，首次请求有 ~1-2 秒延迟。`importResultToOss` 调用有 30 秒超时（Worker 内部 `AbortSignal.timeout(120000)`），冷启动延迟在可接受范围内。如果后续对响应时间敏感，可以考虑 FC 预留实例。

### SQLite 并发

better-sqlite3 是同步驱动，单个请求串行处理。内部工具并发低，当前可接受。

### 图片文件过期

ToAPIs 结果图 URL 有过期时间。一旦 Worker 将其转存到 OSS 后，过期不再是问题。但如果是降级路径（Worker 未配置或调用失败），ToAPIs URL 可能会在若干天后失效。
