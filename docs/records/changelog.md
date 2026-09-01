# Changelog

按时间倒序记录功能层面的变更。

---
## 2026-09-01 — 计费说明页改为「逻辑模型 × 分辨率 × 渠道」价格矩阵

### 背景

原 `/pricing` 按「渠道 → 模型」逐个罗列两列小表（每模型一张分辨率/单价表），渠道一多页面冗长，且同一模型跨渠道比价要上下翻找。

### 变更

- **PricingPage 重构**：每个逻辑模型（`modelCatalog.imageLogicalModels` 去重）一张矩阵表——行 = 分辨率（各渠道模型 resolutions 并集、首现顺序），列 = 提供该模型的全部渠道模型，格 = 单张单价（`ceilCreditValue` 2 位向上取整，沿用统一精度规则）。
- **比价辅助**：每行最低价主色加粗高亮；渠道不支持该分辨率显示「—」（同名渠道多渠道模型时列头用 `渠道名 · model` 消歧）；目录无已定价模型时显示空态。
- 文档：billing.md 页面表描述同步。

---
## 2026-09-01 — 积分精度全链路统一 2 位小数（展示向上取整）

### 背景

1:1 汇率上线后积分即元值，但计费仍沿用 3 位小数（0.105 这类单价），展示与账本存在两种精度。统一为货币式 2 位小数：账务存储与展示同精度，展示侧向上取整。

### 变更

- **账务 2 位**：新增 `roundCredits()`（`server/src/utils/credits.ts`），预扣 totalCost / 逐张扣费 / 失败退款 / 管理端充值扣减全部 2 位舍入入账；逐张成本由直接透传单价改为过 `roundCredits`（防 API 直写 3 位定价渗入流水）。
- **迁移 `migration_credits_dp2`**（schema.ts，置于 credits_v2 之后，新库冷启动种子换算出的 3 位值一并取整）：`users.points` / `generation_tasks.points_*` / `points_transactions.*` 统一 `ROUND(x, 2)`，`ai_models.pricing` 逐档取整；迁移前 `VACUUM INTO backup-pre-credits-dp2-<ts>.db` 自动备份、失败中止启动；幂等守卫 `system_config.migration_credits_dp2`；每行取整差最多 ±0.005。
- **展示 2 位向上取整**：`formatCredits()` 默认 2 位 + 新增 `ceilCreditValue()`（毫厘整数防浮点多进一分；0.105/0.101 → 0.11，0.10 不变）；任务面板余额 tag 整数改默认 2 位；模型选择器价格标签 `toFixed(3)` 散写消除。
- **输入约束**：管理端定价输入 step 0.001 / precision 3 → step 0.01 / precision 2（充值输入本就限 2 位）。
- **不动**：`server/src/utils/pricing.ts` 历史折算表保持 3 位口径。
- **文档**：billing.md 展示规则与需求变更记录同步。

---
## 2026-09-01 — 积分汇率 1:1（1 积分 = ¥1）+ 界面收敛积分单显

### 背景

积分与人民币双轨换算（1 积分 = ¥0.035）带来持续的心智负担：所有展示都要「X 积分 (¥Y)」双显、管理端充值要折算、文档到处解释 0.035。调整为 **1 积分 = ¥1**，存量数据按 ×0.035 精确换算（价值不变、账目连续），积分体系本身（表结构/API/文案）不动。

### 变更

- **迁移 `migration_credits_v2`**（schema.ts，置于全部种子之后）：`users.points`、`generation_tasks.points_cost/points_balance_after`、`points_transactions.amount/balance_after` 统一 `ROUND(×0.035, 3)`；`ai_models.pricing` 逐行 JSON 换算（0.105/0.14/0.35…）。迁移前 `VACUUM INTO backup-pre-credits-v2-<ts>.db` 自动备份，失败中止启动；幂等守卫 `system_config.migration_credits_v2`。
- **种子定价常量保持旧单位**（T6 `TOAPIS_CHANNEL_MODELS`、易联 `{"1K":4,...}`），由 v2 在启动末尾统一换算——新库冷启动与存量库两条路径都正确；此后新增种子须直接写新单位。
- **常量**：前后端 `YUAN_PER_CREDIT` 0.035 → 1（`server/src/utils/credits.ts`、`src/types/adapter.ts`）；`server/src/utils/pricing.ts` 硬编码表（个人 Key 历史折算用）同步换算。
- **展示收敛**：`formatCredits()` 改积分单显 `X 积分`（默认 3 位小数），去 `X 积分 (¥Y)` 双显与 `creditsOnly/yuanOnly/yuanDigits` 选项；趋势图 ¥ 轴标签、充值弹窗「≈ ¥」折算、扣减确认 ¥ 提示移除；管理端充值小数位放宽至 2 位、定价输入精度 3 位（step 0.001）。
- **文档**：billing.md / database-schema.md / api-spec.md / prd.md / ai-provider.md / todo.md 同步 1:1 口径（历史记录保留原值）。

---

## 2026-08-09 — 提示词工坊重构（结构化模块卡片社区库 + 拼接预览）

### 背景

旧版提示词工坊是「六层权重表单（主体/风格/场景/光影/构图/画质）+ 看图选词」的纯拼接工具，结果只能存到私有库。重构为「**模块化提示词卡片社区库 + 右侧拼接预览**」：管理员维护模块体系（要求/元素/禁止出现），用户上传带模块+多图+备注的提示词卡片到公开社区库，点击「复用」把内容追加进右侧可编辑的拼接预览，最终保存到私有提示词库。

### 变更

#### 模块体系（需求 1）

- 新增 `prompt_modules` 表：`type` = `requirement`（要求）/ `element`（元素）/ `forbidden`（禁止出现）。
- 「要求」「禁止出现」为系统内置模块（`is_system=1`，固定首尾，不可改名/删除）；预置 5 个常用元素模块（风格/场景/光影/构图/画质，`is_system=0`，管理员可改可删）。
- 新增管理后台「提示词模块」页（`/admin/prompt-modules`、`AdminPromptModules.vue`）：表格 + 新增/编辑/删除（系统内置按钮禁用 + tooltip）。侧边栏与路由同步新增。

#### 卡片社区库（需求 2/3/7/8）

- 新增 `prompt_cards` 表：模块 + 内容 + 多图（JSON 数组，1~10 张）+ `cover_index`（置顶图）+ 备注 + 互动计数。
- 新增 `prompt_card_favorites` / `prompt_card_likes` 表（参考 `work_favorites` / `work_likes`，点赞每人每天 1 次）。
- 新增 `GET/POST /api/prompt-cards`（列表分页+筛选/上传）、`/:id`、`/like`、`/favorite`、`/reuse`、`DELETE /:id`、`/modules`。`cover_url` = `images[cover_index]||images[0]`。
- 重写工坊页（`PromptWorkshopPage.vue`）为瀑布流卡片库 + 顶部筛选区（搜索 + 范围 + 模块 + 排序，参考作品库）+ 卡片互动按钮（赞/收藏/复用计数/复制 + 作者）。
- 新增上传弹窗 `PromptCardUpload.vue`（模块下拉 + 内容 + 1~10 图上传 + 置顶选择 + 备注）、多图预览弹窗 `PromptCardPreview.vue`（大图+缩略图条+左右翻页+点击放大）。

#### 拼接预览（需求 4/5/6/9）

- 新增拼接逻辑（`promptAssembler.ts` 的 `appendSegmentToText` / `renderPreviewText`，**保留**旧六层逻辑供 `AdminPromptCases` / `PromptLibraryPage` 使用）：
  - 要求固定第一段，禁止出现固定最后一段，元素按添加顺序排在中间，同模块多条并列不去重；
  - 每段格式「模块名：内容；」，段间 `\n` 换行；
  - 复用时按类型归位，保留用户手动编辑内容。
