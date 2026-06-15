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

## AI 买家秀 · 制作买家秀（用户开发，待验证）

### 路由 `/api/buyer-show-batch`（任意登录用户，按用户隔离）

> 该模块由用户自行开发，端到端流程待验证。以下据代码记录。

- `GET /items` — 列出当前用户的批次行
- `POST /items` — 创建批次（批量插入行）
- `PATCH /items/:id` — 更新单行（提示词/勾选/参数等）
- `DELETE /items/:id` — 删除单行
- `DELETE /all` — 清空当前用户全部行

生图复用 `generation_tasks`，`feature_id = 'buyer-show'`；故任务同时出现在全局任务列表。

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

- `GET /key-config` → `{ hasPersonalKey, keyHint, usePersonalKey, sharedKeyConfigured }`
- `PUT /key` body `{ apiKey }` → 加密存储（**不**自动切换模式）
- `PATCH /key-mode` body `{ usePersonalKey }` → 切换模式；`true` 但无 key → 400
- `DELETE /key` → 删除个人 Key，自动回退共享模式
- `POST /test` body `{ apiKey }` → `{ ok }`（用传入 key 调 ToAPIs `/v1/models`）
- `GET /balance` → 用个人 key 查 ToAPIs 余额 `{ balance, credits, currency }`

### 我的额度 `GET /api/me/quota`（任意登录用户）

聚合返回：`{ platform: { credits, yuan }, recentTransactions: [...最近10条], personalKeyCredits: { credits: number|null, placeholderCNY, currency } | null }`。
- `personalKeyCredits.credits` 为 `null` 表示 key 新积分待上游接口（当前用 ToAPIs CNY 占位）。

### 健康状态 `GET /api/toapis/health`（任意登录用户）

返回 `{ sharedKeyConfigured, personalKeyConfigured, personalKeyActive }`（当前用户维度）。

### 余额与流水

- `GET /api/points/me` → `{ balance, total_spent, total_recharged }`（新积分）
- `GET /api/points/me/transactions?page&pageSize` → 分页流水（amount/balance_after 均为新积分）

### 管理员调账 `POST /api/admin/users/:id/points`（auth + admin）

body `{ amount, note }`，`amount` 为**新积分**（正充值、负扣减）。写 `points_transactions`（reason=`admin_recharge`/`admin_deduct`）。

