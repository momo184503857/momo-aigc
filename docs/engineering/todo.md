# TODO

待办事项和风险点，按优先级排列。

---

## AI 买家秀（2026-06-14）

### 制作买家秀：疑似缺表字段 **[待确认]**

前端类型 `BatchItemRecord` 引用了 `model / resolution / aspect_ratio / result_image_urls / input_image_urls / completed_at` 等字段，但 `buyer_show_batch_items` 的建表 DDL 未见这些列。需用户确认：是缺 migration（应补 `ALTER TABLE`），还是这些字段为运行时拼装。若缺列，相关读取会得到 undefined。

### 制作买家秀：端到端未验证 **[待验证]**

`MakeBuyerShowPanel.vue` 的完整流程（Excel 导入/导出、逐行生图、刷新后按 `toapis_task_id` 恢复轮询、对比弹窗、按商品ID 打包 zip）未在本会话验证。建议跑一遍。

### 制作买家秀：权限范围 **[待确认]**

`/api/buyer-show-batch` 任意登录用户可用（无 admin 限制）、按用户隔离。是否符合「全员可用」预期，需确认。

### 素材库：浏览器实测 **[待验证]**

已过后端 curl 冒烟与类型检查，但未做浏览器 UI 验收。建议按需求文档 §2.7 验收标准 + 验收清单走一遍（管理员 CRUD、普通用户只读复制、表格粘贴每条一格、标签筛选、网格/列表、分页）。

### 素材库：标签管理面板未建 **[低优先级]**

当前标签仅在上传/编辑弹窗内通过 allow-create 增删；服务端已具备 `POST/DELETE /tags`。如需集中改名/批量删标签，再补一个管理 UI。

### 素材库：`sort_order` 拖拽排序未暴露 **[低优先级]**

`buyer_show_materials.sort_order` 与 `buyer_show_tags.sort_order` 已建表但 UI 未提供拖拽排序。需要时参考模板图库的 starred 拖拽实现。

---

## 高优先级

### AI摄影：502 生成失败排查 **[进行中]**

AI摄影生成任务返回 502。ToAPIs 和 OSS 单独测试均正常。已在服务端加了调试日志（`/tmp/momoaigc-debug.log`），等待用户测试后定位根因。详见 `docs/engineering/bug-fixes.md`。

### supplementaryImages 存储 base64 data URL 的性能问题

`PhotographyForm.handleGenerate()` 中 `supplementaryImages` 存了 `poolImg.sourceUrl || poolImg.dataUrl`。本地文件无 sourceUrl 时存入的是 base64 data URL（一张 5MP 照片 ≈ 6-7MB）。多张图片时任务创建请求的 JSON body 可能达数十 MB。
- 当前 `express.json({ limit: '50mb' })` 尚可容忍
- 建议改为：生成前先上传到 OSS，supplementaryImages 只存 OSS URL（而非 data URL）
- 影响范围：DB 行体积、API 请求体大小、重新编辑时的加载速度

---

## 需用户操作

### OSS Bucket "强制下载" 设置（用户反馈：稍后处理）

OSS Bucket 当前返回 `Content-Disposition: attachment` 和 `x-oss-force-download: true`，导致浏览器右键"在新标签页打开图片"时触发下载而非显示。需要在阿里云 OSS 控制台关闭"强制下载"开关。

> 用户表示此问题不需要立即处理。

### ~~OSS CORS 配置验证~~ ✅ 已确认

~~浏览器直传 OSS（PostObject policy）目前正常工作。但未验证 OSS Bucket 是否允许浏览器**直接** `fetch()` GET 请求。~~

**已确认**：OSS CORS 已正确配置。`<img>` 标签添加 `crossorigin="anonymous"` 后图片正常加载，Canvas 提取不 taint。下载四层降级中策略1（DOM Canvas）可正常命中。

### 旧任务 ToAPIs URL 迁移

数据库中尚有已完成的任务存储的是 `files.toapis.com` URL（OSS Worker 未配置前生成的）。这些任务的缩略图显示正常，但下载时必须走服务端代理（ToAPIs 无 CORS，Canvas 被 taint，fetch 也失败）。新任务（OSS URL）不受影响。

> 是否需要批量迁移旧任务结果到 OSS？当前阶段暂不处理，旧任务自然被新任务替代。

---

## 后续开发

### 任务列表缩略图无拓展名问题

`downloadUrl()` 的 filename 参数格式为 `{模型}_{ToAPIs taskId 前8位}`，无文件拓展名。浏览器下载后可能不识别为图片。可以从 URL pathname 或 Content-Type 自动补齐拓展名。

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

### 生产环境 HTTPS

当前生产服务器使用 HTTP（`http://REDACTED-OLD-SERVER-IP`）。下载优化后 blob URL 会提示 "loaded over an insecure connection"。功能不受影响，但上 HTTPS 后警告会消失。

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