- 右侧拼接预览为可编辑 `textarea`（需求 6）；底部放原右上角三按钮（重置/复制/保存到提示词库，需求 9），保存到现有私有 `prompt_library`。

#### 删除（需求 10）

- 删除 `.workshop-intro` 容器（六层权重公式说明）及 `CaseSelector.vue`（看图选词弹窗）。`prompt_cases` 表与 `AdminPromptCases` 官方案例管理页保留不动。

### 数据

- 新增 4 张表 + seed 守卫 `seed_prompt_modules_v1`。

---

## 2026-08-09 — 作品库重构（菜单分组 + 广场改版 + 每日点赞 + 去标题 + 备注 + 详情页改版）

### 背景

作品库上线后暴露一系列体验问题：侧边栏分组不合理、广场交互粗糙（分页器、卡片无操作按钮、显示冗余信息）、点赞只能一次、标题字段无实际价值、描述与备注重复、详情页视觉粗糙。

### 变更

#### 侧边栏菜单

- **新增「AI学习」菜单组**：作品库（`/works`）和提示词工坊（`/prompt-workshop`）从原分组移入新组。侧边栏现为三组：AI生图 / AI学习 / 资产管理。

#### 作品广场（`/works`）

- **Tab 改筛选下拉**：原三个 Tab（作品广场/我的作品/我的收藏）改为筛选栏的范围下拉，与其他筛选项并排。
- **排序栏独立**：排序按钮组从筛选栏移出，独占下方一行。
- **瀑布流懒加载**：移除 `el-pagination` 分页器，改用 `IntersectionObserver` 无限滚动（rootMargin 300px，组件卸载 disconnect）。
- **卡片操作按钮**：每张卡片常驻操作按钮行（赞 N / 收藏 / 同款 N / 复制提示词 + 作者名），蓝底白字 `el-button primary`，已赞/已收藏切 `plain`，可直接点击无需进详情。
- **卡片精简**：移除标题、模式标签、模型名、时间的显示。

#### 点赞改为每日一次

- `work_likes` 表主键从 `(user_id, work_id)` 改为 `(user_id, work_id, like_date)`，`like_date` 为北京日。
- 同一用户每天可对同一作品点赞一次（含自己的作品），跨天可重复点赞。
- `like_count` 为累计总数，`is_liked` 语义改为「今天是否已赞」。
- 旧数据迁移：`like_date` 取原 `created_at` 的北京日期（幂等守卫）。

#### 去标题 + 备注合并

- **移除标题**：发布弹窗、广场卡片、详情页均不再有标题；数据库 `works.title` 列保留（NOT NULL，统一存空串）；搜索不再匹配 title。
- **描述合并到备注**：原 `description` 字段废弃，数据迁移到 `remark`；发布弹窗「描述」改名为「备注」；前端 `WorkItem` 类型移除 `title`/`description`，统一用 `remark`。
- 新增 `PATCH /api/works/:id/remark` 接口（仅作者或管理员可改）。

#### 详情页改版（`/works/:id`）

- 改为「沉浸式大图 + 卡片参数」布局。
- 左侧大图可点击放大预览（`useImagePreview`），图下统计行 + 操作按钮行。
- 右侧每段信息改为独立 `.info-card`（圆角 + 阴影 + 细边框）：作者卡、备注卡（可编辑，橙色左边框）、生成参数、参考图（可预览）、提示词结构（高亮填充字段）、完整提示词（带复制）、负面词（浅红底）、标签。
- 删除按钮移至 header 右上角（仅作者可见）。

### 影响

- `WorkItem` 类型变化：移除 `title`、`description`，新增 `remark`。前端所有引用处已同步。
- `worksApi.publish` / `adminWorksApi.publishOfficial` 参数变化：`description` → `remark`，移除 `title`。
- 数据库迁移幂等（`system_config` 守卫），重启即自动执行。

---

## 2026-08-09 — 管理后台拆分为独立网页入口

### 背景

此前管理员功能嵌在用户端左侧栏的「管理员」分组里（8 个菜单项），与用户功能混在一起，既不专业也容易误触。需要把管理后台拆成一个独立网页，与用户端入口分离，但账号保持一致（同一套 JWT）。

### 变更

- **新增独立入口 `admin.html`**：`vite.config.ts` 通过 `build.rollupOptions.input` 注册双入口，`npm run build` 同时产出 `dist/index.html`（用户端）+ `dist/admin.html`（管理后台），各自独立的入口 chunk。
- **管理后台 SPA 骨架**（`src/admin/`，全部复用用户端共享层，零重复代码）：独立 `main.ts` / `AdminApp.vue` / 独立 hash 路由（内路径去掉 `/admin` 前缀，如 `/users`）/ `AdminLayout` + `AdminSidebar`（8 菜单 + 「返回用户端」+ 当前管理员）/ 独立登录页 `AdminLoginPage`（仅密码登录，登录后校验 `role==='admin'`，普通用户被拒并提示无权限）。
- **登录态互通**：两端共享 `localStorage.auth_token` 与同一套 JWT；在用户端登录过的管理员，打开 `/admin.html` 即已登录，无需重复登录。`src/services/http.ts` 的 401 拦截按入口分流（`admin.html` → `/admin.html#/login`，否则 → 用户端 `/#/login`）。
- **用户端侧边栏清理**：`src/components/SidebarMenu.vue` 移除 `if (auth.isAdmin)` 追加的「管理员」分组——用户端侧边栏对所有角色只展示 AI生图 / 资产管理两组。
- **后端零改动**：`/api/admin/*` 路由、`authMiddleware` + `adminMiddleware`、JWT 签发（payload 含 `role`）全部沿用，管理后台调用的 API 与原来完全相同。

### 影响

- 访问入口：用户端 `http://站点/`，管理后台 `http://站点/admin.html`，普通用户登录管理后台被拒。
- 用户端 `/#/admin/*` 路由与 `requiresAdmin` 守卫保留作兜底（无 UI 入口指向，仅防历史链接/误访问白屏）。
- 生产 Nginx **无需改动**：`admin.html` 是 dist 下真实文件，`try_files $uri $uri/ /index.html` 第一段直接命中；管理后台用 hash 路由，深链刷新不会回退到 `index.html`。

### 涉及文件

| 文件 | 变更 |
|------|------|
| `admin.html` | 新增 — 管理后台入口 |
| `src/admin/main.ts` `AdminApp.vue` `router/index.ts` | 新增 — 管理后台 SPA 入口/根/独立路由 |
| `src/admin/layouts/{AdminLayout,AdminSidebar,AdminAuthLayout}.vue` | 新增 — 主框架/侧栏/登录外壳 |
| `src/admin/views/AdminLoginPage.vue` | 新增 — 独立登录页 |
| `vite.config.ts` | 加 `rollupOptions.input` 双入口 |
| `src/services/http.ts` | 401 拦截按入口分流（用户端 / 管理后台） |
| `src/styles/global.css` | `#admin-app` 撑满高度 |
| `src/components/SidebarMenu.vue` | 移除管理员菜单分组 + 清理无用图标 import |

> 完整架构说明见 `docs/reference/architecture.md`「管理后台独立入口」章节；部署说明见 `docs/reference/deployment.md` 注意事项 11。

---

## 2026-06-24 — 修复结果图裂开（移除 crossorigin + 失败自动重试）

### 背景

