# AI 画布（节点式工作流）

最后更新：2026-06-17  
状态：文字 AI 节点已实现·已验证（构建 + 用户端实跑）/ 其余节点继承既有实现  
菜单位置：侧边栏「AI画布」（列表 `/canvas-projects` → 编辑器 `/ai-canvas/:projectId`）

---

## 1. 概述

AI 画布是基于节点的工作流编排器（`@vue-flow/core`）。用户在画布上拖拽节点、连线，串联「输入 → AI 处理 → 输出」，可一键运行全部或逐步执行。每个项目独立保存工作流数据。

- **列表页** `/canvas-projects`：项目管理（新建 / 编辑 / 复制 / 导入 / 删除）。
- **编辑器** `/ai-canvas/:projectId`：画布 + 节点 + 右侧属性面板。
- 运行引擎与节点定义在 `src/modules/workflow/`（`engine/`、`nodes/`、`stores/workflowStore.ts`）。

---

## 2. 节点体系

8 种节点（注册表 `src/modules/workflow/nodes/registry.ts`，类型联合见 `types/workflow.ts`）。端口数据类型：`Text` / `Image` / `Any`。

| 节点 | type | 作用 |
|------|------|------|
| 图片输入 | `image-input` | 上传本地图，输出 Image 给下游 |
| 文字输入 | `text-input` | 输入纯文本，输出 Text |
| 文字 AI | `text-ai` | 调文字模型生成文案/提示词，**可带参考图**（见 §3） |
| 图片 AI | `image-ai` | 调图像模型生图（复用统一 `generateImage()`，`feature_id='canvas'`） |
| 提示词拆分 | `prompt-splitter` | 按分隔符拆分文本为多路 Text 输出 |
| 文字预览 | `text-preview` | 预览文本 |
| 图片预览 | `image-preview` | 预览图片 |
| 保存 | `save` | 收集上游文本/图片入画布素材库 |

---

## 3. 文字 AI 节点（text-ai）

### 3.1 文本模型

走 ToAPIs OpenAI 兼容接口 `POST /v1/chat/completions`（后端代理 `POST /api/canvas-ai/chat`）。模型清单 `src/types/adapter.ts` 的 `TEXT_MODELS`：

| id | 名称 | 备注 |
|----|------|------|
| `gpt-5.5` | GPT-5.5 | **默认**；文档明确支持视觉输入 |
| `gemini-3-flash` | Gemini 3 Flash | 文本模型 |
| `gemini-3.1-flash-lite` | Gemini 3.1 Flash Lite | 轻量版；**视觉支持待确认**（见 `todo.md`） |

- `DEFAULT_TEXT_MODEL = 'gpt-5.5'`；新建节点 `modelName` 默认即此值（不再为空）。
- 节点卡片下拉与右侧 ConfigPanel 均用 `TEXT_MODELS`（此前误绑图像 `MODELS`，已修复）。

### 3.2 Key 与计费

- **Key 与图像共用**：后端 `server/src/routes/canvas-ai.ts` 用 `resolveUserApiKey(userId)` 解析——个人模式用个人 Key、否则共享 Key，与图像生成完全一致。**（推翻计费文档旧规则「canvas-ai 不接入个人 Key」，见 `billing.md` §6 与变更记录。）**
- **不扣积分**：文字 AI 调用**不消耗新积分**——无论共享/个人模式，都不写积分扣减 / `points_transactions`。属阶段性决策（拉新/体验），见决策日志。

### 3.3 图片输入（多模态 vision）

- text-ai 有 `image` 输入端口，可接收上游 `image-input` / `image-ai` 的图（结构 `{ image, imageList }`）。
- **有图时**：请求 `messages[0].content` 构造为 OpenAI vision 多模态数组——一个 `{type:'text'}` 块 + 每张图一个 `{type:'image_url', image_url:{url}}` 块。
- **无图时**：`content` 为纯文本字符串（向后兼容）。
- 图片 URL 接受 `http(s)` 直链（OSS / 上游结果）与 `data:` base64（本地上传）；后端 `express.json` limit 50mb 足够，`messages` 整体透传给 ToAPIs。
- 视觉能力取决于模型：gpt-5.5 确认支持；flash-lite 待确认。

### 3.4 请求超时

- 文字模型请求**单独超时 900000ms（15 分钟）**——`canvasApi.chat` 显式传 `{ timeout }`，避开全局 axios 15s 限制（LLM 带图推理耗时长，15s 必超时）。后端 Node `fetch` 默认无超时，15 分钟为整链兜底上限。

---

