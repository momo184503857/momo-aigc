# Vue3 用户端内嵌帮助文档系统方案

> 2026-08-15 修订：已按本项目实际结构对齐。**范围只覆盖用户端（MainLayout 壳子）**，
> 管理后台（AdminApp / `admin.html` 独立入口）第一阶段不接入。

## 零、与项目现状的对齐说明

本方案最初按通用「单一后台 Layout」撰写，落地前已对照仓库现状修订，差异如下：

| 事项 | 原方案假设 | 本项目实际 | 本方案的处理 |
|------|-----------|-----------|-------------|
| 前端目录 | `frontend/src/` | 仓库根 `src/`，后端 `server/` | 路径全部映射到实际结构 |
| 壳子结构 | 单一 AppLayout | 一个 SPA 内 AuthLayout / AdminApp / MainLayout 三套壳子（`src/App.vue`），管理后台另有独立双入口 `admin.html` + 独立 router（`src/admin/router/`） | **只做用户端**：Drawer 唯一挂载点是 `MainLayout`，`meta.helpKey` 只配主 router（`src/router/index.ts`） |
| 文档目录 | 仓库根 `docs/` | `docs/` 已存放内部项目文档（requirements / reference / ui / previews / records） | 用户帮助收敛到 `docs/help/`，与内部文档隔离 |
| Markdown 服务方式 | Nginx 静态目录 | 生产 Nginx 静态托管 `dist/`、`/api` 反代 Express（PM2） | Nginx 新增 `location /docs/` alias；开发环境 Vite 代理 → Express 静态挂载 |
| 依赖 | — | `markdown-it` 未安装 | 需新增 `markdown-it` + `@types/markdown-it` |
| 样式规范 | — | 强制 `--momo-*` tokens（`src/styles/tokens/`）、Element Plus 经 `ep-overrides.css` 主题化、消息用 `useUiFeedback` | 全部纳入硬性要求 |

---

## 一、项目目标

在现有用户端中新增一套**产品内嵌帮助文档系统**。

目标不是开发一个完整的 GitBook / 飞书文档平台，而是做一套轻量的帮助系统，让用户在使用产品功能时可以：

- 在当前页面点击「? 使用帮助」
- 不跳出产品
- 从右侧 Drawer 打开当前页面对应的帮助文档
- 查看功能介绍、操作步骤、截图、GIF / 视频、常见问题
- 后续支持字段级 `?` 帮助
- 后续支持 Playwright 自动截图 / 录屏
- 后续支持 AI（ZCode Skill）根据功能变化自动生成、更新 Markdown 文档

核心原则：

> **展示层自建，文档使用 Markdown + Git 管理，不开发复杂 CMS。**

---

# 二、整体技术方案

技术栈：

- 前端：Vue3（仓库根 `src/`，主入口 `index.html`）
- UI：Element Plus（已通过 `src/styles/ep-overrides.css` 主题化）
- 文档格式：Markdown
- Markdown 渲染：`markdown-it`（**待安装**，连同 `@types/markdown-it`）
- 文档版本管理：Git（与代码同仓库）
- 文档图片：WebP / PNG
- 操作演示：优先 WebM / MP4，短动画可使用 GIF
- Web 自动化：Playwright（第二阶段引入，当前项目无此依赖）
- AI 文档维护：ZCode Skill（`.agents/skills/`，第三阶段）
- 文档服务：开发环境 Express 静态挂载（Vite 代理）；生产环境 Nginx `location /docs/` alias

整体架构：

```text
用户端 SPA（index.html，hash 路由）
│
├── MainLayout（src/layouts/MainLayout.vue）
│    ├── .main-header 右侧「? 使用帮助」入口
│    └── GlobalHelpDrawer（全局唯一，挂在 MainLayout 根节点）
│
├── Vue Router（src/router/index.ts）
│    └── meta.helpKey
│
├── Help Registry（src/configs/helpRegistry.ts）
│    └── helpKey → Markdown 文档路径
│
└── Help Renderer（markdown-it）
     └── 动态加载 Markdown
            ↓
         fetch('/docs/...')
            ↓
      开发：Vite proxy → Express(3000) express.static
      生产：Nginx location /docs/ → /root/momo-aigc/docs/help/
            ↓
      docs/help/**/*.md 静态文件
```

