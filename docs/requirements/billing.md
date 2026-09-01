# 积分与 Key 计费体系

最后更新：2026-09-01（积分汇率 1:1 调整后口径）  
状态：已实现·后端已验证（fixed-channels 单元 20/20 + 接口/集成 36/36 PASS + 真实生图 e2e）

> 本文档反映当前实现。**2026-09-01 起积分与人民币汇率 1:1（1 积分 = ¥1）**，
> 存量金额与模型定价已由 `migration_credits_v2`（×0.035）一次性换算，价值不变；
> 界面积分单显（不再双显 ¥ 括号）。
> **2026-08-21 fixed-channels 重构后：用户自建渠道（我的渠道）整体下线，
> 渠道收敛为管理员配置的平台渠道 + 一渠道多 Key 优先级轮换（欠费自动切换）；计费单轨——
> 所有模型按平台定价扣积分**。

---

## 1. 概述

生图统一经**平台渠道**（管理员在「配置」页维护，一渠道配多把 Key 按 `priority ASC, id ASC` 轮换）：

| 模式 | 渠道模型来源 | 计费 |
|------|--------------|------|
| **平台积分**（唯一） | 平台渠道模型（管理员配置），模型下拉按渠道分组 | 按 `ai_models.pricing[分辨率] × n` 预扣**新积分** |

上游欠费自动切换：某 Key 被上游判定欠费/额度耗尽（HTTP 402，或 400/403/429 且文案含「余额不足/欠费/insufficient/quota/balance」）→ 服务端标记该 Key `exhausted` → 立即换下一个可用 Key 重试本次请求，用户无感；渠道所有 Key 耗尽/停用 → 任务 failed（错误码 `ALL_KEYS_EXHAUSTED`）+ 全额退款。耗尽 Key 仅管理员在管理端「重新启用」后恢复参与轮换。

计费主单位为**新积分**：`1 新积分 = ¥1`（人民币，2026-09-01 起；历史曾为 ¥0.035）。
积分与人民币数值恒等，界面统一积分单显。

### 定价真源（单一，D5/S6）

积分定价**只在管理后台「配置」页配置一处**：`ai_models.pricing`（JSON：`{"1K":0.105,"2K":0.14,...}`，按渠道×模型×分辨率，单位积分=元）。
前后端共用同一真源（前端经 `GET /api/models/catalog` 读取；「计费说明」页动态渲染）。
原 `server/src/utils/pricing.ts` 硬编码与前端 `MODELS[].pricing` 常量已删除。生图模型保存时定价必填且必须覆盖全部生效分辨率（fixed-channels 后无用户渠道豁免）。

### 扣费/退款时序（服务端编排）

1. **预扣**：`POST /api/generations` 事务内按 `单价×n` 预扣（`users.points` - `points_transactions(reason=generation)` ×n 条，任务各记 `points_cost`/`points_balance_after`）；积分不足 402，任务不创建。
2. **退款**：任务进入 failed（提交失败/上游失败/全部 Key 耗尽/超时/启动清扫）自动全额退款（`refund` 流水，`points_cost` 清零）；completed 后不再退（防套退）。
3. 生成数量 n 的费用 = 单价 × n（每条任务各扣一次，沿用原口径）。

---

## 2. 角色与权限

