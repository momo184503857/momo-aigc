# API Spec

后端 REST API 接口规范（`/api/*`，Express）。增量补充中——本文档先收录 AI 买家秀相关接口，其他模块按需补充。

约定：
- 除特别注明外，所有接口需 `Authorization: Bearer <JWT>`。
- 统一响应：`{ success: boolean, data?: ..., error?: string }`。
- 列表响应：`data: { records, total, page, pageSize, totalPages }`。
- 图片字节不经服务器：上传先取 token（仅签名），浏览器直传 OSS；服务端只存 `oss_*` 字符串。

---

## 认证与账号

### 公开路由 `/api/auth`（无需登录）

#### POST `/api/auth/login`
密码登录（兼容旧用户名账号与邮箱账号）。
- Body：`{ account: string, password: string }`（`account` 可为邮箱或用户名；兼容旧字段 `username`）
- Response：`data: { token: string, user: UserInfo }`
- `UserInfo = { id, username, email, nickname, role, points }`
- 错误：400 参数缺失；401 账号或密码错误；403 账号已禁用

#### POST `/api/auth/send-code`
发送验证码邮件。SMTP 未配置时验证码打印到服务端控制台（开发降级）。
- Body：`{ email: string, purpose: 'register' | 'login' | 'reset_password' }`
- 语义校验：`register` 时邮箱已存在返回 409；`login`/`reset_password` 时邮箱不存在返回 404
- 防刷：同邮箱同用途 60s 内重复发送返回 429
- Response：`{ success: true }`

#### POST `/api/auth/register`
邮箱注册（验证码 + 设置密码），成功后自动签发 token。
- Body：`{ email: string, code: string, password: string }`
- Response：`data: { token: string, user: UserInfo }`
- 错误：400 验证码错误/密码不足6位；409 邮箱已注册

#### POST `/api/auth/login-code`
验证码登录。
- Body：`{ email: string, code: string }`
- Response：`data: { token: string, user: UserInfo }`
- 错误：400 验证码错误；404 账号不存在；403 已禁用

#### POST `/api/auth/reset-password`
忘记密码重置（验证码 + 新密码）。
- Body：`{ email: string, code: string, new_password: string }`
- Response：`{ success: true }`
- 错误：400 验证码错误/密码不足6位；404 账号不存在

#### POST `/api/auth/logout`
JWT 无状态登出，客户端删除 token 即可。Response：`{ success: true }`

### 个人路由 `/api/me`（需登录）

#### GET `/api/me`
获取当前用户信息。Response：`data: UserInfo`

#### PUT `/api/me/profile`
修改昵称。Body：`{ nickname: string }`（1-32 字符）。Response：`{ success: true, data: { nickname } }`

#### PUT `/api/me/password`
修改密码。Body：`{ old_password: string, new_password: string }`（新密码 ≥6 位）。Response：`{ success: true }`

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

## 作品库

用户从已完成任务一键发布作品，展示结果图 + 模式/提示词/参数；其他人可浏览学习并「一键同款」复用参数。先发后审（admin 可下架）。

### 用户路由 `/api/works`（需登录）

#### GET `/api/works`
作品列表（瀑布流懒加载）。默认只看 `status='published'`。关键词搜索只匹配 `prompt`（不再匹配 title）。

- Query：`page`（默认 1）、`pageSize`（默认 20，上限 60）、`sort`（`latest`/`hot`/`most_reused`，默认 `latest`）、`feature_id?`、`tag_id?`、`keyword?`（只搜 prompt）、`scope`（`gallery`/`mine`/`favorites`，默认 `gallery`）
- Response：`data: { records: WorkItem[], total, page, pageSize, totalPages }`
- `WorkItem` 含：`id, user_id, remark, image_url, thumb_url, prompt, user_prompt, prompt_segments, negative_prompt, model, resolution, aspect_ratio, feature_id, reference_image_urls, source_task_id, status, is_official, like_count, favorite_count, reuse_count, view_count, created_at, author: {id,username,nickname}, tags: [{id,name}], is_liked（今天是否已赞）, is_favorited`
- `scope=mine` 只看自己的作品；`scope=favorites` 只看自己收藏的

#### GET `/api/works/tags`
全局作品标签列表（带使用数）。Response：`data: [{ id, name, usage_count, created_at }]`

#### GET `/api/works/:id`
作品详情。非作者访问时 `view_count +1`（作者自己不计）。非公开作品仅作者和管理员可见（否则 404）。

#### POST `/api/works`
从任务发布作品。防重复：同一 `source_task_id` 只能发布一次（重复返回 409）。