与双模式 API Key 架构（用户模式 / 共享模式）无关：帮助文档是纯静态资源，
不走 `/api`，不碰 ToAPIs 代理链路。

---

# 三、最重要的设计原则

## 1. Markdown 不打包进 Vue

不要把用户帮助文档放到：

```text
src/docs/
```

也不要使用：

```ts
import xxx from './xxx.md'
```

否则每次修改 Markdown 都需要：

```bash
npm run build
```

重新构建前端。

也不要放 Vite `public/` 目录——`public/` 内容会被拷进 `dist`，
导致「改文档 → 重新 build → 重新同步 dist」，同样违背解耦目标。

正确方式是：

> Markdown 作为独立静态资源（`docs/help/`），由前端运行时动态加载。

服务器结构（本项目实际部署路径）：

```text
/root/momo-aigc/          # 服务器上的 Git 仓库
│
├── dist/                 # Vue 前端构建产物（Nginx root）
│
└── docs/
    └── help/             # 用户帮助文档根目录（Nginx /docs/ 指向这里）
        ├── works/
        │   ├── gallery.md
        │   └── images/
        │
        ├── prompt-workshop/
        │   └── ...
        │
        └── free-gen/
            └── ...
```

前端运行时请求：

```text
/docs/works/gallery.md
```

这样修改帮助文档后：

```text
修改 Markdown
↓
Git Push
↓
服务器 git pull（只同步 docs/help/，不 build、不 pm2 restart）
↓
完成
```

不需要：

- npm build
- 重启前端
- 重启后端（pm2 restart）
- 重启 Nginx

用户刷新后即可读取最新 Markdown。

---

# 四、目录结构

本项目实际结构（前端在仓库根，后端在 `server/`）：

```text
momoaigc/
│
├── src/                          # 前端
│   ├── components/
│   │   └── help/
│   │       ├── HelpButton.vue
│   │       ├── HelpDrawer.vue
│   │       ├── HelpRenderer.vue
│   │       └── FieldHelp.vue     # 第三阶段
│   │
│   ├── composables/
│   │   └── useHelp.ts
│   │
│   ├── configs/
│   │   └── helpRegistry.ts       # 项目已有 configs 目录，保持惯例
│   │
│   ├── layouts/
│   │   └── MainLayout.vue        # Drawer 唯一挂载点 + 头部帮助入口
│   │
│   └── router/
│       └── index.ts              # 路由 meta.helpKey（只配这一份）
│
├── docs/
│   ├── requirements/             # 内部：产品需求（本方案在此）
│   ├── reference/                # 内部：技术参考
│   ├── ui/                       # 内部：UI 规范
│   ├── previews/、records/       # 内部：预览与记录
│   │
│   └── help/                     # ★ 用户帮助文档根（用户可见内容）
│       ├── free-gen/
│       │   └── home.md
│       │
│       ├── works/
│       │   ├── gallery.md
│       │   ├── detail.md
│       │   └── images/
│       │       ├── gallery-01.webp
│       │       └── gallery-demo.webm
│       │
│       ├── prompt-workshop/
│       │   └── home.md
│       │
│       └── ...（按功能模块扩展）
│
├── server/
│   └── src/
│       └── index.ts              # 开发环境挂 express.static('/docs')
│
└── playwright/
    └── docs/                     # 第二阶段
```

两条边界规则：

1. `docs/help/` 之外的所有 `docs/` 子目录都是**内部文档**，用户不可见，绝不能被
   `/docs/` URL 暴露出去（Nginx alias 只指向 `docs/help/`，天然隔离）。
2. `docs/help/` 与前端在同一个 Git 仓库，但**不参与 Vue build**。

---

# 五、HelpKey 机制

不要让业务页面直接绑定 Markdown 文件地址。

错误方式：

```vue
<HelpButton doc="/docs/works/gallery.md" />
```

正确方式：

```vue
<HelpButton help-key="works.gallery" />
```

增加：

```text
src/configs/helpRegistry.ts
```

按本项目真实功能模块注册（第一阶段先覆盖 1~2 篇验证链路）：

