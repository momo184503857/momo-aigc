# 积分与 Key 计费体系

最后更新：2026-06-20  
状态：已实现·后端已验证（curl + 直连 SQLite）/ 前端已验证（类型检查 + 构建）

> 本文档反映当前实现，取代 PRD v1.0 中「用户 ToAPIs Key 只存浏览器本地，服务器不保存」「不做复杂计费系统」的早期设定。

---

## 1. 概述

平台生图调用 ToAPIs 中转。每个用户生图时使用以下两种 Key 之一，模式由用户自由选择、全局生效：

| 模式 | Key 来源 | 计费 |
|------|----------|------|
| **共享 Key**（默认） | 管理员在 `/admin/toapis-key` 配置，存 `system_config.toapis_api_key`，全员共用 | 消耗用户的**新积分**（按 `pricing` 单价） |
| **个人 Key**（可选） | 用户在 `/settings` 自行配置，服务端 AES-256-GCM 加密存储，仅本人用 | **不消耗平台积分**，费用由用户自己的 ToAPIs 账户承担 |

计费主单位为**新积分**：`1 新积分 = ¥0.035`（人民币）。所有展示处同时显示新积分与折合人民币（括号）。

---

## 2. 角色与权限

- **普通用户**：在 `/my-quota` 配置/测试/清空个人 Key、切换平台/个人模式、设置余额查询间隔，并查看平台余额/流水与 Key 额度。`/settings` 已降级为占位页（仅「前往我的额度」入口）。
- **管理员**：在 `/admin/toapis-key` 配置共享 Key；在 `/admin/users`、`/admin/points` 为用户充值/扣减新积分；查看所有用户积分与流水（`/admin/dashboard`）。
- 模式对所有登录用户**自由选择**，不强制；管理员也是用户，同样可配置个人 Key。

---

## 3. 数据模型

- `user_toapis_keys`（每用户至多一行，`user_id` 主键）：`encrypted_key` / `key_iv` / `key_tag`（AES-256-GCM）、`key_hint`（脱敏）、`use_personal_key`(0/1)、`encryption_version`、`balance_check_interval_sec`（个人 Key 余额轮询间隔，秒，默认 60，`0`=不查询）。
- `users.points`（REAL）—— **新积分**余额。
- `points_transactions`：`amount`（带符号，新积分）/ `balance_after` / `reason`（`generation` 生图扣费 / `admin_recharge` 管理员充值 / `admin_deduct` 管理员扣减 / `refund` 失败退款）。退款行 `reference_type='generation_task'`、`reference_id` 指向被退的任务。
- `generation_tasks.points_cost` / `points_balance_after` —— 新积分。**净消耗口径**：失败任务退款后 `points_cost` 清零（=0），故 `SUM(points_cost)` 天然只算「成功/进行中」的消耗，**统计消耗时不要再加 `WHERE status='completed'`**（会漏掉进行中已扣的），也不要把失败算进去。
- 定价：`server/src/utils/pricing.ts` + `src/types/adapter.ts` `MODELS[].pricing`（双真源，需手动保持一致）。
- **历史迁移**：曾以「元」为存储单位；一次性幂等迁移 `migration_credits_v1`（`×200/7`）已将上述列转为新积分。`toapis_balance_history`（ToAPIs CNY 快照）不迁移。

---

## 4. 业务流程

1. 生图时 `resolveUserApiKey(userId)` 解析当前应使用的 Key：`use_personal_key=1` 且能解密 → 个人 Key（mode `personal`）；否则共享 Key（mode `shared`）。
2. `POST /api/toapis/create-task` / `/task-status/:id` / `/upload` 用解析到的 Key 调 ToAPIs。
3. `POST /api/tasks` 扣费（仅共享模式）：
   - 计算 `cost = calculateCost(model, resolution, n)`（新积分）。
   - 余额不足 → 402。
   - 扣减 `users.points`、写 `generation_tasks`（含 `points_cost` / `points_balance_after`）、写 `points_transactions`（`reason='generation'`）。
   - **个人模式**：`cost=0`，跳过余额校验/扣减/流水，但仍写 `generation_tasks`（`points_cost=0`）。
4. **失败退款**（`PATCH /api/tasks/:id`）：任务从非终态（`submitted`/`queued`/`in_progress`）转为 `failed` 且 `points_cost>0` 时，**同一事务内**退 `users.points`、写 `points_transactions`（`reason='refund'`、`amount=+points_cost`）、清零该任务 `points_cost`。**不退 `completed→failed`**（防「拿图后标失败」套退）。清零 `points_cost` 兼顾幂等（已退则 `=0` 跳过）与统计正确。个人 Key 任务 `points_cost=0`，无退款发生。

---

## 5. 默认值

