# 任务列表双视图

## 目标与验收

- 将自由生图工作台的“创作结果”缩略图列表作为全局任务面板的“新版任务列表”，默认选中。
- 任务面板顶部提供“新版 / 旧版”切换；旧版原有筛选、批量操作、列表和网格视图保留。
- 新版显示当前账号的全部生图任务，保留预览、下载、重新编辑和详情操作，并支持加载更多。
- 每个账号在当前浏览器记住最后一次选择，重新登录后恢复；从未选择的账号默认新版。
- 自由生图页面只保留生成表单，不重复显示结果列表；任务面板的并排、浮动和收起行为保持可用。

## 技术与范围

- Vue 3、Pinia、TypeScript，复用现有 `DsImageCard`、`DsResultGroup` 与任务 API。
- `src/components/TaskPanel.vue` 负责切换；`src/components/TaskResultsList.vue` 负责新版内容；`src/stores/taskPanel.ts` 保存按账号区分的视图偏好；`src/views/free-gen/FreeGenPage.vue` 调整页面布局。
- 不变更任务表结构和生成接口，不新增第三方依赖。沿用现有组件命名与 CSS 变量，例如 `const selectedView = computed(() => taskPanel.listView)`。

## 验证

- 执行 `npm run check`、`npm run build` 和 `git diff --check`。
- 在浏览器确认首次为新版、切换到旧版再切回、面板开关、自由生图单列表单布局，以及重新登录后的选择恢复。
- 真实生成、删除和扣费操作不作为界面验收的一部分。
