# 批量传表格做图 — 实现计划

## 概述

在 AI 工具箱中新增「批量传表格做图」功能。用户上传 xlsx 表格（含文件名、提示词、图片链接），预览并选择任务后批量提交生图。

## 依赖

需新增 npm 包：`xlsx`（SheetJS）— 用于读写 xlsx 文件。

## 改动文件

### 1. 安装依赖
```bash
npm install xlsx
```

### 2. `src/views/tools/ToolboxPage.vue` — 添加工具卡片
在 tools 数组中新增条目，id 为 `batch-spreadsheet`，点击跳转 `/toolbox/batch-spreadsheet`。

### 3. `src/router/index.ts` — 添加路由
`/toolbox/batch-spreadsheet` → `BatchSpreadsheetPage.vue`

### 4. `src/views/tools/BatchSpreadsheetPage.vue` — 新建页面（核心）

页面分为三个阶段，通过 `step` 状态切换：

#### 阶段一：上传表格
- 「下载模板」按钮：用 `xlsx` 库生成一个 xlsx 文件，表头为 `文件名 | 提示词 | 图片链接`，含一行示例数据，浏览器直接下载
- 「上传表格」按钮：`<input type="file" accept=".xlsx,.xls">`，用 `xlsx` 库解析
- 解析后校验：必须有 `文件名`、`提示词`、`图片链接` 三列，缺失则报错
- 每行图片链接字段按英文逗号分割为多个 URL

#### 阶段二：预览与选择
- `el-table` 展示解析后的数据，列：文件名、提示词、图片链接（截断显示）、图片缩略图
- 默认全选，支持 checkbox 多选/单选/反选
- 底部参数区：模型、分辨率、宽高比（复用现有 `MODELS` / `getAspectRatios` / `getPrice`）
- 「开始生成」按钮：弹出确认弹窗，显示选中任务数 × 单价 = 总积分

#### 阶段三：生成与结果
- 顶部进度条：`el-progress`，总数 = 选中任务数，每完成一个 +1
- 预览表格每行显示状态列：等待中 / 进行中（带进度） / 成功 / 失败（带重试按钮）
- 任务提交：每隔 3 秒提交一个，复用 `toapisClient.createTask` + `taskApi.create`
- 失败重试：单个重试 + 批量重试（选中失败项后点重试）
- 生成完成后显示下载按钮区：
  - 「直接下载」：逐个 fetch 结果图片 URL 并触发浏览器下载
  - 「打包下载」：用 `jszip` 打包成 zip 下载（项目已有 jszip 依赖）

### 5. `src/views/tools/ToolboxPage.vue` — 工具卡片配置
```ts
{
  id: 'batch-spreadsheet',
  title: '批量传表格做图',
  description: '上传 Excel 表格，批量提交生图任务',
  icon: Document,
}
```

## 数据结构

```ts
interface TableRow {
  id: number            // 本地自增 ID
  filename: string      // 文件名
  prompt: string        // 提示词
  imageUrls: string[]   // 图片链接数组（逗号分割后）
  selected: boolean     // 是否选中
  status: 'pending' | 'submitting' | 'in_progress' | 'completed' | 'failed'
  progress: number      // 0-100
  resultUrl?: string    // 生成结果 URL
  taskId?: number       // 数据库任务 ID
  toapisTaskId?: string // ToAPIs 任务 ID
  error?: string        // 错误信息
}
```

## 任务提交流程

```
用户确认提交
  → 检查积分余额
  → for each 选中的行:
      1. 标记 status = 'submitting'
      2. toapisClient.createTask({ model, prompt, imageUrls, size, resolution })
      3. taskApi.create(...) — 写入数据库
      4. 标记 status = 'in_progress', 记录 taskId
      5. 触发 canvas:task-created 事件（全局任务列表刷新）
      6. sleep(3000)
  → 所有任务提交完成
  → 开始轮询各任务状态（4秒间隔）
  → 每个任务完成/失败时更新对应行的 status 和 progress
  → 进度条跟随更新
```

## 复用模块

| 模块 | 用途 |
|------|------|
| `PageLayout` | 页面布局 |
| `toapisClient` | 创建任务、查询状态 |
| `taskApi` | 任务数据库操作 |
| `pointsApi` | 积分查询 |
| `MODELS / getPrice` | 模型和价格 |
| `useUiFeedback` | 消息提示 |
| `jszip` | 打包下载（已有依赖） |
| `xlsx` | 读写 Excel 文件（需新增） |
