# momoAigc 项目移交文档

## 1. 项目概述

内部 AI 生图调用面板（Web 应用），让公司同事通过网页调用 ToAPIs 中转站提供的多个图像生成模型。

### 核心原则（必须遵守）
- 用户 ToAPIs API Key **只存在浏览器 localStorage**，永不上传服务器
- 图片文件**不经过业务服务器**（直传 OSS / 直传 ToAPIs）
- 浏览器直接调用 ToAPIs 创建任务、查询状态
- 服务器只存：账号、task_id、prompt、图片URL、状态、统计数据

---

## 2. 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vue 3 (Composition API) + Element Plus + Vue Router + Pinia |
| 后端 | Node.js + Express |
| 数据库 | SQLite (`better-sqlite3`) |
| 构建 | Vite (前端), tsx (后端开发服务器) |
| 目标部署 | 阿里云 ECS + Nginx 反代 |

---

## 3. 当前完成状态

### ✅ 已完成
- 完整项目脚手架（Vite + Express）
- 后端全部 12 个 API 端点，JWT 鉴权、角色校验
- 数据库建表（users, template_images, generation_tasks）
- 前端全部 8 个页面（基本功能可用）
- 模型适配层（GPT-Image-2 / Gemini 系列请求构建 + ToAPIs 浏览器直连）
- 登录/登出 + 路由守卫
- 管理员后台（用户管理、任务管理、模板管理、统计）
- 错误消息中文化工具函数

### ⚠️ 需要完善
- OSS 上传功能需要配置 `.env` 中的阿里云 OSS 凭证才能真实使用
- 模板图重命名功能（后端接口已有，前端未接）
- 前端刷新任务状态时没有自动集成 `translateError` 错误翻译
- 管理员统计页面只展示表格，未接图表（ECharts 可选）
- 任务恢复逻辑（关闭页面后重开，自动轮询未完成任务）已基本实现
- `vite.config.ts` 中 dev proxy 配置了 `/api` → `http://localhost:3000`

### ❌ 未开发（PRD 中明确的非目标）
- 用户自行修改密码、用户注册
- 换装、重绘、主图生成等业务功能
- 多模型同时生成
- 复杂计费、工作流编排
- 客户端 EXE/Electron 版本

---

## 4. 项目结构