任务列表、AI 买家秀对比弹窗、任务详情弹窗、结果页的结果图大量裂开显示不出；买家秀列表缩略图正常、点击进对比弹窗后裂开。根因为结果图 `<img>` 上的 `crossorigin="anonymous"` 触发 OSS CORS 校验失败（同图：不带该属性正常、带则裂开）。本轮同时推翻了 2026-06-05「OSS CORS 已配、crossorigin 不阻止加载」的前提。

### 变更

- **移除 5 处结果图 `crossorigin`**（治本）：`TaskList.vue`（列表+网格视图）、`ImageCompareDialog.vue`（对比弹窗结果图，买家秀共用）、`TaskDetailDialog.vue`、`ResultsPage.vue`。图片不再以 CORS 模式请求，直接正常显示。
- **新增 `useImageRetry` 组合式函数**：图片 `@error` 时给 src 追加时间戳绕缓存重试一次，兜底网络抖动 / 旧失败响应。接入上述 5 处。每张 URL 最多重试一次，避免死循环。
- **清理**：上述文件移除后无用的 `isOssImageUrl` import。

### 影响

- 图片显示：任务列表、对比弹窗（含买家秀）、详情、结果页结果图均恢复正常。
- 下载：`download.ts` 策略1（DOM Canvas）因结果图不再带 `crossorigin` 而失效，实际走策略3服务端代理（`POST /api/proxy/image`）；功能完整、可靠性不变，代价是多一次服务端往返。`download.ts` 代码未改。

### 规则（确认，见 `decision-log.md` 2026-06-24）

展示型 `<img>` / `el-image` 一律不加 `crossorigin`；下载走服务端代理降级，不为「省一次网络」给展示图加 `crossorigin`。

### 涉及文件

| 文件 | 变更 |
|------|------|
| `src/composables/useImageRetry.ts` | 新增 — @error 失败重试一次（绕缓存） |
| `src/components/TaskList.vue` | 移除 2 处 crossorigin + @error |
| `src/components/ImageCompareDialog.vue` | 移除 crossorigin + @error |
| `src/components/TaskDetailDialog.vue` | 移除 crossorigin + @error |
| `src/views/results/ResultsPage.vue` | 移除 crossorigin + @error |

---

## 2026-06-23 — AI 买家秀：工作区支持「重新生成」（覆盖旧结果）

### 背景

制作买家秀工作区里，用户对某行生成结果不满意时，无法基于该商品 + 提示词重新生成；原仅失败行可「重试」，且重试用的是工作区当前选择器参数。

### 变更

- **已完成行可重新生成**：工作区表格「操作」列对 `completed` 行新增「重新生成」按钮；任务历史详情保持只读（不做重生成）。
- **用该行原任务参数**：重新生成用该行上次生成时的 model/分辨率/比例/张数，贴合「重新生成」语义。
- **覆盖旧结果**：重提交时 `buyer_show_batch_items.task_id` 指向新任务，旧任务记录保留但不再关联；新结果完成后经 `LEFT JOIN generation_tasks` 自然替换旧结果显示（`row.resultUrl` 在提交时即时清空，完成后填新结果；刷新后 JOIN 新 `task_id` 亦显示新结果）。
- **透传原任务张数 n**：`fetchItems` SELECT 增加 `gt.n`，`mapRow`/`BatchItemRecord`/前端 `BatchItemRow`/`TableRow` 同步加 `n`。
- **统一提交入口**：抽出 `doSubmit(row, params)` 统一三处提交逻辑（一键生图/失败重试/自动重试），新增 `regenerateRow`（用原参数）；`autoRetry` 改用行原参数，保证重试参数一致。重新生成为新的生图任务，按正常计费扣积分（失败不扣）。

### 涉及文件

后端：`server/src/routes/buyerShowBatch.ts`（fetchItems/mapRow/BatchItemRecord 加 n）。前端：`src/services/buyerShowBatchApi.ts`（BatchItemRow 加 n）、`src/views/buyer-show/MakeBuyerShowPanel.vue`（doSubmit 重构 + regenerateRow + 重新生成按钮）。

---

## 2026-06-22 — AI 买家秀：任务历史 + 修复刷新后结果消失

### 背景

两个问题：① 制作买家秀批量生图完成后，刷新页面结果图消失（行本身还在）；② 缺任务历史，无法回看往期批次。

### 变更

- **修复刷新结果消失（Bug）**：根因为前端 `updateItem` 传 camelCase（`taskId`/`toapisTaskId`/`errorMessage`）而后端 PATCH 白名单只认 snake_case，导致 `task_id` 写不进 `buyer_show_batch_items` → 刷新后 `LEFT JOIN generation_tasks` 关联不到、结果图丢失。`PATCH /items/:id` 归一化 camelCase↔snake_case，修复后所有调用点（提交/重试/autoRetry/状态回写）的 `task_id` 均能落库。修复仅对**新提交**生效；旧 bug 期间 `task_id` 已为 NULL 的行无法可靠回连（结果仍在 `generation_tasks` 但无关联字段）。
- **任务历史（新 Tab）**：新增「任务历史」Tab。一次 Excel 上传 = 一个「任务」= 一个 `batch_id`。新增 `buyer_show_batches` 批次元数据表（`status`: `active`=当前工作区 / `archived`=历史）。
- **工作区只留当前任务**：`GET /items` 默认只返回 active 批次；`POST /items`（上传）自动归档旧 active、再建新 active 并接收任务名；工作区新增「归档当前任务」按钮（手动归档），「清空」改为只清当前任务。归档允许含未完成行（如实保留状态、停止轮询）。
- **历史操作**：列表（名称/时间/完成度/状态）+ 详情（全部行 + 结果 + 对比弹窗）+ 下载 zip + 改名 + 删除；不支持重新生成。
- **命名**：上传时弹框可选输入任务名（留空用「时间 · N个商品」默认），之后可在工作区/历史改名。
- **一次性迁移**：`migration_buyer_show_batches_v1` 为现有批次补建元数据并全部标记为 `archived`（现有批次进历史，工作区从空开始）。
- **复用抽取**：`src/utils/buyerShowZip.ts`（打包下载 + 行→TaskItem 转换）供工作区与历史共用。

### 涉及文件

后端：`server/src/db/schema.ts`（新表+迁移）、`server/src/routes/buyerShowBatch.ts`（修 PATCH + 改造 `/items` + 新增 `/batches` 端点）。前端：`src/views/buyer-show/BuyerShowPage.vue`（加 Tab）、`MakeBuyerShowPanel.vue`（工作区改造）、`BuyerShowHistoryPanel.vue`（新）、`src/services/buyerShowBatchApi.ts`（补批次类型与方法）、`src/utils/buyerShowZip.ts`（新）。

---

## 2026-06-20 — 失败任务退款（计费规则变更）+ 启动迁移

### 背景

原规则「计费在创建时预扣、失败不退款」（与买家秀一致）导致用户为失败任务付费。用户要求「失败不扣费」。

### 变更

- **正向退款**：`PATCH /api/tasks/:id` 在任务从非终态转 `failed` 且 `points_cost>0` 时，事务内退余额 + 写 `points_transactions`(reason=`refund`) + 清零 `points_cost`。阻止 `completed→failed` 套退。
- **历史补退**：`server/src/db/schema.ts` 新增幂等启动迁移 `refund_failed_v1`（与 `migration_credits_v1` 同模式，`system_config` 标记只跑一次）；云端部署重启即自动补退。本地 73 笔 / 云端 74 笔已退。附 `scripts/refund-failed-tasks.mjs` 手动补退脚本（幂等，可 `MOMO_DB_PATH` 指库）。
- **统计自动正确**：退款清零 `points_cost` → `SUM(points_cost)` 自动排除失败，无需改统计代码。

### 规则（确认，见 `docs/requirements/billing.md` §4/§6）

