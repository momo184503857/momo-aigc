# Architecture

技术架构、模块关系、关键数据流。

---

## 生图链路（ai-provider 重构后：多渠道 + 服务端编排）

```
Vue 表单（模型下拉按渠道分组，能力/价格来自 GET /api/models/catalog）
    ↓ POST /api/generations（channelModelId + 业务参数；参考图已先传 OSS）
编排层 server/src/routes/generations.ts
    ├─ 校验（渠道模型归属/生效能力/参考图数/提示词字数）
    ├─ 计价预扣（平台渠道按 ai_models.pricing[分辨率]×n 预扣积分；用户渠道 cost=0）
    ├─ 落库（generation_tasks，内部任务号 task_no=gen-{id:08d}；n>1 拆多条）
    └─ 派发
        ├─ 异步渠道（toapis）：同步调 submitImageTask 回填 provider_task_id
        └─ 同步渠道（openai_image / volcengine_image）：后台执行（每用户并发上限 5）
    ↓ GET /api/generations/:id/status（前端 4s 轮询，节奏不变）
    ├─ 异步：queryImageTask 同步上游状态/进度
    ├─ completed → importing 抢占（UPDATE 抢占式）→ 服务端逐张转存 OSS → completed
    ├─ failed → 自动全额退款（refund 流水；completed 不回退，防套退）
    └─ 同步渠道 submitted 无 provider_task_id → 补派发（重启恢复/并发超限）
适配器层 server/src/providers/
    toapis（异步任务式） · openai_image（同步） · volcengine_image（同步 Ark Seedream）
    openai_compat / volcengine（识图与文字，沿用）
渠道体系（D2：识图/生图/文字统一三表）
    api_providers（owner_user_id NULL=平台渠道，非空=用户自建「我的渠道」）
    ai_models（渠道模型：logical_model_id 关联 + param_overrides 只收窄覆盖 + pricing 定价 JSON）
    ai_logical_models（逻辑模型：共享能力定义——分辨率/宽高比矩阵/参考图上限/提示词上限）
    api_provider_keys（每渠道一把主 Key，AES-256-GCM 加密，明文永不回传）
```

### 任务状态机

| 状态 | 含义 | 谁写入 |
|------|------|--------|
| `submitted` | 已落库待派发（异步：提交上游中；同步：后台执行/排队） | 编排层 |
| `queued` / `in_progress` | 异步渠道上游状态同步 | 轮询端点 |
| `importing` | 转存权抢占（服务端内部过渡态，防多端重复转存） | 轮询/后台执行 |
| `completed` | 结果图已转存 OSS（转存失败保留原始 URL + 「重新加载」） | 编排层 |
| `failed` | 提交失败/上游失败/重启清扫；已扣费自动全额退款 | 编排层 |

- 前端 `ACTIVE_STATUSES = ['submitted','queued','in_progress','importing']`。
- 业务主键 = `task_no`（gen-00012345，展示/搜索/下载命名）；`provider_task_id` 仅异步渠道轮询用；旧列 `toapis_task_id` 已停写（迁移一个版本后删除）。
- 重启清扫（`sweepOrphanTasks()`）：`importing` 复位可重入；`submitted` 无 `provider_task_id` 标 failed + 退款；异步在途任务凭 `provider_task_id` 由轮询自然恢复。
- Key 解析：`resolveUserApiKey()` 已通用化为 `resolveProviderContext(userId, providerId)`（平台渠道读渠道主 Key；用户渠道校验 owner）。

### 退役端点（410，一个过渡版本后删除）

- `POST /api/toapis/create-task`、`GET /api/toapis/task-status/:id`、`POST /api/toapis/upload` → 由 `/api/generations` 取代
- `POST/PATCH /api/tasks` → 状态同步职责在编排层（GET 列表保留兼容）
- 前端 `src/adapter/*`、`toapisProxyApi`、`userKeyApi`、`server/src/utils/pricing.ts` 硬编码已删除