```
momoAigc/
├── .env                          # 环境变量（JWT_SECRET, OSS配置）
├── .env.example                  # 环境变量模板
├── package.json                  # 前端+后端共用依赖
├── vite.config.ts                # Vite 配置，含 /api 代理到 localhost:3000
├── index.html
├── tsconfig.json
│
├── server/                       # 后端代码
│   ├── tsconfig.json
│   ├── data/                     # SQLite 数据库文件存放目录
│   └── src/
│       ├── index.ts              # Express 入口，挂载所有路由
│       ├── config.ts             # 从 .env 加载配置
│       ├── db/
│       │   ├── index.ts          # better-sqlite3 连接 + WAL模式 + 外键
│       │   ├── schema.ts         # 建表（users, template_images, generation_tasks）
│       │   └── seed.ts           # 初始化 admin/admin123 账号
│       ├── middleware/
│       │   ├── auth.ts           # JWT Bearer token 校验 → req.user
│       │   └── admin.ts          # role === 'admin' 校验
│       ├── routes/
│       │   ├── auth.ts           # POST login / logout
│       │   ├── me.ts             # GET /api/me
│       │   ├── oss.ts            # POST /api/oss/upload-token (OSS签名)
│       │   ├── tasks.ts          # GET/POST/PATCH /api/tasks
│       │   ├── templates.ts      # GET/POST/DELETE/PATCH /api/templates
│       │   └── admin/
│       │       ├── users.ts      # 用户CRUD + 重置密码 + 启用/禁用
│       │       ├── tasks.ts      # 全部任务列表（含用户名联查）
│       │       ├── templates.ts  # 全部模板列表
│       │       └── stats.ts      # 按用户聚合统计（submitted/completed/failed）
│       └── utils/
│           ├── jwt.ts            # jsonwebtoken 签发/校验
│           ├── password.ts       # bcryptjs 哈希/比较
│           └── oss.ts            # OSS PostObject policy 签名生成
│
├── src/                          # 前端代码
│   ├── main.ts                   # Vue 入口，注册 ElementPlus/Pinia/Router
│   ├── App.vue                   # 根组件：login 页用 AuthLayout，其余用 MainLayout
│   │
│   ├── types/
│   │   └── adapter.ts            # 模型定义：ModelId, ModelInfo, MODELS 数组
│   │                              #   4个模型：gpt-image-2(默认), gemini-3-pro-image-preview,
│   │                              #   gemini-3.1-flash-image-preview, gemini-2.5-flash-image-preview
│   │
│   ├── styles/
│   │   ├── tokens.css            # CSS 设计变量（侧边栏、卡片、圆角、滚动条等）
│   │   └── global.css            # 全局重置 + 滚动条样式
│   │
│   ├── router/
│   │   └── index.ts              # 所有路由 + beforeEach auth guard
│   │                              #   未登录 → /login，普通用户不能进 /admin/*
│   │
│   ├── stores/
│   │   ├── auth.ts               # Pinia: token, user, login(), logout(), fetchUser()
│   │   └── keyConfig.ts          # Pinia: localStorage 读写 ToAPIs Key
│   │
│   ├── services/
│   │   ├── http.ts               # Axios 实例，自动附加 Bearer token，401拦截跳转登录
│   │   ├── authApi.ts            # login(username, password), logout(), me()
│   │   ├── taskApi.ts            # list/get/create/update 任务
│   │   ├── templateApi.ts        # list/create/rename/delete 模板图
│   │   ├── ossApi.ts             # getUploadToken(filename, mime, size)
│   │   └── adminApi.ts           # 管理员接口：用户/任务/模板/统计 CRUD
│   │
│   ├── adapter/                  # 模型适配层（从 ToolFlux Electron main process 移植到浏览器）
│   │   ├── buildGptImage2Request.ts  # GPT-Image-2 请求体 {model, prompt, size, resolution, reference_images}
│   │   ├── buildGeminiRequest.ts     # Gemini 请求体 {model, prompt, size, metadata:{resolution}, image_urls}
│   │   └── toapisClient.ts           # 核心：fetch() 直连 ToAPIs
│   │                                  #   uploadImage(apiKey, File) → URL
│   │                                  #   createTask(apiKey, params) → taskId
│   │                                  #   getTaskStatus(apiKey, taskId) → {status, progress, resultUrls}
│   │                                  #   testConnection(apiKey) → boolean
│   │
│   ├── composables/
│   │   └── useToApisKey.ts       # 对 keyConfig store 的便捷封装
│   │
│   ├── utils/
│   │   └── errors.ts             # translateError(err) 错误消息中文化
│   │
│   ├── layouts/
│   │   ├── AuthLayout.vue        # 登录页布局（居中卡片 + 标题）
│   │   └── MainLayout.vue        # 主布局（侧边栏 + 顶栏 + router-view）
│   │
│   ├── components/
│   │   ├── PageLayout.vue        # 通用页面外壳（header/extra/content/footer 插槽）
│   │   ├── SidebarMenu.vue       # 左侧导航（工作台/模板库/任务历史/Key设置 + 管理员菜单）
│   │   ├── GenerationForm.vue    # 生图参数表单（模型/参考图/提示词/分辨率/宽高比/数量）
│   │   ├── TemplateSelector.vue  # 模板图选择弹窗（从 OSS 模板库选取）
│   │   ├── TaskList.vue          # 任务列表（列表/网格视图，含状态标签、操作按钮）
│   │   └── TaskDetailDialog.vue  # 任务详情弹窗（描述列表 + 结果图预览）
│   │
│   └── views/
│       ├── login/LoginPage.vue          # 登录表单
│       ├── workspace/WorkspacePage.vue  # 核心页面：左栏表单 + 右栏任务列表 + 轮询
│       ├── templates/TemplatesPage.vue  # 模板图库：OSS上传 + 网格展示
│       ├── tasks/TasksPage.vue          # 任务历史：筛选 + 分页 + 详情
│       ├── settings/KeySettingsPage.vue # Key设置：保存/测试/删除
│       └── admin/
│           ├── AdminUsers.vue      # 用户管理：创建/重置密码/禁用/启用
│           ├── AdminTasks.vue      # 全部任务：筛选 + 删除
│           ├── AdminTemplates.vue  # 全部模板：预览 + 删除
│           └── AdminStats.vue      # 统计：汇总卡片 + 每用户详情表
```

