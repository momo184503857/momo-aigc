# Database Schema

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

> `model / resolution / aspect_ratio / result_image_urls / input_image_urls / completed_at` 等字段**不在本表**：`GET /items` 通过 `LEFT JOIN generation_tasks` 取得（本行有 `task_id` 时以任务状态/结果为准）。无需补 migration。