- Body：`{ source_task_id: number, remark?: string, tagIds?: number[] }`
- 逻辑：按 `source_task_id` + `user_id` 查 `generation_tasks`，校验 `status='completed'` 且有结果图，拷贝 prompt/user_prompt/prompt_segments/negative_prompt/model/resolution/aspect_ratio/feature_id/input_image_urls/result_image_urls[0] 写入 works（title 固定存空串）
- Response：`data: WorkItem`

#### POST `/api/works/:id/like`
点赞/取消今日点赞（每人每天可赞一次，含自己的作品）。已赞今天则取消（`-1`），未赞则新增今日记录（`+1`）。Response：`data: { is_liked: boolean（今天是否已赞）, like_count: number（累计总数） }`

#### POST `/api/works/:id/favorite`
收藏/取消（toggle）。Response：`data: { is_favorited: boolean, favorite_count: number }`

#### PATCH `/api/works/:id/remark`
更新备注（仅作者或管理员，否则 403）。Body：`{ remark: string }`（截断 500 字）。Response：`data: { remark: string }`

#### POST `/api/works/:id/reuse`
记录复用（`reuse_count +1`）并返回完整参数供前端跳转生图。Response：`data: { model, prompt, userPrompt, resolution, aspectRatio, feature_id, input_image_urls }`

#### DELETE `/api/works/:id`
删除作品。仅作者或管理员可删（否则 403）。ON DELETE CASCADE 自动清理标签关联/点赞/收藏。

### 管理员路由 `/api/admin/works`（auth + admin）

- `GET /` - 全部作品列表（含 hidden）。Query：`page, pageSize, status?, keyword?`（keyword 只搜 prompt）
- `PATCH /:id/status` body `{ status: 'published' | 'hidden' }` - 上架/下架
- `DELETE /:id` - 强制删除任意作品
- `POST /official` - 发布官方种子作品（手动填参数 + 图片 URL，`is_official=1`，无 `source_task_id`）。Body：`{ remark?, image_url, prompt, user_prompt?, prompt_segments?, negative_prompt?, model, resolution?, aspect_ratio?, feature_id?, reference_image_urls?, tagIds? }`
- `GET /tags` - 标签列表（含使用数为 0 的）
- `POST /tags` body `{ name }` - 新建标签（幂等：同名返回已存在 id）
- `DELETE /tags/:id` - 删除标签（级联清理关联行）

---

## 提示词工坊 · 参考案例

结构化提示词参考案例库。来源双轨：官方预生成（`prompt_cases` 表）+ 作品库聚合（`works` 表中 `prompt_segments` 该字段非空的作品）。

### 用户路由 `/api/prompt-cases`（需登录）

#### GET `/api/prompt-cases?segment=<key>&keyword=<keyword?>`
按字段列出案例图。`segment` 必填（`subject`/`style`/`scene`/`lighting`/`composition`/`quality`）。

- 无 `keyword` 时：聚合该字段所有出现过的关键词，官方 + 作品聚合混合返回
- 有 `keyword` 时：精确匹配该关键词
- Response：`data: PromptCase[]`
- `PromptCase = { id, keyword, image_url, prompt_snapshot, model, source: 'official'|'community', work_id?, like_count?, reuse_count? }`

### 管理员路由 `/api/admin/prompt-cases`（auth + admin）

- `GET /?segment?` - 全部官方案例（可选按字段筛选）
- `POST /` body `{ segment_key, keyword, image_url, prompt_snapshot?, model?, sort_order? }` - 新增案例（`is_official=1`）
- `PATCH /:id` body `{ segment_key?, keyword?, image_url?, prompt_snapshot?, model?, sort_order? }` - 编辑
- `DELETE /:id` - 删除

---

## 提示词工坊 · 模块卡片社区库（重构版）

提示词工坊核心。模块分三类：要求（`requirement`，固定首段）/ 元素（`element`，中间）/ 禁止出现（`forbidden`，固定末段）。「要求」「禁止出现」为系统内置，管理员可自由增删元素模块。

### 用户路由 `/api/prompt-cards`（需登录）

- `GET /modules` - 模块列表（用户端只读，按 `sort_order`）。Response：`data: PromptModule[]`
  - `PromptModule = { id, name, type: 'requirement'|'element'|'forbidden', sort_order, is_system: boolean }`
