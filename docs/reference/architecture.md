# Architecture

技术架构、模块关系、关键数据流。

---

## 任务生命周期

```
前端 submit → ToAPIs submitted → ToAPIs queued → ToAPIs in_progress → ToAPIs completed
                                                                              ↓
                                                    前端 importing（OSS 导入中）
                                                                              ↓
                                                             前端 completed（所有操作完成）
```

### 状态说明

| 状态 | 来源 | 含义 | 缩略图显示 |
|------|------|------|-----------|
| `submitted` | 前端本地 | 已发送给 ToAPIs，等待确认 | 转圈 |
| `queued` | ToAPIs | ToAPIs 已接收，排队等待 GPU | 转圈 |
| `in_progress` | ToAPIs | GPU 正在生成图片 | 转圈 + 进度条 |
| `importing` | 前端本地 | ToAPIs 已完成，正在导入到 OSS | 转圈 + "正在下载图片..." |
| `completed` | 前端本地 | OSS 导入完成，图片可用 | 显示结果图 |
| `failed` | ToAPIs | 生成失败 | 静态占位图 + 错误信息 |

### 关键实现

- `ACTIVE_STATUSES = ['submitted', 'queued', 'in_progress', 'importing']` — 统一活跃状态常量
- `pollAllTasks()` 跳过 `importing` 和 `completed`/`failed` — 避免重复请求
- `pollTask()` 中的状态切换：ToAPIs `completed` → 前端 `importing` → 等待 `importResultUrls()` → 前端 `completed`
- `importing` 状态不写入数据库（仅前端运行时状态，持久化时仍用 `completed`）

---

## 图片下载四层降级

```
点击下载按钮
    ↓
1. DOM Canvas 提取
   前提: <img> 已加载 + crossorigin="anonymous" + 源站 CORS 生效
   零网络开销，直接从浏览器像素缓存取
   (结果图已于 2026-06-24 移除 crossorigin → 不命中，见下方说明)
    ↓ 失败（Canvas tainted / 无匹配 img）
2. HTTP 缓存 fetch
   fetch(url, {cache: 'force-cache'})
   复用浏览器 HTTP 缓存（<img> 加载时自动写入）
    ↓ 失败（缓存未命中 / CORS 阻止）
3. 服务端代理
   POST /api/proxy/image → 服务端下载 → 返回 blob
   100% 可靠，同源无 CORS 问题
    ↓ 失败（网络错误）
4. 新标签页
   window.open(url, '_blank')
```

### 为什么 ToAPIs URL 无法命中策略1/2

ToAPIs（`files.toapis.com`）不发送 CORS 响应头：
- `<img>` 不带 `crossorigin`：Canvas 被标记为 tainted → `toBlob()` 抛 SecurityError → 策略1跳过
- `fetch(url)`：浏览器 CORS 检查失败 → 策略2跳过
- 最终走策略3代理

~~OSS 有 CORS 配置且 `<img>` 带 `crossorigin="anonymous"` → 策略1直接命中。~~

> **2026-06-24 更正**：上述前提被实测推翻——带 `crossorigin="anonymous"` 的 OSS 结果图会触发 CORS 校验失败、图片裂开（详见 `bug-fixes.md` / `decision-log.md` 2026-06-24）。已移除全部结果图 `<img>` 的 `crossorigin`，故**结果图下载实际落到策略3服务端代理**（策略1 canvas tainted、策略2 fetch 无 CORS 均失效）。功能完整、可靠性不变，仅多一次服务端往返。OSS CORS 当前实际配置状态见 `todo.md`（待确认）；但无论其状态如何，展示图都不再恢复 `crossorigin`。

### 诊断日志

每次下载在控制台输出命中信息：
- `[下载] ✅ 策略1: 从DOM缓存提取 (零网络)`
- `[下载] ⚡ 策略2: HTTP缓存`
- `[下载] 🔄 策略3: 服务端代理...`
- `[下载] ❌ 前三层全部失败，打开新标签页`

---

## 参考图顺序保持

用户指定参考图的顺序现在由 `refImages` 有序数组保证：

```
GenerationForm.handleGenerate()
    → refImages: [{url: 'A'}, {file: FileB}, {url: 'C'}]  // 保持UI拖拽顺序
    → submitTask() 逐一处理，顺序不变
    → inputImageUrls = ['A_oss', 'B_oss', 'C_oss']  // 正确顺序
```

> `refImages` 是唯一的参考图入参。旧的 `imageUrls` / `tempImageFiles` 参数已删除。

---

## AI 生图模块（三层架构）

为支持在各页面复用、改一处全局生效，AI 生图按三层高内聚低耦合组织。所有页面/工作流节点都必须走统一入口，禁止直接调用 `toapisProxyApi` / `taskApi` / `ossApi` 拼装生图流程。

### 分层

| 层 | 文件 | 职责 | UI 依赖 |
|----|------|------|---------|
| **适配器** | `src/adapter/toapisClient.ts` | 纯 API 调用封装：`uploadImage` / `createTask(body)` / `getTaskStatus` | 无 |
| **核心模块** | `src/services/imageGeneration.ts` | 生图编排，纯数据/流程 | 无 |
| **UI 状态** | `src/composables/useTaskManager.ts` + 各页面 | 任务列表、轮询调度、reactive 状态 | Vue |