```ts
export interface HelpEntry {
  title: string
  path: string // 相对 docs/help/ 的 Markdown 路径
}

export const helpRegistry: Record<string, HelpEntry> = {
  'free-gen': {
    title: '自由生图',
    path: 'free-gen/home.md',
  },

  'workspace': {
    title: '快速生图',
    path: 'workspace/home.md',
  },

  'templates': {
    title: '模板图库',
    path: 'templates/home.md',
  },

  'works.gallery': {
    title: '作品库',
    path: 'works/gallery.md',
  },

  'works.detail': {
    title: '作品详情',
    path: 'works/detail.md',
  },

  'prompt-workshop': {
    title: '提示词工坊',
    path: 'prompt-workshop/home.md',
  },

  'photography': {
    title: 'AI摄影',
    path: 'photography/home.md',
  },

  'toolbox.batch-spreadsheet': {
    title: '批量传表格做图',
    path: 'toolbox/batch-spreadsheet.md',
  },

  'user.quota': {
    title: '我的额度',
    path: 'user/quota.md',
  },
}
```

统一使用：

```text
helpKey
```

作为功能与文档之间的唯一标识。

好处：

以后即使文档来源从 Markdown 改为：

- GitBook
- CMS
- API
- 数据库
- RAG

业务页面都不需要修改。

---

# 六、Vue Router 自动绑定帮助文档

页面级帮助优先通过 Router 配置。**只配主 router（`src/router/index.ts`）**，
管理后台独立 router（`src/admin/router/index.ts`）第一阶段不配 helpKey。

本项目路由已普遍使用 `meta.title` / `requiresAuth`，新增 `meta.helpKey` 是顺势扩展，
hash 路由不影响该机制。示例（真实路由）：

```ts
{
  path: '/free-gen',
  name: 'FreeGen',
  component: () => import('@/views/free-gen/FreeGenPage.vue'),
  meta: { title: '自由生图', requiresAuth: true, helpKey: 'free-gen' },
},

{
  path: '/works',
  name: 'WorksGallery',
  component: () => import('@/views/works/WorksGalleryPage.vue'),
  meta: { title: '作品库', requiresAuth: true, helpKey: 'works.gallery' },
},

{
  path: '/works/:id',
  name: 'WorkDetail',
  component: () => import('@/views/works/WorkDetailPage.vue'),
  meta: { title: '作品详情', requiresAuth: true, hideInMenu: true, helpKey: 'works.detail' },
},

{
  path: '/prompt-workshop',
  name: 'PromptWorkshop',
  component: () => import('@/views/prompt-workshop/PromptWorkshopPage.vue'),
  meta: { title: '提示词工坊', requiresAuth: true, helpKey: 'prompt-workshop' },
},
```

帮助入口固定放在 `MainLayout` 的 `.main-header` 右侧（当前头部只有
`.header-left`，需新增右侧区域）：

```text
.main-header
├── .header-left（折叠按钮 + 页面标题，现状保留）
└── .header-right（新增）
    └── 「? 使用帮助」按钮
```

点击时：

```ts
route.meta.helpKey
```

获取当前帮助文档。

流程：

```text
用户访问：
/#/works

↓

router.meta.helpKey

↓

works.gallery

↓

helpRegistry

↓

works/gallery.md

↓

HelpDrawer
```

业务页面原则上不需要单独写 HelpButton。

---

# 七、HelpDrawer

在 `MainLayout` 根节点挂载**全局唯一**的：

```text
GlobalHelpDrawer
```

不要每个业务页面创建一个 Drawer。本项目 `src/App.vue` 下有三套壳子
（AuthLayout / AdminApp / MainLayout），第一阶段**只在 MainLayout 挂载**；
AuthLayout（登录/注册等游客页）与管理后台不提供帮助入口。

结构：

```text
MainLayout（src/layouts/MainLayout.vue）
│
├── SidebarMenu
├── .main-content（header + TabBar + router-view + KeepAlive）
├── TaskPanel / 任务 FAB（现状保留）
└── GlobalHelpDrawer（新增）
```

注意：MainLayout 的 `router-view` 带有 `KeepAlive`（多标签页机制），Drawer
挂在 `router-view` 之外，天然满足「不改变原页面状态」。

用户点击头部右侧：

```text
? 使用帮助
```

后：

```text
┌────────────────墨墨 AI 生图────────────────────────┬──────── 使用帮助 ────────┐
│                                                   │                         │
│ 当前业务页面（状态保持，KeepAlive 不受影响）          │ 作品库                   │
│                                                   │                         │
│                                                   │ 功能说明                 │
│                                                   │                         │
│                                                   │ 操作步骤                 │
│                                                   │                         │
│                                                   │ [截图]                   │
│                                                   │                         │
│                                                   │ 常见问题                 │
│                                                   │                         │
└───────────────────────────────────────────────────┴─────────────────────────┘
```

