# 生图参数与提交面板统一规范

## 目标与范围

以自由生图的 `DsParameterPanel` 为唯一公共视觉容器，将模型、画面比例、生成数量或任务数、分辨率以及主提交按钮组合在同一面板。适用于自由生图、快速生图、AI 摄影、三种批量换图、批量表格和买家秀；AI 画布不迁移。

## 组件契约

- `DsParameterPanel` 负责面板、响应式参数网格和全宽主按钮；业务页通过插槽提供字段，传入按钮文案、禁用、忙碌状态与提示，并监听 `submit`。
- 字段的可选值、校验、价格、任务数量和提交实现仍由原业务页负责。没有“生成张数”选择的批量页显示只读任务数。
- 按钮忙碌时不得重复提交；批量页保留进度和解释性信息；批量表格在生成阶段保持原有进度与下载操作。
- 主题颜色和圆角继续由 `src/components/design-system/theme.css` 控制，页面不得另建一套参数面板样式。

## 实施位置与命令

项目使用 Vue 3、TypeScript 与 Vite。公共实现位于 `src/components/design-system/composites/DsParameterPanel.vue` 与 `DsActionBar.vue`，样式位于 `src/components/design-system/theme.css`；业务页仅组合字段与处理事件。用 `npm run check:ui` 检查公共组件约束，`npm run test:ui` 验证主题与登记，`npm run build` 完成类型与生产构建。

字段沿用项目的 `ds-parameter` 结构，例如：

```vue
<DsParameterPanel :label="generateButtonLabel" :disabled="!canGenerate" @submit="handleGenerate">
  <div class="ds-parameter"><span class="ds-caption">模型</span><ModelChannelSelect v-model="selectedModelId" /></div>
</DsParameterPanel>
```

仅修改视图组合与公共面板表现；不改后端 API、扣费、任务状态机、生成参数取值或自动化提交规则。用户现有的未提交改动和设计图目录保持原样。

## 验收

1. 除 AI 画布外，每个生图入口的参数和主生成按钮同处 `DsParameterPanel`。
2. 各入口仍使用原来的模型、分辨率、比例、数量、定价和提交处理函数。
3. 按钮禁用、加载、批量进度及买家秀下载操作仍可用。
4. `npm run check:ui`、`npm run test:ui`、`npm run build` 通过，并在浏览器检查代表性页面与关键交互。
