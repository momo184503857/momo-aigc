# AI 买家秀（买家秀案例库）

最后更新：2026-06-23  
负责人：管理员（墨墨）  
菜单位置：侧边栏「AI生图」→「AI买家秀」（路由 `/buyer-show`）

---

## 1. 概述

「AI 买家秀」是面向电商运营的功能页，帮助运营基于商品主图批量生成「买家秀」风格的展示图。页面顶部含两个 Tab：

| Tab | 名称 | 状态 | 说明 |
|-----|------|------|------|
| 1 | 制作买家秀 | **已实现·构建通过·待端到端验证** | 从 Excel 批量生图、打包下载。**工作区只保留当前任务**（上传新表=新任务并自动归档旧的，亦可手动归档）。本轮已实现并通过类型检查/构建；真实 OSS/ToAPIs 端到端待验证（见 §3） |
| 2 | 任务历史 | **已实现·构建通过·待端到端验证** | 按批次（一次上传=一个任务）回看历史：列表/详情/对比弹窗/下载 zip/改名/删除。详见 §3.6 |
| 3 | 素材库 | **已实现·已验证** | 管理员维护「图 + 提示词 + 标签」案例库，普通用户查看 + 复制（见 §2） |

- 默认进入 Tab：**制作买家秀**（当前默认值，用户设定）。
- 后端独立性：素材库走 `/api/buyer-show` 与 `/api/admin/buyer-show`；制作买家秀与任务历史同走 `/api/buyer-show-batch`（同源数据，表 `buyer_show_batch_items` + 批次元数据 `buyer_show_batches`），与素材库相互独立。

---

## 2. 素材库（已实现·已验证）

### 2.1 目标

集中维护「一张图 + 一段提示词 + 若干标签」的案例素材，供运营（普通用户）查阅、放大、复制提示词到表格，供管理员增删改查。

### 2.2 角色与权限

| 操作 | 普通用户 | 管理员 |
|------|:------:|:------:|
| 查看列表（网格/列表） | ✅ | ✅ |
| 标签筛选 | ✅ | ✅ |
| 点击图片放大 | ✅ | ✅ |
| 复制单条提示词 | ✅ | ✅ |
| 多选 → 一键复制多条提示词 | ✅ | ✅ |
| 批量上传 | ❌ | ✅ |
| 编辑（提示词/标签/替换图片） | ❌ | ✅ |
| 删除（单条/批量） | ❌ | ✅ |
| 增删标签 | ❌ | ✅ |

- 权限在**服务端**强制：管理员路由 `/api/admin/buyer-show` 经 `authMiddleware + adminMiddleware`，非管理员返回 403；公开路由 `/api/buyer-show` 仅暴露只读 GET。
- 前端 `v-if="auth.isAdmin"` 仅作 UI 隐藏，不作为安全依据。
- 防 metadata 泄漏：公开 GET 只返回公开列（`id / public_url / prompt / width / height / created_at / tags`），不含 `created_by / original_filename`；管理员 GET 返回完整行（含 `username`）。

### 2.3 数据模型

- **素材卡片** = 一张图（OSS public URL）+ 一段提示词（必填）+ 若干标签。
- 表：`buyer_show_materials`（素材）、`buyer_show_tags`（全局标签）、`buyer_show_material_tags`（多对多）。
- 标签为**全局**维度（管理员维护，全用户共享），不复用按用户隔离的 `gallery_tags`。
- 软删除：`status='deleted'`，列表查询一律过滤 `status='active'`。

### 2.4 业务流程

**管理员 · 批量上传**
1. 点「批量上传」→ 弹窗：顶部一组「整批共用标签」+「选择图片」（可多选）。
2. 每张图一行 = 缩略图 + 提示词输入框 + 删除。
3. 校验：每行提示词非空；单图 ≤ 10MB（超限跳过并提示）。
4. 提交：逐张浏览器直传 OSS（见 §2.8），完成后单事务批量写入素材，**每张图都挂同一组标签**。
5. 成功后关闭弹窗、列表刷新。