失败不扣费 = 提交时预扣 + 失败时退款；消耗统计用 `SUM(points_cost)`（净，勿加 `status='completed'`）。

### 涉及文件

`server/src/routes/tasks.ts`（退款）、`server/src/db/schema.ts`（迁移）、`server/src/config.ts`（`MOMO_DB_PATH`）、`scripts/refund-failed-tasks.mjs`（新）、前端 `reasonLabel` 三处加 `refund`（AdminDashboard / MyQuotaPage / AdminPointsTransactions）。

---

## 2026-06-20 — 生图日志：任务/积分合并为统一活动日志 + 统计金额维度/日周月

### 背景

`/admin/dashboard` 原「任务管理」「积分流水」两 Tab 高度重复（同一笔生图在两表各一行）；「生成统计」日期筛选只影响趋势图，其余全量；柱状图只有次数看不到钱。

### 变更

- **合并活动日志**：两 Tab 合一为「任务与积分」；新增 `GET /api/admin/activity`（`generation_tasks` UNION ALL 非生成计费流水，生成计费流水由任务行代表去重）；类型标签区分 生成/充值/扣减；仅生成行可删。
- **统计金额维度 + 周期**：趋势图与柱状图加「次数/金额」+「日/周/月」切换；左图右栏布局、KPI 去图标降噪。金额模式画消耗金额(¥)（柱状按用户降序）。
- **修复日期联动**：`/admin/stats` 的 `summary`/`users`/`daily` 统一支持日期+用户过滤（`bjDateRangeClause`）；`/daily` 加 `granularity=day|week|month`（新增 `bjWeek`/`bjMonth`，周用 `%W` 因 SQLite 不支持 ISO `%G/%V`）；`/users` 加 `HAVING submitted_count>0`。

### 规则（确认）

消耗金额 = `SUM(points_cost)`（净，失败退款后为 0）；`%G/%V` 在 SQLite 3.43 返回空，周分桶用 `%W`。

### 涉及文件

`server/src/routes/admin/{activity.ts(新),stats.ts}`、`server/src/utils/datetime.ts`（bjWeek/bjMonth）、`server/src/index.ts`、`src/services/adminApi.ts`、`src/views/admin/AdminDashboard.vue`。

---

## 2026-06-20 — 我的消耗页（平台/个人 Key 消耗双线 + 充值趋势）

### 背景

用户此前只能在「我的额度」看余额 + 最近 10 条流水，看不到自己每天花了多少、趋势。要求每人可看自己的每日消耗、充值、趋势。

### 变更

- **新页 `/my-consumption`**（从头像菜单进入）：KPI（余额/累计消费/累计充值）+ 消耗趋势（**平台 Key + 个人 Key 双线**）+ 充值趋势 + 明细表；日/周/月 + 日期范围（默认最近 30 天）。
- **新端点 `GET /api/points/me/daily`**：按周期返回 `{date, spent(平台净), personal(个人折算), recharged(admin_recharge), count}`，按日期合并。
- **个人 Key 消耗折算**：平台不记录个人 Key 真实 ToAPIs 花费，故用 `calculateCost(model,resolution,n)`（平台单价）折算；个人任务以「无 `generation` 流水」识别（避免退款过的失败任务被误算），失败任务两侧均不计。
- **修正**：`/api/points/me` 的 `total_recharged` 原含失败退款（`amount>0`），改为只算 `admin_recharge`；新增 `total_consumed`（净）。

### 规则（确认，见 `docs/requirements/billing.md` §6）

个人 Key 消耗 = 平台单价折算（非真实 ToAPIs 扣费，真实花费以用户 ToAPIs 账户为准）；累计充值不含退款。

### 涉及文件

`server/src/routes/points.ts`（/me/daily、/me 字段、import calculateCost）、`src/services/pointsApi.ts`、`src/views/user/MyConsumptionPage.vue`（新）、`src/router/index.ts`、`src/components/SidebarMenu.vue`（菜单 + TrendCharts 图标）。

---

## 2026-06-19 — 全项目时间统一为北京时间（UTC+8）+ 修复生图统计日期查询报错

### 背景

所有时间戳以 UTC 存储，但前端裸 `.slice()` 显示、后端 `DATE()` / `created_at >= '<date>'` 按天与过滤都按 UTC，对北京用户晚 8 小时、且统计 / 过滤错天；生图日志「生成统计」选日期后查询还因 `value-format` 改变 v-model 类型而抛 `TypeError`。

### 变更

- **前端共享时间 util**：新增 `src/utils/datetime.ts`（`parseUTC` / `toBJMinute` / `toBJSecond` / `toBJDate` / `toBJMinuteFromMs`），合并原 `TaskList.vue`、`AdminUsers.vue` 两份重复的 `toBeijingTime`。17 处裸 `.slice()` / `toLocale*` 显示改走 `toBJ*`。
- **后端共享 SQL util**：新增 `server/src/utils/datetime.ts`（`bjDay` 按北京日分桶；`bjDateRangeClause` 用「位移参数」法 `datetime(?,'-8 hours')` 做北京日范围过滤，列保持裸值走索引）。
- **按天统计修正**：`stats.ts` 每日 / 趋势图 `DATE(created_at)` → `DATE(created_at,'+8 hours')`；趋势窗口改为精确北京零点 `datetime(DATE('now','+8 hours'),'-8 hours',?)`。
- **日期范围过滤统一**：4 个列表（`stats` / `tasks` / `points` / `admin/tasks`）边界此前不一致（3 条裸 `<=`、1 条 `< 23:59:59`），统一为「北京日闭区间」——修正了过去 `end_date` 实际只覆盖到当天 UTC 00:00 的漏过滤。
- **修复生图统计查询报错**：`fmtDate` 兼容 `Date | string`；`daysAgo`、买家秀打包文件名改用 `toBJDate`；图表延迟到 tab 激活后 `nextTick` 挂载，消除 ECharts 0 尺寸告警。

### 规则（确认）

详见 `docs/records/decision-log.md` 2026-06-19：存储保持 UTC；面向用户的时间一律显示北京时间、按天统计 / 过滤按北京日；新代码复用 `toBJ*` / `bjDay` / `bjDateRangeClause`，禁止裸 `.slice()` 或 `DATE(col)`。

### 涉及文件

| 文件 | 变更 |
|------|------|
| `src/utils/datetime.ts` | 新增，前端北京时间格式化 util（合并两份重复 helper） |
| `server/src/utils/datetime.ts` | 新增，后端按北京日分桶 / 范围过滤 helper |
| `server/src/routes/admin/stats.ts` | 按天分桶 `+8 hours`；趋势窗口北京零点；/daily 范围 |
| `server/src/routes/{tasks,points,admin/tasks}.ts` | 日期范围过滤统一走 `bjDateRangeClause` |
| `src/components/TaskList.vue` / `src/views/admin/AdminUsers.vue` | 删重复 helper，改用 util |
| 其余 10 个前端文件 | 显示 / 格式化改北京时间 |

---

## 2026-06-17 — AI 画布：文字 AI 节点接入文本模型 + 图片输入 + 控制台入口 + 超时修正

### 背景

AI 画布的文字 AI（text-ai）节点此前模型下拉误绑图像清单、图片输入端口声明却未传给模型、右侧面板默认折叠导致控制台难找、且文字模型请求套用全局 15s 超时必然失败。本轮一并修正并落地文本模型接入。

### 变更

