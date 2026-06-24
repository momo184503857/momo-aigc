# Bug Fixes

重要 bug 记录和解决经验，按时间倒序。

---

## 2026-06-24 — 结果图裂开：crossorigin="anonymous" 触发 OSS CORS 校验失败

**现象**：① 任务列表很多结果缩略图裂开显示不出；② AI 买家秀列表缩略图正常，但点击后「对比弹窗」里结果图裂开；③ 任务详情弹窗、结果页（`/results`）结果图同样裂开。

**根因**：结果图的 `<img>` 带 `crossorigin="anonymous"`，浏览器按 CORS 模式发起图片请求，OSS 未对该请求返回有效的 CORS 响应头（`Access-Control-Allow-Origin`），校验不过 → 图片被拒绝渲染（裂开）。同一张 OSS 图：不带 `crossorigin` 的 `<img>`（买家秀列表缩略图、对比弹窗参考图）正常显示，带 `crossorigin` 的（任务列表结果图、对比弹窗结果图、详情弹窗、结果页）裂开——现象与代码完全吻合。

涉及 5 处 `<img>`：`TaskList.vue`（列表/网格视图 2 处）、`ImageCompareDialog.vue`（对比弹窗结果图，买家秀共用）、`TaskDetailDialog.vue`、`ResultsPage.vue`。

**与既有文档的矛盾（重要）**：本轮现象推翻了 2026-06-05「下载四层降级」的前提——`decision-log.md` / `architecture.md` / `todo.md` 此前均断言「OSS CORS 已正确配置、`crossorigin="anonymous"` 不会阻止图片加载、策略1（DOM Canvas）可命中」。但当前环境下带 `crossorigin` 的 OSS 图无法加载。**OSS CORS 的当前实际配置状态待确认**（可能未配、或 `allowed origins` 不含当前部署域名、或仅配了 GET 但缺 ACAO 等），需在阿里云 OSS 控制台核对 Bucket 的 CORS 规则。无论其状态如何，结论都是「展示图不加 `crossorigin`」。

**解决方案（治本）**：移除上述 5 处结果图 `<img>` 的 `crossorigin` 属性。图片不再以 CORS 模式请求，直接正常显示。新增 `src/composables/useImageRetry.ts`（`@error` 失败时给 src 追加时间戳绕缓存重试一次）兜底偶发的网络抖动 / 旧失败响应缓存——但重试对 CORS 失效无能为力，CORS 问题只能靠「不加 `crossorigin`」解决。

**对下载的影响**：`download.ts` 策略1（DOM Canvas 提取像素）依赖未污染 canvas，本需 `crossorigin` 才能命中；移除后策略1恒失效（canvas tainted）→ 策略2 `fetch(force-cache)` 也因 OSS 无 CORS 失败 → 实际走策略3服务端代理（`POST /api/proxy/image`，绕过 CORS，100% 可靠）。下载功能不受影响，仅多一次服务端往返与代理流量。`download.ts` 代码未改。

**涉及文件**：`src/composables/useImageRetry.ts`（新）；`src/components/{TaskList,ImageCompareDialog,TaskDetailDialog}.vue`、`src/views/results/ResultsPage.vue`（移除 crossorigin + 接入 @error 重试 + 清理无用的 `isOssImageUrl` import）。

**预防方式**：
- 展示型 `<img>` / `el-image`（OSS 或任意跨域图）**不要加 `crossorigin="anonymous"`**，除非确有 canvas 像素操作需求且已确认源站 CORS 对当前域名生效。CORS 校验失败表现为静默裂开，难以排查。
- 下载等需要像素数据的场景，优先用不依赖 `crossorigin` 的服务端代理降级（本项目的 `POST /api/proxy/image`），而非为「省一次网络往返」给展示图加 `crossorigin`——后者会牺牲图片显示本身。
- 同一张图「A 处正常、B 处裂开」，强烈提示 B 处的 `<img>` 多了 `crossorigin`（或 referrerpolicy 等 CORS 相关属性）——排查时 diff 两处 img 标签。

---

## 2026-06-22 — AI 买家秀：刷新后结果图消失（task_id 从未写入）

**现象**：制作买家秀批量生图完成后结果缩略图正常显示；刷新页面后行（商品ID/主图/提示词）还在，但结果图消失。