**管理员 · 编辑**
- 编辑弹窗可改：**提示词 + 标签 + 替换图片**。
- 替换图片在「保存」时才上传（取消不产生孤儿对象）。

**管理员 · 删除**
- 单条删除：确认后软删。
- 批量删除：多选后批量条「批量删除」，确认后单事务软删。

**用户 · 查看与复制**
- 点击图片 → 放大预览（直连 OSS）。
- 点击提示词文本或「复制」按钮 → 复制该条提示词。
- 多选多条 → 批量条「复制选中提示词」→ 提示词以 `\n` 拼接复制，**不复制图片**。
- 粘贴到表格时，每条提示词独占一个单元格（纵向排列一行一格）。

### 2.5 默认值

| 项 | 默认值 |
|----|--------|
| 视图模式 | 网格（可切列表） |
| 每页条数 | 20（可选 20 / 40 / 60 / 100） |
| 标签筛选 | 全部 |
| 批量上传标签范围 | 整批共用一组 |

### 2.6 业务规则与边界

- 提示词**必填**：上传时校验（前端警告 + 后端 400 返回违规行号）；编辑保存时空提示词拒绝。
- 标签创建**幂等**：同名标签返回已存在 id。
- 多条提示词复制：内部换行 `\r?\n` → 空格，保证「一条一格」不串格。
- 删除标签：级联清理 join 行，素材本身保留。
- 列表标签筛选：`INNER JOIN` join 表 + `COUNT(DISTINCT)` 去重。
- 单图上限 10MB（与模板图库一致）。

### 2.7 验收标准

- 管理员可见「批量上传 / 编辑 / 删除 / 批量删除」；普通用户不可见，但可查看、放大、单条/多条复制。
- 批量上传后所有新卡片均带同一组标签；空提示词被拦截。
- 多选复制粘贴到表格 → 每条提示词一格（含内部换行的提示词仍单行单格）。
- 标签筛选、网格/列表切换、右下角分页器均正常；空库隐藏分页。
- 普通用户调用 `/api/admin/buyer-show/*` 返回 403。

### 2.8 图片流量约束（硬性）

> 图片字节**绝不经过服务器**；服务器只存 OSS 链接，节省流量费。

- 上传：`ossApi.upload(file, 'materials')` → 先 `POST /api/oss/upload-token`（服务器只签发 PostObject policy，不收字节），浏览器 `fetch(oss上传地址)` 直传 OSS。
- **禁用** `POST /api/oss/upload`（multer，字节经服务器）与 `/api/proxy/image`（仅用于跨域「另存为」下载，本功能不涉及）。
- 展示/放大：缩略图与 `UiImagePreview` 均用 OSS public URL 直连。
- 服务端 `/batch`、`PATCH /:id` 只接收/写入 `oss_bucket / oss_object_key / public_url` 字符串。

---

## 3. 制作买家秀（已实现·构建通过·待端到端验证）

> 本 Tab 已实现，并通过 `npm run check`（`vue-tsc -b` + 服务端 `tsc --noEmit`）类型检查与构建；真实 OSS / ToAPIs 端到端流程尚未在本环境跑通，需按 §3.5 验收。

### 3.1 目标与流程

基于商品主图批量生成「买家秀」展示图，并按商品ID 打包下载。

