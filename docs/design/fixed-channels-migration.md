# 固定渠道与多 Key 轮换 · 数据迁移与上线手册（fixed-channels）

> 对应功能方案 `docs/requirements/fixed-channels.md`、技术方案 `docs/design/fixed-channels-tech.md`、验收标准 `docs/requirements/fixed-channels-acceptance.md`（已实施）。
> 本手册覆盖：T7 迁移步骤与映射规则、脚本设计、上线步骤、上线后验证、回滚方案、退役时间线。
> 背景：本迁移是 ai-provider 迁移（T1-T6，见 `docs/design/ai-provider-migration.md`）的**后续收尾**——删除用户渠道数据、拆除主 Key 约束、清理遗留表。**含删除性操作，必须先备份。**

---

## 1. 迁移数据清单与映射规则

### 1.1 涉及数据总览

| # | 源 | 目标 | 量级预估 | 风险 |
|---|---|---|---|---|
| T7.1 | `api_provider_keys` 表结构 | + `priority`、+ `exhausted_at` 两列 | DDL | 低 |
| T7.2 | `is_primary=1` 的 Key | `priority = 1`；其余 Key `priority = 100` | Key 行数 | 低 |
| T7.3 | `idx_api_provider_keys_primary` + `is_primary` 列 | DROP INDEX + DROP COLUMN | DDL | 中（DROP COLUMN 依赖 SQLite ≥ 3.35） |
| T7.4 | 全部用户渠道（`owner_user_id` 非空）及其 keys/models | 先置空历史任务外键，再整链删除 | 用户渠道数 × (1+N+M) | **高（删除性，必须备份）** |
| T7.5 | `user_toapis_keys` 表 | DROP TABLE | 遗留数据 | 中（删除性；此前 ai-provider 已约定保留一个版本，本期兑现清理） |
| T7.6 | （纯代码）基线 schema / 种子同步 | `schema.ts` 不再创建 is_primary；种子 Key priority=1 | — | 低 |

### 1.2 映射规则明细

**T7.1 / T7.2 Key 池列与回填**：

```sql
ALTER TABLE api_provider_keys ADD COLUMN priority     INTEGER NOT NULL DEFAULT 100;  -- try/catch 幂等
ALTER TABLE api_provider_keys ADD COLUMN exhausted_at TIMESTAMP NULL;               -- try/catch 幂等
UPDATE api_provider_keys SET priority = 1 WHERE is_primary = 1;                     -- 原主 Key 最先
-- 其余 Key 保持 DEFAULT 100：选取序 priority ASC, id ASC 与原「删主 Key 后按 id 提升」语义一致
```

**T7.3 拆除主 Key 约束**：

```sql
DROP INDEX IF EXISTS idx_api_provider_keys_primary;
ALTER TABLE api_provider_keys DROP COLUMN is_primary;   -- try/catch：旧 SQLite 保留死列，代码零引用即可
```

**T7.4 用户渠道删除**（顺序固定）：

```sql
-- 1) 历史任务外键置空（沿用渠道删除惯例，保证任务记录可读）
UPDATE generation_tasks
   SET channel_model_id = NULL, channel_provider_id = NULL
 WHERE channel_provider_id IN (SELECT id FROM api_providers WHERE owner_user_id IS NOT NULL);
-- 2) 整链删除（api_provider_keys / ai_models 对 provider 是 ON DELETE CASCADE）
DELETE FROM api_providers WHERE owner_user_id IS NOT NULL;
```

- 任务的 `provider_code` / `model` 快照列不动，历史任务展示/搜索不受影响。
- 删除的渠道若曾有在途任务：迁移发生在停机窗口（§3），无在途任务；启动清扫对残留 submitted 任务按现状处理（标失败退款）。

**T7.5 遗留表清理**：

```sql
DROP TABLE IF EXISTS user_toapis_keys;
```

- ai-provider 迁移时该表已停止写入（T4 已把数据搬去用户渠道）；本表数据随 T7.4 一并消失，无二次利用价值。
- `system_config.toapis_api_key`（更早的共享 Key 配置）保留不动（T2 迁移源，历史痕迹，无代码引用）。

**休眠死列（不 DROP）**：`api_providers.owner_user_id`、`balance_check_interval_sec`、`idx_providers_owner`——数据已清空、代码零引用；随退役时间线（§6）下个大版本清理。

### 1.3 与 T1-T6 的顺序关系

T7 追加在 `initAiProviderMigration()` 序列**末尾**（T1→T6 之后）：

- 老库（T1-T6 已跑）：T7 直接清理 T4 产生的用户渠道。
- 超老库（ai-provider 迁移未跑）：同一次启动内 T1-T6 先执行完毕（T4 建用户渠道时 `is_primary` 列尚在，INSERT 不报错），T7 随后清理——多一次建删，结果一致。
- 全新库：基线 schema（T7.6 同步后）直接是目标结构；T7 的 ALTER/UPDATE 因 try/catch 与条件自然空跑；T7.4/T7.5 无数据可删。

---

## 2. 迁移脚本设计

