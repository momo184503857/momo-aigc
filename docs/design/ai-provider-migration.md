# AI 接入体系重构 · 数据迁移与上线手册（ai-provider）

> 对应功能方案 `docs/requirements/ai-provider.md`、技术方案 `docs/design/ai-provider-tech.md`、验收标准 `docs/requirements/ai-provider-acceptance.md`。
> 本手册覆盖：存量数据映射规则、迁移脚本设计、上线步骤、上线后验证、回滚方案、退役时间线。
> 背景：本次为**一次性全上**（D11）+ **平滑迁移**（D10），迁移失败必须可回滚到升级前状态。

---

## 1. 迁移数据清单与映射规则

### 1.1 涉及数据总览

| # | 源 | 目标 | 量级预估 | 风险 |
|---|---|---|---|---|
| T1 | 前端 `MODELS`/`TEXT_MODELS` 常量（代码内） | `ai_logical_models` 7 行 | 固定 | 低（纯新增） |
| T2 | `system_config.toapis_api_key` | toapis 平台渠道主 Key（`api_provider_keys`） | 1 行 | 低 |
| T3 | 前端 MODELS + `utils/pricing.ts`（代码内） | toapis 平台渠道下 7 个 `ai_models` 渠道模型（含定价 JSON） | 7 行 | 低 |
| T4 | `user_toapis_keys` 全表 | 每用户一条 toapis 用户渠道（`api_providers` owner=用户）+ 主 Key + 4 个生图渠道模型 | 用户数 N（N×6 行） | 中（加密数据搬迁） |
| T5 | `generation_tasks` 全表 | 回填 `provider_code='toapis'`、`provider_task_id=toapis_task_id`、`task_no`、`channel_model_id/channel_provider_id`（toapis 渠道模型） | 历史任务数 M | 中（量大、要求无损） |
| T6 | `buyer_show_batch_items.toapis_task_id` | 不迁移（停写，保留兼容旧数据） | — | 低 |

### 1.2 映射规则明细

**T1 逻辑模型种子**（`seed_ai_provider_v1` 幂等守卫）：

| logical code | kind | 能力来源 | 定价种子（仅校对用，定价落在 T3） |
|---|---|---|---|
| gpt-image-2 | image | 原 MODELS：1K/2K/4K + aspectRatiosByResolution、maxRef=14 | 3/4/5 |
| gemini-3-pro-image-preview | image | 同上 | 10/12/16 |
| gemini-3.1-flash-image-preview | image | 含 512 档、14 种宽高比 | 5/6/8/12 |
| gemini-2.5-flash-image-preview | image | 仅 1K、maxPromptChars=1000 | 1K=2.4 |
| gpt-5.5 / gemini-3-flash / gemini-3.1-flash-lite | text | 原 TEXT_MODELS | — |

**T2/T3 toapis 平台渠道**：

```
api_providers: code='toapis', name='ToAPIs', base_url='https://toapis.com',
               adapter='toapis', owner_user_id=NULL
api_provider_keys: 主 Key = system_config.toapis_api_key（迁移后原配置保留不动，双写一个版本便于回滚）
ai_models ×7: provider_id=toapis渠道, model_id=原模型名, logical_model_id=对应逻辑模型,
              supports_image_gen=1（生图4个）/ supports_chat=1（文字3个）, pricing=定价 JSON
```

**T4 个人 Key → 我的渠道**（逐用户）：

```
api_providers: code='u{userId}-{6位随机}', name='ToAPIs（迁移）', base_url='https://toapis.com',
               adapter='toapis', owner_user_id=用户, status=use_personal_key=1 ? 'active' : 'disabled'
api_provider_keys: encrypted_key/key_iv/key_tag/key_hint 原样搬移（同 ENCRYPTION_KEY 下密文直接可用，
                   无需解密重加密；balance_check_interval_sec 随渠道扩展列或配置项保留）
ai_models ×4: 该渠道下生图模型（logical/pricing 同 T3，pricing=NULL）
```

- `use_personal_key=0` 的用户也建渠道但置 disabled，保留其 Key 待用户自行启用。
- 加密密钥轮换场景（JWT_SECRET 变更导致旧密文不可解）与现状行为一致：迁移不修复，用户重录。

**T5 历史任务回填**：

```
provider_code   = 'toapis'
provider_task_id= toapis_task_id（原值，列停写）
channel_provider_id = toapis 平台渠道 id
channel_model_id= 按 model 列匹配 toapis 渠道模型（匹配不上的置 NULL，不影响展示）
task_no         = 'gen-' || printf('%08d', id)
status          = 原值不变；仍在 ACTIVE 状态的旧任务由新轮询端点继续按 provider_task_id 轮询（协议兼容）
```

---

## 2. 迁移脚本设计

