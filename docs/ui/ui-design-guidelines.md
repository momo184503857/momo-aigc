# 墨墨 AI 生图 — UI 设计规范

> 本规范适配自 DDB UI 设计系统，针对本项目技术栈（Vue 3 + Element Plus + 创意生图工具形态）改写。
> 所有颜色/字体/阴影/圆角的权威取值以 `src/styles/tokens/` 为准；本文档与其保持同步。
> 可视化色板与组件速查见同目录 `ui-design-system-preview.html`。

---

## 1. 设计理念

本项目定位为**内部创意生图工具**，非营销站点。视觉服从以下优先级：

> **业务正确 > 操作效率 > 信息清晰 > 视觉装饰**

冲突解决顺序：**本规范 > Element Plus 主题 > 历史页面局部样式**。

### 硬性原则

- 视觉调整**绝不改变**接口、查询参数、权限、分页、排序、保存或批量操作逻辑。
- **颜色不能是状态的唯一表达**。错误/成功/禁用必须同时携带文字、图标或控件状态。
- 层级来自**字重 + 留白 + 分组**，而非单纯靠颜色或字号。
- 同一页面同一间距级别不要混用（如表页垂直节奏统一 20px）。
- 动画只动 `transform`/`opacity`（避免布局抖动）；反馈动画 0.15–0.2s，hover 不得导致周围布局位移。
- 重要功能不能仅靠 hover 触发，必须有可点击/可聚焦的入口。
- 对比度目标：正文/背景 ≥ WCAG AA 4.5:1；大字与非文本控件 ≥ 3:1。

---

## 2. Token 系统（权威取值）

所有视觉表达必须通过 `--momo-*` token，禁止硬编码色值。Element Plus 组件经 `src/styles/ep-overrides.css` 自动跟随。

### 2.1 颜色

**品牌色**

| Token | 值 | 用途 |
|---|---|---|
| `--momo-color-brand` | `#0088ff` | **操作蓝 — 主操作按钮、查询按钮、关键动作** |
| `--momo-color-brand-antd` | `#1890ff` | 品牌蓝 — 链接、Tab 激活 |
| `--momo-color-brand-extended` | `#2b7de9` | 扩展蓝 — 品牌表达 |
| `--momo-color-brand-hover` | `#096dd9` | 主色 hover |
| `--momo-color-brand-active` | `#0050b3` | 主色 active |
| `--momo-color-brand-subtle` | `#e6f7ff` | 浅蓝底（hover 行、选中、信息底） |
| `--momo-color-brand-border` | `#91d5ff` | 浅蓝边框 |

**中性色（Ant 中性灰系）**

| Token | 值 | 用途 |
|---|---|---|
| `--momo-color-text` | `#1d2129` | 一级文字 |
| `--momo-color-text-secondary` | `#4e5969` | 二级文字 |
| `--momo-color-text-tertiary` | `#86909c` | 辅助文字 |
| `--momo-color-text-placeholder` | `#b8b8b8` | 占位符（不可用于正文） |
| `--momo-color-bg` | `#ffffff` | 卡片背景 |
| `--momo-color-bg-soft` | `#f7f9fc` | 弱区块背景 |
| `--momo-color-bg-muted` | `#f5f7fa` | 填充背景 |
| `--momo-color-bg-page` | `#f0f2f5` | 页面底色 |
| `--momo-color-border` | `#d9d9d9` | 常规边框 / 表单控件默认边框 |
| `--momo-color-border-soft` | `#eef0f4` | 弱边框 |
| `--momo-color-border-light` | `#f0f0f0` | 极弱边框 |

**语义色（DDB 业务语义）**

| Token | 值 | 用途 |
|---|---|---|
| `--momo-color-success` | `#31c19e` | 业务成功 — 完成/通过 |
| `--momo-color-success-antd` | `#52c41a` | 标准 success |
| `--momo-color-success-subtle` | `#eaf9f4` | 成功底色 |
| `--momo-color-warning` | `#fa742b` | 业务警告 — 待处理/需关注 |
| `--momo-color-warning-antd` | `#faad14` | 标准 warning |
| `--momo-color-warning-subtle` | `#fff4e8` | 警告底色 |
| `--momo-color-danger` | `#ff4d4f` | 危险 — 删除/拒绝/错误 |
| `--momo-color-danger-antd` | `#f5222d` | 标准 danger |
| `--momo-color-danger-subtle` | `#fff0f0` | 危险底色 |
| `--momo-color-price` | `#f56c6c` | 价格/金额强调 |

**状态标签语义对（文字色 / 背景色）** — 用于 `UiStatusBadge` / `el-tag`

