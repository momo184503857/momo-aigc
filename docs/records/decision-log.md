# Decision Log

技术决策记录，按时间倒序。

---

## 2026-06-20 — 失败任务退款：预扣 + 失败退款（推翻「失败不退款」）

**背景**：原规则「计费在创建时预扣、失败不退款」（2026-06-14 决策、与买家秀一致）。用户要求失败不应扣费。

**决策 — 预扣不变，失败时退款（而非「成功才扣费」）**：计费仍在 `POST /api/tasks` 创建时预扣（保留余额校验、原子写任务+流水），任务失败时（`PATCH /api/tasks/:id` 转 `failed`）退款。**否决**「改为成功才扣费」——那需把扣费推迟到结果回调、失败路径与 ToAPIs 时序更易错；预扣+退款复用现有创建扣费逻辑，退款是新增的正向操作，对称清晰。

**退款实现要点**：① 仅「非终态(submitted/queued/in_progress) → failed」退款，**不退 completed→failed**（防「拿图后标失败」套退）；② 同事务退余额 + 写 `refund` 流水 + 清零 `points_cost`——清零同时实现幂等（已退则=0 跳过）与统计正确（`SUM(points_cost)` 净口径）；③ 历史已扣未退由启动迁移 `refund_failed_v1` 一次性补退。

**后续影响**：消耗统计口径 = `SUM(points_cost)`（净），不要再加 `status='completed'` 过滤；买家秀「5s 快速失败重试」与退款正交（重试建新任务另扣，失败任务退款）。旧文档「失败不退款」均已更新。

---

## 2026-06-20 — 个人 Key 消耗统计：按平台单价 calculateCost 折算（非真实 ToAPIs 花费）

**背景**：「我的消耗」要同时展示平台 Key 与个人 Key 的消耗趋势。但个人 Key 生图的真实花费发生在用户自己的 ToAPIs 账户，平台**不记录**（个人模式 `points_cost=0`、不写流水）。

**决策 — 用 `calculateCost(model,resolution,n)`（平台单价）折算个人 Key 消耗**：把个人任务按平台价算出「等价值」，与平台消耗同单位（新积分/¥）同图对比。**否决**「查 ToAPIs 真实花费」——平台无逐任务 ToAPIs 费用数据，仅能拿到当前余额快照，无法回溯历史每日花费。

**实现要点**：① 个人任务以「无 `generation` 流水」识别（个人模式不写流水；共享模式一定写，含已退款失败任务）——避免退款过的失败任务被误算成个人；② 失败任务两侧均不计消耗（平台失败已退款 points_cost=0；个人失败亦排除），口径一致；③ 折算值非真实 ToAPIs 扣费，页面明确标注「按平台单价折算」。

**后续影响**：若要真实 ToAPIs 花费，需在任务完成时把 ToAPIs 返回的费用落库（仅对今后新任务有效，历史无）。见 `todo.md`。

---

## 2026-06-19 — 全项目时间：存 UTC、显示与按天查询统一按北京时间（UTC+8）

**背景**：所有时间戳（`created_at`/`updated_at`/`completed_at`/`last_login_at`/`checked_at` 等）都以 UTC 存储（SQLite `CURRENT_TIMESTAMP` = `YYYY-MM-DD HH:MM:SS`，JS `new Date().toISOString()`）。但前端多处直接 `.slice(0, N)` 原样截断，对北京用户**晚 8 小时**；后端按天统计用 `DATE(created_at)`（UTC 日）、日期范围用 `created_at >= '<date>'`（UTC 零点），导致北京 16:00–24:00 提交的任务被归到前一天或漏过滤。要求全项目时间一律显示北京时间。

**决策 — 存储（UTC）不动，只在「显示」和「按天逻辑」边界换算**：① 显示统一走前端共享 util `src/utils/datetime.ts`（`parseUTC` / `toBJMinute` / `toBJSecond` / `toBJDate` / `toBJMinuteFromMs`，+8h 后用 `getUTC*` 格式化，null/无效返回 `-`）；② 后端按天统计/过滤走 `server/src/utils/datetime.ts`（`bjDay(col)`=`DATE(col,'+8 hours')`；`bjDateRangeClause(col,start,end)` 用「位移参数」`datetime(?,'-8 hours')` 把北京零点 / 23:59:59 换算成 UTC 瞬时，列保持裸值走索引）。**否决**：把存储改成北京时间字符串——破坏排序/比较、跨时区易错、`CURRENT_TIMESTAMP` 默认值无法本地化。

