# 批量模特图换衣服 — 实现计划

## 概述

在 AI 工具箱中新增「批量模特图换衣服」工具页面。与生图工作台的单次换衣服不同，此工具支持上传多张模特图 + 1 张衣服图，自动组合成多个任务批量提交。

## 改动文件

### 1. `src/views/tools/ToolboxPage.vue` — 添加工具卡片

在 `tools` 数组中新增一个条目：
```ts
{
  id: 'batch-clothes-swap',
  title: '批量换衣服',
  description: '上传多张模特图和一张衣服图，批量生成换装效果图',
  icon: MagicStick,
}
```
卡片点击跳转到 `/toolbox/batch-clothes-swap`。

### 2. `src/router/index.ts` — 添加路由

```ts
{
  path: '/toolbox/batch-clothes-swap',
  name: 'BatchClothesSwap',
  component: () => import('@/views/tools/BatchClothesSwapPage.vue'),
  meta: { title: '批量换衣服', requiresAuth: true },
}
```

### 3. `src/views/tools/BatchClothesSwapPage.vue` — 新建页面（核心）

页面结构与 `FeatureForm.vue`（换衣服功能）类似，使用 `PageLayout` 包裹：

**表单区域：**
- **模特图上传**：使用 `ImageSlotUpload` 组件，`maxCount` 设为 20（支持多张）
- **衣服图上传**：使用 `ImageSlotUpload` 组件，`maxCount` 设为 1
- **补充提示词**：`el-input` textarea，复用 `change-clothes` 的 feature prompt 配置
- **模型选择**：`el-select`，复用 `MODELS` 列表
- **分辨率**：`el-radio-group`
- **宽高比**：`el-select`

**生成按钮：**
- 显示单次价格（与 FeatureForm 一致）
- 点击后弹出确认对话框（`ElMessageBox.confirm`）：
  - 显示：模特图数量 × 1 = 任务数
  - 显示：任务数 × 单价 = 总积分
  - 确认 / 取消

**任务提交逻辑：**
- 遍历每张模特图，与衣服图组合为一个任务
- 每个任务调用 `toapisClient.createTask()` + `taskApi.create()`
- 任务间间隔 3 秒（`await sleep(3000)`）
- 任务提交后触发全局任务列表刷新（通过 `window.dispatchEvent(new CustomEvent('canvas:task-created'))`）
- 遇到积分不足（402）时停止后续提交

### 4. `src/configs/featureConfig.ts` — 无需修改

批量换衣服的 prompt 直接复用 `change-clothes` 的 feature prompt，通过 `featurePromptApi.get('change-clothes')` 获取。配置保持不变。

## 复用的现有模块

| 模块 | 用途 |
|------|------|
| `PageLayout` | 页面布局 |
| `ImageSlotUpload` | 图片上传组件 |
| `featurePromptApi` | 获取换衣服提示词 |
| `toapisClient` | 上传图片 + 创建任务 |
| `taskApi` | 保存任务记录到数据库 |
| `pointsApi` | 查询积分余额 |
| `useUiFeedback` | 消息提示 |
| `MODELS / getPrice` | 模型列表和价格计算 |

## 任务提交流程

```
用户点击生成
  → 弹窗确认（N 个任务，共 X 积分）
  → 用户确认
  → 上传衣服图到 ToAPIs（如果未上传）
  → for each 模特图:
      1. 上传模特图到 ToAPIs
      2. toapisClient.createTask(model+garment URLs)
      3. taskApi.create(..., points 扣除)
      4. 触发 canvas:task-created 事件
      5. sleep(3000)
  → 完成提示
```