- 位置：`server/src/db/migrateAiProvider.ts` 追加 `migrateFixedChannels()`，挂入 `initAiProviderMigration()` 末尾（沿用启动迁移惯例，不引入独立脚本）。
- **幂等**：`system_config` 标记 `migrate_fixed_channels_v1`——标记存在即整段跳过。标记写入与数据操作同事务，迁移不完整不置标记、中止启动。
- **备份**：沿用既有 `backupBeforeMigration()`（`VACUUM INTO` 快照文件）——T7 **必须**在其保护范围内；备份失败中止启动（现状行为，无需改动）。
- **事务**：T7.2-T7.5 在**单个事务**内执行（量级小：用户渠道与 Key 均为个位数~三位数行），任一步失败整体回滚并中止启动。
- **dry-run**：`MIGRATION_DRY_RUN=1 npm run dev:server` 输出各步影响行数（待删用户渠道数、待置空任务数、待回填 priority 行数），不写库。
- **日志**：T7.4 打印被删除的渠道清单（id/name/owner）供审计对账。
- **校验脚本**：可选 `scripts/verify-fixed-channels-migration.mjs`（对齐 ai-provider 惯例），输出：
  1. `owner_user_id IS NOT NULL` 行数 = 0；
  2. 每渠道 priority=1 的 Key ≤ 1 个且必为原主 Key；
  3. `idx_api_provider_keys_primary` 不存在；`is_primary` 列不存在（或存在但全表无引用值）；
  4. `user_toapis_keys` 不存在；
  5. 平台渠道/模型/Key/定价与迁移前基线快照逐项一致；
  6. 历史任务总数与积分流水汇总不变。

---

## 3. 上线步骤（Checklist）

> 前置：代码合入 release 分支；测试环境已按验收文档 M1-M6 全量通过；生产快照演练（测试文档 §3.4）至少一轮 PASS。

| # | 步骤 | 说明 / 验证点 |
|---|------|--------------|
| 1 | 停写入公告（低峰期窗口） | 本迁移含删除性操作，安排停机窗口 |
| 2 | 人工备份：DB 文件 + `.env` 快照 | 双保险（自动备份之外的落盘副本）；记录路径 |
| 3 | 部署后端新版本 | 启动日志确认：备份成功 → T7 各步影响行数与 dry-run 预估一致 → 标记 `migrate_fixed_channels_v1` 写入 → 清扫执行 → 服务监听 |
| 4 | （如有）跑 `scripts/verify-fixed-channels-migration.mjs` | 全部校验项 PASS |
| 5 | 部署前端新版本 | 静态资源发布（我的渠道页随版本消失） |
| 6 | 冒烟（生产） | admin 登录看配置页（Key 池表正常）；userA 平台模型 1 张（小额积分）成功；历史任务打开正常 |
| 7 | Key 池就位确认 | 管理员为高频渠道补配 ≥ 1 个备用 Key 并测试连通（切换能力的运营前提） |
| 8 | 观察期（1~24h） | 错误日志 grep `key-pool`（耗尽标记）；`ALL_KEYS_EXHAUSTED` 计数；任务卡 submitted 计数 = 0；积分对账 |
| 9 | 解除公告 | — |

---

## 4. 上线后验证（对应验收 M1/M3）

1. 管理端：Key 列表优先级排序正确、原主 Key 优先级 1；渠道卡片 Key 总量正确。
2. 生图主链路正常（异步 toapis + 任一同步渠道）。
3. 观察真实上游欠费（如有）：`key-pool` 日志出现耗尽标记 → 业务无失败 → 管理端可见耗尽标签（等效 M3-01 的生产版验证）。
4. 用户侧无「我的渠道」任何残留入口（抽查侧边栏/额度页/计费说明页）。

---

## 5. 回滚方案

| 场景 | 处置 |
|------|------|
| 启动即失败（迁移中止） | 服务未对外：用步骤 2 的人工备份（或自动 `backup-pre-*` 快照）覆盖 DB 文件 → 回退旧版本后端 → 重新启动；T7 未置标记，无脏状态 |
| 上线后发现问题需回退版本 | 恢复备份 DB + 回退前后端旧版本。**代价**：窗口期内新产生的任务/积分流水会随备份回滚而丢失——因此回退决策应在观察期（1~24h）内尽早做出，回退前导出窗口期流水对账 |
| 仅前端问题 | 只回退前端静态资源（后端 T7 与新 API 对旧前端兼容性：旧前端会调 `/api/my/*` → 404，我的渠道页报错但其余功能不受影响——可接受的短期降级） |

---

## 6. 退役时间线

| 对象 | 本期 | 下个大版本 |
|------|------|-----------|
| `api_provider_keys.is_primary`（若 DROP COLUMN 失败保留的死列） | 代码零引用 | 随基线重建清理 |
| `api_providers.owner_user_id` / `balance_check_interval_sec` / `idx_providers_owner` | 数据清空、代码零引用 | DROP COLUMN / DROP INDEX |
| `/api/my/*` 返回 410 的过渡空路由（如启用，S6） | 一个版本 | 删除 |
| `system_config.toapis_api_key` 遗留配置行 | 保留（无引用） | 清理 |
| ai-provider 文档中用户渠道章节（FR5/D7/D8/D9、S1/S3） | 已由 fixed-channels 方案宣告废止 | 文档归档整理 |