要求 Drawer：

- 使用 `el-drawer`（已被 `ep-overrides.css` 主题化，视觉自动统一）
- 宽度约 420px ～ 520px（取值落到 `--momo-*` token，见第十二节）
- PC 端从右侧打开
- 不改变原页面状态（挂载在 router-view / KeepAlive 之外）
- 支持内部滚动
- 支持关闭（Esc / 点击遮罩 / 关闭按钮，遵循 el-drawer 默认行为）
- 支持路由切换后自动更新当前帮助内容（`useHelp` 内 watch
  `route.meta.helpKey`，Drawer 打开状态下自动换文档，关闭状态下只更新目标）
- 当前路由没有 helpKey 时，按钮置灰或隐藏（第一阶段建议置灰 + 提示
  「该页面暂无帮助文档」）

---

# 八、HelpRenderer

创建统一：

```text
HelpRenderer.vue
```

职责：

1. 根据 Markdown URL 加载文档
2. 将 Markdown 渲染为 HTML
3. 支持标题、列表、表格、图片、链接、代码块、引用
4. 支持视频（`<video>`）
5. 支持标题 Anchor（后续帮助中心 / 字段级跳转依赖）
6. 加载中 / 404 / 请求失败三种状态

安装依赖：

```bash
npm install markdown-it
npm install -D @types/markdown-it
```

安全要求：`markdown-it` 默认 `html: false`。帮助文档模板中需要嵌入
`<video>` 标签，处理方式二选一（推荐 a）：

- a. `html: false` + 自定义 `video` 容器语法（如 `::: video ./images/xxx.webm :::`），
  由 Renderer 渲染成受控的 `<video>` 节点（禁止 `autoplay` 带声、强制 `controls`）
- b. `html: true` + 严格约束文档来源（本项目文档全部来自自有 Git 仓库，
  风险可控），但必须禁用 `markdown-it` 的链接跳转外域（统一 `target="_blank"` + `rel`）

同时统一定义帮助文档 CSS（作用域限定在 Drawer 内容容器内，避免污染全局）：

- H1 / H2 / H3
- 正文行高
- 图片圆角、最大宽度 100%
- Table
- Blockquote
- Tip / Warning

所有取值（宽度、圆角、字号、行高、阴影、间距）**必须使用 `--momo-*`
token**（定义于 `src/styles/tokens/`）；token 缺失时在 tokens 中新增，禁止
组件内硬编码。所有文档必须使用同一个 Renderer。

用户反馈消息（如「文档加载失败」的 toast）必须使用
`src/composables/useUiFeedback.ts`，禁止直接 `ElMessage` / `ElMessageBox`。

---

# 九、Markdown 内容规范

每篇用户帮助尽量遵循统一模板。

示例（以真实功能「作品库」为例）：

```markdown
# 作品库

作品库汇聚了全站用户发布的生成作品，可以浏览、学习并一键复刻同款。

## 使用场景

想看看别人用墨墨 AI 生图做出了什么效果、或想直接套用别人的参数时，
进入作品库。

## 操作步骤

### 1. 进入作品库

侧边栏点击【作品库】。

![作品库首页](./images/gallery-01.webp)

### 2. 筛选感兴趣的作品

通过顶部标签、排序方式筛选。

### 3. 一键同款

打开作品详情，点击【一键同款】，自动带出该作品的模型、提示词与参数。

![一键同款](./images/gallery-02.webp)

<video controls>
  <source src="./images/gallery-demo.webm">
</video>

## 注意事项

> 一键同款会按当前计费规则消耗额度，详见【计费说明】。

## 常见问题

### 为什么有的作品不能一键同款？

作者发布时关闭了「允许复刻」。

### 发布作品会泄露我的提示词吗？

取决于发布时的可见性设置，详见发布弹窗说明。
```

写作要求（同样适用于后续 AI 维护文档的 Skill）：

1. 以最终用户视角写作
2. 不描述代码实现、不使用技术术语解释用户操作
3. 每个关键操作步骤尽量附截图

---

# 十、图片与视频

截图建议优先：

```text
WebP
```

操作演示建议优先：

```text
WebM
```

其次：

```text
MP4
```

