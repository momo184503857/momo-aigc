# 内部 AI 生图调用面板 PRD

版本：v1.0  
日期：2026-05-25  
最后更新：2026-06-17（修复拖缩略图入收藏失效，见 9.4.6 验收）  
项目类型：内部工具 / Web 应用  
目标用户：公司内部电商运营、美工、管理员  
产品负责人：管理员（墨墨）  

---

## 1. 项目背景

公司内部需要一个简单、稳定、低服务器成本的 AI 生图调用面板，用于让同事通过网页调用 ToAPIs 中转站提供的多个图像生成模型。

当前不做复杂业务功能，例如换装、高清重绘、主图生成、工作流编排等。第一版目标是先跑通最小闭环：

- 用户登录
- 用户本地保存自己的 ToAPIs API Key
- 用户上传常用模板图片到阿里云 OSS
- 用户选择模型
- 用户输入 Prompt
- 用户选择模板图参与生图
- 前端直接调用 ToAPIs 创建任务
- 前端查询任务状态
- 服务器保存任务历史和统计信息
- 管理员可以创建账号、重置密码、查看任务详情和每个用户生成数量

---

## 2. 产品定位

本项目第一版不是完整的 AI 生图 SaaS，也不是复杂的工作流平台，而是：

> 内部使用的 ToAPIs 图像生成调用面板。

核心价值：

1. 降低同事调用 AI 生图模型的门槛。
2. 避免服务器中转大图片，降低服务器流量和带宽成本。
3. 每个用户使用自己的 ToAPIs Key，避免平台方承担模型费用。
4. 通过账号隔离，避免不同同事互相看到对方任务和图片。
5. 通过管理员后台统计每个同事的生成次数。

---

## 3. 第一版目标

### 3.1 目标

第一版只做 API 调用闭环，不做复杂生图功能分类。

必须实现：

1. 用户账号登录。
2. 管理员创建账号、重置密码。
3. 用户自己的 ToAPIs Key 只保存在本地浏览器，不上传服务器。
4. 支持四个 ToAPIs 图像模型下拉选择。
5. 默认模型为 `gpt-image-2`。
6. 用户可以上传模板图片到阿里云 OSS。
7. OSS Bucket 使用公共读。
8. 用户可以选择 OSS 模板图参与生图。
9. 用户可以输入 Prompt。
10. 前端直接调用 ToAPIs 创建图像生成任务。
11. 拿到 ToAPIs `task_id` 后算生成 1 次。
12. 任务历史永久保存在服务器。
13. 普通用户只能看到自己的任务。
14. 管理员可以看到所有用户任务详情。
15. 管理员可以看到每个用户的生成数量。
16. 前端使用用户本地 ToAPIs Key 查询任务状态。
17. 任务状态和错误信息尽量翻译成运营能看懂的话。
18. 支持一键重新生成。

### 3.2 非目标

第一版不做：

1. 用户自行修改密码。
2. 用户注册。
3. 对外售卖。
4. 团队空间 / 多租户公司管理。
5. 服务器保存用户 ToAPIs Key。
6. 服务器中转用户上传图片。
7. 服务器下载 ToAPIs 生成结果图。
8. OSS 私有读。
9. 复杂模板分类。
10. 换装、高清重绘、主图生成等业务功能。
11. 多模型同时生成。
12. 复杂计费系统。
13. 复杂提示词工作流编排。
14. 图片结果永久存储。
15. 客户端 EXE / Electron / Tauri 版本。

---

## 4. ToAPIs 文档链接

以下链接需要保存在项目文档中，供开发时查阅。

### 4.1 文件上传

- 上传图片接口  
  https://docs.toapis.com/docs/cn/api-reference/uploads/images

### 4.2 图像生成模型

- GPT-Image-2 图像生成  
  https://docs.toapis.com/docs/cn/api-reference/images/gpt-image-2/generation

- Gemini 3 Pro Image 图像生成  
  https://docs.toapis.com/docs/cn/api-reference/images/gemini-3-pro-image/generation

- Gemini 3.1 Flash Image 图像生成  
  https://docs.toapis.com/docs/cn/api-reference/images/gemini-3.1-flash/generation

- Gemini 2.5 Flash Image 图像生成  
  https://docs.toapis.com/docs/cn/api-reference/images/gemini-2.5-flash/generation

### 4.3 任务查询

- 获取图片任务状态  
  https://docs.toapis.com/docs/cn/api-reference/tasks/image-status

---

## 5. 用户角色

### 5.1 管理员

管理员为系统最高权限用户。

权限：

1. 登录后台。
2. 创建普通用户账号。
3. 重置普通用户密码。
4. 禁用 / 启用普通用户账号。
5. 查看所有用户的任务详情。
6. 查看所有用户的模板图片记录。
7. 查看每个用户的生成数量。
8. 查看每个用户最近生成时间。
9. 可删除用户模板图片记录。
10. 可删除或隐藏异常任务记录。

限制：

1. 管理员不保存、不查看用户 ToAPIs Key。
2. 管理员可以查看任务中保存的 Prompt、task_id、图片 URL、模型、状态等信息。

### 5.2 普通用户

普通用户为内部同事。

权限：

