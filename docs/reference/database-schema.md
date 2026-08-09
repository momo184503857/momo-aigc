# Database Schema

## 时间戳约定

- 所有 `created_at` / `updated_at` / `completed_at` / `last_login_at` / `checked_at` / `expires_at` 等 `TIMESTAMP` 列**一律以 UTC 存储**：列默认 `CURRENT_TIMESTAMP`（SQLite，`YYYY-MM-DD HH:MM:SS` UTC），或写入 `new Date().toISOString()`（ISO `...Z`）。**不改成北京时间存储。**
- **展示与按天逻辑才换算成北京时间（UTC+8）**：前端用 `src/utils/datetime.ts`（`toBJMinute`/`toBJSecond`/`toBJDate` 等）格式化，**禁止裸 `.slice()`**；后端按天统计/过滤用 `server/src/utils/datetime.ts`（`bjDay(col)`=`DATE(col,'+8 hours')`、`bjDateRangeClause(col,start,end)`）。
- API 返回给前端的 `*_at` 仍是 UTC 原值，由前端负责格式化为北京时间。

详见 `docs/records/decision-log.md`（2026-06-19）。

## users

用户账号表。支持邮箱注册与旧用户名账号兼容。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK AUTOINCREMENT | |
| username | VARCHAR(64) NOT NULL UNIQUE | 登录标识；邮箱注册用户存 email 本身（满足 NOT NULL UNIQUE 约束） |
| password_hash | VARCHAR(255) NOT NULL | bcrypt 哈希（cost=10） |
| email | TEXT | 邮箱（新注册必填，旧账号为空）；部分唯一索引 `idx_users_email` 保证非空值唯一 |
| nickname | TEXT | 可修改的展示名；展示优先级 nickname > username > email |
| role | VARCHAR(20) DEFAULT 'user' | `admin` / `user` |
| status | VARCHAR(20) DEFAULT 'active' | `active` / `disabled` |
| points | REAL DEFAULT 0 | 新积分余额，1 新积分 = ¥0.035 |
| tags | TEXT DEFAULT '[]' | 用户标签 JSON 数组（历史字段，标签映射另见 `user_tag_mappings`） |
| last_login_at | TIMESTAMP NULL | UTC |
| created_at | TIMESTAMP DEFAULT CURRENT_TIMESTAMP | UTC |
| updated_at | TIMESTAMP DEFAULT CURRENT_TIMESTAMP | UTC |

## email_codes

邮箱验证码表（注册 / 登录 / 重置密码）。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK AUTOINCREMENT | |
| email | VARCHAR(128) NOT NULL | 目标邮箱 |
| code | VARCHAR(8) NOT NULL | 6 位数字验证码 |
| purpose | VARCHAR(20) NOT NULL | `register` / `login` / `reset_password` |
| expires_at | TIMESTAMP NOT NULL | 过期时间（默认 10 分钟） |
| consumed | INTEGER DEFAULT 0 | 0 未消费 / 1 已消费；验证成功后置 1 |
| created_at | TIMESTAMP DEFAULT CURRENT_TIMESTAMP | UTC |

索引：`idx_email_codes_lookup(email, purpose, consumed)`。

## photography_elements

AI摄影功能——管理员配置的元素定义。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | |
| name | VARCHAR(100) UNIQUE NOT NULL | 元素标识符，如 `face`, `pose` |
| label | VARCHAR(100) NOT NULL | 中文标签，如 `人脸`, `姿势` |
| max_images | INTEGER DEFAULT 1 | 该元素最多接受几张图片（1-10） |
| sort_order | INTEGER DEFAULT 0 | 排序（生成时按此顺序拼接 prompt） |
| status | VARCHAR(20) DEFAULT 'active' | active / inactive |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

种子数据（5 个默认元素）：
- face / 人脸 (max_images=1)
- pose / 姿势 (max_images=1)
- clothes / 衣服 (max_images=1)
- accessory / 配饰 (max_images=2)
- background / 背景 (max_images=1)

