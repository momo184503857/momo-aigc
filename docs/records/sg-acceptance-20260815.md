# suite-gen 验收报告（2026-08-15）

> 验收对象：成套生图与提示词专家（suite-gen）首版实现
> 验收依据：`docs/requirements/suite-gen-acceptance.md`
> 验收环境：本机 dev（Express:3000 + Vite:5173，共享模式，admin 账号）
> 自动化证据：`scripts/test-promptEngine.ts`（41 通过 / 0 失败）、`scripts/smoke-sg.ts`（34 通过 / 0 失败）、`scripts/test-smartMatch.ts`（6 通过 / 0 失败）、`npm run check` + `npm run build` 通过、GUI DOM 快照验证 4 个页面

## 一、交付清单

**后端**（6 改 3 新）
- `server/src/db/seedSuiteGen.ts`（新）：6 资产表 + sg_suites + generation_tasks 迁移列 + 种子（幂等守卫 seed_sg_assets_v1）
- `server/src/db/data/suiteGenSeed.json`（新）：`scripts/extract-workbench.mjs` 从工作台 V10.0 提取
- `server/src/routes/sgAssets.ts`（新）：资产 CRUD 工厂（6 类型共用，双轨权限，admin 附加发布卡片）
- `server/src/routes/sgSuites.ts`（新）：套系 CRUD + 任务聚合状态
- 修改：`schema.ts`（挂载 initSuiteGen）、`tasks.ts`（suite_id/point_index 透传 + suiteId 过滤）、`index.ts`（4 路由挂载）

**前端**（12 改 25 新）
- 引擎：`src/utils/promptEngine/`（纯函数）、`imageAnalysis.ts`、`smartMatch.ts`
- 服务/组合式：`sgApi.ts`、`useAssetLibrary.ts`
- 组件：`src/components/sg/` 10 个（AssetPicker/ThemeCard/TrackSelect/PersonaPicker/GarmentUpload/GarmentFeatureChips/GarmentDetailForm/SmartMatchPanel/PromptPreview/SuiteTaskGroup/DecomposeForm18/ExpertSlotForm）
- 页面：`/suite-gen`（6 步向导 + 历史套系）、`/expert`（4 Tab）、`/admin/sg-assets`（6 Tab 资产管理）
- 接线：路由 + helpKey + helpRegistry + 2 份帮助文档 + 侧边栏（用户/管理）+ tabs 元数据 + featureConfig（expert-fusion/expert-swap）+ feature_prompts 种子

## 二、验收结果对照

### M1 资产体系与权限 —— 20/21 通过

| 用例 | 结果 | 证据 |
|---|---|---|
| M1-01 种子完整 | ✅ | 冒烟实测：themes=100 / tracks=7 / personas=8 / locks=22 / features=33 / knowledge=25 / feature_prompts 新功能 16 行 |
| M1-02 幂等 | ✅ | 多次热重启计数不变；guard=done（SQL 断言） |
| M1-03 点位=5 | ✅ | SQL json_array_length 断言全过 |
| M1-10 打开即用 | ✅ | userA 匿名首访即可见 100 全局主题（API） |
| M1-11/12 私有创建与隔离 | ✅ | userA 建私有 / userB 不可见（API） |
| M1-13 越权改他人私有 | ✅ | 403（API） |
| M1-14 复制为我的 | ✅ | 副本生成且原行不变（API） |
| M1-15 用户改全局 | ✅ | 403（API + 界面无入口） |
| M1-16 admin 全局增删停 | ✅ | 新建即全员可见；停用即全员不可见（API） |
| M1-17 种子禁删 | ✅ | admin 删种子 → 400（API） |
| M1-18 分模型话术 | ⚠️ 部分 | 机制完备（models 字段 + 组装过滤 M3-04 单测过），分模型基线话术内容未录入（依赖 P0 实测调优） |
| M1-19 use_count | ✅ | /use 端点 + 页面提交时上报 + 后台热度列 |
| M1-20 过滤分页 | ✅ | scope/keyword/season/grp 参数实现（API） |