1. 登录系统。
2. 在本地浏览器保存自己的 ToAPIs Key。
3. 删除本地 ToAPIs Key。
4. 上传模板图片到 OSS。
5. 查看自己的模板图库。
6. 选择自己的模板图参与生图。
7. 选择模型。
8. 输入 Prompt。
9. 创建图像生成任务。
10. 查看自己的任务历史。
11. 查询自己的任务状态。
12. 一键重新生成自己的历史任务。

限制：

1. 不能注册账号。
2. 不能修改密码。
3. 密码只能由管理员重置。
4. 不能看到其他用户的任务。
5. 不能看到其他用户的模板图。
6. 不能看到管理员统计后台。
7. ToAPIs Key 只保存在自己的浏览器本地。

---

## 6. 核心架构

### 6.1 总体架构

```text
用户浏览器
  ├─ 登录你的系统
  ├─ 本地保存用户自己的 ToAPIs Key
  ├─ 直接上传临时参考图到 ToAPIs
  ├─ 直接上传模板图到阿里云 OSS
  ├─ 直接读取 OSS 公共 URL
  ├─ 直接调用 ToAPIs 创建生图任务
  ├─ 直接调用 ToAPIs 查询任务状态
  └─ 将 task_id / prompt / 图片 URL / 状态同步给你的服务器

你的业务服务器
  ├─ 用户登录与权限控制
  ├─ 管理员创建账号、重置密码
  ├─ 保存任务历史
  ├─ 保存模板图片元信息
  ├─ 发放 OSS 上传签名或临时上传凭证
  ├─ 统计每个用户生成次数
  └─ 管理员查看任务详情

阿里云 OSS
  └─ 公共读，保存用户常用模板图片

ToAPIs
  ├─ 保存临时上传图
  ├─ 读取 OSS 模板图 URL
  ├─ 创建图像生成任务
  ├─ 返回 task_id
  └─ 返回任务状态和结果图 URL
```

### 6.2 关键原则

1. 用户 ToAPIs Key 不进入服务器。
2. 用户图片文件不进入业务服务器。
3. 模板图片长期保存在 OSS。
4. OSS Bucket 使用公共读。
5. OSS 上传权限不能暴露阿里云主账号 AccessKey。
6. 服务器只保存账号、任务文字信息、图片 URL、OSS object key、状态和统计。
7. 任务查询由浏览器使用本地 ToAPIs Key 完成。
8. 服务器只有 task_id 时，不能独立查询 ToAPIs 任务状态，除非服务器保存用户 Key；第一版不保存 Key，所以查询动作由浏览器完成。

---

## 7. 第三方服务设计

### 7.1 ToAPIs

用途：

1. 上传临时参考图。
2. 创建图像生成任务。
3. 查询任务状态。
4. 返回结果图片 URL。

认证：

- 使用用户自己的 ToAPIs API Key。
- Key 保存位置：用户浏览器本地。
- Key 不上传你的业务服务器。

### 7.2 阿里云 OSS

用途：

1. 保存用户常用模板图片。
2. 提供公共可访问 URL。
3. 让 ToAPIs 可以通过 URL 拉取模板图片。

Bucket 设置：

1. Bucket 读权限：公共读。
2. 上传权限：由服务器生成临时上传凭证或上传签名。
3. 前端不能保存阿里云主账号 AccessKey。
4. 建议配置 CORS，允许你的 Web 域名上传图片。
5. 图片路径按用户隔离。

OSS 路径建议：

```text
templates/{user_id}/{yyyy}/{mm}/{uuid}.{ext}
```

示例：

```text
templates/10001/2026/05/8f4a2c7e.png
```

---

## 8. 支持模型

第一版支持四个模型。

| 显示名称 | model id | 默认 |
|---|---|---|
| GPT-Image-2 | `gpt-image-2` | 是 |
| Gemini 3 Pro Image | `gemini-3-pro-image-preview` | 否 |
| Gemini 3.1 Flash Image | `gemini-3.1-flash-image-preview` | 否 |
| Gemini 2.5 Flash Image | `gemini-2.5-flash-image-preview` | 否 |

### 8.1 模型选择规则

1. 用户手动选择模型。
2. 默认选择 `gpt-image-2`。
3. 不需要展示模型差异说明。
4. 不需要推荐模型。
5. 不需要禁用模型。
6. 不支持四模型同时生成。
7. 一次生成 1 张图。

### 8.2 模型参数适配

不同模型的图片入参结构可能不同，前端需要做模型适配层。

#### GPT-Image-2 请求示意

```json
{
  "model": "gpt-image-2",
  "prompt": "用户输入的提示词",
  "n": 1,
  "size": "1:1",
  "resolution": "1K",
  "response_format": "url",
  "reference_images": [
    "https://example.com/image.png"
  ]
}
```

#### Gemini 系列请求示意

```json
{
  "model": "gemini-3-pro-image-preview",
  "prompt": "用户输入的提示词",
  "n": 1,
  "size": "1:1",
  "metadata": {
    "resolution": "1K"
  },
  "image_urls": [
    {
      "url": "https://example.com/image.png"
    }
  ]
}
```

说明：

1. 用户界面只展示统一字段：模型、Prompt、图片、比例、分辨率。
2. 前端根据模型自动转换请求体。
3. 用户不需要知道 `reference_images` 和 `image_urls` 的区别。
4. 用户不需要知道 `resolution` 是顶层字段还是 `metadata.resolution`。

---

## 9. 功能需求

## 9.1 登录功能

### 9.1.1 登录页

字段：