## photography_element_prompts

AI摄影——每元素×每模型的 system_prompt。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | |
| element_id | INTEGER FK → photography_elements(id) ON DELETE CASCADE | |
| model_id | VARCHAR(100) NOT NULL | 模型 ID |
| system_prompt | TEXT DEFAULT '' | 该元素在该模型下的 system_prompt |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |
| UNIQUE(element_id, model_id) | | |

种子数据：每个元素 × 4 个默认模型，system_prompt 初始为空字符串。

## 与 generation_tasks 的关系

AI摄影任务写入 `generation_tasks` 表，字段使用方式：
- `feature_id = 'ai-photography'` — 标识任务来源
- `supplementary_images` — 存储元素到图片的映射，格式 `[{name: "人脸", url: "oss://..."}, ...]`
- `input_image_urls` — 所有输入图片的 OSS URL（flat list）
- `user_prompt` — 用户输入的补充提示词
- `prompt` — 完整 prompt（含各元素 system_prompt + 参考图映射 + user_prompt）

---

## AI 买家秀（素材库）

### buyer_show_tags

买家秀素材库——全局共享、管理员维护的标签（**不复用** 按用户隔离的 `gallery_tags`）。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | |
| name | VARCHAR(100) UNIQUE NOT NULL | 全局唯一标签名 |
| sort_order | INTEGER DEFAULT 0 | 预留排序（v1 未在 UI 暴露） |
| created_at | TIMESTAMP | |

### buyer_show_materials

买家秀素材库——单条素材 = 一张 OSS 图 + 一段提示词 + 标签（经关联表）。软删除。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | |
| oss_bucket | VARCHAR(255) NOT NULL | OSS bucket |
| oss_object_key | VARCHAR(1024) NOT NULL | OSS 对象 key（`materials/<userId>/...`） |
| public_url | TEXT NOT NULL | OSS 公开访问 URL |
| prompt | TEXT NOT NULL | 提示词（必填） |
| original_filename | VARCHAR(255) | 原始文件名（管理员可见） |
| mime_type | VARCHAR(100) | |
| size_bytes | INTEGER | |
| width / height | INTEGER | 图片尺寸 |
| status | VARCHAR(20) DEFAULT 'active' | active / deleted（软删） |
| sort_order | INTEGER DEFAULT 0 | 预留排序 |
| created_by | INTEGER FK → users(id) | 上传该素材的管理员 |
| created_at / updated_at | TIMESTAMP | |
| deleted_at | TIMESTAMP NULL | 软删时间 |

索引：`idx_buyer_show_materials_status(status)`。

### buyer_show_material_tags

素材 ↔ 标签 多对多关联。

| 字段 | 类型 | 说明 |
|------|------|------|
| material_id | INTEGER FK → buyer_show_materials(id) ON DELETE CASCADE | |
| tag_id | INTEGER FK → buyer_show_tags(id) ON DELETE CASCADE | |
| PRIMARY KEY (material_id, tag_id) | | 复合主键去重，配合 `INSERT OR IGNORE` |

索引：`material_id`、`tag_id`。

### 与 generation_tasks 的关系（制作买家秀）

制作买家秀 Tab 的生图复用 `generation_tasks`，使用 `feature_id = 'buyer-show'` 标识来源。

---

## AI 买家秀（制作买家秀）

### buyer_show_batch_items