**根因**：前端 `buyerShowBatchApi.updateItem()` 传的字段是 camelCase（`taskId`/`toapisTaskId`/`errorMessage`），而后端 `PATCH /items/:id` 白名单只认 snake_case（`task_id`/`toapis_task_id`/`error_message`），匹配逻辑 `if (req.body[key] !== undefined)` 按 snake_case key 取值。两者对不上 → `task_id` **永远写不进** `buyer_show_batch_items`（POST 插入时该列本就为 NULL）。当次会话内前端内存 `row.taskId` 有值（来自 `submitTask` 返回）所以能显示；刷新后 `GET /items` 的 `LEFT JOIN generation_tasks ON bi.task_id = gt.id` 因 `task_id IS NULL` JOIN 不到 → `result_image_urls` 取不到 → 结果图消失。只有大小写一致的 `status`/`progress`/`prompt` 能写进表，故「其他内容都还在」。`onPromptChange` 传的 `prompt` 大小写无关所以一直正常，反而掩盖了问题。

**解决方案**：后端 `PATCH /items/:id` 用 `snakeToCamel` 映射归一化——对每个 snake_case 列同时检查两种 key，取非 undefined 的值。一处改完全部调用点（提交/重试/autoRetry/persistRowStatus）生效。

**涉及文件**：`server/src/routes/buyerShowBatch.ts`（PATCH 归一化）。

**预防方式**：
- 前后端字段命名约定不一致（前端 camelCase、DB snake_case）时，**接口层必须有显式归一化**，不能假设某一侧自适应。Express `req.body[key]` 按字面 key 取值，camelCase 不会自动匹配 snake_case 列名。
- 「改提示词能存住、但任务关联存不住」这类**部分字段正常**的现象，强烈提示大小写不一致（相同的字段蒙混过关，不同的静默丢失）——排查时优先核对两端 key 拼写。
- 历史已损坏数据（`task_id` 已 NULL）无法可靠回连，修复只对新提交生效；这类静默写入丢失 bug 要尽早发现，否则脏数据累积不可逆。

---

## 2026-06-20 — 失败任务被扣费未退 + 累计充值误含退款

**现象**：① 失败的生图任务仍扣了用户积分（创建时预扣、失败不退）；② `/api/points/me` 的 `total_recharged` 把「失败退款」（amount>0）也算进了充值，累计充值虚高。

**根因**：
1. `POST /api/tasks` 在创建时扣费（预扣），而 `PATCH /api/tasks/:id` 把状态改 failed 时**没有任何退款逻辑**——只更新 status 字段。故失败任务 `points_cost` 保持原值、余额不恢复、无退款流水（旧规则即「失败不退款」，本轮改为退款）。
2. `/me` 的 `total_recharged = SUM(amount) WHERE amount>0`——退款流水 amount 为正，被误计入「充值」。

**解决方案**：① `PATCH /:id` 加失败退款（见决策日志 2026-06-20）；② `total_recharged` 改为 `SUM(amount) WHERE reason='admin_recharge'`（纯充值，不含退款）；新增 `total_consumed = SUM(points_cost)`（净消耗）。历史失败任务用 `refund_failed_v1` 启动迁移补退（本地 73 笔 / 云端 74 笔已退，金额对账通过：净消耗 = 毛扣费 − 退款）。

**涉及文件**：`server/src/routes/tasks.ts`（退款）、`server/src/routes/points.ts`（/me 口径）、`server/src/db/schema.ts`（迁移）、`scripts/refund-failed-tasks.mjs`。

**预防方式**：
- 「预扣 + 终态退款」模型下，状态流转到失败必须有对称的退款分支；只更新 status 不处理钱是静默 bug（钱扣了不退，DB 不报错）。
- 带符号金额按「方向」分类统计时，不能用「正=充值」这类简单符号判断——退款也是正数。按 `reason` 精确归类（`admin_recharge` 才是充值）。
- 「清零 `points_cost`」一举两得：既防重复退款（幂等守卫），又让 `SUM(points_cost)` 自动成为净口径——退款类操作应把已退金额从原记录抹除，而非仅靠统计时过滤。

---

## 2026-06-19 — 生图统计日期查询报错 + 全项目时间显示/统计错天（UTC 未换算北京时间）

**现象**：① 生图日志「生成统计」选日期后点查询报错（实际抛 `TypeError` 被吞成「加载统计失败」toast）；② 全项目时间显示比北京时间**晚 8 小时**；③ 每日趋势图 / 日期过滤把北京傍晚提交的任务归到前一天或漏掉。

**根因**（两个独立陷阱叠加）：

1. **el-date-picker 的 `value-format` 静默改变 v-model 类型**：设了 `value-format="YYYY-MM-DD"` 后，选过日期 v-model 从 `Date[]` 变成 **`string[]`**；而 `fmtDate()` 对值调 `d.toISOString()`，字符串没有该方法 → 抛 `TypeError`（初始 `Date` 值不触发，**选过日期才炸**，故表现为「选日期后查询报错」）。
2. **存 UTC 但在「展示 / 按天」边界不做时区换算**：前端 `row.xxx.slice(0,16)` 原样截断 UTC 串；后端 `DATE(created_at)`、`created_at >= '<date>'` 都按 UTC 日 / UTC 零点算。对北京用户整体偏 8 小时，按天边界（北京 00:00 = UTC 前一日 16:00）全部错位。

