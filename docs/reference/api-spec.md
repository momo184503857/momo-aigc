# API Spec

后端 REST API 接口规范（`/api/*`，Express）。增量补充中——本文档先收录 AI 买家秀相关接口，其他模块按需补充。

约定：
- 除特别注明外，所有接口需 `Authorization: Bearer <JWT>`。
- 统一响应：`{ success: boolean, data?: ..., error?: string }`。
- 列表响应：`data: { records, total, page, pageSize, totalPages }`。
- 图片字节不经服务器：上传先取 token（仅签名），浏览器直传 OSS；服务端只存 `oss_*` 字符串。

---

## AI 买家秀 · 素材库

### 公开路由 `/api/buyer-show`（任意登录用户，只读）

#### GET `/api/buyer-show`
分页列表，按 `created_at DESC`，仅返回公开列（不含 `created_by / original_filename`）。

- Query：`page`（默认 1）、`pageSize`（默认 20，上限 100）、`tagId?`
- Response：`data: { records: Material[], total, page, pageSize, totalPages }`
- `Material`（公开）= `{ id, public_url, prompt, width, height, created_at, tags: [{id,name}] }`

#### GET `/api/buyer-show/tags`
- Response：`data: Tag[]`，`Tag = { id, name, usage_count, created_at }`

### 管理员路由 `/api/admin/buyer-show`（auth + admin，403 若非管理员）

#### GET `/api/admin/buyer-show`
同公开列表，但返回完整行（含 `original_filename / mime_type / size_bytes / created_by / username`）。

#### GET `/api/admin/buyer-show/tags`
同公开标签列表。

#### POST `/api/admin/buyer-show/tags`
- Body：`{ name: string }`
- 幂等：同名返回已存在 id。
- Response：`data: { id, name }`

#### DELETE `/api/admin/buyer-show/tags/:id`
删除标签，`ON DELETE CASCADE` 自动清理关联行。

#### POST `/api/admin/buyer-show/batch`
单事务批量创建素材。`prompt` 必填，空则 400 返回违规行号。

- Body：`{ items: [{ oss_bucket, oss_object_key, public_url, prompt, original_filename?, mime_type?, size_bytes?, width?, height?, tagIds?: number[] }] }`
- Response：`data: { ids: number[] }`

#### PATCH `/api/admin/buyer-show/:id`
更新单条（提示词 / 标签 / 替换图片）。无字段时 400。

- Body：`{ prompt?, tagIds?: number[], image?: { oss_bucket, oss_object_key, public_url, original_filename?, mime_type?, size_bytes?, width?, height? } }`
- Response：`{ success }`

#### DELETE `/api/admin/buyer-show/batch`
单事务批量软删。

- Body：`{ ids: number[] }`
- Response：`data: { deleted: number }`

---

## AI 买家秀 · 制作买家秀 + 任务历史

### 路由 `/api/buyer-show-batch`（任意登录用户，按用户隔离）

> 已通过类型检查/构建；真实 OSS/ToAPIs 端到端待验证。一个 `batch_id` = 一个「任务」；工作区只留当前（active）任务，完成的进任务历史（archived）。

- `GET /items` — 列出条目（默认仅当前任务 active 批次；`?batchId=` 指定批次），左联 `generation_tasks` 取状态/结果
- `POST /items` body `{ items, name? }` — 建新批次：先归档该用户所有 active 批次，再插新 active 批次元数据 + 行。返回 `{ batchId, ids }`
- `PATCH /items/:id` — 改提示词 / 回写 `task_id`/`toapis_task_id`/status/progress/error_message（**camelCase 与 snake_case 均接受**）
- `DELETE /items/:id` — 删除单行
- `DELETE /all` — 清空当前用户全部行 + 批次
- `GET /batches` — 列出批次（默认仅 archived 历史；`?includeActive=1` 含当前），含 `itemCount/completedCount/failedCount`
- `GET /batches/:batchId/items` — 某批次全部行（任务详情）
- `PATCH /batches/:batchId` body `{ name?, status? }` — 改名 / 归档（status 仅 `active→archived`）
- `DELETE /batches/:batchId` — 删除整个任务（元数据 + 行；`generation_tasks` 保留）

生图复用 `generation_tasks`，`feature_id = 'buyer-show'`；故任务同时出现在全局任务列表。重新生成=改 `task_id` 关联覆盖旧结果。详见 `requirements/buyer-show.md` §3。