1. **下载模板 / 上传表格**：模板列 = `商品ID / 1:1主图1链接 / 提示词`（与样例 Excel 一致）。上传时客户端 `xlsx` 解析，**模糊匹配列名**（兼容「一比一主图一链接」等写法），缺任一必要列报错；解析后弹框**可选输入任务名**（留空用「时间 · N个商品」默认），确认后服务端建新批次——**自动归档旧当前任务**，新批次成为当前任务并替换工作区（非追加）。
2. **列表**：每行 = 主图缩略图（点击 → `UiImagePreview` 放大）+ 商品ID + **可编辑提示词**（失焦/回车即落库 `PATCH`）+ 勾选框；表头内置全选。
3. **统一参数**：模型 / 分辨率 / 比例（**默认 9:16**）/ 张数（**默认 1**），全部可选。
4. **一键生图**：对「勾选且状态为 pending/failed」的行，逐行调用现有生图（3s 限流），积分预检 + 确认弹窗；任务 `feature_id='buyer-show'` 写入 `generation_tasks`，**同时出现在全局任务列表与本页**。
5. **轮询**：每行 4s 轮询 ToAPIs；完成时结果转存 OSS（`ossApi.importResult`）后回写任务与本行。
6. **结果查看 / 重新生成**：结果缩略图点击 → `ImageCompareDialog`（左=主图，右=结果；方向键在已完成项间切换）；对**已完成**的行可点「重新生成」（用该行原任务参数重提交，新结果覆盖旧结果，见 §3.3）。
7. **一键下载 / 归档**：勾选已完成结果 → 真实打 zip（`jszip`），每张按商品ID 命名、**同商品ID 重复加 `_2/_3`**（OSS 直 fetch 失败回落 `/api/proxy/image`）；点「归档当前任务」把当前任务移入「任务历史」（见 §3.6），工作区清空等待新上传。

### 3.2 后端

- 路由 `/api/buyer-show-batch`（仅 `authMiddleware`，**按 `user_id` 隔离，全员可用**）：
  - `GET /items`：默认只返回**当前任务**（`status='active'` 批次）的行；`?batchId=` 指定批次。左联 `generation_tasks` 取每行最新状态/结果（含 `model/resolution/aspect_ratio/n/result_image_urls`）。
  - `POST /items`：建新批次（服务端生成 `batch_id`）——事务内先归档该用户所有 `active` 批次，再插新 `active` 批次元数据（入参 `name`），最后插行。返回 `{ batchId, ids }`。
  - `PATCH /items/:id`：改提示词 / 回写任务链接与状态。**字段名归一化**：同时接受 camelCase（`taskId`/`toapisTaskId`/`errorMessage`）与 snake_case（修复刷新结果丢失，见 `bug-fixes.md` 2026-06-22）。
  - `DELETE /items/:id`、`DELETE /all`（清空该用户全部行 + 批次）。
  - `GET /batches`：列出批次（默认仅 `archived` 历史；`?includeActive=1` 含当前），含聚合统计 `itemCount/completedCount/failedCount`。
  - `GET /batches/:batchId/items`：某批次全部行（任务详情）。
  - `PATCH /batches/:batchId`：改名 / 手动归档（`status` 仅允许 `active→archived`）。
  - `DELETE /batches/:batchId`：删除整个任务（元数据 + 行；`generation_tasks` 保留）。
- 表 `buyer_show_batch_items`：`id, user_id, batch_id, product_id, main_image_url, prompt, task_id, toapis_task_id, status, progress, error_message, sort_order, created_at, updated_at`。
- 表 `buyer_show_batches`（批次元数据 / 任务历史）：`id, user_id, batch_id(UNIQUE), name, status('active'|'archived'), created_at, archived_at`。
- **结果图靠 JOIN、不冗余**：`model/resolution/aspect_ratio/n/result_image_urls/input_image_urls/completed_at` 都不是 `buyer_show_batch_items` 的列，而是 `GET /items` 经 `LEFT JOIN generation_tasks ON task_id=gt.id` 取得（本行有 `task_id` 时以任务状态/结果为准，否则取本行 status）。

### 3.3 业务规则与边界

