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
- 用户端删除顶部工具区和导航折叠按钮；深浅色模式切换收纳到左下角设置菜单。管理后台保持原有顶栏和外观设置。
- 左侧常驻悬浮导航只保留创作工作台、AI画布、资产；小屏也保持可见，不依赖已移除的展开按钮。
- 创作模式与资产分类统一放入左侧主导航的二级入口，不再显示顶部 tab（2026-09-25）。点击一级入口直接进入第一个子页面，一级入口不内嵌子页面按钮；鼠标悬浮或键盘聚焦时在右侧浮窗显示子页面；当前子页面使用品牌橙底白字。创作工作台首项为快速生图，其后为自由生图、AI摄影、AI买家秀、批量工具；资产首项为生图记录，其后为模板图库、提示词库。AI画布保持直接进入项目列表。
- 公共 `DsNavigationDock` 支持 `items[].children`，一级点击默认导航到首个子项；垂直模式通过右侧悬浮菜单展示子项，横向模式保持原行为。
- 资产内有生图记录、模板图库、提示词库三个分类；提供 `/assets/results`、`/assets/templates`、`/assets/prompts`，原有链接继续兼容，资产高亮一致。
- 左下角只显示任务面板开关、剩余积分和设置入口，不显示头像；任务开关保留运行中状态及任务数量。设置菜单提供深浅色模式切换，切换结果复用全局外观偏好并持久化。
- 使用帮助移入设置菜单，无文档时保持禁用并说明原因；账户与退出功能继续保留；用户端设置菜单不提供管理后台入口，后台路由与权限不变。
- 公共 `DsNavigationDock` 支持纵向悬浮和横向分段两种方向；样式统一在公共主题中，展厅提供两种实例。

## 工具入口卡片（2026-09-25）

- `DsToolCard(title, description, imageUrl, disabled)` 为公共工具入口卡，分为 4:3 介绍图、名称与进入按钮、描述三个部分。进入按钮为名称行右侧的小按钮，不含箭头；后台 actions 插槽仍位于描述下方。图片居中裁切；无图或加载失败显示“无图片介绍”，不折叠图片区。
- 默认操作发出 `enter` 事件；后台可通过 `actions` 插槽替换为图片配置操作。组件不访问业务 API；展厅包含有图、无图、禁用状态。
- 后台“内容与素材 → 工具介绍图”（独立入口 `/admin.html#/toolbox`）可上传、清空、保存四个批量工具的介绍图。上传复用 `ossApi`，兼容 direct 与 OSS；上传完成后需点击保存才发布到工具箱。清空仅解除图片配置，不删除存储文件。
- 图片地址按工具分别保存在 `system_config` 的 `toolbox_image_<toolId>`，无需数据库迁移。公开接口只返回这四个介绍图字段；写入接口要求管理员权限。用户端重新进入工具箱时读取配置。
- 接口隔离回归：`npx tsx scripts/test-toolbox-config.ts`，使用临时数据库与独立测试 JWT，不改业务数据。

- 生成参数区 `DsParameterPanel` 默认将 `reason` 作为禁用按钮的悬浮/键盘聚焦提示，按钮可用时不显示；页面不再在 `after` 插槽重复渲染禁用原因。提交进度、下载等非禁用说明仍可使用 `after` 插槽。页面缓存切换时关闭提示，避免旧页面浮层残留。


## 页面顶部区域（2026-09-25）

- 公共 `DsScrollPage` 默认不显示页级标题/说明区（`showHeading=false`），页面不再为此保留高度或分隔线。需要演示完整外壳时可显式开启。
- 返回、新建等必要入口使用 `actions` 插槽；`extra` 和 `filters` 独立保留在无分隔线的工具栏中，不随标题隐藏。页面内容内的分区标题不受影响。

## 标准生图参数组合（2026-09-25）

- `DsParameterPanel` 统一拥有模型、画面比例、生成数量、分辨率四项控件，不再开放默认插槽让页面自行拼装。仅保留 `after` 插槽承载进度、下载等附加操作。
- 页面通过 `models/modelsLoading`、`aspectRatios/resolutions/countOptions` 提供选项，通过 `v-model:modelId/aspectRatio/count/resolution` 传递当前值。模型名称与售价由业务适配层 `useGenerationModelOptions` 从模型目录生成，公共 UI 不依赖业务 store/API，不硬编码价格。
- `model-change` 与 `resolution-change` 在对应值更新后触发，页面保留已有模型能力、比例校正与计费规则。公共控件不提交任务，只有生成按钮发出 `submit`。
- 单次生成统一数量下拉；批量模式传 `taskCount`，显示只读任务数量，不能误改成一次生成多张。
- `placement="dock"` 用于无外侧留白的工作区，统一底部 12px/横向 20px 留白且不加顶部横线；`inset` 用于页面外壳已提供留白的区域，避免二次内缩。控件高度、间距与四列/窄屏两列布局统一由主题控制。
- 契约回归：`node scripts/test-standard-parameters.mjs`。

## 图片两档展示

- 小图统一使用 `DsThumbnail`（输入原图 `src`，内部选择固定最长边 400px 的展示地址）；预览、下载、编辑与生图输入保留原图地址。
- `DsImageCard`、`DsReferenceImage`、`DsToolCard` 已内置该能力。缩略图失败不自动回退原图，保留占位重试及主动预览、下载入口。
- 图片预览仅在弹窗打开时挂载当前原图；缩略图与预览组件不能提前请求整组原图。不得在页面复制 OSS 参数、加时间戳或按当前存储模式判断历史图片来源。
