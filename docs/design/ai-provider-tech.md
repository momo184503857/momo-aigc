# AI 接入体系重构 · 技术方案（ai-provider）

> 对应功能方案：`docs/requirements/ai-provider.md`；验收标准：`docs/requirements/ai-provider-acceptance.md`；迁移与上线：`docs/design/ai-provider-migration.md`。
> 原则：**渠道即数据（三表扩展）、适配器即协议（注册表）、编排归服务端（内部任务号收口）、前端只认目录（单一模型真源）**。

---

## 1. 架构总览

### 1.1 目标架构

```
┌──────────────────────────── 前端（Vue3 + Pinia） ────────────────────────────┐
│  modelCatalog store（新）      GET /api/models/catalog → 渠道分组模型目录      │
│  表单层                        模型下拉按渠道分组 · 能力联动 · 价格随选         │
│  imageGeneration（重写）       submit → POST /api/generations                │
│  useTaskManager（改造）        4s 轮询 GET /api/generations/:id/status        │
└──────────────┬─────────────────────────────────────────────────────────────┘
               │ Axios /api（JWT）
┌──────────────▼─────────────────────────────────────────────────────────────┐
│  后端（Express）                                                             │
│   routes/generations.ts（新·编排核心）                                        │
│    POST /api/generations          校验→计价预扣→落库→派发                     │
│    GET  /api/generations/:id/status  单次查上游+落库+转存（抢占式）            │
│   routes/models.ts（新）          模型目录（平台渠道组 + 我的渠道组）            │
│   routes/myChannels.ts（新）      用户渠道/Key/模型 CRUD + 测试连通             │
│   routes/admin/aiConfig.ts（扩展） 逻辑模型/渠道模型/定价管理                  │
│   canvas-ai.ts（改造）            文字代理按渠道模型解析                       │
└──────────────┬──────────────────────────────────────────────────────────────┘
               │ 适配器层 server/src/providers/（注册表扩展）
│   toapisImage（异步）  openaiImage（同步）  volcengineImage（同步）  openaiCompat（已有，文字/识图）
│   utils/imageSize.ts：宽高比('3:4') × 分辨率('1K') → 渠道像素格式
└──────────────┬──────────────────────────────────────────────────────────────┘
               │
        上游渠道（toapis.com / Ark / OpenAI 兼容中转站 …）→ 结果统一转存 OSS
```

### 1.2 与现状的关键差异

| 维度 | 现状 | 目标 |
|---|---|---|
| 上游调用 | 前端组装请求体 → `/api/toapis/*` 代理 → `utils/toapis.ts` 直连 toapis.com | 前端只发业务参数 → `generations.ts` 按渠道模型解析适配器出站 |
| 任务键 | `toapis_task_id` 为业务键（轮询/转存/恢复轮询） | 内部 `task_no` 为业务键；`provider_task_id` 仅异步渠道轮询用 |
| 模型真源 | 前端 `MODELS` 硬编码 + `pricing.ts` 双真源 | `ai_logical_models` + `ai_models`（DB），catalog API 单一出口 |
| 扣费点 | `POST /api/tasks`（前端写 DB 记录时） | `POST /api/generations`（服务端编排内，事务口径不变） |
| 转存 | 前端 `importResultUrls` 逐张驱动 | 服务端在轮询/完成路径内驱动，`importing` 状态抢占 |
| 个人 Key | `user_toapis_keys` 单行 + 全局模式开关 | 用户渠道（`api_providers.owner_user_id`）+ 模型级判定 |

### 1.3 现有设施复用清单