**产品规则**：面向用户的所有时间一律显示北京时间；查询的日期范围 / 按天图表也按北京日。后端 API 返回的 `*_at` 仍是 UTC 原值，前端负责格式化。

**边界统一（行为修正）**：4 个列表（`stats.ts`/`tasks.ts`/`points.ts`/`admin/tasks.ts`）的 `end_date` 此前 3 条裸 `<= '<date>'`（实际只到当天 UTC 00:00，漏掉大半天）+ 1 条 `< ... 23:59:59`，现已统一为「北京日闭区间 `[<start> 00:00, <end> 23:59:59]`」。

**后续影响**：新增任何展示 `*_at` 的地方必须用 `toBJ*`，禁止裸 `.slice()`；新增按天统计 / 日期过滤必须用 `bjDay` / `bjDateRangeClause`。

---

## 2026-06-17 — AI 画布文字 AI：Key 与图像共用 + 不扣积分（阶段性）

**背景**：文字模型（text-ai 节点）此前固定用共享 Key（`getKey()`），与图像生成的 `resolveUserApiKey` 不一致；计费文档亦写「canvas-ai 不接入个人 Key」。用户要求「图片用哪个 Key，文字模型就用哪个 Key」。

**决策 1 — Key 与图像共用（resolveUserApiKey），而非维持固定共享 Key**：个人模式用个人 Key、否则共享 Key，与图像完全一致。**作废** billing 旧规则「canvas-ai 不接入个人 Key」。原因：调用链统一、用户预期一致（同一 Key 模式贯穿图像与文字）；后端 `messages` 透传，无需额外改造。

**决策 2 — 文字模型不扣积分（阶段性，两模式均不扣）**：文字调用成本低，当前阶段为拉新/体验让用户免费使用文字 AI（共享模式下相当于「白嫖」共享 Key）。**与图像不对称（图像共享模式扣分）是有意为之**，非遗漏。原因：用户明确「目前就先不扣分，让用户白嫖」。

**后续影响**：若要改为计费，需先确认，并定义文本模型 token 单价、复用 `tasks.ts` 的 billing 分支（共享扣 / 个人不扣）。已记入项目记忆，避免被当 bug 误改。

---

## 2026-06-16 — 个人 Key 余额轮询：全局 + per-user 存库（非 localStorage、非页面级）

**背景**：个人 Key 模式下头像与「我的额度」余额此前从不自动刷新（仅在模式切换瞬间拉一次）。需让用户自配刷新频率，且头像也要跟着刷新。

**决策**：轮询放前端 `serverStatus` store **全局**进行，间隔按用户存数据库 `user_toapis_keys.balance_check_interval_sec`（默认 60，`0`=不查询），头像与「我的额度」共享同一份数据。**否决**：① 仅在「我的额度」页面轮询（头像仍不刷新，与诉求相悖）；② 存 localStorage（换设备/重登不一致）。

**配套**：进入个人模式立即拉一次基线值；间隔 >0 按间隔轮询；间隔 =0 仅手动（「刷新」按钮）。`GET /api/toapis/health` 顺带返回间隔，轮询器免额外请求。

---

## 2026-06-16 — 首次配置个人 Key：允许先选模式（前端本地态），不依赖后端硬限制

**背景**：原「未存 Key 切个人模式 → 后端 400 / radio 禁用」造成鸡生蛋——要先存 Key 才能选个人模式，而 Key 输入只在个人模式下出现。

**决策**：允许在未保存 Key 时选中「个人 Key」模式（前端本地态），展示「配置个人 Key」入口；后端 `use_personal_key` 保持 0、`canGenerate=false`，**保存 Key 前禁止生图**，保存时一并激活。后端 `PATCH /key-mode` 无 key 时仍 400，仅作激活前置校验（前端不再依赖它阻止选择）。保留「personal 激活 = 必有可用 Key」的后端语义（`resolveUserApiKey` / health 不变）。

---

## 2026-06-15 — 积分与 Key 计费体系：四项关键取舍