---

## 图片下载四层降级

```
点击下载按钮
    ↓
1. DOM Canvas 提取
   前提: <img> 已加载 + crossorigin="anonymous" + 源站 CORS 生效
   零网络开销，直接从浏览器像素缓存取
   (结果图已于 2026-06-24 移除 crossorigin → 不命中，见下方说明)
    ↓ 失败（Canvas tainted / 无匹配 img）
2. HTTP 缓存 fetch
   fetch(url, {cache: 'force-cache'})
   复用浏览器 HTTP 缓存（<img> 加载时自动写入）
    ↓ 失败（缓存未命中 / CORS 阻止）
3. 服务端代理
   POST /api/proxy/image → 服务端下载 → 返回 blob
   100% 可靠，同源无 CORS 问题
    ↓ 失败（网络错误）
4. 新标签页
   window.open(url, '_blank')
```

### 为什么 ToAPIs URL 无法命中策略1/2

ToAPIs（`files.toapis.com`）不发送 CORS 响应头：
- `<img>` 不带 `crossorigin`：Canvas 被标记为 tainted → `toBlob()` 抛 SecurityError → 策略1跳过
- `fetch(url)`：浏览器 CORS 检查失败 → 策略2跳过
- 最终走策略3代理

~~OSS 有 CORS 配置且 `<img>` 带 `crossorigin="anonymous"` → 策略1直接命中。~~

> **2026-06-24 更正**：上述前提被实测推翻——带 `crossorigin="anonymous"` 的 OSS 结果图会触发 CORS 校验失败、图片裂开（详见 `bug-fixes.md` / `decision-log.md` 2026-06-24）。已移除全部结果图 `<img>` 的 `crossorigin`，故**结果图下载实际落到策略3服务端代理**（策略1 canvas tainted、策略2 fetch 无 CORS 均失效）。功能完整、可靠性不变，仅多一次服务端往返。OSS CORS 当前实际配置状态见 `todo.md`（待确认）；但无论其状态如何，展示图都不再恢复 `crossorigin`。

### 诊断日志

每次下载在控制台输出命中信息：
- `[下载] ✅ 策略1: 从DOM缓存提取 (零网络)`
- `[下载] ⚡ 策略2: HTTP缓存`
- `[下载] 🔄 策略3: 服务端代理...`
- `[下载] ❌ 前三层全部失败，打开新标签页`

---

## 参考图顺序保持

用户指定参考图的顺序现在由 `refImages` 有序数组保证：

```
GenerationForm.handleGenerate()
    → refImages: [{url: 'A'}, {file: FileB}, {url: 'C'}]  // 保持UI拖拽顺序
    → submitTask() 逐一处理，顺序不变
    → inputImageUrls = ['A_oss', 'B_oss', 'C_oss']  // 正确顺序
```

> `refImages` 是唯一的参考图入参。旧的 `imageUrls` / `tempImageFiles` 参数已删除。

---

## AI 生图模块（三层架构）

为支持在各页面复用、改一处全局生效，AI 生图按三层高内聚低耦合组织。所有页面/工作流节点都必须走统一入口，禁止直接调用 `toapisProxyApi` / `taskApi` / `ossApi` 拼装生图流程。

### 分层

| 层 | 文件 | 职责 | UI 依赖 |
|----|------|------|---------|
| **适配器** | `src/adapter/toapisClient.ts` | 纯 API 调用封装：`uploadImage` / `createTask(body)` / `getTaskStatus` | 无 |
| **核心模块** | `src/services/imageGeneration.ts` | 生图编排，纯数据/流程 | 无 |
| **UI 状态** | `src/composables/useTaskManager.ts` + 各页面 | 任务列表、轮询调度、reactive 状态 | Vue |

### 核心模块 API（`imageGeneration.ts`）

分步函数（可自由组合）：