| 现有设施 | 在本方案中的角色 |
|---|---|
| `api_providers / ai_models / api_provider_keys` 三表 + `admin/aiConfig.ts` | 直接扩展为统一渠道体系（D2），管理页结构沿用 |
| `server/src/utils/crypto.ts`（AES-256-GCM） | 用户/平台 Key 加密不变 |
| `points_transactions` + tasks.ts 扣退事务逻辑 | 计价预扣/失败退款整体搬入 generations.ts，口径不变 |
| `importResultToOss`（utils/oss.ts，Cloudflare Worker 转存） | 结果转存复用；taskId 参数改传 task_no（worker 仅回显，弱依赖，已验证兼容） |
| `useTaskManager` 全局轮询骨架 / TaskPanel | 轮询端点替换、转存逻辑移除，交互不变 |
| `imageGeneration.submitTask` 收口（architecture.md 规定唯一入口） | 签名保持，内部重写为调 `/api/generations`，页面层零改动或小改 |
| `useUiFeedback` / `--momo-*` tokens | 新页面 UI 约束 |

---

## 2. 数据库设计

> 迁移全部走 `schema.ts` 启动迁移惯例（`CREATE TABLE IF NOT EXISTS` + `ALTER TABLE` 补列 + `system_config` 幂等标记）。明细与回填规则见 `docs/design/ai-provider-migration.md`。

### 2.1 新表：ai_logical_models（逻辑模型）

```sql
CREATE TABLE IF NOT EXISTS ai_logical_models (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          VARCHAR(100) NOT NULL UNIQUE,        -- 'gpt-image-2'
  name          VARCHAR(100) NOT NULL DEFAULT '',    -- 显示名
  kind          VARCHAR(20)  NOT NULL DEFAULT 'image', -- image | text
  default_params TEXT NOT NULL DEFAULT '{}',          -- 能力定义 JSON，见 §2.4
  status        VARCHAR(20) NOT NULL DEFAULT 'active',
  remark        TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

种子（幂等标记 `seed_ai_provider_v1`）：现有 4 生图 + 3 文字模型，`default_params` 从前端 `src/types/adapter.ts` 的 `MODELS`/`TEXT_MODELS` 常量转换。

### 2.2 扩表：api_providers（渠道归属）

```sql
ALTER TABLE api_providers ADD COLUMN owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
-- NULL = 平台渠道（管理员维护）；非空 = 用户自建渠道
CREATE INDEX IF NOT EXISTS idx_providers_owner ON api_providers(owner_user_id);
```

- 平台渠道查询：`owner_user_id IS NULL`；用户渠道：`owner_user_id = :me`。
- 用户渠道 code 自动生成（`u{userId}-{6位随机}`），避免与平台 code 冲突（code 唯一约束仍在）。
- 用户渠道的 Key 同样存 `api_provider_keys`（一渠道一把主 Key，部分唯一索引已保证）。

### 2.3 扩表：ai_models（渠道模型/映射）

```sql
ALTER TABLE ai_models ADD COLUMN logical_model_id INTEGER REFERENCES ai_logical_models(id);
ALTER TABLE ai_models ADD COLUMN param_overrides TEXT;      -- JSON，可空 = 完全继承逻辑模型能力
ALTER TABLE ai_models ADD COLUMN pricing TEXT;              -- JSON：{"1K":3,"2K":4,"4K":5}；用户模型恒 NULL
ALTER TABLE ai_models ADD COLUMN supports_chat INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_models_logical ON ai_models(logical_model_id);
```

- 生图渠道模型：`supports_image_gen=1` 且 `logical_model_id` 必填（平台侧强校验；用户侧允许 NULL = 完全自定义能力，`param_overrides` 此时存完整能力）。
- 文字渠道模型：`supports_chat=1`。
- 定价校验（S6）：平台生图模型保存时，`pricing` 必须覆盖生效能力中的每个分辨率。

### 2.4 能力 JSON 结构（default_params / param_overrides 共用 schema）

```jsonc
{
  "resolutions": ["1K", "2K", "4K"],
  "aspectRatiosByResolution": {        // 可选；缺省键 = aspectRatios 全量
    "1K": ["1:1", "4:3", "3:4"],
    "2K": ["1:1", "3:4", "9:16", "16:9", "..."]
  },
  "aspectRatios": ["1:1", "3:4", "..."],  // 不分分辨率的兜底全量
  "maxReferenceImages": 14,
  "maxPromptChars": 3000
}
```

**生效能力 = 逻辑模型 default_params ∩ 渠道 param_overrides**（覆盖只允许收窄：校验规则为 overrides 中出现的分辨率/宽高比必须存在于逻辑模型能力内；`maxReferenceImages`/`maxPromptChars` 只能 ≤）。用户完全自定义模型（无 logical_model_id）则 `param_overrides` 即全量，不做交集校验。

### 2.5 扩表：generation_tasks（任务键切换）

```sql
ALTER TABLE generation_tasks ADD COLUMN task_no VARCHAR(64);           -- 内部任务号，回填后加 UNIQUE 索引
ALTER TABLE generation_tasks ADD COLUMN provider_task_id VARCHAR(255); -- 渠道任务号（异步渠道）
ALTER TABLE generation_tasks ADD COLUMN channel_model_id INTEGER REFERENCES ai_models(id);
ALTER TABLE generation_tasks ADD COLUMN channel_provider_id INTEGER REFERENCES api_providers(id);
ALTER TABLE generation_tasks ADD COLUMN provider_code VARCHAR(50);     -- 冗余快照（渠道被删后报表仍可读）
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_task_no ON generation_tasks(task_no);
CREATE INDEX IF NOT EXISTS idx_tasks_provider_task ON generation_tasks(provider_task_id);
```

- `task_no` 格式：`gen-{id 左补零 8 位}`（如 `gen-00012345`）。INSERT 后同事务 UPDATE 回填，天然唯一、可读、可排序。
- 旧列 `toapis_task_id`：迁移时数据复制到 `provider_task_id`，之后**停止写入**；列保留一个版本后清理（见迁移手册退役时间线）。
- 现有 `model` 列保留（渠道模型名字符串快照），报表/过滤兼容。
- `buyer_show_batch_items.toapis_task_id` 冗余列停止写入，恢复轮询改用 `task_id`（generation_tasks 自增 id，列已存在）。

### 2.6 状态机（generation_tasks.status）

沿用现有词汇，新增一个内部过渡态：

```
submitted ──(异步渠道已提交上游/同步渠道派发中)──► queued/in_progress ──► importing ──► completed
    │                                                 │                          │
    └────────────────────► failed ◄───────────────────┴──────── 转存失败保留原始 URL，仍 completed（S5）
                             │
                             └─► 退款（refund 流水，points_cost 清零）
