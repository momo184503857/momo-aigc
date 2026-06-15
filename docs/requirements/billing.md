# 积分与 Key 计费体系

最后更新：2026-06-16  
状态：已实现·后端已验证（curl）/ 前端已验证（类型检查 + 构造）

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

- **普通用户**：在 `/settings` 配置/测试/清空个人 Key、切换模式；在 `/my-quota` 查看余额/流水/Key 额度。
- **管理员**：在 `/admin/toapis-key` 配置共享 Key；在 `/admin/users`、`/admin/points` 为用户充值/扣减新积分；查看所有用户积分与流水（`/admin/dashboard`）。
- 模式对所有登录用户**自由选择**，不强制；管理员也是用户，同样可配置个人 Key。

---

## 3. 数据模型

- `user_toapis_keys`（每用户至多一行，`user_id` 主键）：`encrypted_key` / `key_iv` / `key_tag`（AES-256-GCM）、`key_hint`（脱敏）、`use_personal_key`(0/1)、`encryption_version`。
- `users.points`（REAL）—— **新积分**余额。
- `points_transactions`：`amount`（带符号，新积分）/ `balance_after` / `reason`（`generation` / `admin_recharge` / `admin_deduct`）。
- `generation_tasks.points_cost` / `points_balance_after` —— 新积分。
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
- 个人模式默认关闭；保存 Key **不**自动切换模式（尊重「自由选择」）。

---

## 6. 业务规则与边界

- 个人 Key 生图**不扣积分**；任务记录仍写入（`points_cost=0`），保证任务列表可见。
- 计费在**任务创建时**扣除（`POST /api/tasks`），**失败不退款**（与买家秀等一致，维持现状）。
- **Key 的「积分」= ToAPIs token-balance 接口（`GET /v1/balance`）返回的 `credits`（remain_credits）字段**，直接读取，不换算。`fetchKeyCredits(apiKey)` 即此实现。「余额」= 积分 × 0.035（`creditsToYuan`）。**不**用 `remain_balance`（CNY 账户余额），**绝不** ÷0.035 反推积分（积分是源、余额是派生）。
- ToAPIs 的 `remain_balance`（账户/令牌余额的 CNY 值）与展示用的「余额」不是同一个数——展示余额恒为 `积分 × 0.035`。
- `canvas-ai` 文字模型不接入个人 Key（不涉及积分），保持共享 Key。
- 清空个人 Key → 删除整行 → 自动回退共享模式。
- 未存个人 Key 切个人模式 → 后端 400，前端 radio 禁用。

---

## 7. 展示规则

- 所有显示积分处统一 `X 积分 (¥Y)`，`Y = X × 0.035`，统一调用 `formatCredits()`（`src/types/adapter.ts`），**禁止手写 `×0.035`**。
- 余额类：积分取整、¥ 保留 2 位；单价类：积分保留 1 位、¥ 保留 3 位。
- 个人 Key 模式下，生图按钮/批量页显示「个人 Key · 不消耗积分」，隐藏价格与余额预校验。
- **左下角头像上方的积分按当前 Key 模式显示**：共享模式 → 平台积分（`users.points`）；个人模式 → 该 Key 的积分（token-balance `credits`）。两者余额均为 `积分 × 0.035`。
- 头像下拉入口（顺序）：我的额度、计费说明、个人设置、退出登录。

---

## 8. 页面与端点

| 页面 | 路径 | 说明 |
|------|------|------|
| 个人设置 | `/settings` | 个人 Key 输入/测试/清空、模式切换、平台余额 |
| 我的额度 | `/my-quota` | 平台余额(¥) + 最近 10 条流水 + Key 积分（个人 Key 的 token-balance credits） |
| 计费说明 | `/pricing` | 本地定价表（每个模型 × 分辨率 → 新积分 + ¥），无外部链接 |
| 共享 Key 管理 | `/admin/toapis-key` | 管理员配置共享 Key、查 ToAPIs 余额（标注 credits） |

端点：
- 用户 Key：`/api/me/toapis/*`（`GET /key-config`、`PUT /key`、`PATCH /key-mode`、`DELETE /key`、`POST /test`、`GET /balance`）。
- 我的额度：`GET /api/me/quota`。
- 余额/流水：`GET /api/points/me`、`GET /api/points/me/transactions`。
- 管理员调账：`POST /api/admin/users/:id/points`（amount 为新积分）。
- 健康状态：`GET /api/toapis/health` → `{ sharedKeyConfigured, personalKeyConfigured, personalKeyActive }`。

---

## 9. 验收标准

- 共享模式：生 1 张 gpt-image-2 1K 扣 3 新积分（¥0.105），`points_cost=3`、流水 `-3`；余额不足返回 402 `需要 3 积分`。
- 个人模式：生图 `points_cost=0`、无新流水、积分不变、任务记录仍在。
- 未存 Key 切个人模式 → 400 / radio 禁用；清空 Key 自动回退共享。
- 所有积分展示处为 `X 积分 (¥Y)` 双显；个人模式按钮显示「不消耗积分」。
- `/my-quota` 三卡片齐全；`/pricing` 渲染四模型定价表。
- 个人 Key 加密存取正常；`/api/toapis/health` 反映正确的 key 模式。

---

## 需求变更记录

### 2026-06-15 — 新增「积分与 Key 计费体系」业务域（合并两轮改动）

- **改动一（用户自带 Key）**：在原「管理员共享 Key + 积分」之外，新增「用户自带 Key（服务端 AES-256-GCM 加密存储 + 服务器代理调用）」路径。用户可在 `/settings` 配置/切换；个人 Key 模式生图不消耗积分。新增 `user_toapis_keys` 表、`/api/me/toapis/*` 端点、`resolveUserApiKey()`、`serverStatus` 的 `canGenerate`/`usingPersonalKey`、`/settings` 页。
- **改动二（新积分体系）**：存储与扣费统一改为「新积分」（1 新积分 = ¥0.035），旧元单位一次性迁移（`×200/7`，幂等 `migration_credits_v1`）。`pricing` 改整数（3/4/5/10/20，2.5-flash=2.4）。所有展示统一 `formatCredits()` 双显。新增「我的额度」(`/my-quota`)、「计费说明」(`/pricing`) 两页与 `/api/me/quota` 端点。

### 2026-06-16 — 头像积分按 Key 模式显示 + Key 积分数据源更正

- **Key 积分数据源更正**：澄清「获取新积分接口」就是 ToAPIs token-balance（`GET /v1/balance`）的 `credits`（remain_credits）字段——一直在用。Key 的「积分」直接读 `credits`（不换算），「余额」= 积分 × 0.035。**不**用 `remain_balance`、**绝不** ÷0.035 反推（积分是源、余额是派生）。`fetchKeyCredits()` 由 `credits=null` 占位改为返回真实 credits。
- **头像积分按模式显示**（`SidebarMenu`）：共享模式 → 平台积分（`users.points`）；个人模式 → 该 Key 的积分（token-balance `credits`）。修复「个人模式下头像仍显示共享余额」的误导。
- **修正 AdminToApisKey 的 ÷0.035 反推错误**：改用 `credits` 直接显示，余额 = credits×0.035。删除前后端无用的 `yuanToCredits`（÷0.035 方向，禁用）。