- `GET /` - 卡片列表（瀑布流，服务端分页+筛选）。Query：`page, pageSize, sort: 'latest'|'hot'|'most_reused', scope: 'gallery'|'mine'|'favorites', moduleId?, keyword?`（keyword 搜 content/remark）
  - Response：`data: { records: PromptCard[], total, page, pageSize, totalPages }`
  - `PromptCard = { id, user_id, module_id, module: { id, name, type } | null, content, images: string[], cover_url, cover_index, remark, status, is_official, like_count, favorite_count, reuse_count, created_at, author: { id, username, nickname } | null, is_liked, is_favorited }`
  - `cover_url` = `images[cover_index] || images[0]`
- `GET /:id` - 卡片详情（非作者浏览量不计入；非公开仅作者/管理员可见）
- `POST /` body `{ module_id, content, images: string[], cover_index?, remark? }` - 上传。校验：module 存在、content 非空、images 1~10 张、cover_index 合法
- `POST /:id/like` - 点赞（每人每天 1 次，toggle 当日）。Response：`data: { is_liked, like_count }`
- `POST /:id/favorite` - 收藏/取消（toggle）。Response：`data: { is_favorited, favorite_count }`
- `POST /:id/reuse` - 复用计数 +1，返回模块+内容供前端拼接。Response：`data: { id, module_id, module_name, module_type, content, reuse_count }`
- `DELETE /:id` - 删除卡片（仅作者/管理员）。ON DELETE CASCADE 清理点赞/收藏

### 管理员路由 `/api/admin/prompt-modules`（auth + admin）

模块管理。「要求」「禁止出现」为系统内置（`is_system=1`），不可改名/删除；管理员可自由增删「元素」模块。

- `GET /` - 全部模块（按 `sort_order`）。Response：`data: PromptModule[]`
- `POST /` body `{ name, sort_order? }` - 新增元素模块（type 固定 `element`）。重名 409
- `PATCH /:id` body `{ name?, sort_order? }` - 改名/排序（系统内置模块 400 拒绝）
- `DELETE /:id` - 删除元素模块（系统内置 400 拒绝）。引用该模块的卡片 `module_id` 置 NULL，卡片保留

---

## AI学习 · 主题库

用户端主题浏览页（`/themes`）。数据复用 `sg_themes`：管理员在「成套生图资产管理」维护的全局主题（`owner_user_id NULL`）全员可见；用户上传的主题默认私有，`is_public=1` 时公开。收藏存 `sg_theme_favorites`。

### 用户路由 `/api/themes`（需登录）

- `GET /` - 主题列表（服务端分页+筛选+排序）。Query：`page, pageSize, scope: 'all'|'official'|'mine'|'favorites', sort: 'default'|'latest'|'hot'|'favorite', keyword?(搜 name/path), track_key?, season?(春/夏/秋/冬；'none'=仅全季；全季主题满足任意季节), style?(JSON 数组包含), level?`
  - Response：`data: { records: ThemeItem[], total, page, pageSize, totalPages }`
  - `ThemeItem = { id, name, track_key, track_name, season: string[], styles: string[], images: string[], cover_url, level, path, points: string[], use_count, favorite_count, sort_order, is_public, is_global, is_mine, is_favorited, author: { id, username, nickname } | null, created_at }`
  - `scope=all` 可见范围：全局主题 + 我的主题 + 其他用户公开主题；默认排序 = 官方在前（`sort_order`）+ 用户主题随后
- `POST /` body `{ name, track_key?, season?: string[], styles?: string[], images: string[], level?('L'|'M'|'H'), path?, points?: string[], is_public? }` - 上传自己的主题。校验：name 非空、images 1~5 张（http URL）
- `PATCH /:id` body 同上（均可选）- 更新自己的主题（含公开/私有切换）；管理员可改任意
- `DELETE /:id` - 删除自己的主题（管理员可删任意）。级联清理收藏记录
- `POST /:id/favorite` - 收藏/取消（toggle）。Response：`data: { is_favorited, favorite_count }`

---

## 积分与 Key 计费体系

> 计费主单位为「新积分」，`1 积分 = ¥1`（2026-09-01 起；历史 ¥0.035 已由 migration_credits_v2 换算）。详见 `docs/requirements/billing.md`。

### 用户个人 Key `/api/me/toapis`（已下线）

fixed-channels 重构后整组端点删除（`/api/me/toapis/key-config|key|key-mode|balance-interval|test|balance` 均返回 404）；渠道由管理员统一配置，Key 归平台所有，`user_toapis_keys` 表已 DROP。

### 我的额度 `GET /api/me/quota`（任意登录用户）

聚合返回：`{ platform: { credits, yuan }, recentTransactions: [...最近10条] }`。
- `platform`：平台积分余额，`yuan = credits`（1:1 恒等换算，字段保留兼容）。
- 旧 `personalKeyCredits` 字段已随个人渠道下线移除。

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

---