| 状态 | 文字色 token | 背景色 token |
|---|---|---|
| 已完成 | `--momo-color-status-done-text` `#16845f` | `--momo-color-status-done-bg` `#eaf9f4` |
| 待处理 | `--momo-color-status-pending-text` `#b75a0b` | `--momo-color-status-pending-bg` `#fff4e8` |
| 进行中 | `--momo-color-status-running-text` `#006ac6` | `--momo-color-status-running-bg` `#eaf6ff` |
| 已拒绝 | `--momo-color-status-rejected-text` `#c83b3d` | `--momo-color-status-rejected-bg` `#fff0f0` |
| 已取消 | `--momo-color-status-cancelled-text` `#68717d` | `--momo-color-status-cancelled-bg` `#f0f2f5` |

**表格专用**

| Token | 值 |
|---|---|
| `--momo-color-table-head-bg` | `#fafafa` 表头背景 |
| `--momo-color-table-head-border` | `#f0f0f0` 表头边框 |
| `--momo-color-table-head-text` | `#3d332e` 表头文字 |
| `--momo-color-table-row-hover` | `#e6f7ff` 行 hover |
| `--momo-color-table-row-selected` | `#e6f7ff` 行选中 |
| `--momo-color-table-row-zebra` | `#fbfcfd` 斑马纹 |

**表单控件**

| Token | 值 |
|---|---|
| `--momo-color-control-border` | `#d9d9d9` 默认边框 |
| `--momo-color-control-hover` | `#40a9ff` hover 边框 |
| `--momo-color-control-focus` | `#1890ff` focus 边框 + 蓝色聚焦环 |

**扩展强调色（分类/图表系列，禁止用于主操作）**

`--momo-color-accent-purple` `#722ed1` / `--momo-color-accent-magenta` `#c32bac` / `--momo-color-accent-cyan` `#00b0ff`

### 2.2 字体

字体栈（中文优先）：`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', ...`
默认行高 1.5。

| Token | 值 | 用途 |
|---|---|---|
| `--momo-font-size-xs` | `12px` | 辅助：状态标签、补充说明 |
| `--momo-font-size-sm` | `12px` | 兼容别名 |
| `--momo-font-size-md` | `13px` | 紧凑控件：搜索控件、Tab、信息格 |
| `--momo-font-size-base` | `14px` | 正文 |
| `--momo-font-size-lg` | `16px` | 弹窗标题 |
| `--momo-font-size-xl` | `18px` | 页面小标题 |
| `--momo-font-size-2xl` | `22px` | 页面标题 |
| `--momo-font-size-metric` | `30px` | 数据指标 |

### 2.3 间距（4px 基准）

`--momo-space-1` 4px / `2` 8px / `3` 12px / `4` 16px / **`5` 20px（表页垂直节奏）** / `6` 24px（页面外边距）/ `8` 32px

### 2.4 圆角（混合制）

| Token | 值 | 用途 |
|---|---|---|
| `--momo-radius-sm` | `4px` | 表单控件、查询/主操作按钮、分页 |
| `--momo-radius-image` | `6px` | 表格缩略图 |
| `--momo-radius-md` | `8px` | 信息格、附件、局部内容块 |
| `--momo-radius-lg` | `12px` | 详情分区、灰底列表 |
| `--momo-radius-xl` | `14px` | 表格/Tab 卡 |
| `--momo-radius-full` | `999px` | **胶囊：状态标签、Tab 指示条、操作区按钮** |

### 2.5 阴影

| Token | 值 | 用途 |
|---|---|---|
| `--momo-shadow-sm` | `0 2px 10px rgba(15,23,42,.04)` | 卡片静止 |
| `--momo-shadow-md` | `0 6px 20px rgba(15,23,42,.08)` | 卡片 hover |
| `--momo-shadow-lg` | `0 12px 40px rgba(15,23,42,.16)` | 浮层 |
| `--momo-shadow-brand` | `0 2px 8px rgba(24,144,255,.28)` | 蓝色强调按钮 |

### 2.6 控件尺寸

- 表页搜索控件高度：`--momo-control-height` = `32px`
- 常规筛选宽度：`--momo-control-filter-width` = `200px`；复杂筛选 `280px`；范围 `320px`
- 操作区按钮：高 `--momo-operator-btn-height` = `28px`，圆角胶囊 `999px`

---

## 3. 组件规则

### 3.1 按钮

- **每个操作区只保留 1 个主操作**（操作蓝 `#0088ff`）。删除/拒绝 = 危险语义 + 二次确认。取消/关闭 = 默认。
- 异步操作必须用 `loading` 态并阻止重复提交。
- 禁用用原生 `disabled`，不能仅靠颜色。
- **主操作/查询按钮**：矩形 `--momo-radius-sm` (4px)。
- **表格/列表操作区按钮**：胶囊 `--momo-radius-full` (999px)、高 28px（已在 `ep-overrides.css` 为 `.operator` 区域注入）。
- 图标按钮必须有 `title` / Tooltip / 无障碍名称。

### 3.2 搜索 / 筛选区

- 用 `el-form` + `el-form-item`；**label 外置且可见**（在控件旁），不要嵌入 input 或仅用 placeholder 替代。
- 控件：高 32px，圆角 4px，默认边框 `#d9d9d9`，hover `#40a9ff`，focus `#1890ff` + 浅聚焦环。
- 常规项宽 192–220px；长/范围/级联 260–320px。
- 操作 = 中文矩形按钮"查询 / 重置"；高 32px、圆角 4px；查询为主操作。
- 查询字段与参数映射保持不变；保留回车查询。