**背景**：从「单一共享 Key + 元计费」演进到「共享/个人双 Key + 新积分」。详见 `docs/requirements/billing.md`。

**决策 1 — 个人 Key 服务端加密存储 + 服务器代理，而非浏览器直连（PRD v1.0 的 localStorage 方案作废）**：用户 Key 用 AES-256-GCM 存 `user_toapis_keys`，调用仍走服务器代理。原因：① 调用链路与现状一致、不引入浏览器→toapis.com 的 CORS 隐患；② 服务器能统一决定扣不扣积分；③ Key 不暴露在前端。代价：Key 过服务器（管理员理论可读 DB），用加密 + env 密钥缓解。

**决策 2 — 个人 Key 模式不消耗平台积分（cost=0）**：自带 Key = ToAPIs 直接扣用户自己的账户，绕过积分；语义最清晰、避免双重收费。仅共享模式扣分。

**决策 3 — 新积分作为存储与扣费主单位，一次性迁移（非展示层折算）**：`1 新积分 = ¥0.035`，历史元数据 `×(200/7)` 幂等迁移（`migration_credits_v1` 守卫）。原因：用户明确「实际扣费以新积分为准」「改回以新积分为扣费单位」；pricing 因此得到整数（3/4/5/10/20）。代价：动历史数据，迁移前需备份 DB。

**决策 4 — Key 的「积分」取 ToAPIs token-balance 的 `credits` 字段，余额 = 积分 × 0.035（已修正）**：Key 积分 = `GET /v1/balance` 返回的 `remain_credits`（直接读取，不换算）；「余额」= 积分 × 0.035。**不**用 `remain_balance`（CNY），**绝不** ÷0.035 反推（积分是源、余额是派生）。原方案误以为是「独立上游接口」并做 `credits=null` 占位，后澄清就是 token-balance 接口，已改为返回真实 credits。左下角头像积分按 Key 模式切换：共享→平台积分，个人→Key 积分。

**加密密钥兜底**：`ENCRYPTION_KEY` 缺失时从 `JWT_SECRET` HKDF-SHA256 派生 + 启动告警，保证已有部署升级不崩；补配后旧密文需用户重存。

**后续影响**：key 新积分接口到位后只替换 `fetchKeyCredits()` 函数体；pricing 前后端双真源（`pricing.ts` + `adapter.ts`）需手动同步（记为技术债）。

---

## 2026-06-15 — AI 生图模块重构为三层架构（适配器 / 核心 / UI）

**背景**：生图逻辑散落 6 个调用方，轮询/OSS 转存/请求体构建多处重复，改一处需同步改多处，且新增入口要重写流程。要求「以后只改函数、各页面自动生效，新页面只复用不重写」。

**决策**：按三层高内聚低耦合组织——① 适配器 `toapisClient.ts`（纯 API 封装）② 核心模块 `imageGeneration.ts`（`submitTask`/`pollTask`/`importResultUrls`/`generateImage`，零 UI 依赖）③ UI 层 `useTaskManager.ts` + 各页面（只管 reactive 状态与列表）。所有调用方强制走统一入口，禁止页面直接拼装 `toapisProxyApi`+`taskApi`+`ossApi`。

**分步 vs 一键**：核心模块同时暴露分步函数（`submitTask`+`pollTask`+`importResultUrls`，供需要自定义轮询节奏/转存时机的调用方组合）和高层封装 `generateImage({poll, import})`（供工作流节点等需要阻塞式一键调用的场景）。两种轮询语义明确二分——阻塞式 `pollTask`（工作流）vs 定时器单查 `getTaskStatus`（UI 列表），不可混用。

**DB 终态由核心模块负责**：`generateImage({poll})` 成功写 `completed`、失败/超时写 `failed`，保证不遗留孤立 `submitted` 记录。分步调用方（UI 列表、买家秀行级轮询）各自在轮询到终态时写 DB。

**deprecated 参数一步到位删除**：`imageUrls`/`tempImageFiles`/`templateUrls` 直接移除，统一 `refImages: Array<{url?, file?}>`，不做兼容过渡——调用方有限且都在本仓内。

**原因**：跨页面复用是核心诉求，重复实现是主要痛点；保留 deprecated 参数会长期维持两套入参、阻碍收敛。三层切分使「改上传策略/轮询间隔/请求体只改一处」成立。