制作买家秀——用户上传的表格行（商品ID/主图链接/提示词）及其与生图任务的映射，按 `batch_id` 分组、按用户隔离。**该模块已实现、通过类型检查；真实环境端到端待验证。** `model/resolution/aspect_ratio/result_image_urls/input_image_urls/completed_at` 等展示字段由 `GET /items` 左联 `generation_tasks` 取得，不在本表。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | |
| user_id | INTEGER FK → users(id) | 所属用户 |
| batch_id | TEXT NOT NULL | 批次 ID |
| product_id | TEXT NOT NULL | 商品 ID |
| main_image_url | TEXT NOT NULL | 1:1 主图链接 |
| prompt | TEXT DEFAULT '' | 提示词 |
| task_id | INTEGER NULL FK → generation_tasks(id) | 关联的生图任务 |
| toapis_task_id | TEXT NULL | ToAPIs 任务 ID（用于刷新后恢复轮询） |
| status | TEXT DEFAULT 'pending' | pending/submitting/in_progress/completed/failed |
| progress | INTEGER DEFAULT 0 | 进度 |
| error_message | TEXT NULL | |
| sort_order | INTEGER DEFAULT 0 | |
| created_at / updated_at | TIMESTAMP | |

索引：`user_id`、`batch_id`、`task_id`。

> `model / resolution / aspect_ratio / n / result_image_urls / input_image_urls / completed_at` 等字段**不在本表**：`GET /items` 通过 `LEFT JOIN generation_tasks` 取得（本行有 `task_id` 时以任务状态/结果为准）。

### buyer_show_batches

买家秀批次元数据（任务历史）。一个 `batch_id` = 一个「任务」；`status='active'` 为当前工作区任务，`'archived'` 为已进任务历史。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | |
| user_id | INTEGER FK → users(id) | 所属用户 |
| batch_id | TEXT NOT NULL UNIQUE | 批次 ID（对应 buyer_show_batch_items.batch_id） |
| name | TEXT DEFAULT '' | 任务名（空则前端展示默认「时间 · N个商品」） |
| status | TEXT DEFAULT 'active' | active=当前工作区 / archived=任务历史 |
| created_at | TIMESTAMP | |
| archived_at | TIMESTAMP NULL | 归档时间 |

索引：`user_id`、`status`。

---

## 作品库

用户从已完成的生图任务一键「发布到作品库」，展示结果图 + 模式/提示词/参数，其他人可浏览学习并「一键同款」复用参数生成。先发后审（admin 可下架）。相关路由：`server/src/routes/works.ts`、`server/src/routes/admin/works.ts`。

### works

作品主表。一条记录 = 一件作品（来源一个已完成任务，防重：`source_task_id` 唯一）。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| user_id | INTEGER FK -> users(id) NOT NULL | 发布者 |
| title | TEXT NOT NULL | 标题（默认取 prompt 前 30 字） |
| description | TEXT DEFAULT '' | 可选描述 |
| image_url | TEXT NOT NULL | 作品图 OSS URL（来自任务结果图） |
| thumb_url | TEXT DEFAULT '' | 缩略图（初始 = image_url） |
| prompt | TEXT NOT NULL | 最终发送给 API 的完整 prompt |
| user_prompt | TEXT DEFAULT '' | 用户原始补充词（功能模式） |
| prompt_segments | TEXT DEFAULT '{}' | 结构化字段快照 JSON，见下方说明 |
| negative_prompt | TEXT DEFAULT '' | 负向规避词（自然语言，展示用） |
| model | VARCHAR(100) NOT NULL | 模型 ID |
| resolution | VARCHAR(50) | 分辨率 |
| aspect_ratio | VARCHAR(50) | 宽高比 |
| feature_id | TEXT | 来源模式（`free-gen` / `change-clothes` 等） |
| reference_image_urls | TEXT DEFAULT '[]' | JSON 数组，参考图 OSS URL |
| source_task_id | INTEGER | 来源任务 ID（官方种子无来源，为 NULL） |
| status | TEXT DEFAULT 'published' | `published` / `hidden`（先发后审） |
| is_official | INTEGER DEFAULT 0 | 1=官方种子内容 |
| like_count | INTEGER DEFAULT 0 | 点赞数（冗余计数） |
| favorite_count | INTEGER DEFAULT 0 | 收藏数（冗余计数） |
| reuse_count | INTEGER DEFAULT 0 | 被一键同款次数 |
| view_count | INTEGER DEFAULT 0 | 浏览量（作者自己不计） |
| created_at / updated_at | TIMESTAMP | UTC |