**解决方案**：见 `decision-log.md` 2026-06-19——前端共享 `src/utils/datetime.ts`（`toBJ*`），后端共享 `server/src/utils/datetime.ts`（`bjDay` / `bjDateRangeClause`）。17 处前端显示 + 4 路由范围过滤 + stats 按天分桶全部改走共享 util；`fmtDate` 改为兼容 `Date | string`。

**涉及文件**：`src/utils/datetime.ts`（新）、`server/src/utils/datetime.ts`（新）、`server/src/routes/{admin/stats,admin/tasks,points,tasks}.ts`、`src/components/TaskList.vue`、`src/views/admin/{AdminDashboard,AdminStats,AdminTasks,AdminTemplates,AdminPointsTransactions,AdminUsers}.vue`、`src/views/{user/MyQuotaPage,results/ResultsPage,canvas/ProjectsPage,buyer-show/MakeBuyerShowPanel}.vue`、`src/modules/workflow/components/WorkflowRightPanel.vue`。

**预防方式**：

- `el-date-picker` 一旦设 `value-format`，绑定值类型就从 `Date` 变为**格式化字符串**；消费该值的 helper 必须兼容两种类型（`Date | string`），不能假定是 Date，类型注解也应随之改为字符串。这类「选过才崩」的 bug 极易潜伏。
- 凡是存储为 UTC 的时间，在「展示给人看」「按天分组 / 过滤」之前**必须**做时区换算；裸 `.slice()`、`DATE(col)` 默认都是 UTC，对非 UTC 用户必错。项目已提供 `toBJ*` / `bjDay` / `bjDateRangeClause`，新代码直接复用，禁止再手写换算或裸截断。
- 趋势图「最近 N 天」的窗口左沿不能简单 `DATE('now','-8 hours',?)`（会把窗口拉宽一天），正确写法是 `datetime(DATE('now','+8 hours'),'-8 hours',?)`（北京零点的 UTC 瞬时）。

---

## 2026-06-17 — AI 画布文字 AI：图片输入端口声明但未传给模型

**现象**：文字 AI 节点连了参考图，但模型输出仍要求「上传参考图」——图片未被接收，仅文字输入生效。

**根因**：text-ai 节点声明了 `image` 输入端口，但 `run()` 里 `resolveNodeInputs` 只取了 `inputs.text`，`inputs.image` 从头到尾未被读取；发给模型的 `messages.content` 恒为纯文本字符串。端口是「摆设」。

**解决方案**：`run()` 读取 `inputs.image`，提取图片 URL（兼容 `{image,imageList}`，接受 http/data），有图时把 `content` 构造为 OpenAI vision 多模态数组（`text` 块 + `image_url` 块），无图时保持纯文本。

**涉及文件**：`src/modules/workflow/nodes/text-ai/index.ts`

**预防方式**：
- 声明了输入端口就必须在 `run()` 里消费；「端口接了但没传给下游 API」是静默 bug——运行不报错只是功能失效，易长期潜伏。审查节点时核对每个 input 端口是否有对应读取与传递。
- 多模态接口（vision）的 `content` 要按数组（`text` + `image_url` 块）构造，纯字符串不会带图。

---

## 2026-06-17 — AI 画布文字 AI：请求超时（全局 15s axios timeout 套在慢 LLM 请求上）

**现象**：文字 AI 带参考图调用，前端报 `timeout of 15000ms exceeded`，重试后转 500。

**根因**：`http.ts` 全局 `timeout: 15000` 套用在所有 `/api` 请求上，包括文字模型 chat。LLM 带图推理耗时远超 15s，请求未返回即被前端 axios 主动断开。后端 Node `fetch` 默认无超时，瓶颈纯在前端。第三次 500 是前两次超时残留连接/上游状态的连锁。

**解决方案**：`canvasApi.chat` 单独传 `{ timeout: 900000 }`（15 分钟），不动全局 15s（避免影响其他接口）。

**涉及文件**：`src/services/canvasApi.ts`（+ 后端 `canvas-ai.ts` 补 `console.error` 暴露真因）

