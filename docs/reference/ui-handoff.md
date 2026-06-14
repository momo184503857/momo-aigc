# UI 设计与模块化交接文档

本文档用于把当前对话中的 UI 设计上下文、已完成工作、未完成工作和后续执行建议交接给其他 AI 或开发者。

## 1. 用户目标

用户希望把当前由 AI 生成的前后端项目逐步提升为更现代、更专业、更可维护的 AI 生图工作台。

用户明确提出：

- 不只是让 AI “美化页面”，而是建立方法和规范。
- UI 应按三层理解：信息结构层、交互流程层、视觉表达层。
- 后续所有 AI 在本项目写前端代码时，都要遵循统一 UI 方案。
- 不希望每次都重新让 AI 临时生成 UI 代码，希望沉淀可复用的标准模块。
- 需要一个现代化 UI 方向，而不是只标准化当前 Element Plus 默认后台风格。

当前项目地址：`C:\code\momoAigc`

当前前端页面：`http://localhost:5173/#/workspace`

## 2. 当前项目技术栈

- Vue 3
- TypeScript
- Vite
- Element Plus
- Pinia
- Vue Router
- 后端 Express + SQLite

前端主要目录：

- `src/components`
- `src/views`
- `src/layouts`
- `src/styles`
- `src/composables`

现有工作台页面：

- `src/views/workspace/WorkspacePage.vue`
- `src/components/GenerationForm.vue`
- `src/components/FeatureForm.vue`
- `src/components/FeatureNav.vue`
- `src/components/TaskList.vue`

## 3. 已新增和调整的文档结构

用户要求重新整理 `docs` 目录，按类别拆分。

当前 docs 结构已调整为：

- `docs/requirements/prd.md`
- `docs/reference/ui-design-guidelines.md`
- `docs/reference/ui-module-library.md`
- `docs/reference/deployment.md`
- `docs/reference/handoff.md`
- `docs/reference/ui-handoff.md`
- `docs/reference/api-spec.md`
- `docs/reference/architecture.md`
- `docs/reference/database-schema.md`
- `docs/reference/test-plan.md`
- `docs/reference/runbook.md`

其中以下空文件是按用户要求创建的占位文件：

- `docs/reference/api-spec.md`
- `docs/reference/architecture.md`
- `docs/reference/database-schema.md`
- `docs/reference/test-plan.md`
- `docs/reference/runbook.md`

## 4. 已新增 AI 协作入口

新增文件：

- `AGENTS.md`

作用：

- 规定本项目 UI 修改必须遵循 `docs/reference/ui-design-guidelines.md`。
- 后续 AI 修改前端页面、组件、样式、文案、交互状态前，应先阅读 UI 规范。

注意：

- 如果其他 AI 不会自动读取 `AGENTS.md`，请在 prompt 中明确要求它先读取该文件和 `docs/reference/ui-design-guidelines.md`。

## 5. UI 规范文档现状

文件：

- `docs/reference/ui-design-guidelines.md`

该文档已经从原则文档升级为可执行设计规范，包含：

- 产品定位
- 三层设计方法
- 信息结构层执行标准
- 交互流程层执行标准
- 视觉表达层执行标准
- 字体、字号、行高、字重
- 颜色参数
- 间距参数
- 圆角参数
- 阴影参数
- 工作台具体设计标准
- 生成参数区案例
- 任务列表正确/错误案例
- 按钮、表单、状态标签、空状态标准
- AI 修改 UI 前后的检查清单

用户曾指出上一版问题：

- 缺少具体案例。
- 三层分层没有说明如何执行。
- 字体、颜色、圆角、阴影等参数不清楚。
- 信息结构层和交互流程层不够具体。
- 内容泛泛，缺少可操作细节。

当前版本已经基本满足这些点，但仍有不足：

- 尚未把视觉 token 同步到 `src/styles/tokens.css`。
- 尚未覆盖每个核心页面的单独规范。
- 尚未提供完整组件代码标准。
- 响应式断点策略还不够完整。
- 还缺 UI 改造路线图。

## 6. 已新增 UI 标准模块代码

用户要求检查前端组件，分析哪些可以模块化，并为可模块化组件创建标准模块代码文件。

已新增目录：

- `src/components/ui`

已新增模块：

