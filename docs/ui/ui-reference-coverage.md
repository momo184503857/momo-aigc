# 组件覆盖扩充（参考 DDB 组件预览）

参考：`/Users/momo/code/doubar/ddb_admin/momo/standards/UI_DESIGN_SYSTEM_PREVIEW.html`。
参考文件标题标注「67 组、14 类」，它是静态 HTML 演示而非 Vue 组件接口定义。本次参考功能形态、分类和交互能力；**不复制 CSS、不引入 Ant 依赖，也不宣称与 Ant API 完全兼容**。

本项目清单从 53 项扩展到 82 项。新增 29 个可导出的公共组件，均有 props/emits 类型、真实示例和清单登记。14 个功能分类支持跨基础/组合/扩展查找。

| 分类 | 本次补充/现有对应 |
|---|---|
| 基础元素 | DsLink；已有 Button、Badge、Lucide 图标 |
| 筛选搜索 | DsFilterChips、DsSearch |
| 表单输入 | DsForm（必填验证与 invalid/submit）、DsRate |
| 选择器 | DsAutoComplete、DsCascader、DsTreeSelect、DsDatePicker、DsTimePicker、DsColorPicker |
| 上传文件 | DsFileItem；已有 DsUpload |
| 列表卡片 | DsList、DsDescriptions、DsStatistic、DsQuote |
| 标识切换 | 已有 Avatar、Badge、Tabs、ToggleGroup、Collapsible |
| 层级结构 | DsTimeline、DsTree |
| 媒体图表 | DsVideo、DsCarousel、DsChat、DsChart；已有图片预览 |
| 弹窗抽屉 | DsPopconfirm；已有 Dialog、Sheet、AlertDialog |
| 气泡提示 | 已有 Popover、Tooltip、HoverCard |
| 消息通知 | DsNotification；已有 Alert、Toast |
| 加载状态 | DsResult；已有 Empty、Skeleton、Spinner、Progress |
| 导航 | DsSteps、DsAnchor、DsBackTop、DsSkipLink；已有菜单/面包屑/分页 |

## 接口原则

- 控件使用 modelValue/update:modelValue；动作使用 select/change/submit/confirm 等事件。
- 数据项使用稳定 id/value，而非用显示文本作为业务标识。
- 树节点：`{id,label,disabled?,children?}`；级联值为完整路径 `string[]`，改变父级清除旧子路径。
- 日期为 YYYY-MM-DD，时间为 HH:mm（支持 step），颜色为 hex 字符串。日期/时间/颜色底层使用浏览器原生选择面板，外壳沿用公共 Input。
- 表单提供简单字段级必填验证；复杂业务验证仍由业务层负责，不等同于完整 schema 表单引擎。
- 图表为轻量柱形/折线，支持 loading/empty/error，保留可读数据列表。不是 ECharts 全功能封装。
- 树是可展开嵌套列表及可聚焦按钮，不宣称实现完整 ARIA Tree 的方向键导航。
- 视频示例无远程媒体来源，只展示空态；播放器支持 src/poster/captions 和 play/pause/error，实际媒体播放尚未验收。
- 锚点阻止默认 hash 导航，不影响应用 hash router；回顶可传入滚动容器，默认查找最近滚动祖先。

## 验证

生产构建、规范检查通过。浏览器使用模拟 API 验证：评分、必填错误与提交、两级级联、自动完成选择、聊天发送、气泡确认、柱形/折线切换，以及原有明暗、权限、浮层和响应式回归。
没有调用付费模型或更改真实业务数据。旧页面不迁移，继续处于第一阶段展厅验收。