### M2 成套生图主流程 —— 核心链路通过，4 项遗留

| 用例 | 结果 | 证据 |
|---|---|---|
| M2-01/02/05 上传与主色识别 | ✅ 代码 / ⚠️ 未浏览器实测 | Canvas 分析纯函数 + 事件链实现；IAB 不支持文件上传无法 GUI 实测 |
| M2-03/04 智能匹配 | ✅ | test-smartMatch 6 项全过（新中式/法式命中、无特征兜底、3×2 卡片） |
| M2-06 四层预填 | ✅ | detail_hint 字段全量携带 |
| M2-07 Prompt 预览开关/编辑 | ✅ 引擎层 | 组装正确性 41 单测；GUI 交互未实测（同上传限制） |
| M2-10 积分预估 | ✅ | 5×单价面板 + 后端 402 余额拦截（现有逻辑） |
| M2-11 五任务提交 | ✅ | API 冒烟：suite_id/point_index 落库、点位 0-4、tasks?suiteId=5 条 |
| M2-12 套系分组视图 | ✅（偏离说明） | SuiteTaskGroup 5 点位缩略墙 + 聚合状态，位于成套生图历史区；TaskList 组件未改动（控爆炸半径） |
| M2-13 状态聚合 | ✅ | generating/completed 聚合断言（API）；打包 zip 下载未实现 |
| M2-14 失败点重生成 | ✅ | regenerate-failed 仅重发失败/待生成点位；退费走现有机制 |
| M2-16 发布作品 | ✅ | 循环 worksApi.publish 携带 prompt_segments |
| M2-18 双模式 | ⚠️ 部分 | 共享模式全链路验证；用户模式（浏览器直连）未实测 |

### M3 提示词组装体系 —— 41/43 通过

M3-01~08 引擎单测全过（含 golden 工作台基线对比 16 条、fuzz 500 组）；M3-10 发布官方卡片（API）通过；M3-11 工坊卡片 → 我的模板反向通道未实现（遗留）。

### M4 提示词专家 —— 功能齐备，3 项遗留

GUI 快照验证：4 Tab 渲染、18 项表单（知识库驱动下拉）、推理/反馈按钮、swap 四图槽 + 实时组装的保真 Prompt（DB 模板端到端生效）。遗留：M4-03 历史相似主题回退、M4-04 精准字段优先保留、M4-06 应用到自由生图按钮。

### M5 兼容与回归

- M5-01 ✅ 老 dev 库原位升级成功，存量表/接口无破坏（新增列均可空）
- M5-02 ⚠️ 未全量回归现有 9 功能（构建 + 登录 + workspace 冒烟正常）
- M5-06 ✅ 管理页仅 admin 可见（requiresAdmin + adminMiddleware）
- M5-07 ✅ helpKey 注册 + 2 份文档落位；**发现**：帮助按钮在当前长驻 Vite 会话中禁用——在未修改的 prompt-workshop 路由上同样复现，判定为 HMR 模块单例环境问题，非本次回归（新 dev server 需复核）
- M5-08 ✅ 规范扫描：新代码硬编码色值 0、直接 ElMessage 0、--momo-* token 250 处

### M6 效果验收 —— ❌ 未执行（S 级未完成项）

需有效 ToAPIs Key 真实生图 + ≥2 人人工评审（服装还原 ≥80% / 模特一致 ≥80% / 翻车率 ≤20%）。此为上线前必须项，依赖 P0 话术基线。

### 性能

P-04 五任务提交（不含生图）串行 +300ms 间隔达标；P-05 fuzz 500 组组装瞬时完成（未精确计时）。

## 三、结论与遗留

**自动化验收：81 项断言全部通过（41 单测 + 34 API 冒烟 + 6 匹配测试），构建全绿，4 页面 GUI 渲染验证通过。**

遗留清单（按优先级）：