1. 用户名。
2. 密码。
3. 登录按钮。

规则：

1. 用户名和密码由管理员创建。
2. 普通用户不能自行注册。
3. 普通用户不能自行修改密码。
4. 用户忘记密码，由管理员重置。
5. 登录成功后进入生图工作台。
6. 登录失败时提示：账号或密码错误。

### 9.1.2 会话

要求：

1. 登录状态需要保持。
2. 支持退出登录。
3. 用户退出后清除系统登录态。
4. 退出登录不要求清除本地 ToAPIs Key，但设置页需要提供删除 Key 的入口。

---

## 9.2 管理员用户管理

### 9.2.1 用户列表

字段：

1. 用户 ID。
2. 用户名。
3. 角色。
4. 状态。
5. 创建时间。
6. 最近登录时间。
7. 生成次数。
8. 最近生成时间。

操作：

1. 创建用户。
2. 重置密码。
3. 禁用用户。
4. 启用用户。
5. 查看用户任务。
6. 查看用户模板图片。

### 9.2.2 创建用户

字段：

1. 用户名。
2. 初始密码。
3. 角色，第一版默认普通用户。

规则：

1. 用户名不能重复。
2. 密码不能明文存储。
3. 密码必须哈希后存储。
4. 创建成功后用户可以登录。

### 9.2.3 重置密码

规则：

1. 只有管理员可以重置密码。
2. 普通用户不能自行修改密码。
3. 重置后用户使用新密码登录。

---

## 9.3 ToAPIs Key 设置

### 9.3.1 Key 保存位置

用户自己的 ToAPIs Key 只保存在浏览器本地。

建议：

1. 第一版可以使用 `localStorage`。
2. 后续如需增强稳定性，可迁移到 `IndexedDB`。
3. Key 不上传业务服务器。
4. Key 不写入服务器日志。
5. Key 不保存到数据库。

### 9.3.2 Key 设置页

字段：

1. API Key 输入框。
2. 保存到本机按钮。
3. 测试连接按钮。
4. 删除本地 Key 按钮。
5. 当前状态：已保存 / 未保存。

提示文案：

```text
ToAPIs Key 仅保存在当前浏览器本地，不会上传到公司服务器。
清理浏览器缓存、换电脑或换浏览器后，需要重新填写。
```

### 9.3.3 Key 缺失处理

如果用户未保存 Key，进入生图页时提示：

```text
请先填写你的 ToAPIs API Key，才能提交生图任务。
```

如果用户尝试刷新历史任务状态时没有 Key，提示：

```text
需要先填写 ToAPIs Key，才能刷新任务状态。
```

---

## 9.4 模板图库

模板图片是用户经常重复使用、需要参与生图的图片。

### 9.4.1 模板图存储

存储位置：

- 文件本体：阿里云 OSS。
- 元信息：业务服务器数据库。

OSS 读取权限：

- 公共读。

上传方式：

- 浏览器直传 OSS。
- 业务服务器只发放临时上传签名或凭证。
- 业务服务器不接收图片文件。

### 9.4.2 模板图列表

普通用户只能查看自己的模板图。

字段：

1. 缩略图。
2. 模板名称。
3. 文件名。
4. 文件大小。
5. 图片格式。
6. 上传时间。
7. 使用次数，可选。
8. 操作：选择、重命名、删除。

管理员可以查看所有用户的模板图。

管理员列表字段增加：

1. 所属用户。
2. 用户 ID。

### 9.4.3 上传模板图

流程：

```text
用户选择图片
浏览器请求业务服务器获取 OSS 上传凭证
业务服务器校验用户登录态
业务服务器生成 object_key
业务服务器返回 OSS 上传信息
浏览器直传图片到 OSS
上传成功后浏览器把 object_key、public_url、文件名等信息提交给业务服务器
业务服务器保存模板图元信息
```

上传限制建议：

1. 支持 JPG、JPEG、PNG、WebP。
2. 单张图片大小建议不超过 10MB。
3. 文件名保留原始文件名，但 OSS object key 使用 UUID。
4. 上传失败时提示用户重新上传。

### 9.4.4 删除模板图

第一版建议做软删除：

1. 用户点击删除。
2. 数据库 `status` 改为 `deleted`。
3. 列表不再显示。
4. OSS 文件可以暂时不物理删除。

后续可以增加管理员清理 OSS 文件功能。

### 9.4.5 模板图参与生图

用户在生图页可以选择一张或多张模板图。

生成时：

1. 前端读取模板图的 OSS 公共 URL。
2. 前端将 OSS URL 传给 ToAPIs。
3. ToAPIs 通过该 URL 拉取图片。
4. 业务服务器保存任务时记录使用过的模板图 ID 和 URL。

### 9.4.6 模板收藏（starred）

模板收藏用于把高频复用的模板图置顶，供生图工作台一键调用。

**术语规则（统一）**：面向用户的文案一律称「收藏」，不再使用「常用」。涉及按钮、成功提示、空状态、拖拽提示等所有可见文案。数据库字段 `is_starred`、代码变量名（如 `starredMode`）保持不变，仅约束展示文案。

**收藏管理（模板图库页 `/templates`）**：

1. 顶部「设置收藏」按钮进入收藏编辑态（按钮切换为「退出收藏设置」）。
2. 编辑态下，把上方图库的图片拖入下方收藏区即设为收藏；可拖动调整顺序（越靠左越靠前）。
3. 操作提示文案：「已添加「xxx」到收藏」/「已移除收藏」。
4. 数据：`template_images.is_starred` + `sort_order`；接口 `PATCH /templates/:id/star`。