索引：`idx_works_status_created(status, created_at DESC)`、`idx_works_feature(feature_id)`、`idx_works_user(user_id)`、`idx_works_likes(like_count DESC)`、`idx_works_reuse(reuse_count DESC)`。

**`prompt_segments` JSON 结构**：
```json
{
  "subject": "穿着白色连衣裙的女孩",
  "style": "日系清新, 柔焦",
  "scene": "樱花树下, 春日午后",
  "lighting": "逆光, 柔光",
  "composition": "三分构图, 浅景深",
  "quality": "高画质, 细节丰富"
}
```
空对象 `{}` 表示该作品来自非结构化提示词（如功能模式），仍可展示但不参与结构化检索。

### work_tags

全局共享的作品标签（区别于用户私有的 `gallery_tags`）。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | |
| name | VARCHAR(100) UNIQUE NOT NULL | 全局唯一标签名 |
| created_at | TIMESTAMP | |

### work_tag_relations

作品 ↔ 标签 多对多关联。

| 字段 | 类型 | 说明 |
|------|------|------|
| work_id | TEXT FK -> works(id) ON DELETE CASCADE | |
| tag_id | INTEGER FK -> work_tags(id) ON DELETE CASCADE | |
| PRIMARY KEY (work_id, tag_id) | | 复合主键去重 |

索引：`work_id`、`tag_id`。

### work_likes / work_favorites

点赞 / 收藏（联合主键防重，ON DELETE CASCADE 级联清理）。

| 字段 | 类型 | 说明 |
|------|------|------|
| user_id | INTEGER FK -> users(id) | |
| work_id | TEXT FK -> works(id) ON DELETE CASCADE | |
| created_at | TIMESTAMP | |
| PRIMARY KEY (user_id, work_id) | | 联合主键，配合 `INSERT OR IGNORE` 防重 |

索引：`work_likes(work_id)`、`work_favorites(user_id)`。

---

## 结构化提示词参考案例库

针对每个结构化字段（尤其光影、风格）的某个关键词，配一组参考图，让用户「看图选词」。来源双轨：官方预生成（`prompt_cases` 表）+ 作品库聚合（`works` 表中 `prompt_segments` 该字段非空的作品）。相关路由：`server/src/routes/promptCases.ts`、`server/src/routes/admin/promptCases.ts`。

### prompt_cases

官方预生成的参考案例图。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | |
| segment_key | TEXT NOT NULL | 字段标识：`subject`/`style`/`scene`/`lighting`/`composition`/`quality` |
| keyword | TEXT NOT NULL | 关键词，如 `柔光`/`侧光`/`逆光` |
| image_url | TEXT NOT NULL | 参考图 OSS URL |
| prompt_snapshot | TEXT DEFAULT '' | 生成该图时的完整 prompt（可复现） |
| model | VARCHAR(100) DEFAULT '' | 生成模型 |
| sort_order | INTEGER DEFAULT 0 | 排序 |
| is_official | INTEGER DEFAULT 0 | 1=官方维护 |
| created_at | TIMESTAMP | |

索引：`idx_prompt_cases_segment(segment_key, keyword)`。

---

## 结构化提示词迁移列

以下列在 `schema.ts` 启动时通过幂等 `ALTER TABLE ... ADD COLUMN` 迁移添加。

### prompt_library.segments

| 字段 | 类型 | 说明 |
|------|------|------|
| segments | TEXT DEFAULT '{}' | 六层结构化字段 JSON（与 `works.prompt_segments` 结构一致） |

`content` 仍存最终拼接好的 prompt 文本（向后兼容），`segments` 存六层结构化字段 JSON。纯文本提示词 `segments='{}'`，结构化提示词有值。