---

## OSS 上传（素材库用）

#### POST `/api/oss/upload-token`
服务端仅签发 OSS PostObject policy，不接收字节；浏览器凭 token 直传 OSS。

- Body：`{ filename, mimeType, sizeBytes, scope }`，`scope ∈ { inputs, templates, materials }`
- Response：`data: { uploadUrl, objectKey, publicUrl, ossBucket, fields }`
- 素材库使用 `scope = 'materials'`，objectKey 前缀 `materials/<userId>/<yyyy>/<mm>/<uuid>.<ext>`。

---

## 积分与 Key 计费体系

> 计费主单位为「新积分」，`1 新积分 = ¥0.035`。详见 `docs/requirements/billing.md`。

### 用户个人 Key `/api/me/toapis`（任意登录用户）

- `GET /key-config` → `{ hasPersonalKey, keyHint, usePersonalKey, sharedKeyConfigured, balanceCheckIntervalSec }`（`balanceCheckIntervalSec` 默认 60）
- `PUT /key` body `{ apiKey, balanceCheckIntervalSec? }` → 加密存储（**不**自动切换模式；可附带轮询间隔，省略则保留原值/默认 60）
- `PATCH /key-mode` body `{ usePersonalKey }` → 切换模式；`true` 但无 key → 400
- `PATCH /balance-interval` body `{ intervalSec }` → 单独更新余额轮询间隔（0~604800 秒，`0`=不查询）；无 key → 400。返回 `{ balanceCheckIntervalSec }`
- `DELETE /key` → 删除个人 Key，自动回退共享模式
- `POST /test` body `{ apiKey }` → `{ ok }`（用传入 key 调 ToAPIs `/v1/models`）
- `GET /balance` → 用个人 key 查 ToAPIs token-balance `{ balance, credits, currency }`；`credits`（remain_credits）即该 Key 的「积分」，展示余额 = credits × 0.035（不用 `balance`）。

### 我的额度 `GET /api/me/quota`（任意登录用户）

聚合返回：`{ platform: { credits, yuan }, recentTransactions: [...最近10条], personalKeyCredits: { credits: number|null, currency } | null }`。
- `platform`：平台积分余额（共享模式消耗），`yuan = credits × 0.035`。
- `personalKeyCredits`：仅个人 Key 模式返回；`credits` 为该 Key 的积分（取自 ToAPIs token-balance `remain_credits`），`null` 表示获取失败/Key 无效。共享模式下为 `null`。

### 健康状态 `GET /api/toapis/health`（任意登录用户）

返回 `{ sharedKeyConfigured, personalKeyConfigured, personalKeyActive, balanceCheckIntervalSec }`（当前用户维度；`balanceCheckIntervalSec` 默认 60）。

### 余额与流水

- `GET /api/points/me` → `{ balance, total_spent, total_recharged, total_consumed }`（新积分）。`total_recharged` 仅 `admin_recharge`（**不含失败退款**）；`total_consumed` = `SUM(generation_tasks.points_cost)` 净消耗（失败退款后清零）。
- `GET /api/points/me/transactions?page&pageSize` → 分页流水（amount/balance_after 均为新积分）。
- `GET /api/points/me/daily?granularity=day|week|month&start_date&end_date` → 本人每周期消耗/充值 `{ date, spent(平台净), personal(个人 Key 按平台单价折算), recharged(admin_recharge), count }`。

### 管理端活动日志与统计（auth + admin）

- `GET /api/admin/activity?page&pageSize&type&status&user_id&start_date&end_date` → 统一活动日志：`generation_tasks` UNION ALL 非生成计费流水（生成计费流水 `reference_type='generation_task'` 由任务行代表、去重）；类型标签区分 生成/充值/扣减；仅 `type=task` 行可删。
- `GET /api/admin/stats/{users,daily,summary}` → 均支持 `start_date&end_date&user_id`（北京日闭区间）；`/daily` 支持 `granularity=day|week|month`（周 `strftime('%Y-W%W')`、月 `strftime('%Y-%m')`，均 `+8 hours` 北京时区）。

### 管理员调账 `POST /api/admin/users/:id/points`（auth + admin）

body `{ amount, note }`，`amount` 为**新积分**（正充值、负扣减）。写 `points_transactions`（reason=`admin_recharge`/`admin_deduct`）。