- `submitTask(params): {toapisTaskId, dbTaskId, inputImageUrls}` — 上传参考图 + 创建 ToAPIs 任务 + 写 DB（`status='submitted'`）
- `pollTask(taskId, {interval?, maxAttempts?, timeout?}): {status, progress, resultUrls, errorMessage?, …}` — **阻塞式**轮询，默认 `interval=4000 / maxAttempts=150 / timeout=600000`（约 10 分钟）
- `importResultUrls(taskId, sourceUrls): string[]` — 逐张转存结果到 OSS，**单张失败跳过不中断**

高层封装：

- `generateImage(params, {poll?, import?})` — 一键调用。`poll:true` 时内部轮询并在 DB 写终态（成功→`completed`、失败/超时→`failed`），`import:true` 时附带转存 `result_image_urls`

`SubmitTaskParams` 字段：`model / prompt / size(宽高比) / resolution / refImages[] / featureId / n / userPrompt? / systemPrompt? / supplementaryImages?`。参考图项为 `{url?}` 或 `{file?}`，URL 中 OSS 直传、非 OSS http（含阿里 CDN 等外部图床，**设计上统一中转**——更可靠，CORS 失败时回退原始 URL）先下载再上传、data URL(base64) 先转 File 再上传。

### 调用方约定

| 调用方 | 入口 | 说明 |
|--------|------|------|
| 工作台 / AI摄影（`useTaskManager.handleGenerate`） | `submitTask` + 定时器单查 `getTaskStatus` | `pollAllTasks` + `setInterval(4s)` 驱动，**单次查询**，不可用阻塞式 `pollTask` |
| 工作流节点 `image-ai` | `generateImage({poll, import})` | 阻塞式一键：提交+轮询+转存+DB 终态 |
| 买家秀 `MakeBuyerShowPanel` | `submitTask` + 行级 `getTaskStatus` 轮询 + `importResultUrls` | 保留 5s 快速失败自动重试逻辑 |
| 批量换衣/换姿势 `BatchClothesSwapPage`/`BatchPoseSwapPage` | `submitTask`（不轮询，依赖全局 TaskPanel） | 共享图在循环外用 `uploadImage` 解析一次复用，避免重复上传 |
| 批量表格做图 `BatchSpreadsheetPage` | `submitTask` + 行级 `getTaskStatus` + `importResultUrls` | — |

### 关键不变量

- **DB 终态必达**：`generateImage({poll})` 成功写 `completed`、失败/超时写 `failed`；分步调用方需自行在轮询到终态时写 DB。
- **共享图不重复上传**：批量场景循环外把共享图解析为 OSS URL（`{url}`），`submitTask` 内 `processUrl` 对 OSS URL 原样透传不重传。
- **轮询语义二分**：阻塞式 `pollTask`（工作流）vs 定时器单查 `getTaskStatus`（UI 列表）。混用会导致并发轮询/卡死。

---

## AI摄影（Photography）

### 页面流程

```
用户上传图片 → 图片池 (PoolImage[], 最多10张, 拖拽排序)
     ↓ 拖拽 (copy 语义)
元素分配区 (Element Zones, 从 API 动态加载)
     ↓ 点击生成
构建 Prompt (方案B: 每元素独立 system_prompt + 自动映射描述)
     ↓ 上传图片到 OSS (去重)
ToAPIs createTask → 全局 TaskPanel (feature_id='ai-photography')
```

### Prompt 构建（方案 B）

1. 筛选有图片分配的元素，按 sort_order 排序
2. 拼接各元素的 `photography_element_prompts.system_prompt`（跳过空 prompt）
3. 收集已分配图片 → 去重 → 按元素首次出现顺序排列
4. 自动生成"参考图映射（按顺序）：第N张 — XX参考、YY参考"描述段
5. 追加用户输入 `userPrompt`

### 图片去重

