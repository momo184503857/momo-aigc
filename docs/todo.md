# TODO

待办事项和风险点，按优先级排列。

---

## AI 买家秀（2026-06-23）

### 任务历史 / 重新生成 待端到端验证 **[待验证·中优先级]**

任务历史（Tab）+ 工作区重新生成（覆盖旧结果）+ 刷新结果丢失修复均已通过 `npm run check` 与 `npm run build`，但**未在真实 OSS/ToAPIs 环境跑通**。建议起前后端走一遍：上传 Excel → 一键生图 → 刷新确认结果仍在 → 重新生成确认覆盖 → 归档 → 任务历史回看/下载/改名/删除。规则见 `requirements/buyer-show.md` §3。

### 历史 bug 数据结果图不可恢复 **[已知限制·低优先级]**

2026-06-22 修复刷新结果丢失前，`buyer_show_batch_items.task_id` 因字段名不匹配从未写入（NULL）。这些旧行（迁移后已归档进任务历史）刷新后仍无结果图——结果还在 `generation_tasks` 但已无可关联字段，无法可靠回连。受影响批次需重新上传 Excel 生成。

---

## 计费与消耗统计（2026-06-20）

### 个人 Key 真实 ToAPIs 花费未记录 **[待确认·低优先级]**

「我的消耗」的个人 Key 消耗按平台单价 `calculateCost` 折算（非真实 ToAPIs 扣费）。平台不记录个人 Key 逐任务的真实 ToAPIs 费用（个人模式 `points_cost=0`、不写流水），仅能拿到当前余额快照、无法回溯历史每日花费。若要真实花费：需在任务完成时把 ToAPIs 返回的费用落库（仅对今后新任务有效，历史无）。当前折算方案用户已接受。详见决策日志 2026-06-20。

### ToAPIs 代理偶发返回 HTML（生图失败） **[待排查·可能与既有 502 同因]**

云端 pm2 日志观察到 `[ToAPIs Proxy] Create task error: Unexpected token '<', "<!DOCTYPE"...` —— ToAPIs（或上游）返回 HTML 页面而非 JSON，导致生图请求失败。与本轮计费/统计改动无关（未碰 toapis-proxy / 生图）。可能原因：共享 Key 失效/过期、ToAPIs 服务异常/限流。可能与既有「AI摄影 502 排查 [进行中]」同因。待复现后查 `server/src/routes/toapis-proxy.ts` 日志定位。

---

## 时间显示·北京时间（2026-06-19）

### 浏览器端 UI 实测 **[待验证·低优先级]**

全项目时间已统一为北京时间（存 UTC、显示 / 按天查询按 UTC+8 换算），`npm run check` 通过、后端 SQL 已用真实库（3401 条任务）跑通。但**未做浏览器实测**（本机无 Playwright/Puppeteer）。建议起前后端在「生图日志 → 生成统计」走一遍：选当天查询、确认北京傍晚提交的任务落在今日柱 + 单日过滤包含它；并确认 ECharts 控制台不再有 `Can't get DOM width or height` / `containLabel` 告警。规则与文件清单见 `decision-log.md` / `bug-fixes.md` 2026-06-19。

---

## AI 画布（2026-06-17）

### 文字 AI 计费：当前不扣分（阶段性） **[待确认·维持现状]**

文字 AI（text-ai 节点）目前**不扣积分**（共享/个人模式均不扣），属用户确认的阶段性决策（「目前就先不扣分，让用户白嫖」）。与图像（共享模式扣分）不对称是有意为之。若后续改为计费：需定义文本模型 token 单价、复用 `tasks.ts` billing 分支（共享扣 / 个人不扣）。已记入项目记忆避免误改。详见 `canvas.md` §3.2。

### gemini-3.1-flash-lite 视觉支持未确认 **[待确认·低优先级]**

文字 AI 多模态图片输入依赖模型视觉能力：gpt-5.5 文档明确支持；`gemini-3-flash` 一般支持；`gemini-3.1-flash-lite` 作为轻量版**是否支持视觉输入未确认**。若用户选 flash-lite 连图无响应，换 gpt-5.5 验证。

### 画布任务在主列表「功能」标签显示为原始 canvas **[低优先级·展示瑕疵]**

画布生图任务 `feature_id='canvas'`，在主任务列表「功能」标签显示为原始 `canvas`（`featureConfig` 无此 id，无中文名）。不影响功能。需要时在 featureConfig 补 canvas 条目或做展示映射。

---

## 积分与 Key 计费体系（2026-06-15）

### Key 的「积分」数据源 **[已解决·留档]**

`server/src/utils/credits.ts` 的 `fetchKeyCredits(apiKey)` 直接返回 ToAPIs token-balance 接口（`GET /v1/balance`）的 `credits`（remain_credits）字段作为 Key 的「积分」；「余额」= 积分 × 0.035。原先误以为需要单独的「获取新积分接口」并做了 `credits=null` 占位，现已修正为真实值。规则：**不**用 `remain_balance`、**绝不** ÷0.035 反推（积分是源，余额是派生）。

