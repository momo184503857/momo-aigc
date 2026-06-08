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
