# 公共 UI 设计规范 · V1 候选版

> 第一阶段视觉已获认可。第二阶段全局框架与自由生图样板进行中；其余业务页面等待样板验收后迁移。详见 [第二阶段计划](ui-phase-two-plan.md)。
> 新代码与已迁移页面遵循本文；旧 Element Plus 描述不再作为新开发依据。

## 1. 产品原则

业务正确 > 操作效率 > 信息清晰 > 装饰。图片、生成动作、状态优先于任务 ID 和技术元信息。
同一操作区仅一个最强主操作；危险动作文字与图标明确，并二次确认。异步动作显示 loading 并防重复提交。

## 2. 唯一视觉源与主题

新体系：`src/components/design-system/theme.css`。基础 Token → 语义 Token → 组件 Token。
品牌为荧光橙 `#FF7A00`；主按钮深色文字；链接使用深橙/浅橙语义色而非直接使用品牌色。
浅色与深色模式均为正式规范。`DsThemeProvider` 控制局部主题与密度，不修改 document 根节点。
旧体系仍由 `src/styles/tokens/` 管理，仅在迁移期保留，不能继续为新功能增加旧主题规则。

- 字体：系统字体；正文 14px、辅助 12px、展厅标题 24px。
- 间距：4/8/12/16/20/24/32px；布局可以 flex/grid，但视觉值由公共层定义。
- 圆角：基础 8px、卡片 12px。控件：舒适 36px、紧凑 32px。
- 背景、文字、边框、焦点、成功、警告、危险各自独立，不用橙色表达所有状态。
- 正文对比度 ≥4.5:1；大字与必要非文本控件 ≥3:1。
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
- `DsNotice(title,description,error)`、`DsStatus(status)`、`DsNode(title,status)`：纯展示。

Reka 组件保留受控 v-model、键盘和焦点契约；浮层不得直接挂到 body。通知通过主题 context 的 toastId 隔离，不能串到旧 FeedbackHost。

## 5. 组件展厅与验收

管理员菜单「UI 组件库」：`/admin/ui-components`，独立入口 `admin.html#/ui-components`。
组件清单：`src/components/design-system/registry.json`；基础族和公共组合必须有真实实例。
展厅支持搜索、分类、明暗/密度/适用状态切换；低层子组件在组合场景中展示。
展厅仅模拟业务，不提供主题在线保存，不访问付费服务。

每次新增：补类型、清单、示例、交互测试，运行 `npm run check:ui`、`npm run test:ui`、`npm run build`。
静态规则是可执行最低门槛，不替代代码评审与无障碍/视觉验收。

## 6. 迁移与冻结

第一阶段保留旧组件及旧 CSS；新 primitives 是隔离的迁移起点，不得反向从旧库导入。
用户验收展厅并冻结接口后，再迁移全局框架 → 创作 → 资源复用 → 管理与画布。
不得改变接口、计费、权限、轮询、上传和业务逻辑。开发原型和历史静态预览不迁移。
最终删除旧库与兼容主题，正式代码只保留一套公共入口；不得把隔离副本作为永久双体系。