非常短的动画才使用：

```text
GIF
```

原因：

GIF 文件体积通常明显更大。

目录：

```text
docs/help/
└── works/
    ├── gallery.md
    │
    └── images/
        ├── gallery-01.webp
        ├── gallery-02.webp
        └── gallery-demo.webm
```

Markdown 中使用相对路径。

---

# 十一、字段级帮助

第一阶段暂缓。

后续增加：

```text
FieldHelp.vue
```

例如：

```text
采样步数 [?]
```

点击或 Hover：

```text
┌──────────────────────────┐
│ 采样步数                  │
│                          │
│ 控制生图迭代的精细程度。  │
│                          │
│ 步数越高越精细，也越慢。 │
│                          │
│ 查看完整说明 →            │
└──────────────────────────┘
```

调用方式：

```vue
<FieldHelp help-key="free-gen.steps" />
```

Registry 支持：

```ts
'free-gen.steps': {
  type: 'popover',
  title: '采样步数',
  content: '控制生图迭代的精细程度，越高越精细也越慢。',
  doc: 'free-gen',
  anchor: 'steps'
}
```

这样支持：

```text
字段简单说明
+
跳转完整帮助
```

---

# 十二、开发与部署方案

## 1. Markdown 与前端同仓库，部署动作分离

```text
momoaigc/（Git 仓库）
├── src/、server/          → 代码变化：npm run build + pm2 restart
└── docs/help/             → 文档变化：只同步文件，不 build 不重启
```

判断规则（纳入现有部署流程，见 `docs/reference/deployment.md`）：

```text
如果只有 docs/help/** 修改：

服务器 git pull 即可
不执行 npm build
不执行 pm2 restart
不 reload Nginx
```

## 2. 开发环境（npm run dev / dev:server）

后端目前没有任何静态目录挂载，需在 `server/src/index.ts` 新增：

```ts
// 用户帮助文档静态服务（开发环境主路径；生产环境由 Nginx 直接服务，
// 该挂载不可达，保留作兜底）
app.use('/docs', express.static(path.resolve('docs/help')))
```

`vite.config.ts` 的 `server.proxy` 新增（与现有 `/api` 代理并列）：

```ts
'/docs': {
  target: 'http://localhost:3000',
  changeOrigin: true,
},
```

这样开发环境的请求链路与生产一致：

```text
浏览器 fetch('/docs/works/gallery.md')
  → Vite(5173) proxy
  → Express(3000) express.static
  → docs/help/works/gallery.md
```

注意：**不要**用 Vite `public/` 目录承载帮助文档（build 会拷入 `dist`，破坏解耦）。

## 3. 生产环境（Nginx alias）

现有 Nginx 站点配置（`/etc/nginx/sites-available/momo-aigc`）新增一段：

```nginx
# 用户帮助文档静态目录（与 dist 构建产物解耦，改文档无需重新构建前端）
location /docs/ {
    alias /root/momo-aigc/docs/help/;
    add_header Cache-Control "no-cache";
}
```

要点：

- alias 只指向 `docs/help/`，`docs/` 下的内部文档（requirements /
  reference / ui 等）不会被暴露
- `Cache-Control: no-cache` 保证「用户刷新即可读到最新文档」；图片等
  大文件后续可按需放宽（如 `max-age=3600`）
- `location /docs/` 优先级高于 `location /` 的 `try_files`，不会回退到
  `index.html`；与 `/api/` 代理无交集

## 4. 权限（必做，历史踩坑）

项目位于 `/root` 下而 Nginx 以 `www-data` 运行，部署文档问题 5 记录过
`Permission denied` 坑。新增 docs 目录后同样执行：

```bash
chmod -R o+rX /root/momo-aigc/docs
```

## 5. 服务器最终结构

```text
/root/momo-aigc/
├── dist/          # Nginx root（index.html + admin.html 双入口）
└── docs/help/     # Nginx /docs/ alias 指向这里
```

文档更新后不需要重启任何服务。

---

# 十三、Playwright 自动截图（第二阶段）

本项目当前**没有** Playwright 依赖与测试账号体系，第二阶段开始时需要：

- `npm install -D @playwright/test`
- 准备专用测试账号（seed 的管理员是 `admin`（初始密码见 seed 逻辑）；
  用户端功能截图需要一个普通测试用户）
- 约定测试环境数据库，禁止对生产库截图