同一 PoolImage 拖到多个元素时，只在 refImages 中发送一次。映射描述中列出所有引用：
- 姿势和衣服共用图一时 → `第2张 — 姿势参考、衣服参考`

### 重新编辑/重新生成

- 重新编辑：从 `supplementaryImages`（`[{name:"人脸", url:"..."}, ...]`）反向恢复图片池和元素分配
- 重新生成：复用已存 `task.prompt` + `task.input_image_urls` 直接调 API

### 关键数据流

```
PhotographyForm (图片池 + 元素分配)
  → emit refImages, supplementaryImages, finalPrompt
    → PhotographyPage.handleGenerate
      → useTaskManager.handleGenerate
        → submitTask (上传文件到 OSS, 去重, 构建请求, 写 DB)
          → toapisProxyApi.createTask
            → POST /api/toapis/create-task
              → Express → ToAPIs API
```

> 生图核心模块的三层结构与调用约定见上方「AI 生图模块（三层架构）」。

### 管理员配置

`/admin/photography` — 元素 CRUD + 每元素×每模型的 system_prompt 编辑。数据存储在 `photography_elements` + `photography_element_prompts` 表。

---

## 作品库架构

作品库让用户从已完成的生图任务一键发布作品，其他人可浏览学习并「一键同款」复用参数。先发后审。

### 发布流程

```
任务完成（generation_tasks.status='completed'）
  -> 用户在 TaskList 点「发布到作品库」
  -> POST /api/works { source_task_id }
  -> 后端查 generation_tasks（校验 user_id + status + result_image_urls）
  -> 拷贝 prompt/user_prompt/prompt_segments/negative_prompt/model/resolution/aspect_ratio/feature_id/input_image_urls/result_image_urls[0]
  -> 写入 works 表（防重：source_task_id 唯一，重复返回 409）
  -> 可选写 work_tag_relations
```

**关键设计**：参数从任务直接拷贝，用户无需手填。`prompt_segments` 和 `negative_prompt` 是结构化提示词的快照--如果用户在工坊拼装提示词并通过提示词库使用，任务提交时会自动写入这两个字段，发布作品时一并拷贝。

### 状态机

- `published` - 已发布（默认，公共可见）
- `hidden` - 已下架（admin 操作，仅作者和管理员可见）

作品列表查询默认 `WHERE status='published'`。非公开作品在详情接口中仅作者和管理员可访问（否则 404）。

### 互动计数

`works` 表冗余存储 `like_count`/`favorite_count`/`reuse_count`/`view_count`，避免每次列表查询都 JOIN 聚合。

- **收藏**：`work_favorites` 表用联合主键 `(user_id, work_id)` 防重，收藏/取消时事务更新计数（`+1`/`MAX(0, -1)`）。
- **点赞**（每人每天一次）：`work_likes` 表用联合主键 `(user_id, work_id, like_date)` 防重，`like_date` 为北京日 `YYYY-MM-DD`（`server/src/utils/datetime.ts` 的 `bjToday()`）。同一用户每天可对同一作品点赞一次（含自己的作品），跨天可重复点赞。点赞接口检查**今天**是否已赞：已赞则删除今日记录并 `-1`，未赞则插入今日记录并 `+1`。`is_liked` 字段语义为「今天是否已赞」。

### 备注

`works.remark` 字段（TEXT，默认空串）存储发布人/管理员添加的备注。发布弹窗可填写，详情页可随时编辑（`PATCH /api/works/:id/remark`，仅作者或管理员）。原 `description` 字段已废弃（数据已迁移到 `remark`，列保留兼容）。

### 广场懒加载

作品广场使用 `IntersectionObserver` 实现无限滚动懒加载：滚动容器底部放置哨兵元素，进入视口（rootMargin 300px）时自动请求下一页并追加，无分页器。组件卸载时 `disconnect` observer。

### 一键同款