### generation_tasks.prompt_segments / negative_prompt

| 字段 | 类型 | 说明 |
|------|------|------|
| prompt_segments | TEXT DEFAULT '{}' | 任务提交时的结构化字段快照（来自提示词工坊） |
| negative_prompt | TEXT DEFAULT '' | 负向规避词快照 |

发布作品时直接从任务拷贝，无需用户重填。

---

## 积分与 Key 计费体系

### user_toapis_keys

用户自带的 ToAPIs 个人 Key（服务端 AES-256-GCM 加密存储），每用户至多一行。详见 `docs/requirements/billing.md`。

| 字段 | 类型 | 说明 |
|------|------|------|
| user_id | INTEGER PK, FK → users(id) ON DELETE CASCADE | 所属用户（主键天然防并发） |
| encrypted_key | TEXT NOT NULL | base64 密文 |
| key_iv | TEXT NOT NULL | base64 GCM IV（12B） |
| key_tag | TEXT NOT NULL | base64 GCM auth tag |
| key_hint | TEXT DEFAULT '' | 脱敏提示，如 `sk-t****7890` |
| use_personal_key | INTEGER DEFAULT 0 | 0=用共享 Key，1=用个人 Key |
| balance_check_interval_sec | INTEGER NOT NULL DEFAULT 60 | 个人 Key 余额轮询间隔（秒）；`0`=不查询。幂等 `ALTER TABLE ... ADD COLUMN` 迁移，旧行自动取默认 60 |
| encryption_version | TEXT DEFAULT 'v1' | 加密版本（密钥轮换用） |
| created_at / updated_at | TIMESTAMP | |

加密密钥来源：优先 env `ENCRYPTION_KEY`（32B hex）；缺失时从 `JWT_SECRET` HKDF-SHA256 派生兜底。

### users.points（语义：新积分）

`points`（REAL，默认 0）为用户**新积分**余额。`1 新积分 = ¥0.035`。

**历史迁移**：曾以「元（人民币）」为存储单位；一次性幂等迁移 `system_config.migration_credits_v1` 已将 `users.points`、`generation_tasks.{points_cost, points_balance_after}`、`points_transactions.{amount, balance_after}` 全部 `×(200/7)` 转为新积分（启动时执行，标志位守卫，已 done 则跳过）。`toapis_balance_history.balance`（ToAPIs CNY 快照）不迁移。

### points_transactions

积分流水。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | |
| user_id | INTEGER FK → users(id) | |
| amount | REAL | 带符号（新积分），充值正、扣费负 |
| balance_after | REAL | 变动后余额（新积分） |
| reason | TEXT | `generation` 生图扣费 / `admin_recharge` 充值 / `admin_deduct` 扣减 / `refund` 失败退款 |
| reference_type | VARCHAR | 如 `generation_task` / `admin` |
| reference_id | INTEGER | 关联任务/管理员 id |
| operator_id | INTEGER FK → users(id) | 操作者（管理员调账时） |
| note | TEXT | 备注 |
| created_at | TIMESTAMP | |

索引：`user_id`、`created_at`、`reason`。

> **失败退款与净消耗口径（2026-06-20）**：`generation` 扣费在任务创建时发生（`points_cost` 记入 `generation_tasks`）；任务失败时（`PATCH /api/tasks/:id` 转 `failed`）写一条 `refund` 流水（`amount=+points_cost`，`reference_type='generation_task'`）并**清零该任务 `points_cost`**。故 `SUM(generation_tasks.points_cost)` 即「净消耗」（失败退款后为 0），统计消耗无需再加 `status` 过滤。`completed→failed` 不退款（防套退）。历史已扣未退的失败任务由启动迁移 `refund_failed_v1` 一次性幂等补退（`system_config` 标记，与 `migration_credits_v1` 同模式）；附 `scripts/refund-failed-tasks.mjs` 手动补退脚本。