- **一个任务 = 一个 `batch_id`**：上传即开新任务，旧当前任务自动归档；工作区始终只显示当前（active）任务。
- **归档**：手动（「归档当前任务」按钮）或上传新表时自动。允许归档含未完成（生图中/失败/待生成）行的任务——归档只改 `status`、停前端轮询；行与 task 关系不变，历史详情每次打开取最新（归档时 in_progress 的行若之后 task 完成，刷新详情即见结果）。
- **重新生成（覆盖旧结果）**：对**已完成**行点「重新生成」，用**该行原任务参数**（model/分辨率/比例/张数）重提交；新任务完成后经 `task_id` 关联自然覆盖旧结果（旧任务记录保留但解除关联）。提交瞬间旧结果即时清空 → 生成中 → 完成填新结果。按正常计费扣积分（失败不扣）。**仅工作区支持；任务历史详情只读**（见 §3.6）。
- **默认参数**：比例 `9:16`（依赖默认分辨率 `2K`；切到 `gpt-image-2 @ 1K` 自动回退到该档首个比例）、张数 `1`。
- **积分**：按 `unitPrice × 选中行数 × 张数` 预估；实际在 `taskApi.create` 时由服务端 `calculateCost` 扣除，**失败退款**（预扣 + 失败退，全局规则，见 `billing.md` / `decision-log.md` 2026-06-20）。
- **主图不重传 OSS**：alicdn 主图 URL 直接作为参考图传给 ToAPIs；对比弹窗的「参考图」即该 alicdn 链接。
- **快速失败自动重试**：提交后 **5 秒内**失败视为瞬时失败，自动重提；**单行最多自动重试 2 次**；超过 5s 或达上限转终态失败，由用户手动重试或重新生成（均重置自动重试额度）。自动重试用**该行原任务参数**。
- **刷新续跑**：`onMounted` 仅加载当前任务（active 批次）的行；对 `in_progress` 且有 `toapis_task_id` 的行恢复轮询。
- **结果须为 OSS URL** 才写入 `generation_tasks.result_image_urls`，故先 `importResult` 再 `taskApi.update`。
- **统一提交入口 `doSubmit(row, params)`**：一键生图 / 失败重试 / 自动重试 / 重新生成共用；提交时把所用参数回写到行（model/resolution/aspectRatio/n），保证自动重试参数一致。

### 3.4 已决定 / 风险

- **【待端到端验证】**：导入、逐行生图、轮询恢复、对比弹窗、zip 打包、任务历史、重新生成未在真实 OSS/ToAPIs 环境验证（见 `todo.md`）。
- **【历史数据限制】**：2026-06-22 修复刷新结果丢失前，`task_id` 因字段名不匹配从未写入 `buyer_show_batch_items`；这些旧行（迁移后已归档进历史）刷新后仍无结果图——结果还在 `generation_tasks` 但已无可关联字段，无法可靠回连，需重新上传生成。
- **【已决定·保持现状】系统提示词**：每行直接用表格「提示词」作为生图 prompt，不拼系统提示词。如未来需统一风格，再为 `feature_id='buyer-show'` 追加按模型配置的 system prompt（可挂 `feature_prompts`）。
- **【已决定】计费**：预扣 + 失败退款（全局规则）；自动重试上限 2（`MakeBuyerShowPanel.vue` 的 `MAX_AUTO_RETRY` / `FAST_FAIL_MS`）。
- **【已决定】结果图存储**：靠 `LEFT JOIN generation_tasks` 取，不在 `buyer_show_batch_items` 冗余存结果图；重新生成覆盖=改 `task_id` 关联，旧 task 保留不删。
- **【已决定】任务历史只读**：历史详情不支持重新生成/编辑（只查看/下载/对比/改名/删除）；重新生成仅在工作区。

### 3.5 验收标准

- `npm run check`（`vue-tsc -b` + 服务端 `tsc --noEmit`）通过。
- 下载模板三列正确；上传样例 56 行；主图放大、提示词改写落库、勾选/全选正常。
- 一键生图后任务进全局列表与本页，状态推进到 completed，结果转存 OSS。
- 结果缩略图弹对比弹窗；多选结果一键下载 zip，文件名=商品ID、重复 `_2/_3`。
- **刷新后批次/结果仍在**（`task_id` 已正确写入，JOIN 取回结果），`in_progress` 行继续轮询。
- 已完成行点「重新生成」→ 用原参数重提交 → 旧结果被新结果覆盖（刷新后仍是新结果）。
- 上传新表自动归档旧任务；手动「归档当前任务」后工作区清空；任务历史可见、可改名/下载/删除/对比。