**生图工作台收藏行（两图功能页）**：

- 适用功能：换衣服 / 换背景 / 换脸 / 细节图 / 面料图 / 平铺图 / 3D图（`imageSlots` 各 2 个，共用 `FeatureForm.vue`）。
- 收藏行位于两个上传槽位下方，**始终常驻显示**，不因「无收藏」或「两图已满」隐藏（早期版本会在这两种情况下隐藏，已取消）。
- 行末尾固定一个引导入口（虚框）：星标 +「收藏模板」+「去模板图库添加 ›」，点击 `router-link` 跳转 `/templates`。
- 用户还没有任何收藏模板时，行内显示灰字空状态「还没有收藏的模板」。
- 点击任一收藏缩略图 → 把该模板填入第一个上传槽位。

**边界（既有行为，保留）**：当两个槽位都已上传图时，点击收藏缩略图仍会**替换第一个槽位**的图（如换衣服的「模特图」），不弹选择。此为既有逻辑，暂保留；是否改为「提示选择替换哪张」属后续迭代（见 `docs/todo.md`）。

**验收**：

1. 换衣服页：未上传图、未收藏任何模板时，收藏行仍可见（引导块 + 空状态文案）；两张图都满后收藏行不消失。
2. 引导块点击跳转 `/templates`。
3. 模板图库页所有收藏相关文案无残留「常用」；进入/退出收藏设置、添加/移除收藏的提示文案正确。
4. 模板图库收藏编辑态：按住**缩略图本身**（卡片主交互区）拖入收藏区即可添加，无需抓卡片留白处。技术约束——拖拽源容器（`.tpl-card` `draggable=true`）内的 `<img>` 必须禁用原生拖拽（`draggable="false"`），否则原生图片拖拽会劫持卡片拖拽、导致自定义 `dataTransfer` 写不进、`drop` 静默失败（见 `docs/records/bug-fixes.md` 2026-06-17）。

---

## 9.5 生图工作台

第一版只做通用生图，不做换装、重绘、主图等细分功能。

### 9.5.1 页面字段

必填字段：

1. 模型选择。
2. Prompt 输入框。

可选字段：

1. 模板图选择。
2. 临时参考图上传。
3. 比例 `size`。
4. 分辨率 `resolution`。

固定字段：

1. `n = 1`。

### 9.5.2 默认值

1. 默认模型：`gpt-image-2`。
2. 默认生成数量：1。
3. 默认返回格式：URL。
4. 默认比例和分辨率可先设为：
   - `size = 1:1`
   - `resolution = 1K`

### 9.5.3 创建任务流程

```text
用户登录
用户确认本地已有 ToAPIs Key
用户选择模型
用户输入 Prompt
用户选择模板图，可选
用户上传临时参考图，可选
前端准备图片 URL 列表
  - 模板图：使用 OSS public_url
  - 临时图：上传 ToAPIs 后获得 URL
前端根据模型适配请求体
前端直接调用 ToAPIs 创建图像任务
ToAPIs 返回 task_id
前端将 task_id、模型、prompt、图片 URL 等信息同步给业务服务器
业务服务器保存任务
任务生成数量 +1
前端开始轮询 ToAPIs 任务状态
任务完成后前端同步 result_url、status、expires_at 到业务服务器
```

### 9.5.4 临时参考图上传

临时参考图指本次生成需要使用，但不需要长期保存为模板的图片。

规则：

1. 临时图不上传你的业务服务器。
2. 临时图由前端直接上传到 ToAPIs 上传接口。
3. ToAPIs 返回上传图片 URL。
4. 前端将该 URL 放入生成请求。
5. 业务服务器只保存该 URL，不保存图片文件。

---

## 9.6 任务历史

### 9.6.1 保存位置

任务历史保存在业务服务器数据库。

保留策略：

1. 永久保留。
2. 不主动删除。
3. 只保存文字、参数、URL、状态，不保存图片文件。

### 9.6.2 普通用户任务历史

普通用户只能查看自己的任务。

列表字段：

1. 提交时间。
2. 模型。
3. Prompt 摘要。
4. ToAPIs task_id。
5. 状态。
6. 进度。
7. 结果图 URL。
8. 错误信息。
9. 操作：刷新状态、重新生成、查看详情。

详情字段：

1. 提交时间。
2. ToAPIs task_id。
3. client_business_id。
4. 模型。
5. Prompt 完整内容。
6. size。
7. resolution。
8. 使用的模板图。
9. 使用的临时图 URL。
10. 结果图 URL。
11. 状态。
12. 进度。
13. 错误信息。
14. 完成时间。
15. 结果 URL 过期时间，如 ToAPIs 返回。

### 9.6.3 管理员任务历史

管理员可以查看所有用户任务详情。

管理员任务列表增加字段：

1. 用户名。
2. 用户 ID。

### 9.6.4 任务状态

ToAPIs 状态映射：

| ToAPIs 状态 | 页面中文 |
|---|---|
| `queued` | 排队中 |
| `in_progress` | 生成中 |
| `completed` | 已完成 |
| `failed` | 生成失败 |

本地扩展状态：

