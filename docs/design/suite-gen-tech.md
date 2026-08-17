# 成套生图与提示词专家 · 技术方案（suite-gen）

> 对应功能方案：`docs/requirements/suite-gen.md`；验收标准：`docs/requirements/suite-gen-acceptance.md`。
> 原则：**资产即数据（全局/私有双轨）、组装引擎纯函数、生图链路零新增、UI 组件全复用**。

---

## 1. 架构总览

```
┌────────────────────────── 前端（Vue3 + Pinia） ──────────────────────────┐
│  页面层                                                                  │
│   /suite-gen SuiteGenPage（向导）      /expert ExpertPage（4 Tab）        │
│   /admin 成套生图资产管理（6 Tab）      提示词工坊（现有，接入模板卡片）    │
│  组件层（全部可复用，不耦合页面）                                          │
│   AssetPicker · ThemeCard · PersonaPicker · TrackSelect                  │
│   GarmentDetailForm · SmartMatchPanel · PromptPreview · SuiteTaskGroup   │
│   DecomposeForm18 · ExpertSlotForm（复用 ImageSlotUpload）                │
│  逻辑层（组合式函数 / 纯函数）                                            │
│   useAssetLibrary(type) · useSuites · promptEngine(纯函数)               │
│   imageAnalysis(纯函数) · smartMatch(纯函数)                              │
└──────────────┬───────────────────────────────────────────────────────────┘
               │ Axios /api
┌──────────────▼───────────────────────────────────────────────────────────┐
│  后端（Express）                                                          │
│   /api/sg/assets/:type   资产通用 CRUD（工厂路由，全局+私有双轨）          │
│   /api/sg/suites         套系草稿/历史 CRUD                              │
│   /api/sg/match-config   智能匹配规则配置（管理员）                        │
│   现有复用：tasks · prompts · prompt-cards · featurePrompts · admin/*     │
│  生图链路：完全复用 imageGeneration.submitTask（双模式/积分/OSS/轮询）     │
└──────────────┬───────────────────────────────────────────────────────────┘
               │
        SQLite（新表 6 资产 + 1 套系，迁移 1 列；种子数据来自工作台常量转换）
```

### 1.1 现有设施复用清单

| 现有设施 | 在本方案中的角色 |
|---|---|
| `imageGeneration.submitTask/pollTask` | 套系 5 任务与专家单任务的唯一提交通道（自动继承双模式 Key、积分扣费、OSS 转存、失败退费） |
| `FEATURE_CONFIGS.imageSlots` + `ImageSlotUpload` | 专家页各 Tab 的图槽表单（slot 声明式配置，页面级注册） |
| `feature_prompts`（feature×model） | 专家玩法与套系的系统提示词管理入口（管理员后台可编辑，实现按模型分版本话术） |
| `prompt_cards` + `prompt_modules` | 锁定模板的社区化出口（官方卡片 is_official） |
| `prompt_library.segments`（JSON） | 18 项拆解记录、套系 prompt 快照的存储载体 |
| `generation_tasks.client_business_id` / buyer_show_batches 先例 | 套系分组键设计参照 |
| `TaskList` / `TaskDetailDialog` | 套系分组视图基于现有组件扩展 |
| `works`（一键同款 reference_image_urls + prompt_segments） | 套系发布作品、整套复现 |
| `useUiFeedback` / `--momo-*` tokens / ep-overrides | 所有新页面 UI 约束（见 §7） |

---

## 2. 数据库设计

### 2.1 新表：资产类（统一双轨字段约定）

**双轨约定（六表一致）**：`owner_user_id NULL = 全局（管理员维护）`，`owner_user_id = X = 用户 X 私有`。
全局行仅管理员可写；查询默认 `owner_user_id IS NULL OR owner_user_id = :me`。