## 4. 控制台（节点运行日志）

- 每个节点运行产生的日志（`NodeRunResult.logs`，`{level, message}`）展示在右侧属性面板的**「日志」tab**（样式类 `panel__log-console`），按当前选中节点显示。这是统一的日志面板，非每节点独立窗口。
- 面板默认折叠（`collapsed=true`）。打开方式：
  1. **右键节点 →「打开控制台」**：派发 `canvas:open-console` 事件，右侧面板自动展开并跳到「日志」tab。
  2. 画布最右边缘的 36px 展开条（浅灰 `←` 箭头，tooltip「展开属性面板」）。
- 选中节点后点节点「运行」会自动清空旧日志并跳到「日志」tab。

---

## 5. 画布任务与主任务列表

- 画布 `image-ai` 生图走统一 `generateImage()`，`feature_id='canvas'` 写入 `generation_tasks`。
- **主工作区任务列表默认会显示这些 canvas 任务**（功能过滤器为空 → 拉取不按 `feature_id` 过滤）；用户选了具体功能过滤器时才按 feature 过滤掉 canvas。
- 画布生图时派发 `canvas:task-created` 事件，主任务列表监听后刷新（设计上即有意联动）。
- 结果页 `/results`（不带 `feature_id`）也会显示 canvas 已完成图。
- **已知展示瑕疵**：canvas 任务在主列表「功能」标签显示为原始 `canvas`（`featureConfig` 无此 id，无中文名），低优先级。

---

## 6. 默认值

| 项 | 默认值 |
|----|--------|
| 文字 AI 模型 | `gpt-5.5`（新建节点即此值） |
| 文字模型请求超时 | 15 分钟（900000ms） |
| 右侧属性面板 | 默认折叠 |

---

## 7. 业务规则与边界

- 文字 AI **不扣积分**（两模式均不扣）。
- 文字 AI Key 走 `resolveUserApiKey`（与图像一致）；个人模式用个人 Key，但仍不扣平台积分。
- 多模态图片输入依赖模型视觉能力；gpt-5.5 确认支持，`gemini-3.1-flash-lite` 待确认。
- 文字模型 chat 超时 15 分钟为兜底上限，正常请求几十秒返回。
- 画布生图任务 `feature_id='canvas'`，进主任务列表与结果页（默认可见）。

---

## 8. 验收标准

- 文字 AI 节点下拉可选 gpt-5.5 / gemini-3-flash / gemini-3.1-flash-lite；新建节点默认 gpt-5.5；ConfigPanel 同步为下拉。
- 连参考图运行，日志显示「附带 N 张参考图发给文字模型」并成功返回文案；不连图时纯文本正常。
- 右键节点有「打开控制台」，点击后面板展开 + 跳「日志」tab，显示该节点日志。
- 画布生图任务出现在主任务列表（默认视图）与结果页。
- 文字模型请求不再因 15s 超时失败（长耗时调用在 15 分钟内返回）。

---

## 需求变更记录

### 2026-06-17 — 文字 AI 节点接入文本模型 + 图片输入 + 控制台入口 + 超时修正

- **接入文本模型**：gpt-5.5（默认）/ gemini-3-flash / gemini-3.1-flash-lite，走 ToAPIs `/v1/chat/completions`（后端 `/api/canvas-ai/chat`）。新增 `TEXT_MODELS` / `DEFAULT_TEXT_MODEL`，节点卡片与 ConfigPanel 下拉改用文本清单（修复此前误绑图像 `MODELS`）。
- **修复图片输入**：text-ai 的 `image` 端口此前声明但 `run()` 未读取，图片从未发给模型；现按 OpenAI vision 多模态格式构造 `content`（有图文数组 / 无图纯文本）。详见 `bug-fixes.md`。
- **Key 改为与图像共用**：`canvas-ai.ts` 由 `getKey()` 改 `resolveUserApiKey(userId)`，**推翻 billing 旧规则「canvas-ai 不接入个人 Key」**；计费维持不扣积分。
- **控制台入口**：节点右键菜单新增「打开控制台」（`canvas:open-console` 事件 → 展开右侧面板 + 跳「日志」tab），弥补默认折叠面板难发现的问题。
- **超时修正**：文字模型 chat 请求由全局 15s 放宽到单独 15 分钟（`canvasApi.chat` 显式 `{ timeout }`）。详见 `bug-fixes.md`。
- **可观测性**：后端 `canvas-ai` `!response.ok` 与 `catch` 加 `console.error`；前端 catch 优先读后端返回的具体 `error`，错误信息不再被「status code 500」吞掉。