| 本地状态 | 含义 |
|---|---|
| `submitted` | 已拿到 task_id，任务已提交 |
| `unknown` | 无法确认状态，可能 Key 缺失或查询失败 |

### 9.6.5 任务恢复

如果用户关闭页面后任务仍在 ToAPIs 执行，用户重新登录后：

```text
业务服务器返回历史任务
前端读取本地 ToAPIs Key
前端对未完成任务调用 ToAPIs 查询接口
前端将最新状态同步给业务服务器
```

如果本地没有 Key：

```text
页面显示任务历史，但不能刷新状态。
提示用户先填写 ToAPIs Key。
```

### 9.6.6 一键重新生成

用户点击“重新生成”时：

1. 读取历史任务中的模型、Prompt、size、resolution、模板图 URL、临时图 URL。
2. 重新组装生成请求。
3. 使用浏览器本地 ToAPIs Key 创建新任务。
4. 新任务拿到 task_id 后，保存为一条新的任务历史。
5. 生成数量 +1。

注意：

1. 如果历史任务中的临时图 URL 已失效，则提示用户重新上传图片。
2. 如果模板图来自 OSS 公共 URL，且文件仍存在，可以直接复用。
3. 如果 ToAPIs 结果 URL 过期，不影响重新生成，但不能恢复原结果图。

---

## 9.7 管理员统计

### 9.7.1 统计口径

生成数量统计口径：

> 只要 ToAPIs 返回 task_id，就算生成 1 次。

不要求任务完成。

建议保留三个字段：

1. 提交次数：拿到 task_id 的次数。
2. 成功次数：状态为 completed 的次数。
3. 失败次数：状态为 failed 的次数。

第一版管理员页面默认展示提交次数。

### 9.7.2 统计页面字段

1. 用户名。
2. 用户 ID。
3. 提交次数。
4. 成功次数。
5. 失败次数。
6. 最近提交时间。
7. 最近完成时间。
8. 账号状态。

---

## 10. 错误提示

第一版允许直接展示 ToAPIs 原始错误信息，但需要增加一层中文解释，方便运营理解。

| 错误类型 | 中文提示 |
|---|---|
| API Key 缺失 | 请先填写你的 ToAPIs API Key |
| 401 / unauthorized | API Key 不正确或已失效，请重新填写 |
| 402 / insufficient_quota | ToAPIs 账户余额不足，请先充值 |
| 404 / task_not_found | 没找到这个任务，可能 Key 不一致或任务 ID 错误 |
| 422 / content_policy_violation | 图片或提示词可能触发平台限制，请换图或修改提示词 |
| 429 / rate_limit_exceeded | 请求太频繁，稍等几秒再试 |
| 500 / internal_error | ToAPIs 服务异常，请稍后重试 |
| 图片过大 | 图片超过限制，请压缩后再上传 |
| 图片格式不支持 | 图片格式不支持，请使用 JPG、PNG 或 WebP |
| OSS 上传失败 | 模板图上传失败，请检查网络或重新上传 |
| OSS 凭证获取失败 | 上传凭证获取失败，请重新登录或联系管理员 |
| 本地 Key 与历史任务不匹配 | 当前 Key 可能不是创建该任务时使用的 Key，因此无法查询结果 |

---

## 11. 页面结构

## 11.1 登录页

路径建议：

```text
/login
```

内容：

1. 用户名输入框。
2. 密码输入框。
3. 登录按钮。

---

## 11.2 生图工作台

路径建议：

```text
/workspace
```

内容：

1. Key 状态提示。
2. 模型下拉框。
3. Prompt 输入框。
4. 模板图选择区。
5. 临时图上传区。
6. size 选择。
7. resolution 选择。
8. 生成按钮。
9. 当前任务状态。
10. 结果图预览。
11. 结果 URL。

---

## 11.3 模板图库

路径建议：

```text
/templates
```

内容：

1. 上传模板图按钮。
2. 模板图列表。
3. 模板图预览。
4. 模板名称。
5. 上传时间。
6. 删除按钮。
7. 选择参与生图按钮。

---

## 11.4 任务历史

路径建议：

```text
/tasks
```

内容：

1. 任务列表。
2. 状态筛选。
3. 模型筛选。
4. 时间筛选，可选。
5. 任务详情。
6. 刷新状态。
7. 一键重新生成。

---

## 11.5 Key 设置页

路径建议：

```text
/settings/key
```

内容：

1. ToAPIs Key 输入框。
2. 保存到本机。
3. 测试连接。
4. 删除本地 Key。
5. Key 保存说明。

---

## 11.6 管理员后台

路径建议：

```text
/admin
```

子页面：

1. 用户管理。
2. 任务管理。
3. 模板图片管理。
4. 生成统计。

---

## 12. 数据库设计建议

## 12.1 users

```sql
CREATE TABLE users (
  id BIGINT PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'user',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  last_login_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);
```

字段说明：

| 字段 | 说明 |
|---|---|
| id | 用户 ID |
| username | 用户名 |
| password_hash | 密码哈希 |
| role | `admin` / `user` |
| status | `active` / `disabled` |
| last_login_at | 最近登录时间 |
| created_at | 创建时间 |
| updated_at | 更新时间 |

---

## 12.2 template_images