- `src/components/ui/UiPagination.vue`
- `src/components/ui/UiStatusBadge.vue`
- `src/components/ui/UiImagePreviewTile.vue`
- `src/components/ui/UiEmptyState.vue`
- `src/components/ui/UiInlineNotice.vue`
- `src/components/ui/UiStatusBar.vue`
- `src/components/ui/index.ts`

已新增 composable：

- `src/composables/useUiFeedback.ts`

这些模块的目的：

- 统一分页器。
- 统一状态标签。
- 统一图片缩略图和 hover 预览。
- 统一空状态。
- 统一页面内警告提示。
- 统一状态栏。
- 统一成功、警告、错误消息和危险确认。

重要说明：

- 当前只是新增模块，还没有把现有页面替换为这些模块。
- 这是为了避免一次性重构影响业务。
- 后续 AI 可以逐步把现有页面迁移到这些标准模块。

构建验证：

- 执行过 `npm run build`
- 构建通过
- 只出现 chunk 体积较大的现有提示，不是新增模块导致的编译错误。

## 7. 可模块化组件分析

已记录在：

- `docs/reference/ui-module-library.md`

分析结果：

### 分页器

重复位置：

- `src/views/workspace/WorkspacePage.vue`
- `src/views/templates/TemplatesPage.vue`
- `src/views/results/ResultsPage.vue`
- `src/views/admin/AdminTasks.vue`

建议迁移：

- 使用 `UiPagination.vue`

### 状态展示

重复位置：

- `src/components/TaskList.vue`
- `src/components/TaskDetailDialog.vue`
- `src/views/admin/AdminTasks.vue`
- `src/views/admin/AdminUsers.vue`
- `src/views/admin/AdminStats.vue`

建议迁移：

- 使用 `UiStatusBadge.vue`

### 图片预览和缩略图

重复位置：

- `src/components/TaskList.vue`
- `src/views/results/ResultsPage.vue`
- `src/views/templates/TemplatesPage.vue`
- `src/components/TemplateSelector.vue`
- `src/components/ImageSlotUpload.vue`

建议迁移：

- 使用 `UiImagePreviewTile.vue`

### 空状态

重复位置：

- `src/components/TaskList.vue`
- `src/views/results/ResultsPage.vue`
- `src/views/templates/TemplatesPage.vue`
- `src/views/prompts/PromptLibraryPage.vue`
- `src/views/admin/AdminFeaturePrompts.vue`
- `src/components/TemplateSelector.vue`
- `src/components/GenerationForm.vue`

建议迁移：

- 使用 `UiEmptyState.vue`

### 错误、警告和消息提醒

重复位置：

- 多数页面直接使用 `ElMessage`、`ElMessageBox`

建议迁移：

- 使用 `useUiFeedback.ts`
- 页面内阻断提示使用 `UiInlineNotice.vue` 或 `UiStatusBar.vue`

### 按钮组和危险操作

当前问题：

- 多个页面直接暴露红色删除按钮。
- `TaskList.vue` 每条任务常驻多个按钮。
- 批量模式中存在多个 primary/danger 按钮。

后续建议新增：

- `UiActionMenu.vue`
- `UiDangerAction.vue`
- `UiBulkToolbar.vue`

## 8. 已参考的成熟设计系统

曾按用户要求联网搜索/参考市面成熟设计规范。

参考方向：

- Ant Design：后台、表单、表格、分页、反馈组件。
- Material Design 3：按钮层级、snackbar/message、dialog、progress 状态。
- Carbon Design System：企业工具、通知、分页、状态反馈。
- Apple Human Interface Guidelines：弹窗、危险确认、按钮文案。
- Element Plus：当前项目实际使用组件库，应保持实现兼容。

重要决策：

- 不直接引入 Ant Design、Material、Carbon 的代码。
- 继续使用 Element Plus。
- 只吸收它们的信息层级、反馈规则、危险操作确认、信息密度控制方法。

## 9. 已创建 HTML 预览文件

用户要求新建 `test` 文件夹，并创建 HTML 文件展示组件。

已新增：

- `test/ui-components-preview.html`

该文件展示：

- 按钮样式
- 状态栏
- 警告提示
- 状态标签
- 图片 hover 预览
- 任务卡片
- 翻页器
- 消息提醒
- 危险确认弹窗

用户反馈：

