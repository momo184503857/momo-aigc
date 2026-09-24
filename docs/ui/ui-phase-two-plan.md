# 第二阶段：全站公共组件迁移与创作工作台重整

## 当前交付边界

2026-09-24 用户认可第一阶段组件库（含窄容器分页修复）。本批执行 A：基线和清单，以及 B：全局框架与自由生图样板。验证记录见 [样板验收](ui-phase-two-acceptance.md)。**等待用户确认样板后，才能进入 C 的连续迁移**。不提交、不推送、不部署。

原工作区的第一阶段修改及未跟踪文件已保留。第一阶段规范基线为 1009 项，副本在 `evidence/phase-two/baseline-findings.json`；后续仅允许删除已解决条目，不扩大豁免。

## 已锁定方案

- 创作工作台：自由生图、快速生图、AI摄影、AI买家秀、批量工具使用工作台模式栏，保留各自网址和业务表单。
- AI画布独立；资源中心展开模板/提示词/主题/作品；提示词助手展开工坊/专家/成套提示词；生图记录进入原结果页。
- 账号菜单保留设置、额度、消耗、计费说明；外观支持浅色/深色及舒适/紧凑，默认浅色舒适，在浏览器持久化。
- 管理端分为用户与运行、内容与素材、系统与规范；两个后台入口共用配置与组件。
- 自由生图保留素材、描述、参数三容器和右侧批次结果，每批最多四张可视，更多横向滚动。
- 公共展示组件不访问业务接口；新增能力先进入公共库及展厅，页面只组合与处理业务。
- 接口、计费、权限、上传、轮询和生成编排不变。原型和历史静态预览不迁移。

## 实施批次

| 批次 | 内容 | 当前状态 |
|---|---|---|
| A | 路由/依赖/弹窗清单、初始基线与截图 | 已记录 |
| B | 主题、消息/浮层、导航、页签、全局任务与帮助、自由生图 | 本次样板；验收后再继续 |
| C1 | 快速生图、摄影、买家秀、全部批量工具 | 待样板确认 |
| C2 | 模板、提示词、主题、作品及详情、生图记录 | 待样板确认 |
| C3 | 提示词工坊、专家、成套提示词 | 待样板确认 |
| C4 | 登录注册找回密码、个人设置、额度、消耗、计费说明 | 待样板确认 |
| C5 | 全部后台业务页面、双入口 | 待样板确认 |
| C6 | 画布项目、编辑器、节点、面板和弹窗 | 待样板确认 |
| D | 清理旧组件与主题、移除兼容层、完整回归 | 待所有批次完成 |

## 兼容与接口

- `src/configs/navigation.ts` 为导航名称、图标和页签元信息来源；旧 hash URL 不变。
- `ApplicationTheme` 每个应用实例仅一个，消息使用 `momo-application` 宿主；组件展厅使用独立 Provider，不写应用偏好。
- `momo_ui_appearance_v1` 保存 mode/density，非法值回退 light/comfortable；同源浏览器标签页同步。
- 未迁移内容使用 `.legacy-surface`，保留临时旧变量；共享弹窗已使用新公共浮层及应用主题。兼容层不是最终双体系。
- `useUiFeedback`、confirmDialog、promptDialog 取消及返回语义保持不变。
- 新增 DsStudio、DsParameterPanel、DsResultGroup、DsReferenceImage；扩充 DsUpload(tile/multiple/label)、DsImageCard(externalPreview/statusLabel/progress/preview)、DsActionBar(fullWidth)，旧调用默认行为保留。
- 原生绘图控件、富文本帮助与第三方引擎适配仍需在后续收敛时逐项清理，不能把全局共享控件接入理解为存量检查全部归零。

## 路由清单

逐路由完整业务依赖及弹窗清单见 `ui-phase-two-inventory.json`（静态 import 递归，不枚举第三方包和公共组件内部文件）。表中的待迁移是业务页面主体；全局壳子在本批更新。