- **普通用户**：只能使用平台渠道模型生图（按积分计费）；在 `/my-quota` 查看平台余额与流水。无任何 Key/渠道配置入口（fixed-channels 后「我的渠道」页、侧边栏 Key 余额行均已删除）。
- **管理员**：在 `/admin/ai-config`（配置页）维护平台渠道/逻辑模型/渠道模型与定价/**Key 池**（多 Key、优先级、启停、耗尽态查看与重新启用、明文复制、单 Key/渠道级测试连通）；在 `/admin/users` 为用户充值/扣减新积分。

---

## 3. 数据模型

- **渠道与 Key 池**：`api_providers`（全部平台渠道；`owner_user_id` 为休眠死列，全表恒 NULL）；Key 存 `api_provider_keys`（明文存储、一渠道多 Key、`priority` 小者优先、`status` 含服务端写入的 `exhausted`）。旧表 `user_toapis_keys` 已 DROP（T7）。
- `users.points`（REAL）—— **新积分**余额（1:1 后即元值）。
- `points_transactions`：`amount`（带符号，新积分）/ `balance_after` / `reason`（`generation` 生图扣费 / `admin_recharge` 管理员充值 / `admin_deduct` 管理员扣减 / `refund` 失败退款）。退款行 `reference_type='generation_task'`、`reference_id` 指向被退的任务。
- `generation_tasks.points_cost` / `points_balance_after` —— 新积分。**净消耗口径**：失败任务退款后 `points_cost` 清零（=0），故 `SUM(points_cost)` 天然只算「成功/进行中」的消耗，**统计消耗时不要再加 `WHERE status='completed'`**（会漏掉进行中已扣的），也不要把失败算进去。
- 定价：`ai_models.pricing`（DB 单一真源；详见上文「定价真源」）。
- **历史迁移**：①曾以「元」为存储单位，`migration_credits_v1`（`×200/7`）转为旧积分；②2026-09-01 汇率 1:1 化，`migration_credits_v2`（`×0.035`，迁移前 `VACUUM INTO` 自动备份）换算 users.points / generation_tasks.points_* / points_transactions.* / ai_models.pricing，账目价值不变。`toapis_balance_history`（ToAPIs CNY 快照）不迁移。

---

## 4. 业务流程

1. 生图提交统一走 `POST /api/generations`（服务端编排）：校验能力 → 按 `pricing[分辨率]×n` 预扣 → 落库 → 派发（`withKeyFailover` 按优先级取 Key，欠费自动切换）。
2. 异步渠道（toapis）提交任务号回填 `provider_task_id`，轮询 `GET /api/generations/:id/status` 推进终态并转存 OSS；同步渠道（openai_image / volcengine_image）后台执行 `runSyncTask`（同样接入 Key 轮换）。
3. **失败退款**：任务从非终态转 `failed` 且 `points_cost>0` 时，同一事务内退 `users.points`、写 `points_transactions`（`reason='refund'`、`amount=+points_cost`）、清零该任务 `points_cost`。**不退 `completed→failed`**（防「拿图后标失败」套退）。渠道全部 Key 耗尽（`ALL_KEYS_EXHAUSTED`）同样走该退款路径。

---

## 5. 默认值

- 换算：`YUAN_PER_CREDIT = 1`，`CREDITS_PER_YUAN = 1`（历史：0.035 / 200÷7，v2 迁移已换算）。
- 定价（每张，新积分 = 元，随 `ai_models.pricing` 配置实时生效；下表为 credits_v2 换算后的种子值）：

  | 模型 | 单价 |
  |------|------|
  | gpt-image-2（ToAPIs） | 1K:0.105 / 2K:0.14 / 4K:0.175 |
  | gpt-image-2（易联） | 全档 0.14 |
  | gemini-3-pro-image-preview | 1K:0.35 / 2K:0.42 / 4K:0.56 |
  | gemini-3.1-flash-image-preview | 512:0.175 / 1K:0.21 / 2K:0.28 / 4K:0.42 |
  | gemini-2.5-flash-image-preview | 1K:0.084 |

- 新增 Key 默认优先级 = 该渠道现有最大 + 1（首个为 1）；Key 全部明文存储（`key_iv` 置空）。

---

## 6. 业务规则与边界

- **计费单轨**（F5）：所有渠道模型按平台定价预扣积分；「用户渠道 cost=0 / 跳过余额预检」分支已废止。历史定价缺口由迁移保证：T7 删除了全部用户渠道，平台生图模型定价必填校验（无豁免）保证不存在无定价可提交模型。
- **欠费切换判定**（F3）：HTTP 402 无条件；400/403/429 且错误文案匹配 `/余额不足|欠费|insufficient|quota|balance/i`；401/5xx/网络错误不切换（防误判）。轮询与转存路径不接入切换（S3）。
- **失败不扣费**：计费在任务创建时**预扣**，任务失败时**自动退款**（含全部耗尽）。详见 §4。历史已扣未退的失败任务由启动迁移 `refund_failed_v1` 一次性补退（幂等）。
- **消耗统计口径**：消耗金额 = `SUM(generation_tasks.points_cost)`（净，失败退款后已清零）。统计/列表**不要再加 `status='completed'` 过滤**（会漏进行中已扣），失败也无需排除（已为 0）。「累计充值」只算 `admin_recharge`（**不含失败退款**，退款不是充值）。
- `canvas-ai` 文字模型调用**不扣积分**（沿用阶段性决策），Key 走渠道 Key 池（同样接入欠费切换）。
- Key 明文仅管理端可见；用户侧任何接口不回显 Key。

---

## 7. 展示规则

- 所有显示积分处统一 `X 积分`（1:1 后积分即元值，不再双显 ¥ 括号），统一调用 `formatCredits()`（`src/types/adapter.ts`），**禁止散写换算**。
- 小数位：全链路统一 2 位（账务存储与展示同精度，存量 3 位值已由 `migration_credits_dp2` 取整）；展示**向上取整**（0.105 → 0.11），大数场景可取整。
- 所有生成入口（工作台 / 自由生图 / AI摄影 / 工具箱批量 / 买家秀）的按钮与确认弹窗显示本次消耗 `生成图片 · X 积分`（×张数，取自 `modelCatalog.priceFor`，无「个人渠道」字样）。
- **左下角头像上方的积分**：始终显示平台积分（`users.points`，`X 积分`）。旧「Key 余额」行已随个人渠道下线删除。
- 头像下拉入口（顺序）：我的额度、我的消耗、计费说明、个人设置、退出登录。

---

## 8. 页面与端点

| 页面 | 路径 | 说明 |
|------|------|------|
| 个人设置 | `/settings` | **占位页**：仅留「前往我的额度」入口 |
| 我的额度 | `/my-quota` | 平台积分余额卡 + 最近 10 条流水 |
| 我的消耗 | `/my-consumption` | 个人消耗统计：KPI（余额/累计消费/累计充值）+ 消耗趋势 + 充值趋势 + 明细表；支持 日/周/月 切换 + 日期范围 |
| 计费说明 | `/pricing` | 动态定价矩阵（目录真源渲染：每个逻辑模型一张表，行 = 分辨率（各渠道并集）、列 = 渠道，格 = 单张积分；最低价高亮、「—」= 该渠道不提供此分辨率） |
| 渠道与 Key 池管理 | `/admin/ai-config` | 管理员维护平台渠道、逻辑模型、渠道模型与定价、Key 池（优先级/耗尽/重新启用/明文复制/测试） |

端点：
- 旧用户 Key 端点 `/api/me/toapis/*` 与「我的渠道」`/api/my/*` 全组已删除（404）；`GET /api/me/quota` 仅返回 `{ platform, recentTransactions }`。
- 余额/流水：`GET /api/points/me` → `{ balance, total_spent, total_recharged, total_consumed }`（`total_recharged` 仅 `admin_recharge`、**不含退款**；`total_consumed` = `SUM(points_cost)` 净消耗）；`GET /api/points/me/transactions`。
- 我的消耗趋势：`GET /api/points/me/daily?granularity=day|week|month&start_date&end_date` → 每周期 `{ date, spent(净), recharged(admin_recharge), count }`。
- 管理端统一活动日志：`GET /api/admin/activity`；管理端统计 `GET /api/admin/stats/{users,daily,summary}` 均支持日期 + 用户过滤，`/daily` 支持 `granularity=day|week|month`。
- 管理员调账：`POST /api/admin/users/:id/points`（amount 为新积分）。

---

## 9. 验收标准

- 生 1 张 gpt-image-2 1K 扣 0.105 积分（=¥0.105），`points_cost=0.105`、流水 `-0.105`；余额不足返回 402 `积分不足，需要 0.105 积分`。
- 失败退款：任务转 `failed` 后，余额恢复 = 原扣分、多一条 `refund` 流水、任务 `points_cost=0`；`completed→failed` 不退（防套退）。
- 欠费切换：渠道 K1 欠费 K2 可用 → 本次任务成功（出站先 K1 后 K2），K1 标记 exhausted（含时间戳）；管理员重新启用后 K1 恢复参与轮换。
- 全部 Key 耗尽/停用 → 任务 failed（`ALL_KEYS_EXHAUSTED`）+ 全额退款。
- 消耗统计：`/my-consumption` 与 `/admin/dashboard` 的消耗金额 = `SUM(points_cost)`（失败任务贡献 0），「累计充值」不含失败退款。
- 所有积分展示处为 `X 积分` 单显；`/pricing` 标明「1 积分 = ¥1」并按目录真源渲染定价表；模型下拉仅平台渠道分组、按钮文案统一无「个人渠道」字样。

---

## 需求变更记录

### 2026-09-01 — 积分精度全链路统一 2 位小数（展示向上取整）

- **精度规则**：积分计费与存储从 3 位小数统一为 2 位（与人民币分位对齐）：预扣 / 逐张扣费 / 失败退款 / 管理端充值扣减一律经 `roundCredits()`（`server/src/utils/credits.ts`）2 位舍入入账；管理端定价输入精度收窄为 2 位（step 0.01）。
- **迁移 `migration_credits_dp2`**：`users.points`、`generation_tasks.points_cost/points_balance_after`、`points_transactions.amount/balance_after` 统一 `ROUND(x, 2)`，`ai_models.pricing` 逐档取整；迁移前 `VACUUM INTO` 自动备份、失败中止启动；幂等守卫 `system_config.migration_credits_dp2`；取整差每行最多 ±0.005。
- **展示**：`formatCredits()` 默认 2 位小数且**向上取整**（`ceilCreditValue()`：先对齐毫厘整数再进位，消除浮点 dust）；任务面板余额 tag 由整数改 2 位，模型选择器价格标签同步 2 位。
- **历史折算口径不变**：`server/src/utils/pricing.ts`（个人 Key 历史折算）保持 3 位，不影响现行计费。

### 2026-09-01 — 积分汇率 1:1（1 积分 = ¥1）

- **汇率调整**：`YUAN_PER_CREDIT` 0.035 → 1（前后端两处常量）。存量金额与模型定价由幂等迁移 `migration_credits_v2` 统一 ×0.035（价值不变、账目连续；`ai_models.pricing` 逐行 JSON 换算），迁移前 `VACUUM INTO backup-pre-credits-v2-<ts>.db` 自动备份、失败中止启动。种子定价常量（T6/易联）保持旧单位，由 v2 在启动末尾统一换算；**此后新增种子须直接写新单位**。
- **展示收敛**：`formatCredits()` 改积分单显（去 `X 积分 (¥Y)` 双显，两个数值 1:1 后恒等），默认 3 位小数；图表 ¥ 轴标签、充值弹窗「≈ ¥」折算、扣减确认 ¥ 提示全部移除；管理端充值输入小数位放宽至 2 位，定价输入精度 3 位（step 0.001）。
- **配套**：`server/src/utils/pricing.ts` 硬编码表（仅剩个人 Key 历史折算在用）同步换算为新单位。表结构、API 字段、错误文案、「积分」措辞全部不变。

### 2026-08-21 — fixed-channels：渠道固定化 + Key 池轮换 + 计费单轨

- **用户自建渠道（我的渠道）整体下线**：页面/菜单/侧边栏 Key 余额行/入口卡片全删；`/api/my/*` 与 `/api/me/toapis/*` 返回 404；`user_toapis_keys` 表 DROP（T7）；`resolveUserApiKey`/`personalKeyCredits`/`channelBalance` store/`estimatePriceFor`/`isMineModel` 等随之下线。
- **计费单轨（F5）**：废止「用户渠道 cost=0 / 跳过余额预检」双轨——所有渠道模型按 `ai_models.pricing[分辨率] × n` 预扣积分、失败退款；生图模型定价必填无豁免。
- **Key 池与欠费切换（F2/F3/F4）**：一渠道多 Key，`priority ASC, id ASC` 取第一个可用；上游欠费（402 或 400/403/429×关键词）→ 标记 `exhausted` → 换 Key 重试本次请求；全部耗尽 → 任务 failed（`ALL_KEYS_EXHAUSTED`）+ 全额退款；耗尽恢复仅管理员手动「重新启用」。
- **目录瘦身**：`GET /api/models/catalog` 仅 `{ platform }`；模型下拉只按平台渠道分组，按钮/价格文案统一（无「个人渠道」字样）；默认模型 = 目录第一个可用模型。
- 详见 `docs/requirements/fixed-channels.md`（功能方案）与 `docs/design/fixed-channels-tech.md`（技术方案）。

### 2026-08-20 — 个人渠道优先展示：目录置顶 + 左下角 Key 余额 + 按钮预计消耗

- **模型目录置顶**：`stores/modelCatalog` 归一化顺序由「平台组在前」改为「我的渠道组在前、平台组在后」，默认模型同步优先首个「我的渠道」模型（用户配置了自有 Key 即优先使用；无个人渠道时行为不变）。
- **左下角 Key 余额**：新增 `stores/channelBalance.ts`，用户存在 active 的 toapis 协议渠道时，侧边栏底部平台积分行下方显示「Key 余额 X 积分 (¥Y)」（口径不变：token-balance `credits`，余额 = 积分 × 0.035）；按渠道 `balanceCheckIntervalSec` 轮询（0 = 仅手动），点击行手动刷新。多渠道时取首个。
- **按钮显示预计消耗**：新增 `modelCatalog.estimatePriceFor()` —— 个人渠道模型按**同逻辑模型的平台定价**折算参考价（与消耗统计折算口径一致，真实费用仍由用户与上游结算）。所有生成入口（工作台 / 自由生图 / AI摄影 / 工具箱批量 / 买家秀）的按钮与确认弹窗显示 `预计 X 积分 (¥Y)`（×张数）并保留「· 个人渠道」标记；无参考价（纯自定义模型）时回退「个人渠道 · 不扣积分」。平台模型按钮由显示单价改为显示**总价**（单价 × 张数）。

### 2026-06-15 — 新增「积分与 Key 计费体系」业务域（合并两轮改动）

- **改动一（用户自带 Key）**：在原「管理员共享 Key + 积分」之外，新增「用户自带 Key（服务端 AES-256-GCM 加密存储 + 服务器代理调用）」路径。用户可在 `/settings` 配置/切换；个人 Key 模式生图不消耗积分。新增 `user_toapis_keys` 表、`/api/me/toapis/*` 端点、`resolveUserApiKey()`、`serverStatus` 的 `canGenerate`/`usingPersonalKey`、`/settings` 页。
- **改动二（新积分体系）**：存储与扣费统一改为「新积分」（1 新积分 = ¥0.035），旧元单位一次性迁移（`×200/7`，幂等 `migration_credits_v1`）。`pricing` 改整数（3/4/5/10/20，2.5-flash=2.4）。所有展示统一 `formatCredits()` 双显。新增「我的额度」(`/my-quota`)、「计费说明」(`/pricing`) 两页与 `/api/me/quota` 端点。

### 2026-06-16 — 头像积分按 Key 模式显示 + Key 积分数据源更正

- **Key 积分数据源更正**：澄清「获取新积分接口」就是 ToAPIs token-balance（`GET /v1/balance`）的 `credits`（remain_credits）字段——一直在用。Key 的「积分」直接读 `credits`（不换算），「余额」= 积分 × 0.035。**不**用 `remain_balance`、**绝不** ÷0.035 反推（积分是源、余额是派生）。`fetchKeyCredits()` 由 `credits=null` 占位改为返回真实 credits。
- **头像积分按模式显示**（`SidebarMenu`）：共享模式 → 平台积分（`users.points`）；个人模式 → 该 Key 的积分（token-balance `credits`）。修复「个人模式下头像仍显示共享余额」的误导。
- **修正 AdminToApisKey 的 ÷0.035 反推错误**：改用 `credits` 直接显示，余额 = credits×0.035。删除前后端无用的 `yuanToCredits`（÷0.035 方向，禁用）。

### 2026-06-16 — Key/额度管理归位「我的额度」+ 个人 Key 余额全局轮询 + 个人模式按钮显示消耗

- **页面归位**：个人 Key 输入/测试/清空、平台↔个人模式切换、余额查询，全部从 `/settings` 迁到 `/my-quota`；`/settings` 降级为占位页（仅跳转入口）。`/my-quota` 顶部新增醒目「平台积分 / 个人 Key」模式开关，下方内容按所选模式切换；个人 Key 配置（含轮询间隔）以「配置个人 Key」弹窗承载。
- **个人 Key 余额全局轮询**：新增 per-user 字段 `user_toapis_keys.balance_check_interval_sec`（默认 60，`0`=不查询），由前端 `serverStatus` store 全局轮询 `GET /me/toapis/balance`，头像与「我的额度」共享同一份数据（修复此前个人模式下头像余额从不自动刷新）。间隔默认 60s，快捷项 1分/30分/1小时/1天/不查询，亦可手动输入 0~604800 秒。
- **个人模式按钮显示消耗**：所有生成入口（工作台/AI摄影/工具箱批量/买家秀）的按钮与确认弹窗，由「个人 Key · 不消耗积分」改为显示本次实际消耗 `formatCredits(成本)`（积分+¥）并追加「· 个人 Key」；计费逻辑不变（不扣平台积分、跳过预校验）。「不消耗平台积分」提示收敛为顶部模式标签 + 计费说明页各一处。
- **首次配置流程变更**：允许在未保存个人 Key 时选中「个人 Key」模式（前端本地态，禁止生图），保存 Key 后激活；取代原「未存 Key 切个人 → 后端 400 / radio 禁用」的硬限制（后端 `PATCH /key-mode` 仍 400，仅作激活前置校验）。
- **新端点/字段**：`PATCH /api/me/toapis/balance-interval`；`GET /key-config` 与 `GET /api/toapis/health` 返回 `balanceCheckIntervalSec`；`PUT /key` 可附带该字段。

### 2026-06-17 — canvas-ai 文字模型 Key 改为与图像共用（推翻「不接入个人 Key」）

- 文字模型（AI 画布 text-ai 节点，`POST /api/canvas-ai/chat`）的 Key 解析由「固定共享 Key（`getKey()`）」改为 `resolveUserApiKey(userId)`——个人模式用个人 Key、否则共享 Key，与图像生成完全一致。**推翻本文件 §6 旧规则「canvas-ai 文字模型不接入个人 Key，保持共享 Key」**。
- 计费维持不变：文字模型**不扣积分**（无论共享/个人模式），属阶段性决策（详见 `docs/requirements/canvas.md` §3.2 与决策日志）。

### 2026-06-20 — 失败任务退款（推翻「失败不退款」）+ 消耗/充值趋势 + 生图日志合并

- **失败退款（核心规则变更）**：推翻本文件 §6 旧规则「失败不退款（维持现状）」。计费仍在任务创建时**预扣**，但任务失败时（`PATCH /api/tasks/:id` 转 `failed`）**自动退款**：退余额 + 写 `reason='refund'` 流水 + 清零 `points_cost`（原子事务；阻止 `completed→failed` 套退）。历史已扣未退的失败任务由启动迁移 `refund_failed_v1` 一次性幂等补退（本地 73 笔 / 云端 74 笔已退）。`points_cost` 清零使 `SUM(points_cost)` 自动成为净消耗口径。
- **生图日志（管理端 `/admin/dashboard`）**：原「任务管理」+「积分流水」两 Tab 合并为「任务与积分」统一活动日志（`GET /api/admin/activity`，UNION ALL 去重生成计费流水）；「生成统计」加「次数/金额」维度 + 「日/周/月」周期切换、左图右栏布局；修复「日期筛选只影响趋势图」——`summary`/`users`/`daily` 统一支持日期+用户过滤。
- **我的消耗（用户端，新页 `/my-consumption`）**：个人消耗趋势（平台 Key 与个人 Key 双线）+ 充值趋势 + KPI（余额/累计消费/累计充值），支持 日/周/月 + 日期范围。个人 Key 消耗按平台单价 `calculateCost` 折算（平台不记录其真实 ToAPIs 花费）。
- **修正**：`/api/points/me` 的 `total_recharged` 原把「失败退款」算进充值，改为只算 `admin_recharge`；新增 `total_consumed`（净消耗）。新增 `GET /api/points/me/daily`、`GET /api/admin/activity`、`/admin/stats` 的 `granularity` 与日期过滤。详见决策日志 / 变更记录 2026-06-20。
