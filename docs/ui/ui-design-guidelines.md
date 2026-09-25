# 公共 UI 设计规范 · 唯一现行规范

> 本文是本项目唯一现行 UI 规范。页面开发、公共组件扩展与旧页面迁移均以本文为准；业务方案不另行定义视觉标准。
> 新代码与已迁移页面遵循本文；旧组件仅作迁移兼容，不作为新开发依据。

## 1. 产品原则

业务正确 > 操作效率 > 信息清晰 > 装饰。图片、生成动作、状态优先于任务 ID 和技术元信息。
同一操作区仅一个最强主操作；危险动作文字与图标明确，并二次确认。异步动作显示 loading 并防重复提交。

## 2. 唯一视觉源与主题

新体系：`src/components/design-system/theme.css`。基础 Token → 语义 Token → 组件 Token。
品牌为荧光橙 `#FF7A00`；所有品牌橙色实底公共组件统一白色文字与图标（`--primary-foreground`），图标继承 currentColor；浅橙色辅助背景不套用白字；链接使用深橙/浅橙语义色而非直接使用品牌色。
浅色与深色模式均为正式规范。`DsThemeProvider` 控制局部主题与密度，不修改 document 根节点。
正式应用不再加载旧主题；唯一视觉源为公共主题。开发原型保留的旧组件不进入生产依赖图。

- 字体：系统字体；正文 14px、辅助 12px、展厅标题 24px。
- 间距：4/8/12/16/20/24/32px；布局可以 flex/grid，但视觉值由公共层定义。
- 圆角：基础与按钮、输入框 10px，图片 12px，卡片及大面板 18px。控件：舒适 36px、紧凑 32px。
- 背景、文字、边框、焦点、成功、警告、危险各自独立，不用橙色表达所有状态。
- 正文对比度 ≥4.5:1；大字与必要非文本控件 ≥3:1。
- 已确认的视觉例外（2026-09-25）：品牌亮橙 `#FF7A00` 上使用白字和白色图标，对比度约 2.61:1，不满足上述对比度目标；不得将该组合宣称为无障碍对比度达标。
- 动效尊重 prefers-reduced-motion；状态不能仅靠颜色表达。

## 3. 组件职责与使用

从 `@/components/design-system` 或其明确子路径导入。所有新页面置于 DsThemeProvider 内。

| 层级 | 职责 |
|---|---|
| 基础组件 | 输入、选择、按钮、浮层、表格、导航、反馈和无障碍交互 |
| 公共组合 | 页面/分区/字段/上传/筛选/任务卡/图片卡/生成动作栏 |
| 业务页面 | 数据加载、业务校验、权限与组件组合 |

页面允许外层排列、宽度、位置；不允许覆盖内部颜色、圆角、字号、阴影、焦点样式。
缺少能力时先增加公共 variant、属性或插槽，并登记示例，禁止按页面名称建立皮肤。
公共展示组件不访问业务 API；上传组件仅发出文件选择事件，业务层校验并上传。

## 4. 接口约定

- `DsThemeProvider(mode, density)`：light/dark、comfortable/compact；浮层必须使用 context 中 portalTarget。
- `Button(variant, size)`：default/outline/secondary/ghost/destructive/link；不要用 class 更换语义。
- `DsField(label, help, error, required)`：插槽提供 id/describedby/invalid，必须绑定到真实输入控件。
- `DsUpload(disabled,busy,error,accept)`：`select(File[])`；仅选择，不校验、不上传、不扣费。
- `DsTaskCard(title,status,progress,error)`：pending/running/done/failed/cancelled；retry/reuse 事件。
- `DsImageCard(src,title,loading)`：内部受控预览；actions 插槽用于业务动作。
- `DsActionBar(label,busy,disabled,reason)`：submit 事件；busy/disabled 时不可提交。
- `DsToolbar(modelValue,selectedCount)`：update:modelValue/search/reset，业务层决定筛选行为。
- `DsPage(title,description)`：actions/filters/default/footer 插槽；外层控制滚动归属。
- `DsSection(title,description)`：default/footer；不内置业务数据。
- `DsLinkedPanel(title,anchorOffset,anchorLabel)`：常驻关联气泡面板；default/actions/footer 插槽。顶部尖角指向来源控件，anchorOffset 是来源中心相对面板左侧的像素偏移，并自动限制在面板边界内；不含悬浮、传送或业务请求。
- `DsNotice(title,description,error)`、`DsStatus(status)`、`DsNode(title,status)`：纯展示。

Reka 组件保留受控 v-model、键盘和焦点契约；浮层不得直接挂到 body。通知通过主题 context 的 toastId 隔离，不能串到旧 FeedbackHost。

## 5. 组件展厅与验收

管理员菜单「UI 组件库」：`/admin/ui-components`，独立入口 `admin.html#/ui-components`。
组件清单：`src/components/design-system/registry.json`；基础族和公共组合必须有真实实例。
展厅支持搜索、分类、明暗/密度/适用状态切换；低层子组件在组合场景中展示。
展厅仅模拟业务，不提供主题在线保存，不访问付费服务。

每次新增：补类型、清单、示例、交互测试，运行 `npm run check:ui`、`npm run test:ui`、`npm run build`。
静态规则是可执行最低门槛，不替代代码评审与无障碍/视觉验收。
浏览器回归按需运行 `npm run test:ui:browser`、`npm run test:ui:phase-two`；覆盖明暗/密度、320/768/1024/1440px、键盘焦点、Escape、文件选择与主要业务交互。模拟接口验证不能当作真实生图或计费验收。

## 6. 迁移边界

正式应用页面及公共组件不得从旧库导入，不允许旧 Token、兼容皮肤或存量基线豁免。开发原型按用户要求不迁移，其专用依赖仅供开发使用。
仅按用户确认的范围迁移现存页面，不依据已删除的配套计划恢复功能；功能范围以当前业务需求为准。
不得改变接口、计费、权限、轮询、上传和业务逻辑。开发原型不属于正式页面迁移范围。
正式代码只保留一套公共入口，旧兼容主题已移除；仅保留开发原型实际引用的旧组件，不得被正式代码或生产构建引用，也不得复制形成第二套正式体系。

## 用户端导航精简（2026-09-24）

- 用户端取消打开页签、关闭页签和页签状态持久化；页面草稿由独立的有限 KeepAlive 缓存保留。
- 用户端删除顶部工具区、导航折叠按钮和外观入口；管理后台保持原有顶栏和外观设置。
- 左侧常驻悬浮导航只保留创作工作台、AI画布、资产；小屏也保持可见，不依赖已移除的展开按钮。
- 创作模式显示为顶部居中的独立分段切换条。
- 资产内有生图记录、模板图库、提示词库三个分类；提供 `/assets/results`、`/assets/templates`、`/assets/prompts`，原有链接继续兼容，资产高亮一致。
- 左下角只显示任务面板开关、剩余积分和设置入口，不显示头像；任务开关保留运行中状态及任务数量。
- 使用帮助移入设置菜单，无文档时保持禁用并说明原因；账户与退出功能继续保留；用户端设置菜单不提供管理后台入口，后台路由与权限不变。
- 公共 `DsNavigationDock` 支持纵向悬浮和横向分段两种方向；样式统一在公共主题中，展厅提供两种实例。