目的：

> 自动操作产品，自动生成帮助文档需要的截图和视频。

例如：

```text
启动本地环境
↓
登录测试账号
↓
进入作品库
↓
截图
↓
打开作品详情
↓
截图
↓
一键同款
↓
录制操作过程
```

输出：

```text
docs/help/works/images/

gallery-01.webp
gallery-02.webp
gallery-demo.webm
```

脚本位置：

```text
playwright/
└── docs/
    └── works-gallery.spec.ts
```

注意：

- 使用测试环境与测试账号
- 禁止直接操作生产业务数据
- 截图前清理无关测试数据
- 固定浏览器尺寸
- 固定页面缩放比例

保证生成截图风格统一。

---

# 十四、AI 自动维护文档（第三阶段）

第三阶段建立项目 Skill（本项目使用 ZCode，目录约定为 `.agents/skills/`，
不是 `.skills/`）：

```text
.agents/skills/
└── update-user-docs/
    └── SKILL.md
```

目标：

当开发功能完成后执行：

```text
更新该功能的用户帮助文档
```

AI 自动：

```text
查看 Git Diff
↓
判断哪些用户功能变化
↓
定位对应 helpKey
↓
检查现有 Markdown
↓
启动本地 / 测试环境
↓
通过 Playwright 操作功能
↓
自动截图
↓
必要时录制视频
↓
修改 Markdown
↓
检查图片引用
↓
输出文档更新结果
```

建议 Skill 明确规定：

1. 只修改与本次功能变化有关的帮助文档
2. 不删除旧文档中的有效说明
3. 以最终用户视角写作
4. 不描述代码实现
5. 不使用技术术语解释用户操作
6. 每个关键操作步骤尽量附截图
7. 页面变化时优先重新生成旧截图
8. Markdown 使用第九节统一模板
9. 必须校验 helpKey 是否存在于 helpRegistry
10. 最终输出修改文件列表

---

# 十五、后续可增加帮助中心

后续增加：

```text
/#/help
```

（hash 路由，作为主 router 的一条普通路由）

作为完整帮助中心。

结构：

```text
帮助中心

搜索问题或功能

生图创作
├── 自由生图
├── 快速生图
└── AI画布

灵感与素材
├── 模板图库
├── 提示词库
├── 提示词工坊
└── AI摄影

作品与分享
├── 作品库
└── AI买家秀

批量工具
├── 批量换姿势
├── 批量换衣服
└── 批量传表格做图

账号与计费
├── 我的额度
├── 我的消耗
└── 计费说明
```

数据仍然来源于：

```text
docs/help/**
```

因此实现：

> 一套 Markdown，两种入口。

分别为：

```text
产品内：
? → HelpDrawer

完整文档：
/#/help
```

帮助中心复用同一个 `HelpRenderer`，保证样式一致。

---

# 十六、搜索

V1 不做搜索。

后续如果帮助文档数量达到几十 / 几百篇，可以使用：

```text
Fuse.js
```

实现前端全文搜索（配合一个构建期生成的索引清单，或遍历
helpRegistry 拉取 Markdown）。

不需要一开始引入：

- Elasticsearch
- Meilisearch
- Typesense

等文档数量明显增长后再升级。

---

# 十七、AI 问答

AI 问答属于后期功能，不进入第一阶段。

未来可以在 Drawer 增加：

```text
[帮助文档] [问 AI]
```

因为用户当前已经处于某个页面，例如：

```text
/#/prompt-workshop
```

可以直接把：

```text
当前 helpKey
+
当前 Markdown
+
用户问题
```

发送给 LLM。

V1 不需要做完整 RAG。

例如：

```text
prompt-workshop/home.md
+
用户：
"模块拼好后怎么应用到生图？"

↓

LLM

↓

结合当前功能文档回答
```

---

# 十八、第一阶段开发范围

## 必须完成

> 2026-08-15 第一阶段已实施完成（代码部分），验证记录见本节末尾。

前端：

- [x] 安装 `markdown-it` + `@types/markdown-it`
- [x] 创建 `src/configs/helpRegistry.ts`
- [x] 主 router（`src/router/index.ts`）为已写文档的路由补 `meta.helpKey`
      （`/works` → `works.gallery`，`/prompt-workshop` → `prompt-workshop`）
