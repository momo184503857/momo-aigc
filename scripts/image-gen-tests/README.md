# AI 生图模块端到端回归测试

验证 `src/services/imageGeneration.ts` 的三层重构（`submitTask` / `pollTask` / `importResultUrls` / `generateImage`）不被回归破坏。直接 import 核心函数，通过后端共享 Key 跑真实 ToAPIs/OSS。

## 前置条件

1. 后端已启动：`npm run dev:server`（端口 3000）
2. 共享 API Key 已配置（管理员后台，`GET /api/toapis/health` 返回 `sharedKeyConfigured: true`）
3. `admin / admin123` 可登录（默认种子账号）

## 运行

在项目根目录：

```bash
npx tsx scripts/image-gen-tests/test.ts <scenario>
```

| scenario | 验证内容 | 消耗 |
|----------|---------|------|
| `ping` | 只读连通性（登录 + taskApi.list） | 0 |
| `free-gen` | `generateImage({poll, import})` 全链路：本地图上传→建任务→轮询→转存→DB completed | ~0.084 |
| `batch-clothes` | 共享衣服图只上传一次（重构修复的效率 bug） | ~0.17（2 次提交） |
| `buyer-show` | `submitTask` + `getTaskStatus` 行级轮询 + `importResultUrls` | ~0.084 |
| `fail-check` | `generateImage` DB 终态写入（成功→completed，失败→failed） | ~0.084–0.34 |
| `all` | 跑 free-gen + batch-clothes + buyer-show | ~0.34 |

> 单次生成约 0.084 元（gemini-2.5-flash-image-preview / 1K）。

## 测试案例

默认用 `fixtures/` 下的图（可通过环境变量覆盖）：

| 角色 | 文件 | 说明 |
|------|------|------|
| 模特图（图一） | `fixtures/model.png` | 768×1344 竖图 |
| 衣服图（图二） | `fixtures/garment.jpg` | 800×800 方图 |

固定参数：`model = gemini-2.5-flash-image-preview`、`resolution = 1K`、`aspect = 9:16`。

用其他图测试：

```bash
TEST_MODEL_IMAGE=/path/to/a.png TEST_GARMENT_IMAGE=/path/to/b.jpg \
  npx tsx scripts/image-gen-tests/test.ts free-gen
```

## 已知注意事项

- **Gemini 偶发不返回图**：`gemini-2.5-flash` 有时返回 `no images in Gemini generateContent response`，任务标记为 failed。这是模型侧偶发，非代码 bug，重跑即可。`batch-clothes`/`buyer-show` 遇到时会提示重跑。
- **测试会建 DB 任务**：跑完会在任务列表留下测试记录，需要时手动清理（删 `id` 大于历史最大值的测试任务即可）。
- **fixtures 已 gitignore**：`fixtures/*.png|jpg` 默认不提交（个人测试图），本地保留。需要版本化时改 `fixtures/.gitignore`。

## 这个测试套件抓到过的 bug

**`generateImage` 成功时 DB 写入被耦合在 `import` 选项里**：调用 `generateImage(params, { poll: true })`（不传 `import`，JSDoc 文档里的合法用法）时，即使轮询成功，DB 任务也永远卡在 `submitted`。

修复：成功分支现在无条件写 `completed`，`import` 只决定是否附带 `result_image_urls`；失败分支无条件写 `failed`。两者对称，DB 总能到达终态。

—— 这个 bug 是 `fail-check` 场景实测时（断言"DB 状态须等于轮询结果"）暴露出来的，纯靠代码审查难以发现。这就是保留真实端到端测试的价值。
