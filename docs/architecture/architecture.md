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
   前提: <img> 已加载 + crossorigin="anonymous"（OSS URL 自动带）
   零网络开销，直接从浏览器像素缓存取
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

OSS 有 CORS 配置且 `<img>` 带 `crossorigin="anonymous"` → 策略1直接命中。

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
    → generateImage() 逐一处理，顺序不变
    → allImageUrls = ['A_oss', 'B_oss', 'C_oss']  // 正确顺序
```

旧参数 `imageUrls`/`tempImageFiles` 仍存在，但 `refImages` 优先。