```
用户点「一键同款」
  -> POST /api/works/:id/reuse（reuse_count +1，返回完整参数）
  -> 前端写 sessionStorage('regenerate_task', JSON({...参数}))
  -> router.push 到对应生图页（free-gen / workspace / photography）
  -> 页面 onMounted 读 sessionStorage -> formRef.setParams() 填入表单
```

复用现有 `useTaskManager.handleCopyParams` 的 `sessionStorage` + `setParams()` 机制，零额外基础设施。

### 冷启动

admin 可通过 `POST /api/admin/works/official` 发布官方种子作品（`is_official=1`，无 `source_task_id`），手动填参数 + 图片 URL。官方种子 + 用户 UGC 混合展示。

---

## 提示词工坊架构

提示词工坊是独立页面（`/prompt-workshop`），不改动生图表单，完全解耦。

### 六层结构化提示词模型

课程给出关键词六层权重公式（主体40% + 风格20% + 场景15% + 光影10% + 构图10% + 画质5%）。ToAPIs（gpt-image-2/gemini）是自然语言模型，不解析 SD 的 `(word:1.4)` 权重语法，因此：

- **权重仅通过拼接顺序生效**：字段按权重从大到小排列，词越靠前影响越大（`src/utils/promptAssembler.ts` 的 `assemblePrompt`）
- **负面词以自然语言追加**：`prompt += '\n请避免出现：' + negative`
- **最终输出单一 prompt 字符串**：结构化是编辑态/检索态的价值，发送给 API 时仍是普通文本

### 数据流

```
工坊拼装（六个分字段 + 负面词）
  -> assemblePrompt() 拼接成完整 prompt
  -> 保存到 prompt_library（content=拼接文本, segments=结构化JSON）
  -> 生图表单「从提示词库选择」时，content 填入 prompt 输入框
  -> 若该提示词有 segments，GenerationForm 捕获并随任务提交
  -> generation_tasks.prompt_segments / negative_prompt 快照
  -> 发布作品时拷贝到 works.prompt_segments / negative_prompt
  -> 作品库可按结构化字段检索/展示
  -> 案例库聚合 works 中带该字段值的作品作为参考图
```

### 参考案例库（看图选词）

案例来源双轨（`server/src/routes/promptCases.ts`）：

1. **官方预生成**：`prompt_cases` 表，admin 在 `/admin/prompt-cases` 维护（选字段 + 关键词 + 上传图 + 填 prompt 快照）
2. **作品库聚合**：查 `works` 表中 `prompt_segments` 里该字段非空的作品，按 `like_count + reuse_count * 2` 排序取 top N

前端 `CaseSelector.vue` 弹窗：点某字段「选词」-> 按关键词分组展示参考图 -> 看图选词 -> 点击填入对应字段框。

---

## 管理后台独立入口（双入口架构）

管理后台是**独立于用户端的第二个网页入口**，与用户端共用同一份后端、同一套 JWT 账号、同一套设计系统，但前端是独立的 SPA bundle、独立的登录页与主框架。

### 入口与路由

| 入口 | HTML | 前端入口 | 路由模式 | 默认落地 |
|------|------|---------|---------|---------|
| 用户端 | `index.html` | `src/main.ts` → `App.vue` | hash（`createWebHashHistory`） | `/workspace` |
| 管理后台 | `admin.html` | `src/admin/main.ts` → `AdminApp.vue` | hash（`createWebHashHistory`） | `/users` |

两端都用 hash 模式的关键原因：

- 与用户端一致；
- `admin.html` 在生产环境就是一个被 Nginx 直接返回的静态文件，**深链刷新零 404 风险**（无需为 `/admin.html/*` 配 SPA 回退，回退规则只会命中 `index.html`，会导致管理后台深链刷新错跳到用户端）。

### Vite 多页构建

`vite.config.ts` 通过 `build.rollupOptions.input` 注册两个入口：

```ts
build: { rollupOptions: { input: {
  main: resolve(__dirname, 'index.html'),
  admin: resolve(__dirname, 'admin.html'),
}}}
```

