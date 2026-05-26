# UI 标准模块库方案

本文档说明本项目已经沉淀的标准 UI 模块，以及后续哪些页面/组件应逐步迁移复用这些模块。

## 1. 参考设计系统

本项目继续使用 Vue 3 + Element Plus 作为实现基础，设计方法参考以下成熟设计系统：

- Ant Design：适合作为后台、表单、表格、分页、反馈组件的参考。
- Material Design：适合作为按钮层级、snackbar/message、dialog、progress 状态的参考。
- Carbon Design System：适合作为企业级工具、通知、分页、状态反馈的参考。
- Apple Human Interface Guidelines：适合作为弹窗、危险确认、按钮文案的参考。

本项目不直接引入这些设计系统的代码，避免和 Element Plus 混用造成风格冲突。只吸收其组件分层、反馈规则、危险操作确认和信息密度控制方法。

## 2. 已建立的标准模块

标准模块目录：`src/components/ui`

| 模块 | 文件 | 解决的问题 |
| --- | --- | --- |
| 分页器 | `UiPagination.vue` | 统一分页位置、layout、页码数量、空数据隐藏逻辑 |
| 状态徽标 | `UiStatusBadge.vue` | 统一任务状态、用户状态的中文文案和颜色 |
| 图片预览块 | `UiImagePreviewTile.vue` | 统一缩略图、生成中、空图、hover 查看大图效果 |
| 空状态 | `UiEmptyState.vue` | 统一空数据说明，避免只写“暂无数据” |
| 行内提示 | `UiInlineNotice.vue` | 统一 API Key 缺失、加载失败等页面内提示 |
| 状态栏 | `UiStatusBar.vue` | 统一批量模式、生成条件、页面级状态说明 |
| 反馈 composable | `useUiFeedback.ts` | 统一成功/警告/错误消息和危险确认弹窗 |

统一导出文件：`src/components/ui/index.ts`

## 3. 可模块化组件分析

### 3.1 分页器

当前重复位置：

- `src/views/workspace/WorkspacePage.vue`
- `src/views/templates/TemplatesPage.vue`
- `src/views/results/ResultsPage.vue`
- `src/views/admin/AdminTasks.vue`

迁移目标：

- 统一替换为 `UiPagination`。
- 分页器统一放在列表底部右侧。
- 批量模式下隐藏分页。

### 3.2 状态展示

当前重复位置：

- `src/components/TaskList.vue`
- `src/components/TaskDetailDialog.vue`
- `src/views/admin/AdminTasks.vue`
- `src/views/admin/AdminUsers.vue`
- `src/views/admin/AdminStats.vue`

迁移目标：

- 任务状态统一使用 `UiStatusBadge`。
- 用户状态也可复用 `UiStatusBadge` 的 `active/disabled` 映射。
- 不再在页面中临时写 `status === 'completed' ? 'success' : ...`。

### 3.3 图片预览和缩略图

当前重复位置：

- `src/components/TaskList.vue`
- `src/views/results/ResultsPage.vue`
- `src/views/templates/TemplatesPage.vue`
- `src/components/TemplateSelector.vue`
- `src/components/ImageSlotUpload.vue`

迁移目标：

- 结果图、模板图、选择图统一使用 `UiImagePreviewTile`。
- hover 统一显示查看大图反馈。
- loading、empty、selected 状态统一。

### 3.4 空状态

当前重复位置：

- `src/components/TaskList.vue`
- `src/views/results/ResultsPage.vue`
- `src/views/templates/TemplatesPage.vue`
- `src/views/prompts/PromptLibraryPage.vue`
- `src/views/admin/AdminFeaturePrompts.vue`
- `src/components/TemplateSelector.vue`
- `src/components/GenerationForm.vue`

迁移目标：

- 统一使用 `UiEmptyState`。
- 空状态必须说明：当前没有什么、为什么、下一步做什么。

### 3.5 错误、警告和消息提醒

当前重复位置：

- 多数页面直接使用 `ElMessage` 和 `ElMessageBox`。
- API Key 缺失、生成失败、删除确认、上传失败等写法不统一。

迁移目标：

- 普通成功/警告/错误消息通过 `useUiFeedback`。
- 删除、禁用、清空等危险动作通过 `confirmDanger`。
- 页面内阻断提示用 `UiInlineNotice` 或 `UiStatusBar`，不要全部弹 message。

### 3.6 按钮组和危险操作

当前重复位置：

- `TaskList.vue` 每条任务常驻多个按钮。
- `ResultsPage.vue` 批量操作存在多个 primary/danger。
- 图库、提示词库、管理员页面直接暴露红色删除按钮。

迁移目标：

- 主按钮只保留一个。
- 次要操作使用普通按钮或更多菜单。
- 删除默认放入更多菜单或危险确认流程。
- 后续可新增 `UiActionMenu.vue` 或 `UiDangerAction.vue` 抽象更多菜单和危险操作。

## 4. 使用示例

### 分页器

```vue
<UiPagination
  v-model:current-page="page"
  v-model:page-size="pageSize"
  :total="total"
  @current-change="loadList"
  @size-change="handlePageSizeChange"
/>
```

### 状态徽标

```vue
<UiStatusBadge
  :status="task.status"
  :detail="task.status === 'failed' ? task.error_message : durationText"
/>
```

### 图片预览

```vue
<UiImagePreviewTile
  :src="task.result_image_urls?.[0]"
  :loading="task.status === 'in_progress'"
  @preview="showCompare(index)"
/>
```

### 空状态

```vue
<UiEmptyState
  title="暂无生成任务"
  description="填写左侧参数并点击生成后，任务会显示在这里。"
/>
```

### 危险确认

```ts
const feedback = useUiFeedback()

await feedback.confirmDanger({
  title: '确认删除',
  message: '确定要删除该任务记录吗？',
  confirmText: '删除',
})
```

## 5. 后续落地顺序

建议按风险从低到高逐步替换：

1. `UiPagination`：先替换分页器，风险最低。
2. `UiEmptyState` 和 `UiInlineNotice`：统一空状态和页面内提示。
3. `UiStatusBadge`：统一状态展示。
4. `useUiFeedback`：统一消息提醒和危险确认。
5. `UiImagePreviewTile`：替换图片缩略图和 hover 预览。
6. 再评估是否新增 `UiActionMenu`、`UiDangerAction`、`UiBulkToolbar`。

迁移时每次只改一类模式，避免一次性重构影响工作台业务流程。