```

- `importing`：仅服务端内部使用的短暂状态，用于**抢占转存权**（`UPDATE ... SET status='importing' WHERE id=? AND status IN ('submitted','queued','in_progress')`，changes=0 即已被其他轮询请求/实例抢占）。崩溃残留由启动清扫复位（§4.5）。
- 前端 ACTIVE_STATUSES 扩为 `['submitted','queued','in_progress','importing']`。
- completed→failed 不退款（防套退，沿用）；转存全部失败仍是 completed + 原始 URL + 提示（S5）。

---

## 3. Provider 适配器层

### 3.1 接口定义（扩展 providers/types.ts）

```ts
// 生图请求（业务归一化参数，适配器负责转渠道格式）
export interface ImageGenRequest {
  model: string            // 渠道模型名（ai_models.model_id）
  prompt: string
  negativePrompt?: string
  aspectRatio: string      // '3:4'
  resolution: string       // '512' | '1K' | '2K' | '4K'
  n: number                // 恒为 1：n>1 由编排层拆成多条任务（沿用现状）
  imageUrls: string[]      // 参考图 OSS URL
}

export interface GeneratedImage { url?: string; base64?: string; mimeType?: string }

export interface ImageGenSubmitResult {
  mode: 'async' | 'sync'
  providerTaskId?: string            // async：上游任务号
  images?: GeneratedImage[]          // sync：直接带图
}