- 换算：`YUAN_PER_CREDIT = 0.035`，`CREDITS_PER_YUAN = 200/7`。
- 定价（每张，新积分）：

  | 模型 | 单价 |
  |------|------|
  | gpt-image-2 | 1K:3 / 2K:4 / 4K:5 |
  | gemini-3-pro-image-preview | 1K:10 / 2K:10 / 4K:20 |
  | gemini-3.1-flash-image-preview | 512/1K/2K/4K:5 |
  | gemini-2.5-flash-image-preview | 1K:2.4 |

- 个人 Key 加密：优先 env `ENCRYPTION_KEY`（32B hex）；缺失时从 `JWT_SECRET` 用 HKDF-SHA256 派生兜底（启动告警；补配后旧密文需用户重存）。
- 个人模式默认关闭；保存 Key **不**自动切换模式（尊重「自由选择」）；但若用户当前已选「个人 Key」模式（本地态），保存 Key 时会一并激活。
- 个人 Key 余额轮询间隔默认 **60 秒**；快捷项 1 分钟(60) / 30 分钟(1800) / 1 小时(3600) / 1 天(86400) / 不查询(0)；亦可手动输入 0~604800 之间的秒数。

---

## 6. 业务规则与边界

- 个人 Key 生图**不扣积分**；任务记录仍写入（`points_cost=0`），保证任务列表可见。
- **失败不扣费**（2026-06-20 起，推翻旧「失败不退款」）：计费在任务创建时**预扣**（`POST /api/tasks`），任务失败时**自动退款**（`PATCH /api/tasks/:id` 转 `failed` 时退余额+写 `refund` 流水+清零 `points_cost`）。详见 §4 与决策日志 2026-06-20。历史已扣未退的失败任务由启动迁移 `refund_failed_v1` 一次性补退（幂等）。
- **消耗统计口径**：消耗金额 = `SUM(generation_tasks.points_cost)`（净，失败退款后已清零）。统计/列表**不要再加 `status='completed'` 过滤**（会漏进行中已扣），失败也无需排除（已为 0）。「累计充值」只算 `admin_recharge`（**不含失败退款**，退款不是充值）。
- **个人 Key 消耗**：平台不记录其真实 ToAPIs 花费（费用在用户自己的 ToAPIs 账户）。统计中「个人 Key 消耗」按**平台单价 `calculateCost` 折算**（平台等价值，非真实 ToAPIs 扣费），仅用于横向对比生图量级；真实花费以用户 ToAPIs 账户为准。
- **Key 的「积分」= ToAPIs token-balance 接口（`GET /v1/balance`）返回的 `credits`（remain_credits）字段**，直接读取，不换算。`fetchKeyCredits(apiKey)` 即此实现。「余额」= 积分 × 0.035（`creditsToYuan`）。**不**用 `remain_balance`（CNY 账户余额），**绝不** ÷0.035 反推积分（积分是源、余额是派生）。
- ToAPIs 的 `remain_balance`（账户/令牌余额的 CNY 值）与展示用的「余额」不是同一个数——展示余额恒为 `积分 × 0.035`。
- `canvas-ai` 文字模型 **Key 与图像共用**（`resolveUserApiKey`，个人模式用个人 Key），但**不扣积分**（两模式均不扣，阶段性决策；详见 `canvas.md` §3.2 与决策日志）。**[2026-06-17 更正：原「不接入个人 Key，保持共享 Key」已作废]**
- 清空个人 Key → 删除整行 → 自动回退共享模式。
- **首次配置流程**：允许在未保存个人 Key 时选中「个人 Key」模式（前端本地态）——此时仅显示「配置个人 Key」入口与「未启用」余额提示；后端 `use_personal_key` 仍为 0、`canGenerate=false`，**保存 Key 前禁止生图**。保存 Key 时若当前处于个人模式则一并激活。后端 `PATCH /key-mode` 在无 key 时仍返回 400，仅作为激活前置校验（前端不再依赖它阻止选择）。
- **个人 Key 余额轮询为全局行为**：在前端 `serverStatus` store 中按用户配置的间隔轮询 `GET /me/toapis/balance`，头像与「我的额度」共享同一份数据。进入个人模式立即拉一次基线值；间隔 >0 按间隔轮询；间隔 =0（不查询）仅手动刷新。「不消耗平台积分」的提示只保留一处（顶部模式标签 + 计费说明页），不在「我的额度」个人分支内重复。

---

## 7. 展示规则

- 所有显示积分处统一 `X 积分 (¥Y)`，`Y = X × 0.035`，统一调用 `formatCredits()`（`src/types/adapter.ts`），**禁止手写 `×0.035`**。
- 余额类：积分取整、¥ 保留 2 位；单价类：积分保留 1 位、¥ 保留 3 位。
- 个人 Key 模式下，所有生成入口（工作台 / AI摄影 / 工具箱批量 / 买家秀）的按钮与确认弹窗**显示本次实际消耗** `formatCredits(成本)`（自带「积分 + ¥人民币」），并追加「· 个人 Key」标记（如「生成图片 · 3 积分 (¥0.11) · 个人 Key」）。计费逻辑不变（仍不消耗平台积分、仍跳过余额预校验）。
- **左下角头像上方的积分按当前 Key 模式显示**：共享模式 → 平台积分（`users.points`）；个人模式 → 该 Key 的积分（token-balance `credits`）。两者余额均为 `积分 × 0.035`。个人模式下头像余额由全局轮询按用户配置间隔刷新（不再仅模式切换时拉一次）。
- 头像下拉入口（顺序）：我的额度、我的消耗、计费说明、个人设置、退出登录。