`npm run build` 同时产出 `dist/index.html` + `dist/admin.html`（各自独立的入口 chunk）。`/api` proxy 配置两端共用，dev server 单端口（5173）同时服务两个入口。

### 管理后台应用骨架（`src/admin/`）

```
src/admin/
├── main.ts                      # 入口：注册 Pinia/ElementPlus/VChart + 复用同一套 styles
├── AdminApp.vue                 # 根组件：meta.guest → AdminAuthLayout，否则 → AdminLayout
├── router/index.ts              # 独立 router（hash 模式）+ 管理员身份守卫
├── layouts/
│   ├── AdminAuthLayout.vue      # 登录外壳（居中卡片，「墨墨 AI 生图 / 管理后台」）
│   ├── AdminLayout.vue          # 主框架：AdminSidebar + header + router-view（无 TaskPanel/FAB/多标签）
│   └── AdminSidebar.vue         # 8 个管理菜单 + 「返回用户端」+ 当前管理员信息 + 退出
└── views/
    └── AdminLoginPage.vue       # 独立登录页：仅密码登录，登录后校验 role==='admin'
```

### 复用 vs 新建（零重复代码）

管理后台通过 `@/...` 别名**直接复用** `src/` 下的共享层，不复制：

| 复用（import 即用） | 新建（仅管理后台专用） |
|--------------------|----------------------|
| `@/styles/{tokens,global,ep-overrides}` | `src/admin/*` 全部文件 |
| `@/stores/auth.ts`（token 存 localStorage `auth_token`，两端互通） | |
| `@/services/http.ts`（axios，baseURL `/api`，proxy 转发） | |
| `@/services/adminApi.ts` 及各 `*Api.ts` | |
| `@/composables/useUiFeedback.ts`、`@/components/PageLayout.vue` | |
| `@/views/admin/*.vue`（8 个管理页，**不移动、不复制**，由新 router 直接 import） | |
| `@/plugins/echarts*`、`@/utils/*`、`@/types/*` | |

> 管理后台内路由去掉了 `/admin` 前缀（`/users` 而非 `/admin/users`），但组件本身不变——它们调用的 service 仍打到 `/api/admin/*`，后端无需改动。

### 登录态互通与身份守卫

- **同一 token**：两端共享 `localStorage.auth_token`。在用户端登录的管理员，新开 `/admin.html` 即已登录，管理后台 router 守卫会 `fetchUser()` 拉取 role。
- **管理后台守卫**（`src/admin/router/index.ts` 的 `beforeEach`）：
  - guest 页面：已登录管理员直接进 `/users`。
  - 非 guest：token 存在但 user 未加载时先 `fetchUser()`；未登录 → `/login`；已登录但 `role !== 'admin'` → `clear()` 并回 `/login`。
- **401 按入口分流**：`src/services/http.ts` 的 401 拦截器判断 `window.location.pathname` 是否 `admin.html`，是则跳 `/admin.html#/login`，否则跳用户端 `/#/login`。这是唯一需要触碰共享文件的改动。

### 后端零改动

`/api/admin/*` 路由、`authMiddleware`（校验 JWT → 401）、`adminMiddleware`（`role !== 'admin'` → 403）、JWT 签发（payload 含 `{userId, username, role}`）全部沿用，管理后台与用户端调用的 API 完全相同。

### 用户端侧边栏清理

`src/components/SidebarMenu.vue` 中 `if (auth.isAdmin)` 追加的「管理员」分组已整体移除——用户端侧边栏对所有角色展示三组：AI生图 / AI学习 / 资产管理。其中「AI学习」组包含作品库（`/works`）和提示词工坊（`/prompt-workshop`）。用户端 `src/router/index.ts` 的 `/admin/*` 路由与 `requiresAdmin` 守卫保留作兜底（无 UI 入口指向，仅防历史链接/误访问白屏）。