- [x] 创建 `src/components/help/HelpButton.vue`
- [x] 创建 `src/components/help/HelpDrawer.vue`，挂载到 `MainLayout`（全局唯一）
- [x] 创建 `src/components/help/HelpRenderer.vue`
- [x] 创建 `src/composables/useHelp.ts`（watch 路由 helpKey，Drawer 打开时自动切换文档）
- [x] MainLayout `.main-header` 新增右侧「? 使用帮助」入口
- [x] Markdown 动态 HTTP 加载（`fetch('/docs/...')`）
- [x] 支持 Markdown 图片、WebM / MP4（受控 `<video>`：markdown-it `html:false` +
      ```video 围栏语法，见 `src/utils/helpMarkdown.ts`）
- [x] 支持 Markdown 基本格式（标题/列表/表格/链接/代码块/引用，含标题锚点）
- [x] 支持加载状态、404 / 文档不存在状态、请求失败状态（失败可重试）
- [x] Drawer 与文档内容样式全部使用 `--momo-*` token
      （新增 `--momo-help-drawer-width`，定义于 `src/styles/tokens/_layout.css`）
- [x] 交互反馈使用 `useUiFeedback`，不直接引入 `ElMessage` / `ElMessageBox`
- [x] 编写 2 篇示例文档验证链路（`docs/help/works/gallery.md` +
      `docs/help/prompt-workshop/home.md`）

开发环境：

- [x] `server/src/index.ts` 挂载 `express.static('/docs', docs/help)`
- [x] `vite.config.ts` `server.proxy` 增加 `/docs` → `http://localhost:3000`

生产（运维项，随第一阶段上线一起做）：

- [ ] Nginx 新增 `location /docs/` alias → `/root/momo-aigc/docs/help/`
      （配置片段已写入 `docs/reference/deployment.md`，待服务器执行）