### 核心模块 API（`imageGeneration.ts`）

分步函数（可自由组合）：

- `submitTask(params): {toapisTaskId, dbTaskId, inputImageUrls}` — 上传参考图 + 创建 ToAPIs 任务 + 写 DB（`status='submitted'`）
- `pollTask(taskId, {interval?, maxAttempts?, timeout?}): {status, progress, resultUrls, errorMessage?, …}` — **阻塞式**轮询，默认 `interval=4000 / maxAttempts=150 / timeout=600000`（约 10 分钟）
- `importResultUrls(taskId, sourceUrls): string[]` — 逐张转存结果到 OSS，**单张失败跳过不中断**

高层封装：

- `generateImage(params, {poll?, import?})` — 一键调用。`poll:true` 时内部轮询并在 DB 写终态（成功→`completed`、失败/超时→`failed`），`import:true` 时附带转存 `result_image_urls`

`SubmitTaskParams` 字段：`model / prompt / size(宽高比) / resolution / refImages[] / featureId / n / userPrompt? / systemPrompt? / supplementaryImages?`。参考图项为 `{url?}` 或 `{file?}`，URL 中 OSS 直传、非 OSS http（含阿里 CDN 等外部图床，**设计上统一中转**——更可靠，CORS 失败时回退原始 URL）先下载再上传、data URL(base64) 先转 File 再上传。

### 调用方约定

| 调用方 | 入口 | 说明 |
|--------|------|------|
| 工作台 / AI摄影（`useTaskManager.handleGenerate`） | `submitTask` + 定时器单查 `getTaskStatus` | `pollAllTasks` + `setInterval(4s)` 驱动，**单次查询**，不可用阻塞式 `pollTask` |
| 工作流节点 `image-ai` | `generateImage({poll, import})` | 阻塞式一键：提交+轮询+转存+DB 终态 |
| 买家秀 `MakeBuyerShowPanel` | `submitTask` + 行级 `getTaskStatus` 轮询 + `importResultUrls` | 保留 5s 快速失败自动重试逻辑 |
| 批量换衣/换姿势 `BatchClothesSwapPage`/`BatchPoseSwapPage` | `submitTask`（不轮询，依赖全局 TaskPanel） | 共享图在循环外用 `uploadImage` 解析一次复用，避免重复上传 |
| 批量表格做图 `BatchSpreadsheetPage` | `submitTask` + 行级 `getTaskStatus` + `importResultUrls` | — |

### 关键不变量

- **DB 终态必达**：`generateImage({poll})` 成功写 `completed`、失败/超时写 `failed`；分步调用方需自行在轮询到终态时写 DB。
- **共享图不重复上传**：批量场景循环外把共享图解析为 OSS URL（`{url}`），`submitTask` 内 `processUrl` 对 OSS URL 原样透传不重传。
- **轮询语义二分**：阻塞式 `pollTask`（工作流）vs 定时器单查 `getTaskStatus`（UI 列表）。混用会导致并发轮询/卡死。

---

## AI摄影（Photography）

### 页面流程

```
用户上传图片 → 图片池 (PoolImage[], 最多10张, 拖拽排序)
     ↓ 拖拽 (copy 语义)
元素分配区 (Element Zones, 从 API 动态加载)
     ↓ 点击生成
构建 Prompt (方案B: 每元素独立 system_prompt + 自动映射描述)
     ↓ 上传图片到 OSS (去重)
ToAPIs createTask → 全局 TaskPanel (feature_id='ai-photography')
```

### Prompt 构建（方案 B）

1. 筛选有图片分配的元素，按 sort_order 排序
2. 拼接各元素的 `photography_element_prompts.system_prompt`（跳过空 prompt）
3. 收集已分配图片 → 去重 → 按元素首次出现顺序排列
4. 自动生成"参考图映射（按顺序）：第N张 — XX参考、YY参考"描述段
5. 追加用户输入 `userPrompt`

### 图片去重

同一 PoolImage 拖到多个元素时，只在 refImages 中发送一次。映射描述中列出所有引用：
- 姿势和衣服共用图一时 → `第2张 — 姿势参考、衣服参考`

### 重新编辑/重新生成

- 重新编辑：从 `supplementaryImages`（`[{name:"人脸", url:"..."}, ...]`）反向恢复图片池和元素分配
- 重新生成：复用已存 `task.prompt` + `task.input_image_urls` 直接调 API

### 关键数据流

```
PhotographyForm (图片池 + 元素分配)
  → emit refImages, supplementaryImages, finalPrompt
    → PhotographyPage.handleGenerate
      → useTaskManager.handleGenerate
        → submitTask (上传文件到 OSS, 去重, 构建请求, 写 DB)
          → toapisProxyApi.createTask
            → POST /api/toapis/create-task
              → Express → ToAPIs API
```

> 生图核心模块的三层结构与调用约定见上方「AI 生图模块（三层架构）」。

### 管理员配置

`/admin/photography` — 元素 CRUD + 每元素×每模型的 system_prompt 编辑。数据存储在 `photography_elements` + `photography_element_prompts` 表。