### 3.6 任务历史（Tab 2）

按批次（任务）回看往期买家秀的全部内容与结果，支持下载/对比/改名/删除（**只读**，不重新生成）。

- **列表**：每个 `archived` 批次一行——名称（自定义或默认「`toBJDate(created_at)` · N 个商品」）、创建时间、完成度（`completedCount/itemCount` + 进度条）、状态（全部完成 / N 失败 / 部分完成）、操作（查看详情 / 下载 zip / 改名 / 删除）。按 `created_at` 倒序，前端分页。
- **详情**：该批次全部行（主图、商品ID、提示词只读、状态、结果）。结果点击 → `ImageCompareDialog`；顶部「下载全部结果 zip」（按商品ID 命名）。
- **规则**：任务历史 = 所有 `archived` 批次；当前任务（active）在工作区、不进历史。删除任务删元数据行 + 其行（`generation_tasks` 保留）。改名 `PATCH /batches/:batchId { name }`，空 name 用默认。历史**只读**，不重新生成、不回迁工作区。
- **复用**：对比弹窗 `ImageCompareDialog`、打包下载 `src/utils/buyerShowZip.ts`（与工作区共用）。

---

## 4. 需求变更记录

- **2026-06-14**：新增「AI 买家秀」页面与「素材库」功能。素材库由本会话实现并验证（管理员 CRUD + 用户只读复制 + 标签筛选 + 网格/列表 + 批量上传/删除 + 一键复制多条提示词至表格）。关键确认：① 编辑范围 = 提示词 + 标签 + 替换图片；② 批量上传标签 = 整批共用一组；③ 图片流量直传 OSS、服务端只存链接。同页「制作买家秀」Tab 由用户实现，待验证。
- **2026-06-14（制作买家秀落地）**：实现「制作买家秀」Tab 全流程——Excel 模板下载/上传解析、可编辑提示词、统一参数（默认 9:16 / 张数 1）、一键生图（复用 `generation_tasks`，`feature_id='buyer-show'`）、4s 轮询、对比弹窗、按商品ID 打包 zip；批次持久化到 `buyer_show_batch_items`，刷新续跑。**新增规则：提交后 5s 内失败自动重试，单行上限 2 次。** 已通过类型检查/构建；真实环境端到端待验证。澄清：`model/resolution/result_image_urls` 等为 `GET /items` 左联 `generation_tasks` 所得，**非本表缺失列**（推翻此前「缺 migration」的疑虑）。

- **2026-06-22（任务历史 + 刷新结果修复）**：① 修复刷新后结果图消失——根因前端 PATCH 传 camelCase 而后端认 snake_case，致 `task_id` 写不进表、刷新 JOIN 不到结果；`PATCH /items/:id` 归一化字段名修复（仅对新提交生效）。② 新增「任务历史」Tab：一次上传=一个任务（`batch_id`），新增 `buyer_show_batches` 元数据表（`active`=当前 / `archived`=历史）。③ 工作区改为「只留当前任务」：上传新表自动归档旧任务 + 手动「归档当前任务」按钮；`GET /items` 默认仅 active，`POST /items` 自动归档旧的并接收任务名。④ 历史支持列表/详情/对比弹窗/下载 zip/改名/删除（不支持重生成）；命名上传时可选输入、之后可改。⑤ 幂等迁移 `migration_buyer_show_batches_v1` 将现有批次标记为 `archived`。详见 `docs/records/changelog.md`。

- **2026-06-23（工作区重新生成）**：工作区「操作」列对已完成行新增「重新生成」——用该行原任务参数（model/分辨率/比例/张数）重提交，新结果覆盖旧结果（`task_id` 指向新任务，旧任务解除关联但保留）。任务历史详情保持只读。统一抽 `doSubmit` 提交入口；`fetchItems` 等透传原任务 `n`。重新生成按正常计费扣积分（失败不扣）。详见 `docs/records/changelog.md`。
