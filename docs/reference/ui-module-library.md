# 公共 UI 模块库

当前规范见 [UI 设计规范](../ui/ui-design-guidelines.md)。旧的 UiStatusBadge / UiImagePreviewTile / Element Plus 模式不再用于新功能。

## 查看真实组件

管理员菜单「UI 组件库」提供设计基础、基础组件、公共组合、页面模式。登记清单位于 `src/components/design-system/registry.json`，组件源码位于同目录。

基础族涵盖按钮、输入、选择、数字、日期、表格、分页、导航、徽标、空态、加载、菜单、对话框、抽屉、提示、图片预览。
公共组合包含 DsPage、DsSection、DsField、DsToolbar、DsUpload、DsImageCard、DsTaskCard、DsStatus、DsActionBar、DsNotice、DsNode。
生成参数与表格状态由基础组件和组合组件示例组合，不为每一种业务模型建立专用外观。

## 使用示例

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { DsThemeProvider, DsField, Input, DsActionBar } from '@/components/design-system'
const name = ref('')
const saving = ref(false)
</script>
<template>
  <DsThemeProvider mode="light">
    <DsField v-slot="field" label="名称" required>
      <Input :id="field.id" v-model="name" :aria-describedby="field.describedby" :aria-invalid="field.invalid" />
    </DsField>
    <DsActionBar label="保存" :busy="saving" :disabled="!name" />
  </DsThemeProvider>
</template>
```

业务页面只负责逻辑、数据和外层布局。不允许深层 CSS 覆盖、硬编码品牌色、自己重做按钮或对话框。新增能力先进入公共库并登记，再引用。

## 兼容边界

第一阶段旧 `components/ui` 与旧业务页面保持原状；新库仅在展厅使用，等待验收。
原生 file input 在 DsUpload 内是明确的底层例外，页面不得直接复制实现。