---

## 5. 关键实现细节

### 5.1 鉴权流程
- 前端登录 → `POST /api/auth/login` → 返回 JWT
- Token 存 `localStorage('auth_token')`
- Axios 拦截器自动附加 `Authorization: Bearer <token>`
- 路由 `beforeEach` 检查 token，无效则跳 `/login`
- 后端 `authMiddleware` 校验 JWT，`adminMiddleware` 校验 `role === 'admin'`

### 5.2 生图完整流程（WorkspacePage.vue 的 handleGenerate）
1. 检查 localStorage 中有无 ToAPIs Key → 无则提示
2. 临时图片文件通过 `toapisClient.uploadImage()` 上传到 ToAPIs
3. 模板图 OSS URL 直接使用，不上传
4. 合并所有图片 URL，根据模型类型构建请求体（GPT-Image-2 / Gemini 两种格式）
5. 调用 `toapisClient.createTask()` 创建 ToAPIs 任务
6. 拿到 `task_id` 后调用 `taskApi.create()` 保存到服务器（计数+1）
7. 每 4 秒轮询 `toapisClient.getTaskStatus()`，状态变化后 `taskApi.update()` 同步到服务器

### 5.3 模型请求体差异（adapter/ 目录）
- **GPT-Image-2**: `{model, prompt, n, size, resolution, response_format: "url", reference_images: ["url"]}`
- **Gemini 系列**: `{model, prompt, n, size, metadata: {resolution}, image_urls: ["url"]}`
- 选择逻辑：`model === 'gpt-image-2'` vs 其他 → `toapisClient.ts:buildRequestBody()`

### 5.4 OSS 上传流程
1. 前端请求 `POST /api/oss/upload-token` → 服务器返回 `{uploadUrl, objectKey, publicUrl, ossBucket, fields}`
2. 前端 `FormData` 拼装 fields + file → POST 直传 OSS
3. 上传成功（HTTP 200）→ 前端调用 `POST /api/templates` 保存元信息
4. Object key 格式：`templates/{userId}/{yyyy}/{mm}/{uuid}.{ext}`
5. **⚠️ OSS 上传必须在 `.env` 中配置真实的阿里云 OSS 凭证才能工作**

### 5.5 任务轮询（WorkspacePage）
- 只在 WorkspacePage 挂载时轮询（`onMounted` 启动，`onUnmounted` 停止）
- 轮询间隔：4 秒
- 只轮询非终态任务（status !== 'completed' && status !== 'failed'）
- 需要用户已保存 ToAPIs Key；无 Key 则跳过

### 5.6 重新生成
- 读取历史任务的 model/prompt/size/resolution/input_image_urls
- 模板图 OSS URL 可复用（公共读）
- 临时图 URL 若过期会失败——目前未做过期检测，直接复用原 URL
- 创建的是新任务，计数+1

---

## 6. 数据库 Schema

三张表在 `server/src/db/schema.ts`：

- **users** — id, username, password_hash, role(admin/user), status(active/disabled), last_login_at, created_at, updated_at
- **template_images** — id, user_id→users, name, oss_bucket, oss_object_key, public_url, original_filename, mime_type, size_bytes, width, height, status(active/deleted), created_at, deleted_at
- **generation_tasks** — id, user_id→users, toapis_task_id, model, prompt, size, resolution, n, template_image_ids(JSON), input_image_urls(JSON), result_image_urls(JSON), status, progress, error_code, error_message, raw_error(JSON), created_at, completed_at, expires_at

统计直接 SQL 聚合 `generation_tasks`，无独立统计表。

---