## AI 接入体系（ai-provider 重构 · 2026-08）

### 生图编排 `/api/generations`

#### POST `/api/generations`
提交生图任务（服务端编排：校验→计价预扣→落库→派发）。需登录。
- Body：`{ channelModelId, prompt, userPrompt?, systemPrompt?, aspectRatio, resolution, n?, refImageUrls?, templateImageIds?, featureId?, supplementaryImages?, promptSegments?, negativePrompt?, suiteId?, pointIndex?, clientBusinessId? }`
- 全部渠道模型按 `pricing[resolution] × n` 预扣积分（fixed-channels 后计费单轨；不足 402，任务不创建）。
- 派发接入 Key 池轮换（`withKeyFailover`）：上游欠费（402 或 400/403/429×关键词）→ 标记该 Key 耗尽 → 换下一个可用 Key 重试本次请求；全部耗尽 → 任务 failed（`ALL_KEYS_EXHAUSTED`）+ 全额退款。
- Response：`data: { tasks: [{ id, taskNo, status }], inputImageUrls }`（n>1 多条）
- 错误：400 参数/能力/定价缺失；402 积分不足；404 渠道模型不存在

#### GET `/api/generations/:id/status`
单次任务状态查询（服务端查上游 + 转存 OSS + 失败退款）。仅任务 owner。
- Response：`data: { status, progress, resultUrls, errorMessage?, errorCode?, expiresAt?, taskNo, completedAt? }`

#### POST `/api/generations/:id/reimport`
已完成但转存失败的任务重跑转存（S5）。Response：`data: { resultUrls }`

#### GET `/api/generations`
任务列表（过滤参数兼容旧 `/api/tasks`：page/pageSize/status/model/feature_id/suiteId/start_date/end_date）。
- 响应增加 `taskNo / channelProviderName / channelModelName / logicalCode`。

### 模型目录 `/api/models`

#### GET `/api/models/catalog?kind=image|text`
前端唯一模型真源。Response：`data: { platform: [渠道组] }`（fixed-channels 后仅平台渠道，`mine` 字段已删除），
每组 `{ providerId, providerName, adapter, models: [{ id(=channelModelId), modelId, displayName, logicalCode, capabilities, pricing, kind }] }`。
仅返回 active 渠道/模型。

### 我的渠道 `/api/my`（已下线）

fixed-channels 重构后路由整体卸载：`/api/my/channels*`、`/api/my/meta` 等全组端点返回 404，无业务副作用。渠道（含 Key 池）只由管理员在 `/api/admin/ai-config` 配置。

### 管理端扩展 `/api/admin/ai-config`

- `GET /logical-models`：逻辑模型列表；`PATCH /logical-models/:id`：仅接受 `name`（显示名；其余字段 400）；`POST` / `DELETE` 已下线（410）——逻辑模型由平台代码定义（`server/src/db/logicalModels.ts`，启动时幂等同步进库）
- 模型创建/编辑新增入参：`logical_model_id`（生图必填）、`param_overrides`（只收窄校验）、`pricing`（生图必填且覆盖全部生效分辨率，S6，无用户渠道豁免）、`supports_chat`
- Key 池管理（fixed-channels）：`POST /keys` 入参 `{ provider_id, name, key, priority? }`（缺省 = 该渠道 MAX+1，首个为 1）；`PATCH /keys/:id` 支持 `name/key(轮换)/priority(≥1 整数；exhausted 态拒绝)/status`（状态机 active↔disabled、exhausted→active=重新启用清 `exhausted_at`、exhausted→disabled 400；手动置 exhausted 400——耗尽仅服务端欠费切换写入）；Key 明文存储，响应回传完整 `key` 字段（后台可查看/复制）
- Key 序列化字段：`{ id, provider_id, name, key, key_hint, priority, status('active'|'disabled'|'exhausted'), exhausted_at, last_checked_at, last_check_ok, created_at }`
- `GET /providers`：keys 按 `priority ASC, id ASC` 排序；响应含 `first_key_hint`（首个可用 Key hint）与 `has_active_key`（无可用 Key 警示用），无 `primary_key_hint`
- `POST /providers/:id/test` 与 `POST /chat`（调试）使用优先级最高的可用 Key
- 旧 `GET /user-providers` 已删除（用户渠道下线）
- 服务商 base_url 建/改均过 SSRF 校验

### 退役端点（410）

`POST /api/toapis/create-task`、`GET /api/toapis/task-status/:id`、`POST /api/toapis/upload`、
`POST|PATCH /api/tasks` —— 一个过渡版本后删除；`GET /api/toapis/health` 精简为目录状态摘要。