**预防方式**：
- 长耗时接口（LLM 推理、大文件、慢上游）必须单独放宽 axios timeout，不能依赖全局默认；全局 timeout 只适合常规短请求。
- 代理类后端的 `catch` 务必 `console.error` 打印原始错误，否则真因被「status code 500」吞掉，前后端都看不到。前端 catch 应优先读 `err.response.data.error` 而非 axios 的 `err.message`。

---

## 2026-06-17 — 模板图库：拖缩略图入收藏区失效（原生图片拖拽劫持）

**现象**：模板图库页进入「设置收藏」编辑态后，按住网格卡片的缩略图拖入下方收藏区无反应（图片不被添加、无提示）；只有恰好抓到缩略图外的卡片留白处才偶发可用。曾误判为「图片过大」。

**根因**：网格卡片 `.tpl-card` 设 `draggable="true"`，但卡片内最大的交互区是缩略图 `<img>`。`<img>` 在 HTML5 中天生是原生拖拽源——按住图片拖动时，浏览器发起的是**原生图片拖拽**（拖图片本身），而不是卡片的拖拽；卡片的 `@dragstart` 没能可靠写入自定义数据 `application/template-id`，收藏区 `handleDropZoneDrop` 里 `getData('application/template-id')` 返回空 → 静默 `return`。图片越大、缩略图占卡片面积越大，用户越容易抓到图片区域，故呈现「图片大就拖不动」的假象，本质是原生图片拖拽劫持。

**解决方案**：给网格缩略图 `<img>` 加 `draggable="false"`，使其不再是拖拽源，拖拽冒泡到祖先 `.tpl-card`（`draggable=true`），卡片 `dragstart` 正常写入模板 id，收藏区 `drop` 成功。点击预览不受影响（点击事件仍冒泡到父级 `.tpl-thumb`）。

**涉及文件**：`src/views/templates/TemplatesPage.vue`

**预防方式**：
- 凡 `draggable=true` 容器内的 `<img>`，都必须显式禁用其原生拖拽（`draggable="false"` 或 `pointer-events: none`），否则原生图片拖拽会劫持容器拖拽，导致自定义 `dataTransfer` 写不进、`drop` 静默失败。
- 本页收藏区内部排序的 `.zone-item-img img` 早已用 `pointer-events: none` 规避同一问题，但网格→收藏区这条拖拽路径漏处理——同一类 bug 在同页出现两次，第二次靠 code review 没兜住。审查 HTML5 拖拽功能时，应把「拖拽源容器内的所有原生可拖拽子元素（`<img>`、`<a>` 等）」统一过一遍。

---

## 2026-06-15 — AI 生图：generateImage 成功时 DB 任务卡在 submitted

**现象**：调用 `generateImage(params, { poll: true })`（不传 `import`）时，轮询已 `completed`，但 DB 任务一直停在 `submitted`，全局任务列表显示幽灵"运行中"任务。

**根因**：`generateImage` 里 DB 写 `completed` 的逻辑被错误地嵌在 `if (options?.import)` 内——即只有同时要求转存结果时才写 DB。失败分支却无条件写 `failed`，成功/失败两条路径不对称。

**解决方案**：成功分支无条件写 `completed`，`import` 仅决定是否附带 `result_image_urls`；失败/超时无条件写 `failed`。两条路径对称，DB 总能到达终态。

**涉及文件**：`src/services/imageGeneration.ts`

**预防方式**：
- 服务层写 DB 终态的代码，成功与失败路径必须对称（都写、或都不写），不能只挂在其中一条分支里。
- 「阻塞轮询 + DB 终态」的组合，用端到端断言「DB status === pollResult.status」覆盖（见 `scripts/image-gen-tests/` 的 `fail-check` 场景），纯代码审查难以发现这类条件嵌套错位。

---

## 2026-06-15 — AI 生图：批量换衣共享图重复上传 N 次

**现象**：批量换衣（1 衣服 + N 模特）提交时，共享的衣服图被上传到 OSS 共 N 次，浪费带宽/时间、产生 N 个 OSS 对象。

**根因**：重构初版把共享图包成 `{file}` 在循环内传给每次 `submitTask`，而 `submitTask` 对 `{file}` 每次都调 `ossApi.upload`。原代码在循环外上传一次复用 URL，重构时退化了。

**解决方案**：批量页面循环外用 `uploadImage`（`resolveSlotUrl`）把共享图解析为 OSS URL 一次，循环内传 `{url}`；`submitTask` 的 `processUrl` 对 OSS URL 原样透传不重传。

**涉及文件**：`src/views/tools/BatchClothesSwapPage.vue`、`BatchPoseSwapPage.vue`

**预防方式**：循环内复用的共享资源（图片、文件）应在循环外一次性解析为可复用形态（URL），再以透传形态传入；`{file}` 这类「每次都触发上传」的入参不要放进循环。