```sql
-- 主题库（种子：工作台 THEMES 100 套）
CREATE TABLE IF NOT EXISTS sg_themes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,  -- NULL=全局
  name          VARCHAR(100) NOT NULL,
  track_key     VARCHAR(50)  NOT NULL DEFAULT '',               -- 关联 sg_tracks.key
  season        TEXT NOT NULL DEFAULT '[]',                     -- JSON 数组：["春","夏"]…；[] = 全季（历史值 ss/aw/all 已迁移）
  styles        TEXT NOT NULL DEFAULT '[]',                     -- JSON 数组：适合风格（新中式国风/文艺风/休闲/极简/法式/度假/优雅/职场/运动/喜婆婆/小香风）
  images        TEXT NOT NULL DEFAULT '[]',                     -- JSON 数组：主题图片 URL（≤5 张，OSS）
  level         VARCHAR(10)  NOT NULL DEFAULT 'M',              -- L | M | H（场景复杂度）
  path          VARCHAR(255) NOT NULL DEFAULT '',               -- 动线概述「A→B→C→D→E」
  points        TEXT NOT NULL DEFAULT '[]',                     -- JSON: 5 点位场景描述
  status        VARCHAR(20) NOT NULL DEFAULT 'active',
  use_count     INTEGER NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  source        VARCHAR(20) NOT NULL DEFAULT 'seed',            -- seed | admin | user | derive
  is_public     INTEGER NOT NULL DEFAULT 0,                     -- 用户主题是否公开到「AI学习 · 主题库」；全局主题恒全员可见
  favorite_count INTEGER NOT NULL DEFAULT 0,                    -- 收藏数（sg_theme_favorites 计数冗余）
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sg_themes_scope ON sg_themes(owner_user_id, season, status);

-- 主题收藏（AI学习 · 主题库页；联合主键防重，theme_id 级联删除）
CREATE TABLE IF NOT EXISTS sg_theme_favorites (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  theme_id   INTEGER NOT NULL REFERENCES sg_themes(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, theme_id)
);

-- 赛道库（种子：工作台 TRACKS 7 条）
CREATE TABLE IF NOT EXISTS sg_tracks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  key           VARCHAR(50)  NOT NULL,                          -- A/B/C...（主题引用键）
  name          VARCHAR(100) NOT NULL,
  emoji         VARCHAR(20)  NOT NULL DEFAULT '',
  mood          TEXT NOT NULL DEFAULT '',                       -- 基调描述
  hair          TEXT NOT NULL DEFAULT '',                       -- 默认发型妆造
  light         TEXT NOT NULL DEFAULT '',                       -- 默认光影
  acc           TEXT NOT NULL DEFAULT '',                       -- 配饰方向
  hand          TEXT NOT NULL DEFAULT '',                       -- 手部姿态方向
  status        VARCHAR(20) NOT NULL DEFAULT 'active',
  use_count     INTEGER NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 模特人设库（种子：M1 贝尔示例）
CREATE TABLE IF NOT EXISTS sg_personas (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name          VARCHAR(100) NOT NULL,
  avatar_url    TEXT NOT NULL DEFAULT '',                       -- OSS
  dna           TEXT NOT NULL DEFAULT '',                       -- 面部/体态/神态文字 DNA
  hair_default  TEXT NOT NULL DEFAULT '',                       -- 默认发型妆造（可被人设级覆盖）
  fingerprint   TEXT NOT NULL DEFAULT '[]',                     -- JSON: 指纹参考图 OSS URL ≤8
  note          TEXT NOT NULL DEFAULT '',
  status        VARCHAR(20) NOT NULL DEFAULT 'active',
  use_count     INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 锁定模板库（种子：工作台 BASE_LOCK + PROMPT_TPL 拆条，见功能方案 5.4）
CREATE TABLE IF NOT EXISTS sg_lock_templates (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  key           VARCHAR(100) NOT NULL,                          -- 如 neg.hand
  name          VARCHAR(100) NOT NULL,
  grp           VARCHAR(50)  NOT NULL,                          -- identity|garment|scene|light|pose|camera|quality|negative|fusion|fidelity
  order_no      INTEGER NOT NULL DEFAULT 100,
  content       TEXT NOT NULL,                                  -- 支持 {{persona.dna}} 等占位符
  cond_kind     VARCHAR(50)  NOT NULL DEFAULT 'none',           -- none|outdoor|fingerprint|refimg|season:ss…
  models        TEXT NOT NULL DEFAULT '[]',                     -- JSON: 适用 model id 数组；空=全部
  scope         TEXT NOT NULL DEFAULT '[]',                     -- JSON: 适用功能 ['suite','fusion','swap','derive']
  status        VARCHAR(20) NOT NULL DEFAULT 'active',
  use_count     INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sg_locks_scope ON sg_lock_templates(owner_user_id, grp, status);

-- 服装特征速选（种子：工作台 FEATURES 5 组）
CREATE TABLE IF NOT EXISTS sg_garment_features (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  grp           VARCHAR(50) NOT NULL,                           -- style|shape|fabric|element|accessory
  name          VARCHAR(100) NOT NULL,                          -- 显示名
  match_tags    TEXT NOT NULL DEFAULT '[]',                     -- JSON: 命中赛道/主题的关键词
  detail_hint   TEXT NOT NULL DEFAULT '',                       -- 四层描述预填建议文案
  status        VARCHAR(20) NOT NULL DEFAULT 'active',
  sort_order    INTEGER NOT NULL DEFAULT 0
);

-- 拆解知识库（种子：KNOWLEDGE 18 维 + REASON_RULES 6 条 + 智能匹配规则）
CREATE TABLE IF NOT EXISTS sg_knowledge (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  kind          VARCHAR(50) NOT NULL,                           -- field_options | reason_rule | match_rule
  field         VARCHAR(50) NOT NULL,                           -- kind=field_options 时的维度名(scene/props/…)
  content       TEXT NOT NULL,                                  -- JSON：选项数组 / 规则对象
  status        VARCHAR(20) NOT NULL DEFAULT 'active',
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### 2.2 新表：套系

```sql
CREATE TABLE IF NOT EXISTS sg_suites (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL REFERENCES users(id),
  name            VARCHAR(150) NOT NULL DEFAULT '',
  feature_source  VARCHAR(20) NOT NULL DEFAULT 'suite',         -- suite | derive（专家Tab4 创建）
  -- 资产快照（提交/复现不依赖资产表后续变更）
  track_snapshot  TEXT NOT NULL DEFAULT '{}',                   -- JSON: 赛道完整字段
  theme_snapshot  TEXT NOT NULL DEFAULT '{}',                   -- JSON: 主题完整字段（含 5 点位）
  persona_snapshot TEXT NOT NULL DEFAULT '{}',                  -- JSON: 人设完整字段（含指纹图 URL）
  garment         TEXT NOT NULL DEFAULT '{}',                   -- JSON: {mainUrl, detailUrls[], features{}, detail4{}}
  -- Prompt 快照
  prompt_common   TEXT NOT NULL DEFAULT '',                     -- 公共锁定部分全文
  prompt_points   TEXT NOT NULL DEFAULT '[]',                   -- JSON: 5 条点位差异部分
  enabled_locks   TEXT NOT NULL DEFAULT '[]',                   -- JSON: 启用的模板 key + 用户改文 {key,content}[]
  -- 生成参数
  model           VARCHAR(100) NOT NULL,
  resolution      VARCHAR(50)  NOT NULL DEFAULT '2K',
  aspect_ratio    VARCHAR(50)  NOT NULL DEFAULT '3:4',
  n_total         INTEGER NOT NULL DEFAULT 5,
  status          VARCHAR(20) NOT NULL DEFAULT 'draft',         -- draft|generating|partial|completed|failed
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sg_suites_user ON sg_suites(user_id, status, created_at DESC);

-- 现有表迁移（schema.ts 追加，沿用 try/catch 幂等模式）
ALTER TABLE generation_tasks ADD COLUMN suite_id INTEGER;       -- 所属套系
ALTER TABLE generation_tasks ADD COLUMN point_index INTEGER;    -- 点位序号 0-4
CREATE INDEX IF NOT EXISTS idx_tasks_suite ON generation_tasks(suite_id);
```

**套系状态机**（由任务状态聚合，不单独维护定时器）：

```
draft ──提交第1个任务──► generating ──全部completed──► completed
                              │ ├─部分completed部分failed──► partial ──重生成失败点──► generating
                              │ └─全部failed──► failed
```

状态计算：`GET /api/sg/suites` 列表联查 `generation_tasks WHERE suite_id=?` 聚合得出，避免状态不同步。

### 2.3 种子数据迁移

- 工作台 HTML 内常量（THEMES/TRACKS/BASE_LOCK/PROMPT_TPL/FEATURES/KNOWLEDGE/REASON_RULES）由一次性脚本 `scripts/seed-suite-gen.mjs` 解析转换：
  - 输入：从工作台 HTML 提取的 JSON（人工一次性导出为 `scripts/data/workbench-export.json`）；
  - 输出：`owner_user_id=NULL` 的全局资产行 + `feature_prompts` 种子（专家玩法 × 4 模型）；
  - 幂等：`system_config.seed_sg_assets_v1 = done` 守卫，符合本仓库迁移惯例。
- 话术分版本：`sg_lock_templates.models` 为空数组=默认版；P0 实测后为 gpt-image-2 与 gemini 各插入一条同 key 不同 content 的行，组装时优先精确匹配。

---

## 3. 后端设计

### 3.1 资产通用 CRUD 工厂 `server/src/routes/sgAssets.ts`

```ts
// 一处实现，六类资产共用。新增资产类型 = 在 ASSET_TYPES 里加一行配置。
interface AssetTypeConfig {
  table: string                       // 表名
  fields: string[]                    // 允许读写的列（白名单，防注入）
  required: string[]                  // 创建时必填列
  jsonFields: string[]                // 需要 JSON.parse/stringify 的列
  globalWritable: true                // 全局行仅 admin（adminMiddleware）
  orderBy: string
}
const ASSET_TYPES: Record<string, AssetTypeConfig> = {
  themes:   { table: 'sg_themes',   fields: [...], jsonFields: ['points', 'season', 'styles', 'images'], ... },
  tracks:   { ... }, personas: { ... }, 'lock-templates': { ... },
  'garment-features': { ... }, knowledge: { ... },
}

// 统一路由（挂载在 /api/sg/assets/:type）
GET    /            ?scope=global|mine|all（默认 global+mine 合集）& 分页 & 关键词 & 业务过滤（season/track_key/grp/kind；season 为中文 JSON 数组包含匹配，'[]'=全季命中）
POST   /            私有行（当前用户）；admin + ?global=true 建全局行
PUT    /:id         本人私有行任意改；admin 可改全局行；禁止改他人私有行（403）
DELETE /:id         同上
POST   /:id/copy    全局资产 → 我的私有副本（管理员资产只读保护的关键出口）
POST   /:id/use     use_count + 1（提交套系时批量上报）
```

权限中间件链：`authMiddleware → (全局写操作) adminMiddleware`。路由工厂内统一校验 `owner_user_id` 归属，避免每类资产重复写鉴权。

### 3.2 套系路由 `server/src/routes/sgSuites.ts`

```
GET    /api/sg/suites            我的套系列表（含任务聚合状态、5 点位缩略图）
GET    /api/sg/suites/:id        套系详情（含 5 任务及结果 URL）
POST   /api/sg/suites            创建/更新草稿（快照写入，见 §2.2 字段）
DELETE /api/sg/suites/:id        删除草稿（已生成套系仅允许隐藏，防误删作品关联）
POST   /api/sg/suites/:id/rename 重命名
```

**注意**：套系路由**不负责生图**。生图由前端调用现有 `taskApi.create`（扩展 `suite_id/point_index` 两字段透传），保持双模式与计费逻辑单点维护。

### 3.3 现有路由的最小扩展

| 文件 | 改动 |
|---|---|
| `routes/tasks.ts` | create/update 接受 `suite_id`、`point_index`；列表接口支持 `?suiteId=` 过滤 |
| `routes/prompts.ts` | 无需改动（segments JSON 天然支持拆解记录，前端约定 `segments.sgType='decompose'`） |
| `routes/featurePrompts.ts` | 无需改动（feature id 新增即生效） |
| `index.ts` | 挂载 sgAssets / sgSuites 路由 |

### 3.4 后台管理路由

复用资产工厂：`/api/admin/sg/:type` 内部即 `sgAssets` 工厂 + 强制 `adminMiddleware`，支持全局行的增删改、启停、按 use_count 排序查看。另加 `POST /api/admin/sg/lock-templates/:id/publish-card`（锁定模板一键发布为官方 prompt_card）。

---

## 4. 前端设计

### 4.1 目录规划

```
src/
├─ utils/
│   ├─ promptEngine/
│   │   ├─ types.ts          # PromptEntry / AssembleContext / AssembleResult
│   │   ├─ entries.ts        # 内置兜底条目（与种子同源，离线安全）
│   │   ├─ assemble.ts       # 纯函数：entries + context → 5 条完整 prompt
│   │   └─ index.ts
│   ├─ imageAnalysis.ts      # 纯函数：dominantColor / brightness / compositionGrid
│   └─ smartMatch.ts         # 纯函数：特征+主色 → 赛道/主题打分推荐
├─ composables/
│   ├─ useAssetLibrary.ts    # <T>(type) => { list, scope, load, create, update, remove, copyGlobal }
│   ├─ useSuites.ts          # 套系草箱/历史/提交 5 任务/重生成点位
│   └─ useDecompose.ts       # 18 项拆解 + 推理补全 + 反馈
├─ components/sg/            # 全部无页面耦合的可复用组件
│   ├─ AssetPicker.vue       # 通用资产选择器（type 驱动；全局/我的双 Tab；admin 可内联编辑全局）
│   ├─ ThemeCard.vue         # 主题卡片（动线 5 点位示意 + 季节/赛道标签）
│   ├─ PersonaPicker.vue     # 模特人设选择（头像卡 + 指纹图预览）
│   ├─ TrackSelect.vue
│   ├─ GarmentUpload.vue     # 主图+细节图上传（内部复用 ImageSlotUpload）
│   ├─ GarmentFeatureChips.vue
│   ├─ GarmentDetailForm.vue # 四层结构 + 印花 + 配饰清单
│   ├─ SmartMatchPanel.vue   # 3×2 推荐卡片 + 换赛道/换主题/重匹配
│   ├─ PromptPreview.vue     # 左公共锁定(分组折叠/单条开关/编辑) 右点位差异
│   ├─ SuiteTaskGroup.vue    # 套系卡片：5 点位缩略墙 + 状态 + 重生成 + 发布作品
│   ├─ DecomposeForm18.vue
│   └─ ExpertSlotForm.vue    # 专家图槽表单（slot 配置驱动，内部复用 ImageSlotUpload）
└─ views/
    ├─ suite-gen/SuiteGenPage.vue      # 向导（el-steps 分步，步骤组件局部注册）
    ├─ suite-gen/components/           # 仅本页使用的编排组件（StepUpload/StepMatch/…）
    └─ expert/ExpertPage.vue           # 4 Tab
```

### 4.2 promptEngine 纯函数设计（核心）

```ts
// types.ts
interface PromptEntry {
  key: string                       // 'neg.hand'
  grp: 'identity'|'garment'|'scene'|'light'|'pose'|'camera'|'quality'|'negative'|'fusion'|'fidelity'
  order: number
  content: string                   // 含占位符 {{persona.dna}} {{track.light}} {{point.scene}} …
  condKind?: string                 // 'none'|'outdoor'|'fingerprint'|'refimg'|…
  models?: string[]                 // 空=全部
  overrides?: { userId: number; content: string }[]   // 用户私有改文（组装时取当前用户）
}
interface AssembleContext {
  persona?: PersonaSnapshot; track: TrackSnapshot; theme: ThemeSnapshot
  pointIndex: number                // 0..4；undefined=单张模式（专家玩法）
  garment: GarmentInfo; features: string[]
  model: ModelId; locks: LockSelection[]   // 用户开关 + 改文
}
interface AssembleResult { commonText: string; pointTexts: string[]; fullTexts: string[] }

// assemble.ts —— 无 UI、无网络、无 store 依赖，可直接 vitest 单测
assemble(entries: PromptEntry[], ctx: AssembleContext): AssembleResult
// 步骤：过滤(models/scope/status) → 条件求值(condKind 对 ctx) → 应用用户开关与改文
//     → 占位符插值（{{a.b}} 从 ctx 取路径）→ 按 grp+order 排序 → 拆公共/点位 → 拼接
```

公共/点位拆分规则：`entry.order >= 1000` 视为点位差异条目（与工作台 `d:true` 等价），单张模式（专家）全部按公共输出。

### 4.3 useAssetLibrary（资产双轨的统一入口）

```ts
const { list, loading, scope, setScope, create, update, remove, copyGlobal, reportUse }
  = useAssetLibrary<ThemeAsset>('themes')
// scope: 'all'(默认，全局+我的) | 'global' | 'mine'
// list 每项带 isGlobal = (owner_user_id === null)，UI 据此显示 🔒全局 / 我 徽标
// copyGlobal(id)：一键"复制为我的"，返回新私有行
// reportUse(ids)：套系提交时批量上报热度
```

### 4.4 路由与导航

```ts
// router/index.ts 新增
{ path: '/suite-gen',  component: () => import('@/views/suite-gen/SuiteGenPage.vue') }
{ path: '/expert',     component: () => import('@/views/expert/ExpertPage.vue') }
```

- `SidebarMenu` 增加「成套生图」「提示词专家」两项（放在「AI 摄影」「提示词工坊」附近）。
- 帮助系统：`helpRegistry.ts` 注册 `suite-gen` / `expert` 两个 helpKey，`docs/help/suite-gen/home.md`、`docs/help/expert/home.md` 提供抽屉文档（沿用现有 HelpDrawer 机制）。
- 管理后台：`AdminSidebar` 增加「成套生图资产」，页面 `AdminSuiteAssets.vue`（6 Tab 内嵌 AssetPicker 的 admin 模式）。

### 4.5 FEATURE_CONFIGS 与 feature_prompts

```ts
// configs/featureConfig.ts 新增（供专家页 ExpertSlotForm 与后台提示词编辑共用）
'expert-fusion': { label: '拆解融合', imageSlots: [
    { key: 'base',    label: '电商主图(场景基准)', maxCount: 1, required: true,  section: 'reference' },
    { key: 'face',    label: '模特头像',           maxCount: 1, required: false, section: 'reference' },
    { key: 'garment', label: '服装参考图',         maxCount: 2, required: true,  section: 'reference' } ] }
'expert-swap':  { label: '保真换装', imageSlots: [
    { key: 'base', label: '优质主图(绝对基底)', maxCount: 1, required: true,  section: 'reference' },
    { key: 'face', label: '模特头像',          maxCount: 1, required: false, section: 'reference' },
    { key: 'hair', label: '发型参考图',        maxCount: 1, required: false, section: 'reference' },
    { key: 'garment', label: '服装参考图',     maxCount: 2, required: false, section: 'reference' } ] }
// feature_prompts 种子：suite-gen / expert-fusion / expert-swap / expert-derive × 4 模型
```

V1 不将专家玩法塞进三面板工作台（向导式 UX 与工作台形态不符），feature id 仅用于：feature_prompts 后台编辑、generation_tasks.feature_id 统计口径。

### 4.6 生图链路时序（成套 5 任务）

```
SuiteGenPage                imageGeneration            后端 tasks            ToAPIs
    │ ⑥点击"生成5张"              │                        │                   │
    ├─POST /api/sg/suites(草稿)──┼───────────────────────►│ sg_suites 落快照   │
    ├─for point 0..4（串行）────►│                        │                   │
    │                            ├─submitTask({suite_id, point_index,          │
    │                            │   prompt=fullTexts[i], refImages=[主图+细节图+指纹图],
    │                            │   model, size:'3:4', resolution})           │
    │                            ├─createTask ───────────►│ tasks.insert ─────►│ (双模式路由)
    │  ◄─x/5 提交进度────────────┤                        │                   │
    ├─TaskPanel 轮询(现有4s机制)──┼───────────────────────►│ ──聚合套系状态────►│
    │  单点失败：SuiteTaskGroup「重新生成此点」→ 对该 point 再 submitTask     │
    │  完成后：importResultUrls → OSS → works.publish(携带 prompt_segments)   │
```

要点：
- 5 任务共享同一组参考图 URL（首次上传 OSS 后复用，不重复传）。
- 参考图顺序：服装主图 → 细节图 → 人设头像 → 指纹图（模型对先出现的参考权重更高，沿用工作台"主图优先"经验）。
- 中途断网/关页：已提交任务照常轮询（任务系统已有），套系回显 partial，可续生成缺失点位。

---

## 5. 权限与安全

| 风险点 | 对策 |
|---|---|
| 越权改他人私有资产 | 工厂路由统一 `owner_user_id = req.user.userId OR (NULL AND admin)` 校验，单点实现 |
| SQL 注入 | 工厂路由列名白名单（ASSET_TYPES.fields），值全量参数化 |
| 资产快照外泄 | persona 指纹图/服装图均为提交者本人 OSS URL；works 发布时沿用现有公开规则 |
| 全局资产误删影响他人 | 全局删除=软删（status），种子资产（source='seed'）禁止物理删除 |
| 积分绕过 | 生图只走 imageGeneration.submitTask，计费在现有 task 创建链路内，无旁路 |

---

## 6. 性能与容量

| 关注点 | 策略 |
|---|---|
| 主题库 100+ 行渲染 | 列表接口分页（默认 20）+ 前端虚拟滚动备选；AssetPicker 按赛季/赛道先过滤 |
| 资产查询频次 | useAssetLibrary 模块级缓存（stale-while-revalidate），步骤间切换不重拉 |
| 5 任务串行提交 | 每任务提交间隔 300ms 防限流；失败即停可续 |
| Prompt 长度 | gpt-image-2/gemini 上限 32K 字符，5 条锁定 Prompt 全文 ≤ 4K，安全 |
| Canvas 主色分析 | 图片压缩至 200px 短边再取色，耗时 < 100ms |

---

## 7. UI 约束（遵守项目设计系统）

- 颜色/圆角/阴影一律 `--momo-*` tokens，禁止硬编码（AGENTS.md 约定）。
- 消息/确认统一 `useUiFeedback`（toast/confirm），禁止直接 ElMessage。
- 向导步骤条用 Element Plus el-steps + ep-overrides 主题映射；卡片 hover 动效沿用现有 `.card` 模式。
- 资产徽标：全局 🔒（--momo-accent）、私有 👤（--momo-sub），文案统一"通用/我的"。

---

## 8. 风险与对策

| 风险 | 等级 | 对策 |
|---|---|---|
| 模型对锁定式长 Prompt 遵循度不足（话术为 Seedream 调教） | 高 | P0 阶段 5 条代表 Prompt × 2 模型实测，产出分模型基线话术；feature_prompts/模板 models 字段支持持续调优 |
| 5 张图模特一致性不达标 | 中 | 指纹多图 + DNA 文字 + 参考图排序固定；验收含人工一致性评分项；不达标降级为"人设头像单图"模式 |
| 用户误删全局资产 | 低 | 全局仅 admin 可删且软删；用户侧只有"复制为我的" |
| 套系状态与任务状态漂移 | 低 | 状态由任务实时聚合，不落库不同步字段 |
| 工作台常量提取遗漏 | 低 | 提取脚本 + 种子行数核对（主题=100/赛道=7/模板≥19/特征=5组）写进验收 |

---

## 9. 实施排期（建议）

| 周 | 交付 |
|----|------|
| W1 | P0 话术实测 + 种子脚本 + 6 资产表 + 资产工厂路由 + useAssetLibrary + 后台资产管理页 |
| W2 | promptEngine（含单测）+ PromptPreview + SuiteGenPage 步骤①~⑤ |
| W3 | 套系提交/任务分组/重生成/发布作品 + SuiteTaskGroup + 联调 |
| W4 | ExpertPage 四 Tab + 拆解库 + 工坊卡片互通 + 帮助文档 |
| W5 | 全量验收（见验收文档）+ 话术调优 + 上线 |