## 7. API 端点一览

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| POST | /api/auth/login | 无 | 登录 |
| POST | /api/auth/logout | JWT | 登出 |
| GET | /api/me | JWT | 当前用户 |
| POST | /api/oss/upload-token | JWT | OSS 上传签名 |
| GET | /api/templates | JWT | 自己的模板列表 |
| POST | /api/templates | JWT | 保存模板记录 |
| PATCH | /api/templates/:id | JWT | 重命名 |
| DELETE | /api/templates/:id | JWT | 软删除 |
| GET | /api/tasks | JWT | 自己的任务（分页+筛选） |
| GET | /api/tasks/:id | JWT | 任务详情 |
| POST | /api/tasks | JWT | 创建任务记录 |
| PATCH | /api/tasks/:id | JWT | 更新状态/结果 |
| GET | /api/admin/users | Admin | 用户列表（含统计） |
| POST | /api/admin/users | Admin | 创建用户 |
| POST | /api/admin/users/:id/reset-password | Admin | 重置密码 |
| PATCH | /api/admin/users/:id/status | Admin | 启用/禁用 |
| GET | /api/admin/tasks | Admin | 全部任务 |
| DELETE | /api/admin/tasks/:id | Admin | 删除任务 |
| GET | /api/admin/templates | Admin | 全部模板 |
| DELETE | /api/admin/templates/:id | Admin | 删除模板 |
| GET | /api/admin/stats/users | Admin | 每用户生成统计 |

---

## 8. 启动和开发

```bash
# 1. 安装依赖（已完成）
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，填写 JWT_SECRET 和阿里云 OSS 凭证

# 3. 启动后端（端口 3000）
npm run dev:server

# 4. 启动前端（端口 5173，自动代理 /api → 3000）
npm run dev

# 5. 访问 http://localhost:5173
#    默认管理员：admin / admin123
```

**⚠️ OSS 上传功能需要真实凭证**：在 `.env` 中填写 `OSS_ENDPOINT`、`OSS_BUCKET`、`OSS_ACCESS_KEY_ID`、`OSS_ACCESS_KEY_SECRET`

---

## 9. 已知待办事项

### P0（必需）
- [ ] 填写真实的阿里云 OSS 凭证，测试模板图上传全流程
- [ ] 用真实的 ToAPIs Key 测试完整生图流程（上传→创建→轮询→结果）
- [ ] 验证管理员后台统计数字与实际生成一致

### P1（建议）
- [ ] 在 WorkspacePage 轮询错误时调用 `translateError()` 展示中文错误
- [ ] 模板图重命名功能（前端接上后端 PATCH /api/templates/:id）
- [ ] `vite build` 生产构建并部署到 ECS + Nginx
- [ ] 生产环境 `.env` 配置（强密码 JWT_SECRET、真实 OSS 凭证）

### P2（后续）
- [ ] ECharts 图表展示统计趋势
- [ ] 任务增加"隐藏"功能（管理员）
- [ ] OSS 文件清理（CronJob 定期清理软删除的模板文件）
- [ ] ToAPIs CORS 问题探测与处理（PRD 第 18 节）

---

## 10. 技术债务

1. **CORS 风险**：PRD 第 18 节提到 ToAPIs 可能有浏览器跨域限制。当前代码直接 `fetch()` ToAPIs，如果遇到 CORS 错误需要加后端代理（但这会增加服务器流量）
2. **Token 无刷新机制**：JWT 7 天过期，到期需重新登录。内部工具可接受
3. **SQLite 并发限制**：better-sqlite3 是同步驱动，单个请求串行。内部工具并发低，可接受
4. **前端大 chunk**：Element Plus 全量导入导致 ~1MB js bundle。后续可改为按需导入
5. **TaskDetailDialog 在 TasksPage 中的使用**：与 WorkspacePage 中相同的方式——需要一个 ref 调用 open()，目前 TasksPage 中的实现比较简单

---

## 11. 相关参考

- PRD 文档：`docs/requirements/prd.md` — 完整需求规格
- ToolFlux 源码：`C:\code\ToolFlux` — 前端组件复用的来源项目（Electron 桌面应用）
- ToAPIs 文档：https://docs.toapis.com （图像生成 API）
- 阿里云 OSS PostObject：https://help.aliyun.com/document_detail/31988.html