---

## 2026-06-15 — AI 生图：importResultUrls 单张失败整体丢失

**现象**：结果图有多张时，任意一张转存 OSS 失败即抛错，已成功转存的图丢失，DB 任务卡死。

**根因**：`importResultUrls` 对每张 `ossApi.importResult` 无 try/catch，首张失败即中断循环并抛出。

**解决方案**：逐张 try/catch，单张失败跳过、记录 warn，返回成功转存的子集。`useTaskManager` 增加空结果检测保留「转存失败请重试」提示。

**涉及文件**：`src/services/imageGeneration.ts`、`src/composables/useTaskManager.ts`

**预防方式**：批量独立项的循环处理（转存、上传、批量请求）默认应容错——单项失败不中断整体，返回成功子集让调用方决策。

---

## 2026-06-15 — AI 生图：pollTask 默认无上限可死循环

**现象**：`pollTask` 的 `maxAttempts`/`timeout` 默认 `Infinity`，裸 `poll:true`（文档中的合法用法）在任务永不到终态时会无限轮询。

**根因**：默认值给了无界，依赖每个调用方自觉传上限，文档示例又只写 `poll: true`。

**解决方案**：默认改为有限值（`maxAttempts=150`、`timeout=600000`，约 10 分钟）。

**涉及文件**：`src/services/imageGeneration.ts`

**预防方式**：轮询/重试类函数的默认值必须是有限的、合理的上界；把「无限」作为需要显式 opt-in 的行为，不要作为默认。

---

## 2026-06-08 — AI摄影：photography_elements 表每次重启产生重复数据

**现象**：AI摄影配置页出现多份重复元素（如 8 份"人脸"、8 份"姿势"…），共 40 条记录。

**影响范围**：AI摄影配置管理页（`/admin/photography`）和用户端元素列表。

**根因**：`photography_elements` 表创建时 `name` 字段没有 UNIQUE 约束。种子数据使用 `INSERT OR IGNORE` 但无约束可冲突 → 每次 `tsx watch` 重启都插入一套完整的 5 个元素。重启 8 次 = 40 条。

**解决方案**：
1. 手动清理重复数据：`DELETE ... WHERE id NOT IN (SELECT MIN(id) GROUP BY name)`
2. 创建唯一索引：`CREATE UNIQUE INDEX IF NOT EXISTS idx_photography_elements_name ON photography_elements(name)`
3. 表定义中 `name` 字段改为 `VARCHAR(100) NOT NULL UNIQUE`
4. 添加迁移代码兼容已有数据库

**涉及文件**：`server/src/db/schema.ts`

**预防方式**：
- 任何使用 `INSERT OR IGNORE` 的种子数据，表上必须有对应的 UNIQUE 约束
- 新增表时如果 seed 逻辑依赖去重，表定义中必须显式声明 UNIQUE
- 可以考虑用 `INSERT ... ON CONFLICT DO NOTHING` 替代 `INSERT OR IGNORE`（语义更明确，但需要 SQLite 3.24+）

---

## 2026-06-08 — AI摄影：重新编辑/重新生成无法还原图片和元素分配 **[未完全解决，见下方]**

**现象**：
1. 从任务列表点"重新编辑"，只还原了模型/分辨率/参数，图片池和元素分配为空
2. 从任务列表点"重新生成"没有反应

**根因**：
1. `PhotographyForm.setParams()` 原始实现只回复基本参数，注释写着"完全恢复需下载图片，后续优化"
2. `useTaskManager.handleRegenerate()` 对 AI摄影任务只 emit `copyParamsEvent` 而不实际调用 `handleGenerate`

**解决方案**：
1. 重写 `setParams()`：从 `supplementaryImages`（`[{name:"人脸", url:"..."}, ...]`）反推 — 去重 URL 创建图片池 → 按元素标签名匹配元素 ID → 重建 elementAssignments
2. `handleRegenerate()` 对摄影任务直接复用已存 `task.prompt` + `task.input_image_urls` 调用 `generateImage`

**涉及文件**：`src/components/PhotographyForm.vue`、`src/views/photography/PhotographyPage.vue`、`src/composables/useTaskManager.ts`

**剩余问题**：502 生成失败 — 见下方记录。

---

## 2026-06-08 — AI摄影：生成任务 502 报错 **[未解决，待验证]**

**现象**：AI摄影页面点击「生成图片」后，所有任务返回 `Request failed with status code 502`。

**影响范围**：AI摄影功能（其他功能如生图工作台是否受影响待确认）。