```sql
CREATE TABLE template_images (
  id BIGINT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  name VARCHAR(255) NULL,
  oss_bucket VARCHAR(255) NOT NULL,
  oss_object_key VARCHAR(1024) NOT NULL,
  public_url TEXT NOT NULL,
  original_filename VARCHAR(255) NULL,
  mime_type VARCHAR(100) NULL,
  size_bytes BIGINT NULL,
  width INT NULL,
  height INT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  deleted_at TIMESTAMP NULL
);
```

字段说明：

| 字段 | 说明 |
|---|---|
| user_id | 所属用户 |
| name | 模板图名称 |
| oss_bucket | OSS Bucket |
| oss_object_key | OSS 文件路径 |
| public_url | OSS 公共访问 URL |
| original_filename | 原始文件名 |
| mime_type | 文件 MIME 类型 |
| size_bytes | 文件大小 |
| width / height | 图片尺寸 |
| status | `active` / `deleted` |

---

## 12.3 generation_tasks

```sql
CREATE TABLE generation_tasks (
  id BIGINT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  toapis_task_id VARCHAR(255) NOT NULL,
  client_business_id VARCHAR(255) NULL,
  model VARCHAR(100) NOT NULL,
  prompt TEXT NOT NULL,
  size VARCHAR(50) NULL,
  resolution VARCHAR(50) NULL,
  n INT NOT NULL DEFAULT 1,
  template_image_ids JSON NULL,
  input_image_urls JSON NULL,
  result_image_urls JSON NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'submitted',
  progress INT NULL,
  error_code VARCHAR(100) NULL,
  error_message TEXT NULL,
  raw_error JSON NULL,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP NULL,
  expires_at TIMESTAMP NULL
);
```

字段说明：

| 字段 | 说明 |
|---|---|
| user_id | 提交任务的用户 |
| toapis_task_id | ToAPIs 返回的任务 ID |
| client_business_id | 业务侧任务 ID |
| model | 使用模型 |
| prompt | 用户输入 Prompt |
| size | 比例 |
| resolution | 分辨率 |
| n | 生成数量，第一版固定 1 |
| template_image_ids | 使用的模板图 ID |
| input_image_urls | 输入图片 URL，包括 OSS URL 和 ToAPIs 上传 URL |
| result_image_urls | 生成结果 URL |
| status | 任务状态 |
| progress | 进度 |
| error_code | 错误码 |
| error_message | 错误信息 |
| raw_error | 原始错误信息 |
| completed_at | 完成时间 |
| expires_at | 结果 URL 过期时间，如 ToAPIs 返回 |

---

## 12.4 user_generation_stats，可选

第一版可以不建统计表，直接通过 `generation_tasks` 聚合。

示例查询：

```sql
SELECT
  user_id,
  COUNT(*) AS submitted_count,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_count,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
  MAX(created_at) AS last_submitted_at
FROM generation_tasks
GROUP BY user_id;
```

---

## 13. 后端接口设计建议

## 13.1 登录

```http
POST /api/auth/login
```

请求：

```json
{
  "username": "user01",
  "password": "password"
}
```

响应：

```json
{
  "success": true,
  "user": {
    "id": 1,
    "username": "user01",
    "role": "user"
  }
}
```

---

## 13.2 退出登录

```http
POST /api/auth/logout
```

---

## 13.3 获取当前用户

```http
GET /api/me
```

---

## 13.4 管理员创建用户

```http
POST /api/admin/users
```

请求：

```json
{
  "username": "user02",
  "password": "initialPassword"
}
```

---

## 13.5 管理员重置密码

```http
POST /api/admin/users/{user_id}/reset-password
```

请求：

```json
{
  "new_password": "newPassword"
}
```

---

## 13.6 获取 OSS 上传签名

```http
POST /api/oss/upload-token
```

请求：

```json
{
  "filename": "model.png",
  "mime_type": "image/png",
  "size_bytes": 1024000
}
```

响应：

```json
{
  "upload_url": "https://bucket.oss-cn-hangzhou.aliyuncs.com",
  "object_key": "templates/1/2026/05/uuid.png",
  "public_url": "https://bucket.oss-cn-hangzhou.aliyuncs.com/templates/1/2026/05/uuid.png",
  "fields": {
    "policy": "...",
    "signature": "...",
    "OSSAccessKeyId": "..."
  }
}
```

说明：

1. 具体字段根据 OSS 上传方式调整。
2. 不允许前端获得阿里云主账号 AccessKey。
3. 上传路径必须限制在当前用户目录下。

---

## 13.7 保存模板图记录

```http
POST /api/templates
```

请求：

```json
{
  "name": "常用模特图",
  "oss_bucket": "bucket-name",
  "oss_object_key": "templates/1/2026/05/uuid.png",
  "public_url": "https://bucket.oss-cn-hangzhou.aliyuncs.com/templates/1/2026/05/uuid.png",
  "original_filename": "model.png",
  "mime_type": "image/png",
  "size_bytes": 1024000,
  "width": 2048,
  "height": 2048
}
```

---

## 13.8 获取模板图列表

```http
GET /api/templates
```

普通用户只返回自己的模板图。

---

## 13.9 删除模板图

```http
DELETE /api/templates/{template_id}
```

第一版执行软删除。

---

## 13.10 保存生成任务

```http
POST /api/tasks
```

请求：