### 计费失败退款 / 扣费时序 **[已解决·留档]**

**2026-06-20 起「失败不扣费」已实现**：计费仍在 `POST /api/tasks` 创建时预扣，但任务失败时（`PATCH /api/tasks/:id` 转 failed）自动退款（退余额 + 写 `refund` 流水 + 清零 `points_cost`）。详见 `billing.md` §4/§6 与决策日志 2026-06-20。历史已扣未退由启动迁移 `refund_failed_v1` 补退（本地 73 笔 / 云端 74 笔）。

**仍存在的边角时序（未处理）**：扣费发生在「调 ToAPIs 之后」（create-task 先、扣分后），存在 ToAPIs 已扣但本地余额不足返回 402 的极边角时序——维持现状，影响极小。个人 Key 模式天然不扣积分、不受影响。

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

### 制作买家秀：失败扣费策略（已决定） **[已更新·退款已实现]**

买家秀生图复用 `generation_tasks`，失败时同样走 `PATCH /api/tasks/:id` 退款（2026-06-20 起，见 `billing.md` §4）——失败任务自动退积分。「5s 内快速失败自动重试」重试建新任务另扣、失败任务退款，两者正交，用户不为失败付费。`MAX_AUTO_RETRY` / `FAST_FAIL_MS` 维持不变。本条仅留档。

### 制作买家秀：权限范围（已确认） **[已确认]**

`/api/buyer-show-batch` 任意登录用户可用、按 `user_id` 隔离——符合「全员可用」预期，无需 admin 限制。本条仅留档。

### 素材库：浏览器实测 **[待验证]**

已过后端 curl 冒烟与类型检查，但未做浏览器 UI 验收。建议按需求文档 §2.7 验收标准 + 验收清单走一遍（管理员 CRUD、普通用户只读复制、表格粘贴每条一格、标签筛选、网格/列表、分页）。

### 素材库：标签管理面板未建 **[低优先级]**

当前标签仅在上传/编辑弹窗内通过 allow-create 增删；服务端已具备 `POST/DELETE /tags`。如需集中改名/批量删标签，再补一个管理 UI。

### 素材库：`sort_order` 拖拽排序未暴露 **[低优先级]**

`buyer_show_materials.sort_order` 与 `buyer_show_tags.sort_order` 已建表但 UI 未提供拖拽排序。需要时参考模板图库的 starred 拖拽实现。

---

## 模板图库 / 模板收藏（2026-06-16）

### 两图已满时点击收藏模板「替换第一槽」语义 **[待确认·低优先级]**

生图工作台两图功能页（换衣服等 7 个，共用 `FeatureForm.vue`）的模板收藏行已改为始终常驻。当两个上传槽位都已满时，点击收藏缩略图仍走 `handleStarredSelect` → **替换第一个槽位**（如换衣服的「模特图」），不弹选择。此为既有逻辑，本轮未改。若后续觉得易误操作（用户可能本意是替换第二槽 / 衣服图），可改为「提示选择替换哪张」。暂保留现状。

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

### 结果图裂开修复：待浏览器实测 **[待验证·低优先级]**

2026-06-24 已移除任务列表 / 对比弹窗 / 任务详情 / 结果页结果图的 `crossorigin`（根因 = crossorigin 触发 OSS CORS 校验失败，图片裂开），并加 `useImageRetry` 失败重试。`npm run check` 通过，但**未做浏览器实测**。建议起前端走一遍：任务列表结果缩略图、点开对比弹窗（含买家秀）、任务详情、`/results` 结果页——确认结果图不再裂开、偶发抖动有自动重试。规则见 `decision-log.md` / `bug-fixes.md` 2026-06-24。

### OSS CORS 配置状态：与现象矛盾，待重新确认 **[待确认·中优先级]**

2026-06-05 曾结论「OSS CORS 已正确配置、`crossorigin="anonymous"` 不阻止图片加载、下载策略1（DOM Canvas）可命中」。但 2026-06-24 排查发现：带 `crossorigin="anonymous"` 的结果图 OSS URL 在任务列表 / 对比弹窗 / 详情 / 结果页大量裂开，不带该属性的同一张图正常——强烈指向 OSS 对当前部署域名未返回有效 CORS 响应头（`Access-Control-Allow-Origin`），与旧结论冲突。OSS Bucket CORS 的当前实际配置**待确认**：需在阿里云 OSS 控制台核对该 Bucket 的 CORS 规则（是否配置、`allowed origins` 是否含生产/开发域名、`allowed methods` 是否含 GET、是否返回 ACAO）。

注意：即便确认 OSS CORS 正常，结论仍是「展示型结果图不加 `crossorigin`」（图片显示不应依赖 OSS 配置）。本轮已移除全部结果图 `crossorigin`，见 `bug-fixes.md` / `decision-log.md` 2026-06-24。

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

当前生产服务器使用 HTTP（`http://REDACTED-SERVER-IP`）。下载优化后 blob URL 会提示 "loaded over an insecure connection"。功能不受影响，但上 HTTPS 后警告会消失。

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