**已排除**：
- ToAPIs API 本身正常（curl 测试，带长中文 prompt + reference_images 均返回 200）
- OSS 上传通道正常（完整链路：upload-token → OSS PostObject → public URL 均可成功）
- 服务端路由正常（`/api/photography/elements` 返回正确数据）

**当前进展**：
- 在 `server/src/routes/toapis-proxy.ts` 增加了详细错误日志（记录 model/promptLen/imageCount + 写入 `/tmp/momoaigc-debug.log`）
- 服务器已重启、数据库已清理重复元素
- **等待用户再次测试生成后查看 debug log 定位根因**

**涉及文件**：`server/src/routes/toapis-proxy.ts`（临时调试日志）

---

## 2026-06-05 — Bug #8: 图片对比弹窗上下键切换任务失效

**现象**：在图片对比弹窗中按 ↑ ↓ 方向键无法切换任务。之前功能正常。

**影响范围**：`ImageCompareDialog.vue` 的键盘导航。

**根因**：Bug #4 修复（commit `786e6b4`）将 `currentTask` computed 改为优先通过 `props.taskId` 查找任务，但 `navigateDetail()` 只更新了 `currentIndex`，没有同步更新 `taskId` 锚点。原任务仍在数组中，`currentTask` 始终返回同一个任务，导航看似失效。

**解决方案**：引入本地 `activeTaskId` ref——弹窗打开时从 `props.taskId` 初始化，键盘导航时同步更新为新任务 ID。`currentTask` computed 改为用 `activeTaskId` 查找。弹窗关闭时重置。

**涉及文件**：`src/components/ImageCompareDialog.vue`

**预防方式**：当 computed 使用多种查找策略（ID 优先 + 索引兜底）时，确保所有修改路径都能触发正确的查找结果。如果一个策略改变了，另一个策略的"失效"可能表现为静默 bug。

---

## 2026-06-05 — Bug #7: 参考图提交顺序与用户在 UI 中拖拽排序不一致

**现象**：用户在生图表单中拖拽排好参考图顺序，但任务列表中的 `input_image_urls` 顺序不同——模板图（URL）总是排在本地文件前面，穿插顺序丢失。

**影响范围**：所有涉及参考图排序的场景（自由生图、功能模式）。

**根因**：`GenerationForm.handleGenerate()` 和 `FeatureForm.handleGenerate()` 将参考图拆成 `templateUrls`（sourceUrl 不为空）和 `tempImageFiles`（本地文件）两个独立数组。`imageGeneration.generateImage()` 先处理所有 URL，再处理所有文件。无论用户在 UI 中如何排序，最终 URL 全部排在文件前面。

例如：用户排序 `[模板A, 本地B, 模板C]` → 提交时拆成 `templateUrls=[A, C]` + `tempImageFiles=[B]` → `allImageUrls=[A, C, B]`。

**解决方案**：在 `GenerateImageParams` 中新增 `refImages?: Array<{url?: string, file?: File}>` 有序列表。当 `refImages` 存在时，`generateImage()` 按列表顺序逐一处理（URL 直推、文件上传），完全尊重用户拖拽顺序。旧的 `imageUrls`/`tempImageFiles` 分拆参数保留向下兼容。

**涉及文件**：`src/services/imageGeneration.ts`、`src/composables/useTaskManager.ts`、`src/components/GenerationForm.vue`、`src/components/FeatureForm.vue`、`src/views/workspace/WorkspacePage.vue`

**预防方式**：不要用多个平级数组传递有顺序关系的数据。用单一有序列表，或带 `position` 字段的结构体。

---

## 2026-06-05 — Bug #6: 任务完成但结果图区域不显示图片（显示静态图标）

**现象**：任务状态已显示"已完成"，但缩略图区域不是结果图，也不是转圈动画，而是一个静态的图片占位图标。有时过一会儿图片才出来。

**影响范围**：任务列表（列表视图和网格视图）的缩略图区域。

**根因**：两个独立问题叠加：

1. **`submitted`/`queued` 状态无转圈**：缩略图区域的条件只判断了 `task.status === 'in_progress'` 才显示转圈。`submitted`（已提交）和 `queued`（排队中）掉到 `v-else`，显示静态 `<Picture />` 图标。修复：改用 `isActive(task.status)` 覆盖三个活跃状态。

2. **任务完成但图片还在下载**：`pollTask()` 中 `task.status = 'completed'` 在先（第 327 行），`importResultUrls()` 异步 OSS 导入在后（第 330 行）。导入期间状态已是 completed 但 `result_image_urls` 为空。修复：新增 `importing` 过渡状态——OSSS 导入期间显示"下载中"转圈，导入完成后再切 `completed`。