```json
{
  "toapis_task_id": "task_img_xxx",
  "client_business_id": "biz_xxx",
  "model": "gpt-image-2",
  "prompt": "用户输入的提示词",
  "size": "1:1",
  "resolution": "1K",
  "n": 1,
  "template_image_ids": [1, 2],
  "input_image_urls": [
    "https://bucket.oss-cn-hangzhou.aliyuncs.com/templates/1/2026/05/uuid.png"
  ],
  "status": "submitted",
  "progress": 0
}
```

说明：

1. 前端调用 ToAPIs 成功拿到 task_id 后，再调用本接口。
2. 后端保存成功后，生成次数 +1。
3. 如果保存失败，前端应提示“任务已提交到 ToAPIs，但本地记录保存失败”。

---

## 13.11 获取任务历史

```http
GET /api/tasks
```

普通用户只返回自己的任务。

管理员可以通过后台接口查看全部任务。

---

## 13.12 更新任务状态

```http
PATCH /api/tasks/{task_id}
```

请求：

```json
{
  "status": "completed",
  "progress": 100,
  "result_image_urls": [
    "https://example.com/result.png"
  ],
  "completed_at": "2026-05-25T10:00:00Z",
  "expires_at": "2026-05-26T10:00:00Z"
}
```

说明：

1. 状态查询由前端用本地 ToAPIs Key 完成。
2. 查询结果由前端同步给服务器。
3. 后端需要校验该任务是否属于当前用户。
4. 管理员可以更新所有任务，普通用户只能更新自己的任务。

---

## 13.13 管理员任务列表

```http
GET /api/admin/tasks
```

---

## 13.14 管理员统计

```http
GET /api/admin/stats/users
```

响应示例：

```json
[
  {
    "user_id": 1,
    "username": "user01",
    "submitted_count": 20,
    "completed_count": 18,
    "failed_count": 2,
    "last_submitted_at": "2026-05-25T10:00:00Z"
  }
]
```

---

## 14. 前端 ToAPIs 调用逻辑

## 14.1 上传临时图到 ToAPIs

使用用户本地 ToAPIs Key。

```http
POST https://toapis.com/v1/uploads/images
Authorization: Bearer 用户自己的 ToAPIs Key
Content-Type: multipart/form-data
```

返回后获取图片 URL。

---

## 14.2 创建图像任务

```http
POST https://toapis.com/v1/images/generations
Authorization: Bearer 用户自己的 ToAPIs Key
Content-Type: application/json
```

请求体由模型适配层生成。

---

## 14.3 查询任务状态

```http
GET https://toapis.com/v1/images/generations/{task_id}
Authorization: Bearer 用户自己的 ToAPIs Key
```

查询结果同步到业务服务器。

---

## 15. 任务计数规则

### 15.1 何时计数

当 ToAPIs 创建任务接口返回 `task_id` 时，系统记录一次生成。

```text
拿到 task_id = 生成次数 +1
```

### 15.2 失败任务是否计数

计数。

原因：

1. 用户已经成功提交到 ToAPIs。
2. ToAPIs 已经受理任务。
3. 成本和使用行为已经发生。

### 15.3 保存失败情况

如果 ToAPIs 返回 task_id，但业务服务器保存任务失败：

1. 前端提示用户：任务已提交，但本地记录保存失败。
2. 前端可以提供“重试保存记录”按钮。
3. 该任务可能无法进入管理员统计，除非后续补写成功。

---

## 16. 权限隔离

### 16.1 普通用户

普通用户只能访问：

1. 自己的任务。
2. 自己的模板图片。
3. 自己的统计，可选。
4. 自己的 Key 设置。

普通用户不能访问：

1. 其他用户任务。
2. 其他用户模板图片。
3. 管理员后台。
4. 用户管理接口。

### 16.2 管理员

管理员可以访问：

1. 所有用户。
2. 所有任务。
3. 所有模板图片元信息。
4. 所有统计。

### 16.3 OSS 公共读风险说明

由于 OSS 使用公共读：

1. 任何人拿到图片 URL 都可以访问图片。
2. 系统层面仍然需要按用户隔离模板列表。
3. 普通用户不应该通过业务接口获取其他用户的 OSS URL。
4. 管理员可以查看所有图片 URL。

---

## 17. 安全要求

1. 用户密码必须哈希存储。
2. 不允许明文保存密码。
3. 不允许保存用户 ToAPIs Key 到服务器。
4. 不允许日志打印 ToAPIs Key。
5. 不允许将阿里云主账号 AccessKey 写进前端。
6. OSS 上传路径必须由服务器生成，不能让前端任意指定。
7. 普通用户接口必须校验 `user_id`。
8. 管理员接口必须校验 `role = admin`。
9. 上传模板图时限制文件类型和大小。
10. 任务更新接口需要校验任务归属，避免用户篡改他人任务状态。

---

## 18. CORS 说明

第一版暂时忽略 CORS 风险，按以下前提设计：

1. 浏览器可以直接访问 ToAPIs。
2. 浏览器可以直接上传 OSS。
3. OSS 配置允许你的 Web 域名跨域上传。
4. 如后续 ToAPIs 浏览器直连存在 CORS 问题，再单独调整方案。

如果 ToAPIs 不允许浏览器跨域直连，备选方案：

1. 改为 Electron / Tauri 客户端。
2. 或增加后端代理，但会增加服务器流量，不符合当前成本目标。

第一版暂不处理该问题。

---

## 19. 验收标准

### 19.1 登录与账号