| 入口 | 地址 | 页面 | 状态 |
|---|---|---|---|
| 用户端/内嵌后台 | `/login` | `src/views/login/LoginPage.vue` | 页面待迁移；全局框架已接入 |
| 用户端/内嵌后台 | `/register` | `src/views/login/RegisterPage.vue` | 页面待迁移；全局框架已接入 |
| 用户端/内嵌后台 | `/forgot-password` | `src/views/login/ForgotPasswordPage.vue` | 页面待迁移；全局框架已接入 |
| 用户端/内嵌后台 | `/free-gen` | `src/views/free-gen/FreeGenPage.vue` | 样板待验收 |
| 用户端/内嵌后台 | `/workspace` | `src/views/workspace/WorkspacePage.vue` | 页面待迁移；全局框架已接入 |
| 用户端/内嵌后台 | `/templates` | `src/views/templates/TemplatesPage.vue` | 页面待迁移；全局框架已接入 |
| 用户端/内嵌后台 | `/results` | `src/views/results/ResultsPage.vue` | 页面待迁移；全局框架已接入 |
| 用户端/内嵌后台 | `/prompts` | `src/views/prompts/PromptLibraryPage.vue` | 页面待迁移；全局框架已接入 |
| 用户端/内嵌后台 | `/prompt-workshop` | `src/views/prompt-workshop/PromptWorkshopPage.vue` | 页面待迁移；全局框架已接入 |
| 用户端/内嵌后台 | `/canvas-projects` | `src/views/canvas/ProjectsPage.vue` | 页面待迁移；全局框架已接入 |
| 用户端/内嵌后台 | `/photography` | `src/views/photography/PhotographyPage.vue` | 页面待迁移；全局框架已接入 |
| 用户端/内嵌后台 | `/suite-prompt` | `src/views/suite-gen/SuitePromptPage.vue` | 页面待迁移；全局框架已接入 |
| 用户端/内嵌后台 | `/expert` | `src/views/expert/ExpertPage.vue` | 页面待迁移；全局框架已接入 |
| 用户端/内嵌后台 | `/themes` | `src/views/themes/ThemeLibraryPage.vue` | 页面待迁移；全局框架已接入 |
| 用户端/内嵌后台 | `/toolbox` | `src/views/tools/ToolboxPage.vue` | 页面待迁移；全局框架已接入 |
| 用户端/内嵌后台 | `/buyer-show` | `src/views/buyer-show/BuyerShowPage.vue` | 页面待迁移；全局框架已接入 |
| 用户端/内嵌后台 | `/works` | `src/views/works/WorksGalleryPage.vue` | 页面待迁移；全局框架已接入 |
| 用户端/内嵌后台 | `/works/:id` | `src/views/works/WorkDetailPage.vue` | 页面待迁移；全局框架已接入 |
| 用户端/内嵌后台 | `/settings` | `src/views/user/UserSettingsPage.vue` | 页面待迁移；全局框架已接入 |
| 用户端/内嵌后台 | `/my-quota` | `src/views/user/MyQuotaPage.vue` | 页面待迁移；全局框架已接入 |
| 用户端/内嵌后台 | `/my-consumption` | `src/views/user/MyConsumptionPage.vue` | 页面待迁移；全局框架已接入 |
| 用户端/内嵌后台 | `/pricing` | `src/views/user/PricingPage.vue` | 页面待迁移；全局框架已接入 |
| 用户端/内嵌后台 | `/toolbox/batch-clothes-swap` | `src/views/tools/BatchClothesSwapPage.vue` | 页面待迁移；全局框架已接入 |
| 用户端/内嵌后台 | `/toolbox/batch-pose-swap` | `src/views/tools/BatchPoseSwapPage.vue` | 页面待迁移；全局框架已接入 |
| 用户端/内嵌后台 | `/toolbox/batch-spreadsheet` | `src/views/tools/BatchSpreadsheetPage.vue` | 页面待迁移；全局框架已接入 |
| 用户端/内嵌后台 | `/toolbox/batch-face-swap` | `src/views/tools/BatchFaceSwapPage.vue` | 页面待迁移；全局框架已接入 |
| 用户端/内嵌后台 | `/ai-canvas/:projectId` | `src/views/canvas/AICanvasPage.vue` | 页面待迁移；全局框架已接入 |
| 用户端/内嵌后台 | `/admin/ui-components` | `src/views/admin/AdminUiComponents.vue` | 组件展厅 |
| 用户端/内嵌后台 | `/admin/users` | `src/views/admin/AdminUsers.vue` | 页面待迁移；全局框架已接入 |
| 用户端/内嵌后台 | `/admin/dashboard` | `src/views/admin/AdminDashboard.vue` | 页面待迁移；全局框架已接入 |
| 用户端/内嵌后台 | `/admin/templates` | `src/views/admin/AdminTemplates.vue` | 页面待迁移；全局框架已接入 |
| 用户端/内嵌后台 | `/admin/feature-prompts` | `src/views/admin/AdminFeaturePrompts.vue` | 页面待迁移；全局框架已接入 |
| 用户端/内嵌后台 | `/admin/photography` | `src/views/admin/AdminPhotography.vue` | 页面待迁移；全局框架已接入 |
| 用户端/内嵌后台 | `/admin/works` | `src/views/admin/AdminWorks.vue` | 页面待迁移；全局框架已接入 |
| 用户端/内嵌后台 | `/admin/prompt-cases` | `src/views/admin/AdminPromptCases.vue` | 页面待迁移；全局框架已接入 |
| 用户端/内嵌后台 | `/admin/prompt-modules` | `src/views/admin/AdminPromptModules.vue` | 页面待迁移；全局框架已接入 |
| 用户端/内嵌后台 | `/admin/sg-assets` | `src/views/admin/AdminSuiteAssets.vue` | 页面待迁移；全局框架已接入 |
| 用户端/内嵌后台 | `/admin/ai-config` | `src/views/admin/AdminAiConfig.vue` | 页面待迁移；全局框架已接入 |
| 独立后台 | `/login` | `src/admin/views/AdminLoginPage.vue` | 页面待迁移；全局框架已接入 |
| 独立后台 | `/ui-components` | `src/views/admin/AdminUiComponents.vue` | 组件展厅 |
| 独立后台 | `/users` | `src/views/admin/AdminUsers.vue` | 页面待迁移；全局框架已接入 |
| 独立后台 | `/dashboard` | `src/views/admin/AdminDashboard.vue` | 页面待迁移；全局框架已接入 |
| 独立后台 | `/templates` | `src/views/admin/AdminTemplates.vue` | 页面待迁移；全局框架已接入 |
| 独立后台 | `/feature-prompts` | `src/views/admin/AdminFeaturePrompts.vue` | 页面待迁移；全局框架已接入 |
| 独立后台 | `/photography` | `src/views/admin/AdminPhotography.vue` | 页面待迁移；全局框架已接入 |
| 独立后台 | `/works` | `src/views/admin/AdminWorks.vue` | 页面待迁移；全局框架已接入 |
| 独立后台 | `/prompt-cases` | `src/views/admin/AdminPromptCases.vue` | 页面待迁移；全局框架已接入 |
| 独立后台 | `/prompt-modules` | `src/views/admin/AdminPromptModules.vue` | 页面待迁移；全局框架已接入 |
| 独立后台 | `/sg-assets` | `src/views/admin/AdminSuiteAssets.vue` | 页面待迁移；全局框架已接入 |
| 独立后台 | `/ai-config` | `src/views/admin/AdminAiConfig.vue` | 页面待迁移；全局框架已接入 |

## 兼容网址补充

原 `/` 进入自由生图；`/suite-gen` 继续重定向至成套提示词；`/admin`、旧任务/统计/积分管理地址保留原重定向。独立后台继续支持 `/admin/*` 别名，不修改外部书签。

## 验收标准

每批执行 npm run check、npm run check:ui、npm run test:ui、npm run build，并做浏览器回归。样板脚本为 scripts/test-ui-phase-two.cjs，全部 API 拦截，不访问付费服务。真实登录/数据读取单独记录，不把模拟请求当成真实生图验证。

覆盖导航与旧链接、缓存与返回、两个后台入口与权限、明暗/密度与偏好、真实文件选择事件、参数选择/复用、图片预览/下载/分页、任务与错误状态、320/768/1024/1440px 布局、键盘焦点与 Escape。

正式迁移全部完成的标准：正式代码无旧组件依赖；旧主题和兼容层清除；存量违规归零或仅剩有说明且精确定位的底层例外；每条正式路由有验证记录。样板阶段不宣称达到该标准。