export interface ImageTaskStatus {
  status: 'queued' | 'in_progress' | 'completed' | 'failed'
  progress: number
  resultUrls: string[]
  errorMessage?: string
  errorCode?: string
  expiresAt?: string                 // 上游 URL 过期时间（ToAPIs），转存调度参考
}

export interface ImageProviderAdapter extends ProviderAdapter {
  submitImageTask(req: ImageGenRequest, ctx: ProviderRuntimeConfig): Promise<ImageGenSubmitResult>
  queryImageTask(providerTaskId: string, ctx: ProviderRuntimeConfig): Promise<ImageTaskStatus>
  supportsBalance?: boolean          // toapis = true，驱动「我的渠道」余额 UI（S3）
  queryBalance?(ctx: ProviderRuntimeConfig): Promise<{ balance: number; credits: number }>
}
```

`ProviderRuntimeConfig` 扩展一个字段：`providerTaskKind?: 'image' | 'chat'`（同一渠道配置可同时用于识图与生图时不影响，适配器按自身职责取用）。

### 3.2 三个生图适配器

| 适配器 code | 协议 | 模式 | 实现要点 |
|---|---|---|---|
| `toapis` | ToAPIs 任务式 | async | 迁移现 `utils/toapis.ts` 的 createTask/getTaskStatus；请求体构建（gpt-image-2：顶层 resolution + `reference_images`；gemini 系：`metadata.resolution` + `image_urls`）按**逻辑模型 code** 分支；余额查询沿用 `/v1/balance` |
| `openai_image` | OpenAI 兼容 `/v1/images/generations` | sync | 标准请求体 `{model, prompt, n, size}`；`response_format` 优先 url、失败回退 b64_json；参考图：渠道支持 `image[]`/`image_url` 字段的透传，不支持的在能力层就应配成"无参考图"；结果 url/base64 均归一为 GeneratedImage |
| `volcengine_image` | 火山 Ark `/api/v3/images/generations`（Seedream） | sync | Ark 生图格式（`model/prompt/size/image` 参考图 URL 数组），Bearer 认证；同步返回 URL 列表 |

共用设施：`providers/http.ts` 的 `postJson`（120s 超时）、`joinUrl`、`extractErrorMessage`；新适配器同 volcengine.ts 一样走 `createXxxAdapter` 工厂或直接对象字面量，注册进 `providers/index.ts`（管理页/我的渠道页的协议下拉自动带出，无需改前端硬编码）。

### 3.3 imageSize 换算（server/src/utils/imageSize.ts，新）

```
基准边长：512→512 · 1K→1024 · 2K→2048 · 4K→4096
aspectRatio 'w:h' → 长边 = 基准，短边 = 基准 × min(w,h)/max(w,h)，16px 对齐
toapis：直接透传字符串（size='3:4' + resolution='1K'，现状格式）
openai_image / volcengine_image：像素 'WxH'
```

- 适配器内做"渠道支持尺寸"映射：若渠道只支持离散尺寸（如 gpt-image-1 的 1024x1024/1536x1024/1024x1536），取最接近的支持值；无法映射（偏差 >10%）直接报错——这属于管理员能力配置失误，管理端保存能力覆盖时给预览提示。
- 换算纯函数 + 单测脚本覆盖全部 现有分辨率×宽高比 组合。

---

## 4. 编排层 routes/generations.ts（核心）

### 4.1 POST /api/generations（提交）

请求体（前端 imageGeneration.submitTask 签名映射）：

```jsonc
{
  "channelModelId": 12,           // 渠道模型（决定渠道、适配器、能力、定价）
  "prompt": "...", "userPrompt": "...", "systemPrompt": "...",
  "aspectRatio": "3:4", "resolution": "1K", "n": 2,
  "refImageUrls": ["https://oss..."],   // 前端已上传 OSS
  "featureId": "change-clothes", "supplementaryImages": [...],
  "promptSegments": {...}, "negativePrompt": "...",
  "suiteId": 3, "pointIndex": 0
}
```

流程（全事务 + 后台派发）：

1. **解析与校验**：`ai_models JOIN api_providers`，校验存在、active、归属（平台渠道 或 `owner_user_id = me`）；按 §2.4 规则计算生效能力，校验 aspectRatio/resolution/参考图数合法。
2. **计价**：平台渠道 → `cost = pricing[resolution] × n`；用户渠道 → `cost = 0`。余额不足 → 402（沿用现错误协议）。
3. **落库 + 预扣**（一个事务，口径与现 tasks.ts 一致）：写 n 条 generation_tasks（status='submitted'，channel_model_id/provider_code/model 快照，points_cost/points_balance_after）、扣 users.points、写 points_transactions（reason='generation'）。
4. **派发**（事务提交后，逐条任务）：
   - async 渠道：同步调 `submitImageTask` → 回填 provider_task_id；提交异常 → 该任务标 failed + 退款。
   - sync 渠道：`setImmediate` 起后台 Promise（in-process，§4.4）。
5. 返回 `{ tasks: [{ id, taskNo, status }] }`（n>1 返回多条，前端 TaskItem 逻辑沿用）。

### 4.2 GET /api/generations/:id/status（轮询）

1. 读 DB；终态直接返回。
2. 进行中且 async：调 `queryImageTask(provider_task_id)` → 同步状态/进度落库。
3. completed：执行转存——先 `UPDATE status='importing' WHERE status IN (...)` 抢占，成功者逐张 `importResultToOss`（taskId 参数传 task_no；单张失败跳过，S5），全部完成写 result_image_urls + completed；抢占失败（changes=0）则返回当前 DB 快照。
4. failed：走退款（§4.3）后返回。
5. 返回结构与现轮询响应兼容（status/progress/resultUrls/errorMessage/errorCode/taskNo）。

### 4.3 失败退款（复用现逻辑，位置从 tasks.ts PATCH 迁入）

条件：当前非终态 → failed 且 `points_cost > 0`。事务：退 users.points、写 refund 流水（reference=任务 id）、任务 `points_cost=0`。调用点：提交异常、轮询发现 failed、启动清扫。

### 4.4 同步渠道后台执行

- in-process Promise 表（`Map<taskId, Promise>`）仅用于优雅停机等待；真正的恢复不依赖内存（§4.5）。
- 后台流程：`submitImageTask`（sync 返回 images）→ 转存 OSS → completed；上游异常/超时 → failed + 退款。
- 并发控制：每用户同步渠道在途任务上限（初始 5，常量可调），超限时任务保持 submitted 由下一轮轮询再派发（轮询端点对"submitted 且无 provider_task_id 且 sync"的任务补派发）。

### 4.5 重启恢复（启动清扫）

1. `status='importing'` → 复位为轮询路径可重入状态（有上游完成结果的转存可重试，objectKey 幂等由 uuid 生成策略避免重复对象，重复转存仅浪费存储不产生脏数据）。
2. `status IN ('submitted','queued','in_progress')` 且渠道为 async 且有 provider_task_id → 无需处理（轮询自然恢复，与现状一致）。
3. `submitted` 且无 provider_task_id（sync 在途丢失 / async 提交中断）→ 标 failed + 退款。

### 4.6 GET /api/generations（列表）

过滤参数沿用现 `GET /api/tasks`（user 分页 + status/model/feature_id/suiteId/日期）；响应增加 taskNo/channelProviderName/channelModelName 字段。`routes/tasks.ts` 收窄为兼容读端点（旧客户端过渡一个版本）后删除，PATCH 中的状态同步职责已被编排层取代。

---

## 5. 模型目录与用户渠道 API

### 5.1 routes/models.ts（新）

- `GET /api/models/catalog`：

```jsonc
{
  "platform": [{
    "providerId": 1, "providerName": "ToAPIs", "adapter": "toapis",
    "models": [{
      "id": 12,                       // channelModelId
      "logicalCode": "gpt-image-2", "displayName": "GPT-Image-2",
      "capabilities": { "resolutions": [...], "aspectRatiosByResolution": {...}, "maxReferenceImages": 14, "maxPromptChars": 3000 },
      "pricing": { "1K": 3, "2K": 4, "4K": 5 },
      "kind": "image"
    }]
  }],
  "mine": [ /* 同构，pricing 恒 null，providerName 为用户渠道名 */ ]
}
```

- 仅返回 active 渠道/模型；用户未建渠道时 `mine: []`。前端唯一模型真源（PricingPage、表单、canvas 节点共用）。

### 5.2 routes/myChannels.ts（新，authMiddleware）

| 端点 | 说明 |
|---|---|
| `GET /api/my/channels` | 本人渠道列表（含模型数、主 Key hint、协议、状态、余额支持标记） |
| `POST /api/my/channels` | 建渠道 {name, adapter, baseUrl, key}；校验 adapter 白名单 + baseUrl SSRF 防护（http/https、DNS 解析后拒绝私网/环回 IP） |
| `PATCH /api/my/channels/:id` | 改名/baseUrl/启停；status 停用后其模型从目录消失 |
| `DELETE /api/my/channels/:id` | 级联删除渠道模型（有历史任务时任务保留快照，channel_model_id 置 NULL 或保留软引用） |
| `PUT /api/my/channels/:id/key` | 录入/轮换 Key（AES-256-GCM） |
| `POST /api/my/channels/:id/test` | 测试连通（走适配器 testConnection/testImageConnection） |
| `GET /api/my/channels/:id/balance` | 仅 supportsBalance 适配器（toapis）；404/400 其余协议 |
| `GET/POST/PATCH/DELETE /api/my/channels/:id/models` | 渠道模型 CRUD：model_id（渠道模型名）+ logical_model_id（引用）或 param_overrides（自定义）；用户侧 pricing 恒空 |

管理端只读视图：`GET /api/admin/ai-config/user-providers`（S1，不含 Key 明文）。

---

## 6. 管理端 API 扩展（admin/aiConfig.ts）

在现有 providers/models/keys CRUD 基础上：

1. `GET/POST/PATCH/DELETE /api/admin/ai-config/logical-models`：逻辑模型 CRUD（default_params JSON 校验：结构、宽高比格式、覆盖关系合法）。
2. 模型创建/编辑扩展入参：`logical_model_id`、`param_overrides`（收窄校验）、`pricing`（平台生图模型必填且覆盖全部生效分辨率，S6）、`supports_chat`。
3. 渠道表单增加"生图协议"适配器选项（注册表自动）；生图渠道测试连通走 `testImageConnection`。
4. 用户渠道只读列表端点（§5.2）。

前端 `AdminAiConfig.vue`：新增「逻辑模型」管理区（列表 + 能力编辑弹窗：分辨率多选、每分辨率宽高比多选、上限输入）；模型弹窗扩展关联逻辑模型下拉、能力覆盖（裁剪交互）、定价行编辑（按生效分辨率逐行填积分价）。

---

## 7. 前端设计

### 7.1 stores/modelCatalog.ts（新）

- `fetchCatalog()` → 缓存 platform/mine 两组；`options`（el-option-group 结构）、`getModel(channelModelId)`、`getCapabilities`、`getPrice(modelId, resolution)`。
- 替代 `src/types/adapter.ts` 的 MODELS/getPrice 双真源；`types/adapter.ts` 仅保留纯类型与工具函数（formatCredits 等），常量删除。

### 7.2 services/imageGeneration.ts（重写，签名不变）

- `submitTask(params)`：上传参考图（沿用 processUrl/processFile → OSS）→ 组装 §4.1 请求体 → POST /api/generations → 返回 `{ tasks: [{toapisTaskId → taskNo, dbTaskId}] }` 结构兼容（字段改名 taskNo，调用方同步改）。
- `pollTask(taskNo)`：GET /api/generations/:id/status（默认 4s/150 次/10 分钟不变，canvas 阻塞轮询沿用）。
- `importResultUrls` 前端退役（服务端负责）；`generateImage({poll, import})` 的 import 参数忽略保留签名。

### 7.3 composables/useTaskManager.ts（改造）

- `pollTask` 换端点；删除前端转存与"转存失败重载"分支（服务端完成）；TaskItem 增加 taskNo/channelName；`retryImportTask` 改为调新端点 `POST /api/generations/:id/reimport`（编排层对已完成但 result_image_urls 为空的任务重跑转存）。
- 402 处理、任务合并逻辑（loadHistory）、hasActiveJobs 轮询启停不变。

### 7.4 表单动态化（GenerationForm / FeatureForm / PhotographyForm）

- 模型下拉：`el-option-group`（平台渠道组 + 我的渠道组，"个人"标签）；选中项携带 channelModelId。
- 分辨率/宽高比/参考图上限/提示词上限从 catalog 能力渲染；联动重置规则沿用（切换模型/分辨率时校正不兼容项）。
- 价格按钮：平台模型 `formatCredits(price×n)`；我的渠道模型显示"个人渠道 · 不扣积分"，并跳过批量页余额预检（usingPersonalKey 判定改为"选中模型 ∈ mine"，serverStatus store 相应瘦身）。

### 7.5 页面切换清单

| 页面/组件 | 改动点 |
|---|---|
| WorkspacePage / FreeGenPage / PhotographyPage | 无感（走 useTaskManager） |
| SuiteGenPage | 模型选项来源 catalog（默认模型改为"首个可用"而非硬编码 gemini-3.1-flash）；submitTask 签名不变 |
| ExpertPage | 同上（默认模型动态化） |
| Batch×4 / MakeBuyerShowPanel / BatchSpreadsheetPage | 行级轮询换 GET status（用 dbTaskId）；刷新恢复轮询改用 task_id 列（弃 toapisTaskId）；转存分支删除 |
| Canvas 图片节点（modules/workflow/nodes/image-ai） | 默认模型动态化；generateImage 阻塞轮询换端点；文件名用 taskNo |
| Canvas 文字节点 + canvas-ai.ts | 模型来源 catalog(kind=text)；代理请求携带 channelModelId，服务端解析渠道调 openaiCompat.chat |
| TaskList / TaskDetailDialog / ResultsPage | 展示 taskNo（复制/下载命名）；字段替换 toapis_task_id |
| MyQuotaPage | 「平台/个人 Key」开关与个人 Key 弹窗移除 → 入口指向「我的渠道」页；积分区不变 |
| PricingPage | 从 catalog 动态渲染（含我的渠道不计费说明） |
| AdminTasks / AdminDashboard / activity | 展示与搜索改 task_no（兼容 provider_task_id 搜索旧任务） |
| SidebarMenu | usingPersonalKey 徽标逻辑改为"当前选中模型为我的渠道模型"（或移除，仅保留积分展示） |

### 7.6 新页面：我的渠道（路由 /my-channels，挂在用户中心菜单）

- 渠道卡片列表（名称/协议标签/base_url/主 Key hint/模型数/状态/余额区[toapis]）+ 新建/编辑弹窗（协议下拉、base_url、Key password 输入、测试连通按钮）。
- 渠道详情：模型表格（渠道模型名、能力摘要、启停）+ 添加模型弹窗（能力来源二选一：引用逻辑模型模板（下拉 + 裁剪勾选）/ 完全自定义（分辨率与宽高比编辑器））。
- UI 约束：`--momo-*` tokens、`useUiFeedback`、PageLayout 骨架。

---

## 8. 文字模型链路迁移

1. `canvas-ai.ts`：请求体增加 channelModelId；服务端按渠道模型解析渠道（平台或我的）→ `openaiCompat.chat()`（toapis 渠道即原 `/v1/chat/completions` 行为，协议同构）。
2. 画布文字节点配置面板：模型下拉 = catalog(kind=text) 按渠道分组；旧画布存量节点配置里的模型名字符串做兼容映射（按"渠道模型名全局查一次"兜底）。
3. 计费不变（不计积分）。

---

## 9. 退役清单

| 对象 | 处置 |
|---|---|
| `server/src/routes/toapis-proxy.ts` 的 create-task / task-status / upload | 删除（编排层取代）；/health 精简为目录状态摘要，保留一个版本后删 |
| `server/src/routes/me-toapis-key.ts` + `src/services/userKeyApi.ts` | 删除（myChannels 取代） |
| `user_toapis_keys` 表 | 迁移源，数据搬走后代码零引用；表保留只读，后续版本 DROP |
| `server/src/utils/pricing.ts` 硬编码 + 前端 MODELS 常量 | 删除（DB 真源） |
| `src/adapter/buildGptImage2Request.ts` / `buildGeminiRequest.ts` | 逻辑移入服务端 toapis 适配器，前端文件删除 |
| `src/adapter/toapisClient.ts` | 并入 imageGeneration/新 generationApi，删除 |
| `generation_tasks.toapis_task_id` 列 / `buyer_show_batch_items.toapis_task_id` | 停写 → 下个大版本清理 |
| `resolveUserApiKey()` | 通用化为 `resolveProviderContext(userId, providerId)`（读渠道主 Key，平台渠道读渠道 Key，用户渠道校验 owner） |

---

## 10. 实施顺序（一次性交付内部依赖序）

1. **DB 迁移 + 种子**：§2 全部 DDL、逻辑模型/渠道/渠道模型种子、存量回填（见迁移手册）；node 脚本验证回填。
2. **适配器层**：types 扩展、imageSize、toapisImage/openaiImage/volcengineImage、注册表。
3. **编排层**：generations.ts（提交/轮询/转存/退款/清扫/列表）+ reimport 端点；node 冒烟脚本跑通 toapis 异步与任一同步渠道。
4. **目录与渠道 API**：models.ts catalog、myChannels.ts、admin/aiConfig 扩展、canvas-ai 改造。
5. **前端地基**：modelCatalog store、imageGeneration 重写、useTaskManager 改造、generationApi。
6. **表单与页面**：三表单动态化 → 业务页面按 §7.5 清单逐一切换 → 我的渠道页。
7. **管理端 UI**：AdminAiConfig 逻辑模型/定价扩展、任务/流水展示 taskNo。
8. **收尾**：退役清单执行、文档同步（architecture / api-spec / database-schema / billing / AGENTS.md）、全量回归（见验收文档 M8）。

---

## 11. 风险与对策

| 风险 | 对策 |
|---|---|
| 转存并发（多端轮询同一任务） | `importing` 状态 UPDATE 抢占（§4.2），抢占失败方直接读快照 |
| 同步渠道长耗时阻塞 HTTP | POST 快速返回 + 后台执行（§4.4），前端轮询节奏不变 |
| 重启丢在途任务 | 启动清扫（§4.5）：async 凭 provider_task_id 恢复；sync 未完成标失败退款 |
| 管理员能力配置与渠道实际支持不符 | imageSize 映射失败即报错（§3.3）+ 管理端保存时能力预览提示 + 测试连通 |
| 一次性全上回归面大 | submitTask 收口良好（页面零感知）；按 §7.5 清单逐页切换并逐页冒烟 |
| SSRF / Key 泄露 | base_url 协议白名单 + 私网 IP 拦截（myChannels 校验层）；Key 加密 + 明文不出服务端（沿用 crypto.ts） |
| 旧客户端（缓存页）调旧端点 | toapis-proxy/tasks 旧端点保留一个过渡版本返回 410/迁移提示 |