---

## 8. 页面与端点

| 页面 | 路径 | 说明 |
|------|------|------|
| 个人设置 | `/settings` | **占位页**：Key/额度管理已迁至 `/my-quota`，仅留「前往我的额度」入口与「更多账户设置即将推出」占位 |
| 我的额度 | `/my-quota` | 顶部「平台积分 / 个人 Key」模式开关；**平台分支**=平台余额 + 最近 10 条流水；**个人分支**=个人 Key 余额卡 +「配置个人 Key」按钮（弹窗内：Key 输入/测试/清空 + 余额查询间隔设置） |
| 我的消耗 | `/my-consumption` | 个人消耗统计：KPI（余额/累计消费/累计充值）+ **消耗趋势（平台 Key 与个人 Key 双线）** + 充值趋势 + 明细表；支持 日/周/月 切换 + 日期范围；从头像菜单进入 |
| 计费说明 | `/pricing` | 本地定价表（每个模型 × 分辨率 → 新积分 + ¥），无外部链接 |
| 共享 Key 管理 | `/admin/toapis-key` | 管理员配置共享 Key、查 ToAPIs 余额（标注 credits） |

端点：
- 用户 Key：`/api/me/toapis/*`（`GET /key-config`、`PUT /key`、`PATCH /key-mode`、`PATCH /balance-interval`、`DELETE /key`、`POST /test`、`GET /balance`）。`GET /key-config` 与 `GET /api/toapis/health` 均返回 `balanceCheckIntervalSec`；`PUT /key` 可附带 `balanceCheckIntervalSec`，`PATCH /balance-interval { intervalSec }` 单独更新（0~604800，无 key → 400）。
- 我的额度：`GET /api/me/quota`。
- 余额/流水：`GET /api/points/me` → `{ balance, total_spent, total_recharged, total_consumed }`（`total_recharged` 仅 `admin_recharge`、**不含退款**；`total_consumed` = `SUM(points_cost)` 净消耗）；`GET /api/points/me/transactions`。
- 我的消耗趋势：`GET /api/points/me/daily?granularity=day|week|month&start_date&end_date` → 每周期 `{ date, spent(平台净), personal(个人 Key 按平台单价折算), recharged(admin_recharge), count }`。
- 管理端统一活动日志：`GET /api/admin/activity`（`generation_tasks` 与非生成计费流水 `UNION ALL`，生成计费流水去重；按 类型/状态/用户/日期 筛选 + 分页）；管理端统计 `GET /api/admin/stats/{users,daily,summary}` 均支持日期 + 用户过滤，`/daily` 支持 `granularity=day|week|month`。
- 管理员调账：`POST /api/admin/users/:id/points`（amount 为新积分）。
- 健康状态：`GET /api/toapis/health` → `{ sharedKeyConfigured, personalKeyConfigured, personalKeyActive, balanceCheckIntervalSec }`。

---

## 9. 验收标准

- 共享模式：生 1 张 gpt-image-2 1K 扣 3 新积分（¥0.105），`points_cost=3`、流水 `-3`；余额不足返回 402 `需要 3 积分`。
- 个人模式：生图 `points_cost=0`、无新流水、积分不变、任务记录仍在；生成按钮显示实际消耗（如「3 积分 (¥0.11) · 个人 Key」）。
- 失败退款：共享模式任务转 `failed` 后，余额恢复 = 原扣分、多一条 `refund` 流水、任务 `points_cost=0`；`completed→failed` 不退（防套退）；个人 Key 任务失败本就 `points_cost=0`，无退款。
- 消耗统计：`/my-consumption` 与 `/admin/dashboard` 的消耗金额 = `SUM(points_cost)`（失败任务贡献 0），「累计充值」不含失败退款；`/my-consumption` 消耗趋势平台/个人双线随 日/周/月 + 日期范围联动。
- 未存 Key 时可选「个人 Key」模式（显示配置入口、禁止生图）；保存 Key 后激活；清空 Key 自动回退共享。
- 头像与「我的额度」个人 Key 余额按配置间隔刷新；选「不查询」时不自动刷新，「刷新」按钮可手动拉取。
- 所有积分展示处为 `X 积分 (¥Y)` 双显；`/my-quota` 顶部模式开关 + 按模式切换的平台/个人内容；`/pricing` 渲染四模型定价表。
- 个人 Key 加密存取正常；`/api/toapis/health` 反映正确的 key 模式并返回 `balanceCheckIntervalSec`。

---

## 需求变更记录

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