**解决方案**：
- 新增 `importing` 状态，加入 `ACTIVE_STATUSES` 列表和 `isActive()` 判断
- `pollTask()` 重构：ToAPIs 返回 completed → 状态先切到 `importing` → 等待 `importResultUrls()` → 再切到 `completed`
- 缩略图区域增加 `importing` 状态的专用展示（转圈 + "正在下载图片..."）
- `completed` 但无结果图时显示刷新按钮，支持手动重试导入
- 新增 `retryImportTask()` 方法：重新从 ToAPIs 拉取结果 URL → 导入 OSS → 更新任务

**涉及文件**：`src/composables/useTaskManager.ts`、`src/components/TaskList.vue`、`src/components/TaskPanel.vue`、`src/components/TaskDetailDialog.vue`、`src/components/ImageCompareDialog.vue`

---

## 2026-06-05 — Bug #5: 下载按钮走远端 URL 而非本地缓存

**现象**：任务列表已显示缩略图（图片已加载到浏览器），但点击下载按钮时仍重新从 OSS/ToAPIs 请求图片数据，下载慢。

**根因**：`downloadUrl()` 旧实现直接 `fetch(url)` 远端 URL。即使浏览器已通过 `<img>` 标签加载了同一张图，`fetch` 也不共享 `<img>` 的像素缓存。且 ToAPIs URL 无 CORS 头，`fetch` 直接失败，需走服务端代理（更慢）。

**解决方案**：改为四层降级策略：
1. **DOM Canvas 提取**：查找页面中已加载的同 URL `<img>` 元素，通过 Canvas 提取像素数据 → Blob → 下载。零网络开销。
2. **HTTP 缓存 fetch**：`fetch(url, {cache: 'force-cache'})` 复用浏览器 HTTP 缓存。
3. **服务端代理**：`POST /api/proxy/image`。
4. **新标签页**：`window.open`。

同时给 OSS URL 的 `<img>` 标签添加 `crossorigin="anonymous"`，使 Canvas 不被标记为 tainted——这是策略1能命中的前提。ToAPIs URL 不加（ToAPIs 无 CORS，加了反而图片不显示）。

**涉及文件**：`src/utils/download.ts`、`src/components/TaskList.vue`

**预防方式**：涉及图片下载的功能，优先考虑复用浏览器已缓存的像素数据，而非重新请求。注意 Canvas 在跨域无 CORS 时会 taint，需配合 `crossorigin` 属性使用。

---

## 2026-06-05 — Bug #4: 图片对比对话框参考图不显示

**现象**：任务列表显示了参考图缩略图（`input_image_urls`），但打开图片对比对话框时参考图侧显示空白（或"无参考图"）。刷新页面后恢复正常。

**影响范围**：通过任何方式打开的图片对比对话框（TaskPanel 中的 `@compare-images` 事件触发）。

**根因**：`ImageCompareDialog.vue` 的 `currentTask` 通过 `props.tasks[currentIndex]` 按索引取任务。当 `useTaskManager` 的 `loadHistory()` 替换整个 `tasks.value` 数组后，同一索引可能对应不同的任务对象（尤其是数组被 `unshift` 或排序后）。对话框持有的旧任务对象上的 `input_image_urls` 可能为空（任务创建时的初始值），而新数组中间接任务已更新，但 computed 不会主动用新数组中间对象替换旧引用。

**解决方案**：`showCompare()` 调用时记录目标任务 ID（`compareTaskId`），`ImageCompareDialog` 的 `currentTask` computed 改为优先通过 `taskId` 在 `props.tasks` 中查找，绕过索引依赖。

**涉及文件**：
- `src/composables/useTaskManager.ts` — 新增 `compareTaskId` ref，`showCompare` 中赋值
- `src/components/TaskPanel.vue` — 传递 `:task-id` prop
- `src/components/ImageCompareDialog.vue` — `currentTask` computed 改为 taskId 查找

**预防方式**：
- 任何依赖数组索引获取对象的 computed/watcher，都要考虑数组被整体替换的场景
- `useTaskManager` 的 `loadHistory` 会整体替换 `tasks.value`，所有下游消费方应对此有预期

---

## 2026-06-05 — Bug #3: 下载按钮打开新标签页而非触发下载

**现象**：点击任务列表/结果页/详情弹窗中的"下载"按钮，图片在新标签页打开，而不是下载到本地。

**影响范围**：所有下载按钮（TaskList、ResultsPage、BatchSpreadsheetPage、TaskDetailDialog）。

**根因**：浏览器对 `<a href="跨域URL" download>` 会忽略 `download` 属性（安全策略）。之前的下载代码直接用跨域 URL（OSS/ToAPIs）作为 `<a>` 的 `href`，导致浏览器打开新标签页而非下载。