- 管理员可以创建普通用户。
- 普通用户可以登录。
- 普通用户不能注册。
- 普通用户不能修改密码。
- 管理员可以重置普通用户密码。
- 禁用用户不能登录。

### 19.2 Key

- 用户可以在浏览器本地保存 ToAPIs Key。
- 刷新页面后 Key 仍存在。
- 删除 Key 后无法提交任务。
- Key 不会出现在服务器数据库。
- Key 不会出现在业务服务器请求体中。

### 19.3 模板图

- 用户可以上传模板图到 OSS。
- 上传后业务服务器保存模板图元信息。
- 普通用户只能看到自己的模板图。
- 管理员可以看到所有模板图。
- OSS 图片 URL 可以被 ToAPIs 读取并参与生图。

### 19.4 生图

- 用户可以选择四个模型之一。
- 默认模型为 `gpt-image-2`。
- 用户可以输入 Prompt。
- 用户可以选择模板图参与生图。
- 用户可以上传临时参考图到 ToAPIs。
- 创建任务成功后获得 task_id。
- 获得 task_id 后业务服务器保存任务。
- 获得 task_id 后生成次数 +1。
- 一次只生成 1 张图。

### 19.5 任务历史

- 普通用户只能看到自己的任务历史。
- 管理员可以看到所有任务历史。
- 任务历史永久保留。
- 任务历史包含提交日期和 ToAPIs task_id。
- 任务历史包含模型、Prompt、图片 URL、状态和错误信息。
- 用户重新登录后，可以用本地 Key 刷新未完成任务状态。
- 支持一键重新生成。

### 19.6 统计

- 管理员可以看到每个用户的提交次数。
- 提交次数以拿到 ToAPIs task_id 为准。
- 管理员可以看到成功次数和失败次数，若已实现状态同步。

---

## 20. 开发优先级

### P0 必须完成

1. 登录。
2. 管理员创建账号。
3. 管理员重置密码。
4. 用户本地保存 ToAPIs Key。
5. OSS 模板图上传。
6. 模板图列表。
7. 四模型选择。
8. Prompt 输入。
9. 调用 ToAPIs 创建任务。
10. 保存任务历史。
11. 任务状态查询。
12. 管理员查看任务和统计。

### P1 建议完成

1. 一键重新生成。
2. 错误提示中文化。
3. 用户禁用 / 启用。
4. 任务筛选。
5. 模板图重命名。
6. 模板图软删除。

### P2 后续考虑

1. 模板分类。
2. 常用 Prompt。
3. 换装 / 重绘 / 主图等业务功能。
4. 批量生成。
5. 多模型对比。
6. 结果图本地批量下载。
7. 更细权限。
8. 操作日志。
9. OSS 文件自动清理。

---

## 21. 未决事项

当前暂不影响第一版开发，但后续需要关注：

1. ToAPIs 浏览器直连是否存在 CORS 限制。
2. ToAPIs 不同模型的参数兼容性是否会变化。
3. OSS 公共读是否会带来图片泄露风险。
4. 生成结果 URL 的有效期问题。
5. 是否需要将历史任务导出为 Excel。
6. 是否需要记录更细的用户操作日志。
7. 是否需要模板图容量限制。
8. 是否需要限制每个用户每天生成次数。
9. 是否需要管理员手动调整用户状态。
10. 是否需要支持更多 ToAPIs 模型。

---

## 22. 当前定版摘要

第一版最终定义：

```text
一个内部网页工具。

用户登录后，在本地浏览器保存自己的 ToAPIs Key。
用户上传常用模板图到阿里云 OSS，OSS 公共读。
用户选择模型、输入 Prompt、选择模板图，前端直接调用 ToAPIs 创建任务。
拿到 task_id 后，服务器保存任务历史并计数。
任务状态由浏览器用本地 Key 查询 ToAPIs，再同步到服务器。
普通用户只能看自己的任务和模板图。
管理员可以创建账号、重置密码、查看所有任务详情和每个用户生成数量。
```

---

## 23. 需求变更记录

### 2026-06-17 — 修复模板图库「拖缩略图入收藏」失效

- **问题**：进入收藏编辑态后，按住网格缩略图拖入收藏区无反应（仅抓卡片留白处偶发可用）。根因：缩略图 `<img>` 是 HTML5 原生可拖拽元素，劫持了卡片（`draggable=true`）的拖拽，卡片 `dragstart` 未写入模板 id，收藏区 `drop` 拿不到 id 静默失败；图片越大、缩略图占卡片面积越大越易触发，曾误判为「图片过大」。修复：网格缩略图 `<img>` 加 `draggable="false"`，拖拽冒泡到卡片。详见 9.4.6 验收第 4 条与 `docs/records/bug-fixes.md`。

### 2026-06-16 — 模板收藏行常驻 + 术语统一为「收藏」

- **收藏行常驻**：生图工作台两图功能页的「模板收藏行」改为始终显示，取消「无收藏时隐藏」和「两图已满时隐藏」两个旧条件；新增左侧引导入口（跳转 `/templates`）与无收藏空状态。解决用户「看不到该功能 / 不知去哪收藏 / 填满图后收藏行消失」的问题。详见 9.4.6。
- **术语统一**：模板图库页所有用户可见文案由「常用」改为「收藏」（按钮、提示、空状态、hint）；字段名与变量名不变。
- **保留行为**：两图已满时点击收藏模板仍替换第一个槽位（既有逻辑，未改）。