- 位置：`server/src/db/schema.ts` 启动迁移（沿用现有惯例）+ 独立校验脚本 `scripts/verify-ai-provider-migration.mjs`。
- **幂等**：`system_config` 标记两级——`seed_ai_provider_v1`（T1-T3 种子）、`migrate_user_keys_v1`（T4）、`migrate_tasks_v1`（T5）。标记完成即跳过；T5 支持断点续跑（按行判断 task_no IS NULL）。
- **事务**：T4/T5 分批（500 行/事务），失败即回滚该批并中止启动（迁移不完整不对外服务）。
- **dry-run**：`MIGRATION_DRY_RUN=1 npm run dev:server` 输出每步影响行数与抽样结果，不写库。
- **备份**：启动迁移前自动 `sqlite3 data/momoaigc.db ".backup data/backup-pre-ai-provider-{ts}.db"`（better-sqlite3 `db.backup()`），备份失败则中止。
- **校验脚本**输出（对应验收 M7）：
  1. task_no 唯一性与覆盖率 = 100%；
  2. provider_task_id 与原 toapis_task_id 逐行一致（抽全量比对）；
  3. 用户渠道数 = 原 user_toapis_keys 行数；每渠道 Key hint 与原 key_hint 一致；
  4. 定价 JSON 与原 pricing.ts 常量一致；
  5. 历史积分流水/统计汇总数值与迁移前快照一致。

---

## 3. 上线步骤（Checklist）

> 前置：代码合入 release 分支、测试环境已按验收文档 M1-M9 全量通过。

| # | 步骤 | 说明 / 验证点 |
|---|------|--------------|
| 1 | 停写入公告（可选，低峰期） | 通知用户升级窗口 |
| 2 | 备份：DB 文件 + `.env`（ENCRYPTION_KEY/JWT_SECRET 快照） | 记录备份路径；OSS Worker 配置不动 |
| 3 | 部署后端新版本 | 启动日志确认：备份成功 → 迁移各级标记写入 → 清扫（§4.5）执行 → 服务监听 |
| 4 | 跑 `scripts/verify-ai-provider-migration.mjs` | 全部校验项 PASS（=验收 M7-01/02/06） |
| 5 | 部署前端新版本 | 静态资源发布 |
| 6 | 冒烟（生产） | admin 登录看配置页；userA 平台模型 1 张（小额积分）；userA 个人渠道模型 1 张；历史任务打开 |
| 7 | 观察期（1~24h） | 错误日志 grep `[generations]`；任务卡 submitted 计数=0；转存失败率；积分流水对账 |
| 8 | 解除公告 | — |

**回滚触发条件**（满足其一）：迁移校验失败且无法续跑；冒烟主流程失败；积分对账不平。

---

## 4. 回滚方案

1. **后端代码回退**：回退到上一版本镜像/commit；旧代码不识别新列但**不破坏**（新列均为可空/带默认值，旧读写路径只碰旧列）。
2. **数据回滚**：恢复步骤 2 的 DB 备份（`.backup` 文件替换）。**注意**：仅在迁移当次窗口内有效；一旦新版本已产生新任务/积分流水，禁止整库回滚，改为前滚修复（见下）。
3. **前滚修复预案**：
   - 新任务缺 task_no → 按 T5 规则补跑；
   - 双写过渡（T2）：升级后一个版本内 `system_config.toapis_api_key` 与渠道主 Key 同步维护，回滚时旧代码立即可用；
   - 个人 Key：旧表 `user_toapis_keys` 迁移后保留只读，回滚场景旧代码仍读旧表——**迁移期间旧表不删不改**（退役时间线见 §5）。
4. **回滚验证**：旧版本启动 → 用旧共享 Key 生图 1 张 → 个人 Key 用户生图 1 张 → 历史任务展示。

---

## 5. 退役时间线（旧设施清理节奏）

| 阶段 | 动作 |
|------|------|
| 本次上线 | 旧端点/旧表全部保留但停用：`toapis-proxy` 生图三端点返回 410（提示新端点）；`me-toapis-key` 路由保留（旧缓存页防报错）但 UI 入口移除；`user_toapis_keys`/`toapis_task_id` 列停写 |
| 上线 + 1 个版本 | 删除 `toapis-proxy.ts` 生图端点、`me-toapis-key.ts`、`userKeyApi.ts`、前端 `toapisClient.ts`/`build*Request.ts`、`utils/pricing.ts` 硬编码；tasks.ts 兼容读端点删除 |
| 上线 + 2 个版本（确认无回滚需求） | `DROP` 迁移：`user_toapis_keys` 表、`generation_tasks.toapis_task_id`、`buyer_show_batch_items.toapis_task_id`（各配独立迁移标记与备份） |

---

## 6. 文档同步（上线收尾）

- `docs/reference/architecture.md`：生图三层架构 → 渠道/编排新架构图；「禁止直调 toapisProxyApi」约束改为「禁止绕过 /api/generations」。
- `docs/reference/api-spec.md`：新增 generations/models/myChannels 端点，标注旧端点退役。
- `docs/reference/database-schema.md`：三表扩列 + ai_logical_models + generation_tasks 新列。
- `docs/requirements/billing.md`：定价真源改为 ai_models.pricing，补充渠道×模型×分辨率口径。
- `AGENTS.md`：架构章节按新体系重写（任务键、Key 解析、适配器层）。
- `docs/records/decision-log.md`：记录 D1-D12 决策与上线日期。