### 3.3 表格（el-table）

表头/hover/选中/边框色已通过 `ep-overrides.css` 注入 `el-table` token，自动生效。

- 列标题/对齐/单位一致；金额/数量列右对齐。
- 优先 `min-width` 而非刚性宽度；长文本省略但可查看。
- 空态/加载失败需反馈 + 恢复。
- 选择列仅在存在批量操作时出现。
- 分页用 `UiPagination`，页码规格限 `10 / 20 / 50 / 100 / 200`。
- 行内操作用语义色变体（查看/复制=蓝、编辑=黄、删除/拒绝=红），危险操作隔开 + 确认。

### 3.4 状态标签

- 用 `UiStatusBadge` 或 `el-tag`（effect="light"），其 type 已映射 DDB 语义色。
- 状态 = 文字 + 颜色（必要时加图标）。
- 避免仅靠红/绿区分多状态。

### 3.5 弹窗（el-dialog）

- 宽度分级：`--momo-dialog-xs/sm/md/lg/xl`。
- `PageLayout` 作为卡片容器外壳。
- 长内容：body 限高约 70vh，内部滚动。
- 关闭路径明确 + 未保存变更提示。

### 3.6 表单

- `el-form` 语义 + 校验；必填项显示必填标记；错误紧邻字段。
- 复杂字段用持久帮助文字（非仅 placeholder）；blur/提交时校验。
- 只读 vs 禁用视觉与语义都区分；长表单按业务分组；未保存变更警告。

### 3.7 反馈 / 空状态 / 图片预览

- 消息/对话框统一用 `useUiFeedback` 组合式（`src/composables/useUiFeedback.ts`），不直接 `ElMessage`/`ElMessageBox`。
- 空状态统一用 `UiEmptyState`。
- 图片预览统一用 `UiImagePreview` / `useImagePreview`，不自行实现。

---

## 4. 布局约定

- 侧边栏 `--momo-sidebar-width` 220px / 折叠 64px。
- 页面内边距 `--momo-page-padding` 24px。
- 卡片内边距 `--momo-card-padding` 24px，圆角 `--momo-card-radius` 14px。
- 表页垂直节奏：搜索↔操作↔表格区间距 `--momo-table-rhythm` 20px。

---

## 5. 图表（ECharts）

图表颜色在 JS 中消费，统一引用 `src/plugins/echartsPalette.ts`：

- 分类系列色 `CHART_COLORS`：blue `#0088ff` / green `#31c19e` / red `#ff4d4f` / orange `#fa742b` / purple `#722ed1` / teal `#00b0ff`。
- UI 中性灰 `CHART_NEUTRALS`：textPrimary / textSecondary / textTertiary / splitLine / axisLine / tooltipBorder。
- 复用 `tooltipBase` 与 `withAlpha(hex, alpha)`（避免手写 rgba 字面量）。
- 折线=趋势、柱状=对比；饼图 ≤5 类；图表须覆盖 loading/空/失败。

---

## 6. 工作流画布（vue-flow）

节点类型标识色（`src/modules/workflow/nodes/*/index.ts`）对齐 DDB 色系，按语义区分：

| 节点 | 色 | 语义 |
|---|---|---|
| 输入类（text-input / image-input） | `#0088ff` / `#31c19e` | 操作蓝 / 成功 |
| AI 处理（text-ai / image-ai） | `#722ed1` / `#c32bac` | 紫 / 品红强调 |
| 分割（prompt-splitter） | `#fa742b` | 警告 |
| 预览（text-preview / image-preview） | `#86909c` | 中性 |
| 保存（save） | `#31c19e` | 成功 |

端口数据类型标签色（text/image/any）经 token：brand / success / info。

---

## 7. 验收清单

- [ ] 页面所有颜色走 `--momo-*` token，无硬编码（图表除外，但需引用 `echartsPalette`）。
- [ ] CSS 变量统一用 `--momo-*`，不残留 `--tf-*` 别名引用。
- [ ] 每个操作区 ≤1 个主操作；危险操作红 + 二次确认。
- [ ] 表格经 token 自动生效表头/hover/选中色；分页页码限 `10/20/50/100/200`。
- [ ] 状态非仅靠颜色；空态用 `UiEmptyState`；反馈用 `useUiFeedback`。
- [ ] 弹窗宽度按分级；长内容内部滚动 + 未保存提示。
- [ ] 图表引用 `echartsPalette`，覆盖 loading/空/失败。
- [ ] 1366px 宽度下无重叠；`npm run build` 通过。

---

## 文档同步规则

Token 文件（`src/styles/tokens/`）是唯一权威源。若 token 改动，本文档 §2 与 `ep-overrides.css` 必须同步更新，不得只改色板显示。
