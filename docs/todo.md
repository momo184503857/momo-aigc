# TODO

待办事项和风险点，按优先级排列。

---

## 积分与 Key 计费体系（2026-06-15）

### Key 的「新积分」上游接口待接入 **[待用户提供]**

`server/src/utils/credits.ts` 的 `fetchKeyCredits(apiKey)` 为占位实现：当前返回 ToAPIs CNY 余额 + `credits=null`，前端在「我的额度」页标注「新积分待接口（当前 ToAPIs 余额：¥X）」。用户将提供「获取新积分接口」（返回值即新积分）；到位后**只需替换 `fetchKeyCredits` 函数体**，端点 `/api/me/quota`、前端展示无需改动。注意：占位期间**绝不**按 0.035 把 ToAPIs CNY 折算为新积分。

### 计费失败退款 / 扣费时序 **[已确认·维持现状]**

积分在 `POST /api/tasks` 任务创建时扣除，**失败不退款**；且扣费发生在「调 ToAPIs 之后」（create-task 先、扣分后），存在 ToAPIs 已扣但本地 402 的边角时序。个人 Key 模式天然不扣积分、不受影响；共享模式维持现状。与买家秀「失败扣费策略」一致。本条仅留档，如需引入退款再单独立项。

### pricing 前后端双真源同步 **[技术债·低优先级]**

模型定价在两处手维护：`server/src/utils/pricing.ts`（后端扣费用）与 `src/types/adapter.ts` 的 `MODELS[].pricing`（前端展示用）。改价时必须两处同步。建议后续抽单一真源（如共享 JSON / 枚举）消除漂移风险。

### 迁移前 DB 备份 **[已做·留档]**

新积分迁移（`×200/7`，`migration_credits_v1`）执行前已备份：`server/data/momo.db.bak-20260615-224649`。迁移已验证幂等（标志位 `done`）且余额对账通过（admin 7.2 元 → 205.714 新积分）。若需回滚，清 `system_config.migration_credits_v1` 标志位后从备份恢复（反向迁移有精度损失，不建议）。

### 浏览器端 UI 验收 **[待验证]**

后端 curl 与类型检查已通过，但「我的额度」/「计费说明」两页、双显排版（按钮「3.0 积分 (¥0.105)」）、个人模式文案切换未做浏览器实测。建议按 `docs/requirements/billing.md` §9 走一遍。

---

## AI 生图模块重构（2026-06-15）

### 买家秀主图改走 OSS 中转：行为变化 **[已确认·保持现状]**

重构后 `MakeBuyerShowPanel` 的主图（阿里 CDN URL）经 `submitTask` 的 `processUrl` 浏览器端下载后转传到自有 OSS（原来直接把 CDN URL 传给 ToAPIs 服务端拉取）。**更可靠但批量时延迟增加**，CORS/防盗链失败时回退原始 URL（仍交 ToAPIs）。用户已确认**接受此取舍、保持现状**，不对已知 CDN（alicdn 等）加直传不中转的特例。真实测试已跑通（结果正常），见 `scripts/image-gen-tests/`。本条仅留档。

### BatchPoseSwapPage feature_id 误用 **[低优先级·预存在]**

`src/views/tools/BatchPoseSwapPage.vue`（换姿势）的 `featureId` 为 `'change-clothes'`（HEAD 即如此，copy-paste 遗留），与 `BatchClothesSwapPage` 相同。仅影响任务列表的 feature 筛选分组，不影响生图。建议改为 `'change-pose'`（需同步 `featureConfig` / `featurePromptApi` key）。

### 死代码与重复 helper 清理 **[低优先级]**

- `src/adapter/toapisClient.ts` 的 `uploadImage` 现仅被批量页面用、`createTask(body)` 几乎无调用方；`imageGeneration.ts` 末尾 `GenerateImageParams` 类型别名无引用——确认无外部依赖后可删。
- `resolveSlotUrl`/`sleep` 在 `BatchClothesSwapPage` 与 `BatchPoseSwapPage` 重复定义，可抽到共享 utils。

### 回归测试已落地 **[已实现]**

`scripts/image-gen-tests/`：真实跑 ToAPIs/OSS，覆盖自由生图、批量换衣共享图不重复上传、买家秀行级轮询、generateImage DB 终态写入。改生图核心逻辑后重跑。`fixtures/` 下测试图已 gitignore（本地保留）。

---

## AI 买家秀（2026-06-14）

### 制作买家秀：端到端未验证 **[待验证]**

`MakeBuyerShowPanel.vue` 已实现并通过 `npm run check`，但完整流程（Excel 导入、逐行生图、刷新后按 `toapis_task_id` 恢复轮询、对比弹窗、按商品ID 打包 zip、5s 快速失败自动重试）未在真实 OSS/ToAPIs 环境跑通。建议按 `docs/requirements/buyer-show.md` §3.5 走一遍。

### 制作买家秀：不加 system prompt（已决定） **[已确认·保持现状]**

每行直接用表格「提示词」作为生图 prompt，**不拼系统提示词**。用户已确认保持现状；如未来需要「真人模特穿着展示」等统一风格，再为 `feature_id='buyer-show'` 追加按模型配置的 system prompt（可挂 `feature_prompts`）。本条仅留档。

### 制作买家秀：失败扣费策略（已决定） **[已确认·保持现状]**

积分在 `taskApi.create` 时由服务端扣除，**失败不退款**。「5s 内快速失败自动重试」上限维持 **2**，**不实现**「失败退积分」。用户已确认保持现状；如需调整，改 `MakeBuyerShowPanel.vue` 中 `MAX_AUTO_RETRY` / `FAST_FAIL_MS` 两常量即可。本条仅留档。

### 制作买家秀：权限范围（已确认） **[已确认]**

`/api/buyer-show-batch` 任意登录用户可用、按 `user_id` 隔离——符合「全员可用」预期，无需 admin 限制。本条仅留档。

### 素材库：浏览器实测 **[待验证]**

已过后端 curl 冒烟与类型检查，但未做浏览器 UI 验收。建议按需求文档 §2.7 验收标准 + 验收清单走一遍（管理员 CRUD、普通用户只读复制、表格粘贴每条一格、标签筛选、网格/列表、分页）。

### 素材库：标签管理面板未建 **[低优先级]**

当前标签仅在上传/编辑弹窗内通过 allow-create 增删；服务端已具备 `POST/DELETE /tags`。如需集中改名/批量删标签，再补一个管理 UI。

### 素材库：`sort_order` 拖拽排序未暴露 **[低优先级]**

`buyer_show_materials.sort_order` 与 `buyer_show_tags.sort_order` 已建表但 UI 未提供拖拽排序。需要时参考模板图库的 starred 拖拽实现。

---

## 高优先级

### AI摄影：502 生成失败排查 **[进行中]**

AI摄影生成任务返回 502。ToAPIs 和 OSS 单独测试均正常。已在服务端加了调试日志（`/tmp/momoaigc-debug.log`），等待用户测试后定位根因。详见 `docs/records/bug-fixes.md`。

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