- **接入文本模型**：新增 `TEXT_MODELS`（gpt-5.5 默认 / gemini-3-flash / gemini-3.1-flash-lite）+ `DEFAULT_TEXT_MODEL`，走 ToAPIs `/v1/chat/completions`（后端 `/api/canvas-ai/chat`）。text-ai 节点卡片与 ConfigPanel 下拉改用文本清单（修复误绑图像 `MODELS`）。
- **修复图片输入**：text-ai 的 `image` 端口此前声明但 `run()` 未读取，现按 OpenAI vision 多模态格式构造 `content`（有图文数组 / 无图纯文本）。
- **Key 与图像共用**：`canvas-ai.ts` 由 `getKey()` 改 `resolveUserApiKey(userId)`，推翻 billing 旧规则「canvas-ai 不接入个人 Key」；计费维持不扣积分。
- **控制台入口**：节点右键菜单新增「打开控制台」（`canvas:open-console` 事件 → 展开右侧面板 + 跳「日志」tab）。
- **超时修正**：文字模型 chat 请求由全局 15s 放宽到单独 15 分钟。
- **可观测性**：后端 `canvas-ai` 加 `console.error`；前端 catch 优先读后端具体 `error`。

### 规则（确认）

详见 `docs/requirements/canvas.md`：文字 AI 不扣积分（两模式均不扣）；Key 与图像共用；多模态依赖模型视觉能力；chat 超时 15 分钟兜底；画布生图任务 `feature_id='canvas'` 进主任务列表。

### 涉及文件

| 文件 | 变更 |
|------|------|
| `src/types/adapter.ts` | 新增 `TEXT_MODELS` / `DEFAULT_TEXT_MODEL` / `TextModelInfo` |
| `src/modules/workflow/nodes/text-ai/index.ts` | 读取 image 输入 → vision 多模态 content；默认模型；catch 读后端 error |
| `src/modules/workflow/nodes/text-ai/ConfigPanel.vue` | 模型改下拉（TEXT_MODELS） |
| `src/modules/workflow/components/WorkflowNode.vue` | text-ai 下拉改用文本清单 |
| `src/modules/workflow/components/WorkflowCanvas.vue` | 右键菜单加「打开控制台」+ 事件 |
| `src/modules/workflow/components/WorkflowRightPanel.vue` | 监听 `canvas:open-console` |
| `src/services/canvasApi.ts` | chat 请求单独 timeout 15 分钟 |
| `server/src/routes/canvas-ai.ts` | `resolveUserApiKey` + console.error 日志 |

---

## 2026-06-16 — Key/额度管理归位「我的额度」+ 个人 Key 余额全局轮询 + 个人模式按钮显示消耗

### 背景

个人 Key 管理（输入/切换/查余额）原散落在 `/settings`，与只读的 `/my-quota` 割裂；个人 Key 模式下头像余额从不自动刷新（仅模式切换瞬间拉一次）；所有生成按钮只显示「个人 Key · 不消耗积分」，不告知本次消耗多少自己的 Key。

### 变更

- **页面归位**：个人 Key 输入/测试/清空、平台↔个人模式切换、余额查询全部从 `/settings` 迁到 `/my-quota`——顶部「平台积分 / 个人 Key」模式开关，下方内容按模式切换；个人 Key 配置以「配置个人 Key」弹窗承载（含余额查询间隔）。`/settings` 降级为占位页（仅跳转入口）。
- **全局余额轮询**：新增 `user_toapis_keys.balance_check_interval_sec`（默认 60，`0`=不查询）；前端 `serverStatus` store 全局轮询 `GET /me/toapis/balance`，头像与「我的额度」共享同一份数据（修复头像个人模式余额不刷新）。间隔可设：快捷 1分/30分/1小时/1天/不查询，或手输 0~604800 秒。
- **个人模式按钮显示消耗**：所有生成入口（工作台/AI摄影/工具箱批量/买家秀）的按钮与确认弹窗，由「个人 Key · 不消耗积分」改为显示 `formatCredits(成本)`（积分+¥）并追加「· 个人 Key」；计费逻辑不变（不扣平台积分、跳过预校验）。「不消耗平台积分」提示收敛为顶部模式标签 + 计费说明页各一处。
- **新端点/字段**：`PATCH /api/me/toapis/balance-interval`；`GET /key-config`、`GET /api/toapis/health` 返回 `balanceCheckIntervalSec`；`PUT /key` 可附带该字段。

### 规则（确认）

详见 `docs/requirements/billing.md` §5/§6/§7：个人模式按钮始终显示实际消耗；余额轮询全局生效、间隔存 DB；首次配置允许先选个人模式（保存 Key 前禁止生图）。

---

## 2026-06-16 — 生图工作台模板收藏行常驻 + 「常用」文案统一为「收藏」

### 背景

生图工作台两图功能页（换衣服等 7 个）的「模板收藏行」原仅在「有收藏且两图未满」时显示，导致：用户无收藏时看不到该功能、也无从知道去哪收藏；两图填满后收藏行消失无法再用。同时模板图库页「收藏」功能的文案混用「常用」「收藏」两种说法。

### 变更

- **收藏行常驻**（`FeatureForm.vue`，7 个两图功能页共用）：去掉 `v-if="starredTemplates.length > 0 && !allSlotsFull"`，始终渲染。行末尾放虚框引导块（星标 +「收藏模板」+「去模板图库添加 ›」，`router-link`→`/templates`）；无收藏时显示灰字空状态「还没有收藏的模板」。
- **术语统一「常用」→「收藏」**（`TemplatesPage.vue`）：按钮「设置常用 / 退出设置」→「设置收藏 / 退出收藏设置」；成功提示「已添加…到常用 / 已移除常用」→「…到收藏 / 已移除收藏」；拖拽 hint、空状态文案同步。字段 `is_starred` 与变量名不变。

### 规则（确认）

- 两图功能页的模板收藏行**始终常驻**：不因「无收藏」或「两图已满」隐藏；左侧必有引导入口跳 `/templates`。
- 模板收藏功能用户可见文案**统一称「收藏」**，不用「常用」。
- **保留行为**：两图已满时点击收藏缩略图仍替换第一个槽位（如换衣服「模特图」），既有逻辑未改（待确认是否优化，见 `todo.md`）。

### 涉及文件

| 文件 | 变更 |
|------|------|
| `src/components/FeatureForm.vue` | 收藏行去隐藏条件常驻；加引导块 + 空状态；引入 `StarFilled`；新增 `.starred-guide` / `.starred-empty` CSS |
| `src/views/templates/TemplatesPage.vue` | 5 处「常用」→「收藏」文案 |

---

## 2026-06-16 — 头像积分按 Key 模式显示 + Key 积分数据源修正

### 变更

- **头像积分按模式显示**（`SidebarMenu.vue`）：共享 Key 模式显示平台积分（`users.points`）；个人 Key 模式显示该 Key 的积分（token-balance `credits`）。修复「个人模式下头像仍显示共享余额」的误导。
- **Key 积分数据源修正**：澄清「获取新积分接口」就是 ToAPIs token-balance（`/v1/balance`）的 `credits`（remain_credits）字段——一直在用。`fetchKeyCredits()` 由 `credits=null` 占位改为返回真实 credits；「余额」= 积分 × 0.035。
- **修正 AdminToApisKey 的 ÷0.035 反推错误**：上一轮用 `余额 ÷ 0.035` 反推积分违反「积分是源、余额是派生」规则，改为直接读 `credits`，余额 = `credits × 0.035`（`creditsToYuan`）。删除前后端无用的 `yuanToCredits`（÷0.035 方向，禁用）。

### 规则（确认）

- 积分是主单位/源；余额(¥) = 积分 × 0.035；**永远相乘，不反过来**。
- Key 积分 = token-balance `credits`；**不**用 `remain_balance`。

### 涉及文件