**后续影响**：未来新增生图入口只调 `submitTask` 或 `generateImage`；新增模型只改 `buildRequestBody` 分发与 `MODELS` 配置。回归用 `scripts/image-gen-tests/` 重跑。

---

## 2026-06-14 — AI 买家秀：制作买家秀与素材库后端完全隔离

**背景**：「AI买家秀」页两个 Tab 由两位开发者并行实现——素材库（`buyerShow.ts` + `buyer_show_materials` 等）与制作买家秀（`buyerShowBatch.ts` + `buyer_show_batch_items`）。需避免合并冲突与语义混淆。

**决策**：制作买家秀使用**独立的表、独立的路由文件、独立的挂载前缀** `/api/buyer-show-batch`（区别于素材库的 `/api/buyer-show`），不修改对方的表与路由；前端业务全部落在 `MakeBuyerShowPanel.vue`，`BuyerShowPage.vue` 仅作 `el-tabs` 外壳。

**原因**：两个子功能的数据模型、权限模型（素材库有管理员/公开之分；制作买家秀全员按用户隔离）、生命周期都不同，强行共用表/路由会耦合并发编辑；独立前缀使双方可并行提交、零合并冲突。

**实现**：生图复用既有 `generation_tasks`（`feature_id='buyer-show'`），仅新增映射表 `buyer_show_batch_items`；其 `model / resolution / result_image_urls` 等展示字段通过 `GET /items` 左联 `generation_tasks` 取得，**不落本表**（此前「缺列」疑虑据此澄清）。

**后续影响**：后续新增的买家秀子功能若与既有两者数据模型不同，沿用「独立表 + 独立前缀 + 独立面板组件」模式。

---

## 2026-06-14 — 制作买家秀：提交后 5s 内失败自动重试（上限 2）

**背景**：ToAPIs 偶发瞬时失败（限流、同步拒绝等），用户要求「提交后 5 秒内失败则自动重新生成」。

**决策**：轮询到 `failed` 时，若 `now - submittedAt < 5000ms` 且本行自动重试次数 `< 2`，弹提示并新建任务重提；否则转终态失败，由用户手动重试。每次提交/重提刷新 `submittedAt`；手动重试重置计数；刷新后恢复轮询的行（无 `submittedAt`）不自动重试。

**原因（取舍）**：积分在任务**创建时**扣除、失败不退款，自动重试会为同一行多次扣分。上限 2 在「挽救瞬时失败」与「控制扣费」间取平衡；超 5s 的失败更可能是真实生成失败，不自动重试。

**后续影响**：若需更激进/保守策略，调整 `MakeBuyerShowPanel.vue` 中 `FAST_FAIL_MS` / `MAX_AUTO_RETRY` 两常量；若引入「失败退积分」，可放宽上限。见 `docs/todo.md` 待确认项。

---

## 2026-06-14 — AI 买家秀：图片流量一律浏览器直传 OSS，服务端只存链接

**背景**：OSS 流量/带宽费昂贵，用户明确要求图片字节尽可能不经过自有服务器。素材库涉及批量上传、展示、放大，是高流量场景。

**决策**：上传用 `ossApi.upload(file, 'materials')`——先 `POST /api/oss/upload-token`（服务端仅签发 OSS PostObject policy，不接收字节），再由浏览器 `fetch(oss上传地址, formData)` 直传；展示缩略图与放大预览（`UiImagePreview`）均直连 OSS public URL。

**原因**：服务端经手图片字节会产生双向流量（入站收 + 转发到 OSS 出站），大图/批量场景成本高；PostObject policy 方案让服务端只做轻量签名，字节走「浏览器 → OSS」最短路径。

**实现**：
- 复用既有 `generateOssUploadToken`，新增 `materials` scope（OSS key 前缀 `materials/<userId>/...`）。
- **禁用** `POST /api/oss/upload`（multer 内存缓存再转发，字节经服务器）与 `POST /api/proxy/image`（跨域「另存为」下载代理，本功能不涉及）。
- 服务端 `/api/admin/buyer-show/batch`、`PATCH /:id` 只接收/写入 `oss_bucket / oss_object_key / public_url` 字符串。

**后续影响**：所有后续「图片密集」功能（如制作买家秀的结果图）应遵循同一约束；任何需要服务端经手图片字节的方案需先评估流量成本。