| # | 项 | 级别 | 说明 |
|---|---|---|---|
| 1 | M6 效果评审 + P0 分模型基线话术 | S | 需真实 API Key 环境执行 |
| 2 | M2-18 用户模式（浏览器直连）实测 | S | 需配置个人 Key 账号 |
| 3 | 草稿自动保存（步骤⑤刷新不丢） | A | 当前提交时才落库 |
| 4 | PromptPreview「存为我的模板」按钮 | A | 后端已支持，缺前端入口 |
| 5 | 套系打包 zip 下载 | A | 单张下载已可用 |
| 6 | 并发套系数限制（≤2） | B | 后端可加简单计数 |
| 7 | 工坊卡片 → 成套模板反向复用 | B | M3-11 |
| 8 | 拆解推理：历史回退 + 精准反馈闭环 | B | M4-03/04 |
| 9 | M5-02 现有功能全量回归 + M2 GUI 全流程人工过单 | A | 上线前执行 |
| 10 | 帮助按钮 HMR 环境复核 | B | 新 dev server 验证 |

## 五、追加验收（2026-08-15 第二轮，S 级缺口处置）

**环境核查结论**：当前环境**没有任何有效 ToAPIs API Key**（`system_config.toapis_api_key` 为空、`user_toapis_keys` 无记录、`.env` 无 Key、工作台 `api_config.json` 为空账号、工作台 `E:\WorkBuddy工作文件\API文件.txt` 不存在）。OSS/SMTP/JWT 均已配置。**M6 真实生图与 M2-18 个人 Key 直连为凭据阻塞项，非代码缺口**，需用户提供 Key 后一键执行。

本轮已完成的补齐：

| 项 | 结果 | 证据 |
|---|---|---|
| S-1 前置：P0 分模型基线话术 v0 | ✅ 已入库 | `scripts/seed-p0-baselines.ts` 写入 8 条（gpt 原文版 + Gemini 正向压缩版），幂等守卫；文档 `docs/records/sg-p0-baseline-20260815.md` |
| S-1 前置：引擎分模型优先级 | ✅ 修复+单测 | `assemble` 支持"私有+专属 > 私有 > 全局专属 > 全局通用 > 内置"合并；专项断言 3 项（合计 44/44 通过） |
| S-1 执行通道：M6 一键脚本 | ✅ 就绪 | `scripts/run-m6-suite.ts --key <Key>`：写 Key → 自动生成服装参考图 → 双模型 × 5 点位 → 轮询 → OSS 转存 → 输出评审材料清单；无 Key 时正确拦截（实测 exit 2） |
| M2-18 可测部分：用户模式判定与引导 | ✅ 实测 | 当前环境即用户模式分支（sharedKeyConfigured=false）：health 判定正确、自由生图页显示"未配置可用的 API Key（共享/个人均未配置）"、生成按钮禁用；个人 Key 配置入口（我的额度页 Key 弹窗+模式切换）完好 |
| M2-18 网络直连 + M6-01~06 评审 | ⏸ 阻塞 | 唯一缺失输入 = 有效 ToAPIs Key（付费凭据，仅用户可提供） |

**用户提供 Key 后的完整复验路径**（预计 30~40 分钟，含生图等待）：

```bash
# 1. M6 双模型真实生图 + 评审材料（自动：参考图→10张→OSS→材料清单）
npx tsx scripts/run-m6-suite.ts --key <ToAPIs Key>
# 2. 按材料清单视觉评审 → 写 docs/records/sg-effect-review-YYYYMMDD.md（对照 M6-01~06 标准）
# 3. M2-18 个人 Key：在「我的额度」页粘贴同一 Key 启用个人模式，自由生图提交 1 张验证直连链路
# 4. 话术校准：评审翻车项 → 后台改对应模型版模板 → 复跑单点位
```

## 四、复验命令

```bash
npx tsx scripts/test-promptEngine.ts   # 44 项（含分模型优先级）
npx tsx scripts/test-smartMatch.ts     # 6 项
npm run dev:server &                   # 启动后：
npx tsx scripts/smoke-sg.ts            # 34 项（自建/自清理测试用户）
npx tsx scripts/seed-p0-baselines.ts   # P0 基线话术（幂等）
npm run check && npm run build
```