- [ ] `chmod -R o+rX /root/momo-aigc/docs`
- [x] 部署流程增加「仅 docs/help/** 变更时跳过 build / pm2 restart」的判断
      （已写入 `docs/reference/deployment.md` 日常更新部署流程表）
- [x] 更新 `docs/reference/deployment.md`

### 验证记录（2026-08-15）

- `npm run check`（vue-tsc + server tsc）通过
- `npm run build` 生产构建通过（双入口 index.html / admin.html 均产出）
- 后端直连：`GET /docs/works/gallery.md`、`/docs/prompt-workshop/home.md` → 200；
  不存在的文档 → 404；`/docs/requirements/prd.md`（内部文档）→ 404（隔离生效）；
  `/docs/../server/src/index.ts`（目录穿越）→ 404
- Vite 代理链路：`GET localhost:5173/docs/works/gallery.md` → 200，
  缺失文档 → 404
- 渲染管线（`src/utils/helpMarkdown.ts`）13 项断言全部通过：CJK 标题锚点、
  相对链接/图片/视频按文档目录解析、外链原样、链接新窗口、```video 围栏、
  普通代码块、blockquote、表格、内联 HTML 转义
- 浏览器端到端 GUI 验证因本机 in-app browser webview 无法挂载未能执行，
  已以上述链路证据替代；建议人工在浏览器过一遍：登录 → 作品库 →
  点击「使用帮助」→ 抽屉渲染 → 自由生图页按钮应禁用

## 第一阶段不要做

不要开发：

- [ ] 管理后台（AdminApp）的帮助入口与 `src/admin/router` 的 helpKey
- [ ] 后台 Markdown 编辑器
- [ ] CMS
- [ ] 文档数据库
- [ ] 文档审核
- [ ] 多人协同编辑
- [ ] 文档历史版本
- [ ] AI 问答
- [ ] RAG
- [ ] Elasticsearch
- [ ] 复杂全文搜索
- [ ] 评论系统
- [ ] 用户点赞
- [ ] Playwright 自动截图

先保证最核心链路可用。

---

# 十九、第二阶段

第一阶段稳定以后开发：

- Playwright 自动截图
- Playwright 自动录屏
- 文档截图统一规范
- AI 文档 Skill
- 根据 Git Diff 自动识别文档变化
- 自动更新 Markdown

最终目标：

```text
功能开发完成
↓
AI（ZCode）：
更新用户帮助
↓
Playwright：
操作页面
↓
生成截图 / 视频
↓
AI（ZCode）：
更新 Markdown
↓
Git Commit
```

---

# 二十、第三阶段

根据实际使用情况增加：

- `/#/help` 独立帮助中心
- Fuse.js 搜索
- 字段级 FieldHelp
- FAQ
- AI 问答
- 文档反馈
- 文档访问统计
- 管理后台（AdminApp）接入帮助系统（挂载 AdminApp 壳子 +
  `src/admin/router/index.ts` 配 helpKey，Drawer 组件与 Registry 复用）

不要提前开发。

---

# 二十一、关键要求

开发时必须遵守：

### 1. 文档和 Vue Build 解耦

Markdown 更新不允许要求：

```text
npm run build
```

（因此也不使用 Vite `public/` 承载文档）

---

### 2. 文档通过 HTTP 动态加载

例如：

```text
/docs/works/gallery.md
```

---

### 3. 页面不直接写 Markdown URL

必须：

```text
helpKey
↓
helpRegistry
↓
document path
```

---

### 4. HelpDrawer 全局唯一

第一阶段唯一挂载点是 `MainLayout`，不要每个业务页面单独创建。

---

### 5. HelpRenderer 全局唯一

帮助 Drawer、未来帮助中心、未来预览页面都应该复用：

```text
HelpRenderer
```

确保不同地方看到的 Markdown 样式完全一致。

---

### 6. 不开发 Markdown CMS

当前文档：

```text
Markdown
+
Git
+
AI
```

维护即可。

---

### 7. 文档与代码一起 Git 管理

功能代码和对应帮助文档存在于同一个 Repository。

这样 AI 可以同时查看：

```text
Git Diff
+
源代码
+
Markdown
```

自动判断文档是否需要更新。

---

### 8. 遵守本项目设计规范（本项目强制）

- 所有样式取值使用 `--momo-*` token（`src/styles/tokens/`），禁止硬编码；
  Element Plus 组件视觉经 `ep-overrides.css` 自动统一
- 用户反馈消息统一走 `src/composables/useUiFeedback.ts`
- 新增交互需符合 `docs/ui/ui-design-guidelines.md`

---

# 二十二、最终用户体验

目标效果：

```text
用户正在使用墨墨 AI 生图

↓

不知道某功能怎么使用

↓

点击页面头部右侧：

? 使用帮助

↓

右侧打开 HelpDrawer

↓

自动识别当前页面（route.meta.helpKey）

↓

显示：

功能介绍
操作步骤
截图
操作演示
注意事项
常见问题

↓

用户关闭 Drawer

↓

继续操作原页面（KeepAlive 状态原样保留）
```

整个过程中：

> 用户不离开产品、不打开新页面、不进入飞书或外部文档网站。

---

# 二十三、最终技术架构

```text
              用户端 SPA（index.html，hash 路由）
                             │
                             │
                     Vue Router（src/router/index.ts）
                             │
                       meta.helpKey
                             │
                             ↓
                  Help Registry（src/configs/helpRegistry.ts）
                             │
                             ↓
                       useHelp()
                             │
                             ↓
              Global HelpDrawer（挂在 MainLayout）
                             │
                             ↓
                    HelpRenderer.vue
                             │
                      HTTP Fetch Markdown
                             │
                             ↓
            开发：Vite proxy → Express static(docs/help)
            生产：Nginx location /docs/ → /root/momo-aigc/docs/help/
                             │
                             ↓
                    docs/help/*.md
                             │
                  ┌──────────┴──────────┐
                  ↓                     ↓
              WebP 图片             WebM 视频
                  ↑                     ↑
                  └──────────┬──────────┘
                             │
                         Playwright（第二阶段）
                             ↑
                             │
                       AI Skill（第三阶段，.agents/skills/）
                             ↑
                             │
                         Git Diff
```

## 一句话总结

第一阶段先实现：

> **MainLayout 全局 HelpDrawer + 主 Router helpKey + Markdown 动态加载 + Git 管理文档（只做用户端）。**

Markdown 独立于 Vue Build（`docs/help/` 目录，不进 `public/`、不进 build），
开发环境经 Vite 代理 → Express 静态服务，生产环境由 Nginx `location /docs/`
alias 直接提供，因此：

> **修改帮助文档只需要 git pull 同步 Markdown 文件，不需要重新构建前端，也不需要重启任何服务。**

后续再逐步加入：

> **Playwright 自动截图 / 录屏 + AI Skill 自动更新帮助文档。**