---

## 2026-06-14 — AI 买家秀素材库：使用专用标签表，不复用 gallery_tags

**背景**：素材库需要全局共享、管理员维护的标签体系。既有 `gallery_tags` 表为「按用户隔离」设计（`user_id` + `UNIQUE(user_id, name)`），服务于模板图库的私有标签。

**决策**：新建专用表 `buyer_show_tags`（`name` 全局 UNIQUE，无 `user_id`）+ `buyer_show_material_tags` 多对多关联，不复用 `gallery_tags`。

**原因**：复用 `gallery_tags` 要么把管理员标签泄漏到每个用户的私有标签列表，要么特殊处理 `user_id IS NULL`，两者都破坏既有语义与查询。素材库标签是全用户共享的全局维度，独立表最清晰。

**实现**：标签增删幂等（同名返回已存在 id）；`ON DELETE CASCADE` 清理关联；列表标签筛选走 `INNER JOIN` + `COUNT(DISTINCT)`。

**后续影响**：若未来出现多个全局共享标签的业务域，可考虑抽象一张全局标签字典表；当前一个域一张表，成本可接受。

---

## 2026-06-07 — AI摄影：每元素独立 system_prompt（方案 B），非全局 prompt 模板

**背景**：AI摄影功能需要让用户将不同图片分配给不同"元素"（人脸、姿势、衣服等），AI 需要知道每张图对应的语义。三种方案：

- **A**：全局 system_prompt（一个 feature 一个 prompt），元素映射由系统自动注入 — 简单但无法精细控制每个元素的语义
- **B**：每元素独立 system_prompt（per element × per model），管理员为每个元素单独写提示词 — 灵活但配置工作量大
- **C**：混合模式（全局 prompt + 元素简短描述）

**决策**：选择方案 B。

**原因**：摄影场景中各元素语义差异大（人脸要保特征、衣服要保款式、背景要保氛围），需要独立 prompt 控制精度。管理员配置一次后不频繁修改，工作量可接受。

**实现**：
- 新增 `photography_element_prompts` 表，每元素每模型一行
- 生成时按元素 sort_order 拼接所有已分配元素（跳过未拖图的元素）的 system_prompt
- 系统自动在 prompt 末尾生成"参考图映射（按顺序）：第N张 — XX参考、YY参考"描述段
- 一图多元素时自动去重：同一 PoolImage 拖到多个元素，只发一次给 API

**后续影响**：
- AdminPhotography.vue 配置页需支持每元素×每模型的 prompt 编辑（参考 AdminFeaturePrompts 模式）
- 未来如果元素语义简单可用，可考虑降级为方案 A

---

## 2026-06-07 — AI摄影：图片池与元素分配的解耦设计

**背景**：用户需求是同一张上传图片可作为多个元素的参考（如全身照同时是姿势和衣服参考），图片只需上传一次。

**决策**：
1. 图片池（PoolImage[]）与元素分配（`Record<elementId, poolImageId[]>`）完全解耦
2. 从池拖到元素区使用 HTML5 `effectAllowed: 'copy'` 语义 — 图片留在池中，元素区获取引用
3. 生成时按元素 sort_order 遍历分配，收集唯一图片 ID → 去重后生成 refImages

**放弃的方案**：图片池和元素槽位合并设计（类似 FeatureForm 的 ImageSlot 模式，每槽位独立上传）— 无法支持一图多用。

---

## 2026-06-07 — AI摄影任务列表共用：复用 generation_tasks 表而非新建表

**背景**：AI摄影任务需要与生图工作台共用任务列表。

**决策**：复用现有 `generation_tasks` 表，`feature_id='ai-photography'`。元素-图片映射存储在 `supplementary_images` JSON 字段（`[{name: "人脸", url: "..."}]` 格式）。

**原因**：
- 避免新建表和重复的任务管理逻辑
- TaskPanel 的功能筛选自动支持新 feature_id
- 重新编辑/重新生成的流程可复用 useTaskManager 的大部分逻辑

**后续影响**：`supplementary_images` 字段在 AI摄影中存储了元素标签到图片 URL 的完整映射，而非原始设计中的"带名称的补充图片"。语义上有轻微差异但格式兼容。重新编辑通过反向解析此字段恢复图片池和元素分配。

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