- 这个 HTML 预览和当前项目 UI 太像。
- 用户认为之前说过要更现代，但该预览只是标准化当前 Element Plus 后台风格。

判断：

- 用户反馈正确。
- `ui-components-preview.html` 是“标准化当前风格”，不是“现代化视觉方向稿”。

随后开始创建现代版方向稿：

- `test/ui-modern-preview.html`

该文件已在中途中断前创建完成，作用是展示更现代的 UI 方向：

- 更轻的导航。
- 更突出的图片结果。
- 更弱的任务 ID 和技术元信息。
- 更少的常驻按钮。
- 更现代的任务卡片。
- 更清晰的生成参数区和任务结果区。

注意：

- 本次对话被用户中断后，没有再做构建或视觉验收。
- 其他 AI 接手时应先打开 `test/ui-modern-preview.html` 看效果，再判断是否继续优化。

## 10. 当前用户偏好

用户偏好非常明确：

- 不要只给泛泛建议。
- 要方法，也要可落地的文档和代码模板。
- 希望后续 AI 有明确约束，不要每次随机发挥。
- 用户不满意“和原来很像”的 UI。
- 用户想要更现代的产品感，而不是普通 Element Plus 后台感。
- 用户能接受先做 HTML 方向稿，再转成 Vue 组件。

因此，其他 AI 接手时不要直接说“当前规范已经很好”，应继续推进现代化方向。

## 11. 后续建议执行顺序

建议下一位 AI 按以下顺序继续：

1. 打开并检查 `test/ui-modern-preview.html`
   - 确认现代版方向是否比当前项目更有产品感。
   - 检查是否和用户现有截图相比有明显升级。

2. 如果视觉方向可接受，更新文档
   - 在 `docs/reference/ui-design-guidelines.md` 中补充“现代版视觉方向”。
   - 在 `docs/reference/ui-module-library.md` 中补充现代版组件用法。

3. 把现代版 HTML 中的视觉 token 提炼到文档
   - brand 色
   - surface 色
   - border 色
   - badge 风格
   - task card 风格
   - layout 宽度

4. 再开始迁移 Vue 代码
   - 先迁移低风险模块：分页器、空状态、状态标签。
   - 再迁移图片预览。
   - 最后改工作台布局和任务卡片。

5. 每次迁移后运行：

```bash
npm run build
```

6. 如需视觉验证，启动：

```bash
npm run dev
```

然后在浏览器查看：

```text
http://localhost:5173/#/workspace
```

## 12. 重要文件清单

必须阅读：

- `AGENTS.md`
- `docs/reference/ui-design-guidelines.md`
- `docs/reference/ui-module-library.md`
- `docs/reference/ui-handoff.md`

UI 标准模块：

- `src/components/ui/UiPagination.vue`
- `src/components/ui/UiStatusBadge.vue`
- `src/components/ui/UiImagePreviewTile.vue`
- `src/components/ui/UiEmptyState.vue`
- `src/components/ui/UiInlineNotice.vue`
- `src/components/ui/UiStatusBar.vue`
- `src/composables/useUiFeedback.ts`

预览文件：

- `test/ui-components-preview.html`
- `test/ui-modern-preview.html`

重点待改页面/组件：

- `src/views/workspace/WorkspacePage.vue`
- `src/components/TaskList.vue`
- `src/components/GenerationForm.vue`
- `src/components/FeatureForm.vue`
- `src/components/FeatureNav.vue`

## 13. 当前 Git 状态提示

当前已有较多新增/移动文件。

历史上 docs 目录曾从：

- `docs/requirements/prd.md`
- `docs/reference/handoff.md`
- `docs/reference/deployment.md`

移动到：

- `docs/requirements/prd.md`
- `docs/reference/handoff.md`
- `docs/reference/deployment.md`

因此 git status 中可能显示旧文件删除和新目录新增，这是预期的目录重组结果。

本交接文档创建时，没有执行 git commit。

## 14. 给下一个 AI 的关键提醒

不要把“标准化当前 Element Plus 风格”误认为“现代化 UI”。

当前用户真正想要的是：

- 先有现代化方向稿。
- 再沉淀为标准模块。
- 再逐步迁移真实 Vue 页面。

请优先处理 `test/ui-modern-preview.html`，而不是继续打磨 `test/ui-components-preview.html`。

在修改真实页面前，先让用户确认现代版方向是否满意。