| 文件 | 变更 |
|------|------|
| `server/src/utils/credits.ts` | `fetchKeyCredits` 返回真实 credits；删 `yuanToCredits` |
| `server/src/routes/me.ts` | `/quota` 类型跟随 |
| `src/components/SidebarMenu.vue` | 头像积分按模式显示（watch `usingPersonalKey` 取 Key credits） |
| `src/views/user/MyQuotaPage.vue` | Key 余额显示真实积分（去「待接口」占位） |
| `src/views/admin/AdminToApisKey.vue` | 积分改用 `credits`（非 ÷0.035），余额 = credits×0.035 |
| `src/types/adapter.ts` | 删 `yuanToCredits` |

---

## 2026-06-15 — 积分与 Key 计费体系（用户自带 Key + 新积分双单位）

### 背景

原系统只有「管理员共享 Key + 积分（实为元）」一种模式，且「积分」「元」1:1 混用、与 ToAPIs `credits` 撞名。两轮改动合并落地一套完整的计费体系：① 允许用户自带 Key（不消耗平台积分）；② 计费统一为「新积分」（1 新积分 = ¥0.035），元作为副单位展示。权威需求见 `docs/requirements/billing.md`。

### 变更

- **用户自带 Key（改动一）**：新增 `user_toapis_keys` 表（AES-256-GCM 服务端加密存储）、`/api/me/toapis/*` 端点（key-config / key / key-mode / test / balance）、`resolveUserApiKey(userId)` 按用户解析 Key；`toapis-proxy` 的 create-task / task-status / upload 改用解析到的 Key；`/api/toapis/health` 增返 `personalKeyConfigured` / `personalKeyActive`。`POST /api/tasks` 个人模式 `cost=0` 跳过余额校验/扣减/流水，仍写任务记录。前端 `serverStatus` 增 `canGenerate` / `usingPersonalKey`；新增 `/settings` 页（个人 Key 配置 + 模式切换）；9 处生成开关、6 处价格文案、4 处批量余额校验按个人模式放宽/隐藏。
- **新积分体系（改动二）**：存储与扣费统一改为「新积分」。`pricing.ts` + `adapter.ts` 定价改整数（3/4/5/10/20，2.5-flash=2.4）；`calculateCost`/扣费逻辑零改动（语义跟随列）。一次性幂等迁移 `migration_credits_v1`（`×200/7`）转换 `users.points` / `points_transactions` / `generation_tasks` 历史数据（`toapis_balance_history` 不迁）。新增 `credits.ts`（常量 + 换算 + `fetchKeyCredits` 占位）、`/api/me/quota` 聚合端点、前端 `formatCredits()` 统一双显、21 处展示统一改写。新增 `/my-quota`、`/pricing` 两页 + 头像下拉入口。
- **顺手修复**：`BatchSpreadsheetPage` 按钮缺失的 `usingPersonalKey` 分支；`AdminToApisKey` / `UserSettingsPage` 的 ToAPIs `credits` 文案「积分」→「credits」避免与新积分撞名。
- **安全**：新增 env `ENCRYPTION_KEY`（缺失时从 `JWT_SECRET` HKDF 派生兜底，不破坏已有部署）。

### 边界（维持现状）

- 计费在任务创建时扣除，**失败不退款**（与买家秀一致）。
- `canvas-ai` 文字模型不接入个人 Key。
- Key 的「新积分」由独立上游接口提供，**待接入**（当前 `fetchKeyCredits()` 占位返回 ToAPIs CNY，标注「新积分待接口」）。

### 涉及文件

| 文件 | 变更 |
|------|------|
| `server/src/utils/credits.ts` | 新增 — 换算常量 + `fetchKeyCredits` 占位 |
| `server/src/utils/crypto.ts` | 新增 — AES-256-GCM 加解密 |
| `server/src/utils/toapis.ts` | `createTask/getTaskStatus/uploadImage/getBalance` 加可选 `apiKey`；`resolveUserApiKey` |
| `server/src/utils/pricing.ts` | 定价改新积分整数 |
| `server/src/routes/me-toapis-key.ts` | 新增 — 用户 Key CRUD/test/balance |
| `server/src/routes/me.ts` | 新增 `GET /quota` |
| `server/src/routes/toapis-proxy.ts` | 按用户取 Key；`/health` 增字段 |
| `server/src/routes/tasks.ts` | 个人模式 cost=0 分支 |
| `server/src/db/schema.ts` | `user_toapis_keys` 表 + `migration_credits_v1` 迁移 |
| `server/src/config.ts` / `.env.example` | `ENCRYPTION_KEY` |
| `src/types/adapter.ts` | 定价改新积分 + `formatCredits` / `creditsToYuan` |
| `src/stores/serverStatus.ts` | `canGenerate` / `usingPersonalKey` |
| `src/services/{userKeyApi,pointsApi}.ts` | 用户 Key API + `getMyQuota` |
| `src/views/user/{UserSettingsPage,MyQuotaPage,PricingPage}.vue` | 新增三页 |
| `src/components/{SidebarMenu,GenerationForm,FeatureForm,PhotographyForm,TaskPanel}.vue`、`src/views/tools/Batch*.vue`、`src/views/buyer-show/MakeBuyerShowPanel.vue`、`src/views/admin/*` | 展示统一 `formatCredits` 双显 + 个人模式分支 |
| `src/router/index.ts` | `/settings` `/my-quota` `/pricing` |

### 数据库变更

- 新表 `user_toapis_keys`（user_id PK, encrypted_key, key_iv, key_tag, key_hint, use_personal_key, encryption_version, timestamps）。
- 一次性迁移：`users.points` / `generation_tasks.{points_cost,points_balance_after}` / `points_transactions.{amount,balance_after}` ×(200/7)（`system_config.migration_credits_v1` 守卫）。

---

## 2026-06-15 — AI 生图模块重构为三层架构（高内聚低耦合）

### 背景

AI 生图逻辑此前散落多处：6 个调用方绕过统一入口直接调 `toapisClient.createTask` + `taskApi.create`；轮询逻辑 4 处各自实现（间隔/策略不一）；`importResultUrls` 重复实现 4 份；`buildRequestBody` 在两个文件重复。目标：改一处全局生效，未来各页面只复用函数不重写。

### 变更

- **核心模块** `src/services/imageGeneration.ts` 拆出分步函数：`submitTask`（上传+建任务+写DB）/ `pollTask`（阻塞式轮询，默认 4s×150 次 / 10min 超时）/ `importResultUrls`（逐张转存，单张失败跳过）；`generateImage(params, {poll, import})` 作为高层一键封装。
- **适配器** `src/adapter/toapisClient.ts` 删除重复的 `buildRequestBody`，`createTask` 改为直接接受已构建请求体。
- **UI 层** `useTaskManager.ts`、6 个调用方（工作台/AI摄影/工作流节点/买家秀/批量换衣/换姿势/批量表格）全部迁移到统一入口，删除各自的轮询与 OSS 转存重复实现。
- **删除 deprecated 参数**：`GenerateImageParams` 的 `imageUrls` / `tempImageFiles` / `templateUrls` 一步到位移除，统一用 `refImages`。
- **新增端到端回归测试** `scripts/image-gen-tests/`（真实跑 ToAPIs/OSS，覆盖自由生图、批量换衣共享图不重复上传、买家秀行级轮询、generateImage DB 终态写入）。

### 修复（测试中发现）