**解决方案**：创建 `src/utils/download.ts`，通过以下步骤触发真正的下载：
1. `POST /api/proxy/image` 服务端代理获取图片 blob（同源请求，无 CORS 问题）
2. `URL.createObjectURL(blob)` 创建同源 blob URL
3. 创建临时 `<a>` 元素，`href` 指向 blob URL，`download` 设为文件名，`click()` 触发下载
4. 延迟 60 秒后 `revokeObjectURL`（给浏览器足够时间开始下载）

**设计决策**：全部走代理，不先尝试直接 fetch OSS URL。原因见 `docs/records/decision-log.md` — "下载功能全部走代理"。

**涉及文件**：
- `src/utils/download.ts` — 新增，共享下载工具
- `src/composables/useTaskManager.ts` — 替换 `downloadUrl`
- `src/views/results/ResultsPage.vue` — 替换 `downloadUrl`
- `src/views/tools/BatchSpreadsheetPage.vue` — 替换 `downloadUrl`
- `src/components/TaskDetailDialog.vue` — 替换 `handleDownload`

---

## 2026-06-05 — Bug #2: FC Worker 返回 "Unauthorized" / "Cannot parse body"

**现象**：部署到阿里云 FC 3.0 的 Worker 无法正常工作：
- 带 Authorization header 的请求返回 `{"error":"Unauthorized"}`
- 去掉 Authorization header 后返回 `{"error":"Missing taskId, userId, ..."}`（body 未能解析）

**影响范围**：结果图无法转存到 OSS，降级保留 ToAPIs URL。

**根因**：
1. FC 3.0 HTTP trigger 传给 handler 的第一个参数不是标准的 `http.IncomingMessage`，而是一个 **Buffer**，内容是 FC event envelope JSON。格式为 `{ version, rawPath, headers: {...}, body: "<json-string>" }`。
2. `event.headers` 存在但 Authorization 值为空（FC 不转发自定义 HTTP headers 给 handler）。
3. 请求体在 `event.body` 字段中，是 JSON 字符串，需要二次 `JSON.parse(event.body)`。而原始代码直接从 `event` 读取字段，导致 parse 出的 payload 为空对象。

**调试过程**：部署了多次调试版本，通过返回 `event` 的 `Object.keys` 和类型信息，逐步发现 FC 传参格式。关键发现：`Object.keys(event)` 返回 `["0","1","2",...]`（有数字索引），且 `hasHeaders: false`。这确认了 `event` 是 Buffer/字符串而非对象。

**解决方案**：
1. 修改 Worker 的请求体解析：Buffer → `JSON.parse(event.toString('utf8'))` → `JSON.parse(eventObj.body)` 两层解析
2. 移除 `assertAuthorized` 鉴权（Authorization header 为空，无法传 secret）
3. 安全替代：依赖 Worker URL 保密 + `targetObjectKey` 前缀校验

**涉及文件**：
- `workers/oss-result-import-worker.mjs` — 重写 handler 和 body 解析
- `server/src/utils/oss.ts` — 移除 Authorization header 发送

**预防方式**：
- 部署到 serverless 平台前，先在本地测试 handler 的参数格式。阿里云 FC 的 HTTP trigger handler 格式与标准 Node.js HTTP handler 不同
- 如果使用 `@serverless-devs/s`，可以用 `s local invoke` 本地测试

---

## 2026-06-05 — Bug #1: 服务器部署后结果图仍是 ToAPIs URL

**现象**：本地测试结果图是 OSS URL（`momo-aigc.oss-cn-hangzhou.aliyuncs.com`），但部署到服务器后变成 `files.toapis.com` URL。

**影响范围**：服务器生产环境。

**根因**：服务器 `.env` 缺少 `OSS_RESULT_IMPORT_WORKER_URL` 和 `OSS_RESULT_IMPORT_WORKER_SECRET` 两个变量。`importResultToOss` 发现 `resultImportWorkerUrl` 为空，抛出 `"OSS_RESULT_IMPORT_WORKER_URL is not configured"`，前端 catch 后降级使用原始 ToAPIs URL。

**解决方案**：
1. 在服务器 `.env` 追加 Worker 配置
2. PM2 重启时使用 `--update-env` 参数（否则不重新加载 `.env`）

**涉及文件**：服务器 `.env`（运维操作，不在代码仓库中）

**预防方式**：
- `.env.example` 已包含 Worker 相关变量模板
- 每次新增 `.env` 变量后，部署时需要同时更新服务器配置
- 文档 `docs/reference/deployment.md` 已更新包含新变量