- `generateImage` 成功时 DB 写入原被耦合在 `import` 选项里：`generateImage(p, {poll:true})`（不传 import）即使轮询成功，DB 也卡 `submitted`。改为成功无条件写 `completed`、失败/超时无条件写 `failed`，二者对称，DB 总达终态。
- 批量换衣/换姿势：共享衣服图（或模特图）被循环内每次 `submitTask` 重复上传 N 次。改为循环外用 `uploadImage` 解析一次复用 `{url}`。
- `importResultUrls` 单张转存失败即整体抛出，丢失已转存图且 DB 卡死。改为逐张容错。
- `pollTask` 默认 `maxAttempts`/`timeout` 为 `Infinity`，裸 `poll:true` 可能死循环。改为有限默认。

### 行为变化（待确认）

- **买家秀主图** 原直接把阿里 CDN URL 传给 ToAPIs（服务端拉取），现经 `submitUrl` 浏览器端下载后转传到自有 OSS。更可靠但批量时延迟增加、CORS 失败时回退原始 URL。详见 `docs/todo.md`。

### 涉及文件

| 文件 | 变更 |
|------|------|
| `src/services/imageGeneration.ts` | 三层 API，删除 deprecated 参数 |
| `src/adapter/toapisClient.ts` | 删 `buildRequestBody`，`createTask(body)` |
| `src/composables/useTaskManager.ts` | 改用核心模块函数，剥离生图逻辑 |
| `src/modules/workflow/nodes/image-ai/index.ts` | 用 `generateImage({poll,import})` 一键调用 |
| `src/views/buyer-show/MakeBuyerShowPanel.vue` | 统一入口，保留 5s 快速失败重试 |
| `src/views/tools/Batch{Clothes,Pose,Spreadsheet}SwapPage.vue` | 用 `submitTask`，共享图循环外上传 |
| `src/views/{workspace,photography}/*.vue`、`src/components/{Generation,Feature}Form.vue` | 参数签名跟随 `refImages` 化 |
| `scripts/image-gen-tests/` | 新增回归测试套件 |

---

## 2026-06-14 — AI 买家秀（素材库 + 制作买家秀）

### 新增

- **AI 买家秀页面**（`/buyer-show`）：在「AI生图」菜单组下新增页面，顶部两个 Tab：
  1. **素材库**（本会话实现·已验证）：管理员维护「图 + 提示词 + 标签」案例库；普通用户查看、放大、复制提示词。支持网格/列表（默认网格）、标签筛选、多选、批量上传（整批共用一组标签）、编辑（提示词/标签/替换图片）、批量软删、多选一键复制多条提示词（`\n` 拼接，表格粘贴每条一格）、右下角通用分页。
  2. **制作买家秀**（已实现·构建通过·待端到端验证）：从 Excel（商品ID/主图链接/提示词）批量生图，默认比例 9:16、张数 1，`feature_id='buyer-show'` 复用 `generation_tasks`；批次持久化到 `buyer_show_batch_items`，支持对比弹窗、按商品ID 打包 zip、**提交后 5s 内失败自动重试（上限 2）**。
- **OSS `materials` scope**：`utils/oss.ts` / `routes/oss.ts` / `services/ossApi.ts` 新增上传作用域，OSS key 前缀 `materials/<userId>/...`。
- **`useClipboard` 组合式函数**：抽取剪贴板复制（Clipboard API + 隐藏 textarea 兜底），供素材库复用。
- **`npm run check`**：新增脚本，前端 `vue-tsc -b` + 服务端 `tsc --noEmit` 类型检查。

### 权限

- 素材库：管理员 CRUD（`/api/admin/buyer-show`，`authMiddleware + adminMiddleware`）；普通用户只读（`/api/buyer-show`）。公开 GET 仅返回公开列，不泄漏 `created_by/original_filename`。

### 图片流量约束（硬性）

- 素材图片**浏览器直传 OSS**（`ossApi.upload` → `POST /api/oss/upload-token` 仅签 policy，不收字节）；展示/放大直连 OSS public URL。禁用经服务器的 multer 上传与下载代理。详见 `docs/records/decision-log.md`。

### 涉及文件

| 文件 | 变更 |
|------|------|
| `src/views/buyer-show/BuyerShowPage.vue` | 占位页改为 `el-tabs` 外壳（制作买家秀 + 素材库） |
| `src/components/buyer-show/MaterialLibrary.vue` | 新增 — 素材库主面板 |
| `src/components/buyer-show/MaterialCard.vue` | 新增 — 素材卡片（网格/列表） |
| `src/components/buyer-show/MaterialUploadDialog.vue` | 新增 — 批量上传弹窗 |
| `src/components/buyer-show/MaterialEditDialog.vue` | 新增 — 编辑弹窗（含替换图片） |
| `src/components/buyer-show/MaterialTagInput.vue` | 新增 — 标签选择（allow-create） |
| `src/services/buyerShowApi.ts` | 新增 — 素材库 API（公开 + 管理员） |
| `src/composables/useClipboard.ts` | 新增 — 剪贴板复制 |
| `src/views/buyer-show/MakeBuyerShowPanel.vue` | 新增（用户） — 制作买家秀面板 |
| `src/services/buyerShowBatchApi.ts` | 新增（用户） — 批量制作 API |
| `server/src/routes/buyerShow.ts` | 新增 — 素材库双路由（公开只读 + 管理员 CRUD） |
| `server/src/routes/buyerShowBatch.ts` | 新增（用户） — 批量制作路由 `/api/buyer-show-batch` |
| `server/src/db/schema.ts` | 修改 — 新增 `buyer_show_tags` / `buyer_show_materials` / `buyer_show_material_tags` / `buyer_show_batch_items` |
| `server/src/index.ts` | 修改 — 挂载三条新路由 |
| `server/src/utils/oss.ts` `server/src/routes/oss.ts` `src/services/ossApi.ts` | 修改 — 新增 `materials` scope |
| `src/router/index.ts` `src/components/SidebarMenu.vue` | 修改 — 新增 `/buyer-show` 路由与菜单项 |
| `package.json` | 修改 — 新增 `check` 脚本 |

### 数据库变更

- `buyer_show_tags`：id, name(UNIQUE), sort_order, created_at（全局标签）
- `buyer_show_materials`：id, oss_bucket, oss_object_key, public_url, prompt(必填), original_filename, mime_type, size_bytes, width, height, status(默认 active，软删), sort_order, created_by(FK users), created_at, updated_at, deleted_at
- `buyer_show_material_tags`：material_id(FK cascade), tag_id(FK cascade), 复合主键
- `buyer_show_batch_items`：id, user_id, batch_id, product_id, main_image_url, prompt, task_id, toapis_task_id, status, progress, error_message, sort_order, created_at, updated_at（制作买家秀模块；`model/resolution/result_image_urls` 等展示字段由 `GET /items` 左联 `generation_tasks` 取得，非本表列）

---

## 2026-06-07/08 — AI摄影功能

### 新增

- **AI摄影页面**（`/photography`）：在"AI生图"菜单组下新增独立页面。核心流程：
  1. 用户上传最多 10 张参考图（图片池，标记图一~图十，可拖拽排序）
  2. 将图片拖拽到管理员配置的"元素"（人脸、姿势、衣服、配饰、背景等）
  3. 同一张图可拖到多个元素（如全身照同时作为姿势和衣服参考，图片池中保留副本语义）
  4. 选择模型/分辨率/宽高比/数量，输入提示词，点击生成
- **AI摄影配置管理页**（`/admin/photography`）：管理员可增删改查元素，设置每元素最大图片数，为每元素×每模型独立配置 system_prompt
- **摄影任务与全局任务列表共用**：`feature_id='ai-photography'`，任务出现在与生图工作台相同的 TaskPanel 中，支持功能筛选
- **Prompt 自动拼接（方案 B）**：每个元素独立 system_prompt，生成时按 sort_order 拼接，自动附加"参考图映射"描述段告知 AI 第几张图对应哪个元素。图片去重：一图多元素引用时只发一次给 API
- **重新编辑**：从任务列表点击"重新编辑"可还原图片池和元素分配（通过 supplementaryImages 字段反向恢复）
- **重新生成**：AI摄影任务支持直接重新生成（复用已存 prompt + 图片 URL）

### 涉及文件

| 文件 | 变更 |
|------|------|
| `src/views/photography/PhotographyPage.vue` | 新增 — 主页面 |
| `src/components/PhotographyForm.vue` | 新增 — 核心表单（图片池、元素拖放、prompt 构建） |
| `src/views/admin/AdminPhotography.vue` | 新增 — 管理后台 |
| `src/services/photographyApi.ts` | 新增 — API 调用封装 |
| `server/src/routes/photography.ts` | 新增 — 公开 API |
| `server/src/routes/admin/photography.ts` | 新增 — 管理 API |
| `server/src/db/schema.ts` | 修改 — 新增 photography_elements / photography_element_prompts 表 |
| `server/src/index.ts` | 修改 — 挂载摄影路由 |
| `src/router/index.ts` | 修改 — 新增 /photography /admin/photography 路由 |
| `src/components/SidebarMenu.vue` | 修改 — 新增菜单项 |
| `src/configs/featureConfig.ts` | 修改 — 注册 ai-photography |
| `src/composables/useTaskManager.ts` | 修改 — handleCopyParams/handleRegenerate 支持摄影任务导航 |

### 数据库变更

- `photography_elements`：id, name(UNIQUE), label, max_images, sort_order, status, timestamps
- `photography_element_prompts`：id, element_id(FK), model_id, system_prompt, timestamps, UNIQUE(element_id, model_id)
- 种子数据：5 个默认元素（人脸/姿势/衣服/配饰/背景）× 4 个模型

---

## 2026-06-05/06 — 任务状态流优化 + 下载性能优化 + 多项 bug 修复

### 新增

- **`importing` 任务状态**：ToAPIs 生成完成后、OSS 导入完成前显示"下载中"。缩略图显示转圈 + "正在下载图片..."文字。导入完成后再切到 `completed`。
- **结果图手动刷新按钮**：已完成但无结果图时，缩略图上显示刷新按钮，点击后从 ToAPIs 重新拉取结果并导入 OSS，不刷新页面。
- **下载四层降级策略**：DOM Canvas 提取 → HTTP 缓存 fetch → 服务端代理 → 新标签页。正常情况（OSS URL + 已显示缩略图）直接零网络下载。
- **下载诊断日志**：控制台输出 `[下载] ✅ 策略1: 从DOM缓存提取 (零网络)` 等标记，方便排查缓存命中情况。

### 修改

- **`downloadUrl()`**：从纯代理模式改为四层降级，优先复用浏览器已有数据
- **OSS 缩略图** `<img>` 标签添加 `crossorigin="anonymous"`（仅 OSS URL），使 Canvas 提取不被 taint
- **`pollTask()`** 重构：推迟设置 `completed` 状态到 OSS 导入完成后，导入期间设为 `importing`
- **`isActive()` / `ACTIVE_STATUSES`**：加入 `importing`，统一使用常量数组
- **`retryImportTask()`** 新方法：用 `getTaskStatus` 重取 ToAPIs 结果 → `importResultUrls` → OSS → 更新任务

### 修复

- **Bug #5**：下载走远端而非缓存（改为四层降级）
- **Bug #6**：任务完成但缩略图空白 / 显示静态图标（新增 importing 状态 + 刷新按钮）
- **Bug #7**：参考图提交顺序与 UI 拖拽不一致（新增 refImages 有序参数）
- **Bug #8**：图片对比弹窗上下键切换失效（activeTaskId 本地跟踪）

### 涉及文件

| 文件 | 变更类型 |
|------|----------|
| `src/utils/download.ts` | 重构（四层降级 + 诊断日志） |
| `src/composables/useTaskManager.ts` | 修改（importing 状态 + retryImportTask + refImages 传递） |
| `src/services/imageGeneration.ts` | 修改（refImages 有序处理） |
| `src/components/TaskList.vue` | 修改（importing UI + 刷新按钮 + crossorigin + 下载优化） |
| `src/components/GenerationForm.vue` | 修改（emit refImages） |
| `src/components/FeatureForm.vue` | 修改（emit refImages） |
| `src/components/ImageCompareDialog.vue` | 修改（keyboard nav fix + importing 状态） |
| `src/components/TaskDetailDialog.vue` | 修改（importing statusMap） |
| `src/components/TaskPanel.vue` | 修改（retryImport 事件） |
| `src/views/workspace/WorkspacePage.vue` | 修改（refImages 透传） |

---

## 2026-06-05 — OSS 全链路通 + 下载/对比修复

### 新增

- **OSS 结果导入 Worker 部署**：`workers/oss-result-import-worker.mjs` 部署到阿里云函数计算，公网 URL `https://oss-rest-worker-ykaraoaubf.cn-hangzhou.fcapp.run`。ToAPIs 任务完成后自动将结果图转存到 OSS `results/{userId}/{yyyy}/{mm}/{uuid}.{ext}`。
- **跨域下载工具** `src/utils/download.ts`：通过服务端代理 `POST /api/proxy/image` 先获取图片 blob → 创建同源 blob URL → 触发 `<a download>` 下载，解决浏览器对跨域 URL 忽略 `download` 属性的问题。
- **非 OSS 参考图 URL 自动中转** `src/services/imageGeneration.ts`：若 `imageUrls` 中包含非 OSS URL（如 ToAPIs 链接、历史结果复用），自动下载后重新上传到 OSS，再存入 `input_image_urls`。
- **FC Worker 部署配置** `workers/s.yaml` 和入口文件 `workers/index.mjs`。

### 修改

- **下载逻辑**：TaskList / ResultsPage / BatchSpreadsheet / TaskDetailDialog 的下载函数全部改用 `src/utils/download.ts`。
- **图片对比对话框** `ImageCompareDialog.vue`：`currentTask` 计算属性优先通过 `taskId` 查找最新任务数据，修复 `loadHistory` 替换 `tasks.value` 数组后引用不更新导致参考图不显示。
- **服务端 Worker 调用** `server/src/utils/oss.ts`：移除对 Worker 的 Authorization header（FC HTTP trigger 不转发自定义 headers）。
- **`.env` 新增变量**：`OSS_RESULT_IMPORT_WORKER_URL`、`OSS_RESULT_IMPORT_WORKER_SECRET`。

### 删除/废弃

- Worker 的 Bearer Token 鉴权（`assertAuthorized` 函数）— FC 不支持，改为依赖 Worker URL 保密 + objectKey 前缀校验。
- `toapisProxyApi.upload`（`/toapis/upload` 代理）— 代码保留但生图流程不再调用，属于死代码。

### 涉及文件

| 文件 | 变更类型 |
|------|----------|
| `src/utils/download.ts` | 新增 |
| `src/services/imageGeneration.ts` | 修改 (+27/-2) |
| `src/components/ImageCompareDialog.vue` | 修改 (+20) |
| `src/components/TaskPanel.vue` | 修改 |
| `src/composables/useTaskManager.ts` | 修改 |
| `src/views/results/ResultsPage.vue` | 修改 |
| `src/views/tools/BatchSpreadsheetPage.vue` | 修改 |
| `src/components/TaskDetailDialog.vue` | 修改 |
| `server/src/utils/oss.ts` | 修改 |
| `workers/oss-result-import-worker.mjs` | 修改 |
| `workers/index.mjs` | 新增 |
| `workers/s.yaml` | 新增 |
