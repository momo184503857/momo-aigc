# 固定渠道与多 Key 轮换 · 技术方案（fixed-channels）

> 对应功能方案：`docs/requirements/fixed-channels.md`；测试文档：`docs/reference/fixed-channels-test-plan.md`；验收标准：`docs/requirements/fixed-channels-acceptance.md`；迁移与上线：`docs/design/fixed-channels-migration.md`。
> 原则：**渠道即平台资产（用户渠道下线）、Key 选取即查询（priority ASC, id ASC）、切换即重试（withKeyFailover 收口）、计费即单轨（D8 分支删除）**。
> 现状基线：ai-provider 重构已完成的三处「唯一主 Key」查询（`channelModel.ts` 的 `resolveProviderContext`、`admin/aiConfig.ts` 的 `getPrimaryApiKey`、`myChannels.ts` 的 `buildRuntime`）与 `api_provider_keys.is_primary` 部分唯一索引，是本方案要替换的全部单点。

---

## 1. 架构总览

### 1.1 目标架构

```
┌──────────────────────────── 前端（Vue3 + Pinia） ────────────────────────────┐
│  modelCatalog store（瘦身）     只剩平台分组；无 mine / 个人渠道文案           │
│  表单层 / 批量工具 / 画布       全部走平台计费；余额预检不跳过                 │
│  AdminAiConfig（升级）          Key 池表：优先级 · 耗尽态 · 重新启用          │
│  （删除）MyChannelsPage / channelBalance store / 我的渠道菜单与余额行          │
└──────────────┬─────────────────────────────────────────────────────────────┘
               │ Axios /api（JWT）
┌──────────────▼─────────────────────────────────────────────────────────────┐
│  后端（Express）                                                             │
│   utils/channelModel.ts（改造）                                               │
│     resolveProviderContext(providerId, kind)   ← 去 userId；优先级取 Key      │
│     isKeyExhaustionError(e) / markKeyExhausted(keyId) / withKeyFailover(...) │
│   routes/generations.ts（接入切换）                                            │
│     异步提交 / runSyncTask 逐任务包 withKeyFailover；全部耗尽→失败+退款        │
│     计费：删 isPlatform 分支，一律预扣+退款                                    │
│   routes/canvas-ai.ts（接入切换）  chat 调用包 withKeyFailover                 │
│   routes/models.ts（瘦身）        catalog 响应去 mine                          │
│   （删除）routes/myChannels.ts + /api/my 挂载                                 │
│   routes/admin/aiConfig.ts（升级） keys 端点：priority / exhausted / 重新启用  │
└──────────────┬─────────────────────────────────────────────────────────────┘
               │ 适配器层不变（toapis / openai_image / volcengine_image / openai_compat）
        上游渠道（toapis.com / Ark / OpenAI 兼容中转站 …）→ 结果统一转存 OSS
```

### 1.2 与现状的关键差异

| 维度 | 现状 | 目标 |
|------|------|------|
| Key 选取 | 三处独立查询 `is_primary=1 AND status='active'`（单行） | 一处统一：`status='active' ORDER BY priority ASC, id ASC LIMIT 1` |
| Key 唯一性约束 | `is_primary` + 部分唯一索引（每渠道至多一主 Key） | 无约束；`priority` 允许重复，id 兜底稳定序 |
| 上游欠费（402 等） | 与普通失败同义：任务直接 failed + 退款 | 先耗尽标记 → 换 Key 重试本次请求；全耗尽才 failed（`ALL_KEYS_EXHAUSTED`） |
| 渠道归属 | `owner_user_id` 区分平台/用户渠道，提交校验归属、计费分支 | 全部平台渠道；归属校验与 D8 免计费分支删除 |
| 模型目录 | `{ platform, mine }` 双组，前端 mine 置顶、参考价折算 | `{ platform }` 单组 |
| 用户侧 Key 能力 | 我的渠道页、侧边栏 Key 余额轮询、余额查询 API | 全部删除 |
| 遗留个人 Key | `user_toapis_keys` + `resolveUserApiKey` + `/api/me/toapis` 半残存 | 表 DROP、代码删除 |

### 1.3 现有设施复用清单

| 现有设施 | 在本方案中的角色 |
|---|---|
| `api_provider_keys` 多行存储 + `status`（active/disabled） | Key 池直接落在这张表：加 `priority`/`exhausted_at` 两列即可，表结构本来就支持一渠道多行 |
| `ProviderCallError`（`providers/http.ts`，携带 HTTP status 与原始响应） | 欠费判定的输入：`isKeyExhaustionError` 只依赖它，无需改任何适配器 |
| `admin/aiConfig.ts` 的 keys CRUD / 单 Key 测试 / 明文查看 | 端点骨架沿用，仅改字段语义（is_primary → priority）与状态机（+exhausted） |
| `failTaskAndRefund`（generations.ts） | 全部耗尽的失败路径复用，新增错误码 `ALL_KEYS_EXHAUSTED` |
| 启动迁移框架（`migrateAiProvider.ts`：flag 幂等、`backupBeforeMigration`、`MIGRATION_DRY_RUN`） | T7 迁移直接追加，见迁移手册 |
| `resolveKeyPlain`（crypto.ts，明文/密文双轨兼容） | 平台 Key 明文读取不变；密文分支随用户渠道删除而只剩兜底 |

---

## 2. 数据库设计

> DDL 明细、回填规则、与 T1-T6 的顺序关系见 `docs/design/fixed-channels-migration.md`。此处只讲结构语义。

### 2.1 `api_provider_keys` 变更

```sql
-- 新增列（ALTER TABLE，幂等 try/catch）
ALTER TABLE api_provider_keys ADD COLUMN priority     INTEGER NOT NULL DEFAULT 100;
ALTER TABLE api_provider_keys ADD COLUMN exhausted_at TIMESTAMP NULL;

-- 回填（一次性）：原主 Key → 1；其余保持 100（ORDER BY id 兜底，与原 promoteNext 语义一致）
UPDATE api_provider_keys SET priority = 1 WHERE is_primary = 1;

-- 移除主 Key 约束（顺序执行，均幂等）
DROP INDEX IF EXISTS idx_api_provider_keys_primary;            -- 每渠道一主 Key 的部分唯一索引
ALTER TABLE api_provider_keys DROP COLUMN is_primary;          -- try/catch：SQLite < 3.35 时保留死列
```

- `priority`：正整数，**小者优先**；允许重复，选取序 `priority ASC, id ASC`。应用层校验 ≥ 1。
- `exhausted_at`：耗尽时间戳，仅用于展示/对账；判断是否参与调用只看 `status`。
- `status` 取值扩为 `active | disabled | exhausted`：
  - `active → disabled`：管理员停用（沿用）。
  - `active → exhausted`：**仅由服务端欠费切换路径写入**，管理端不提供手动置耗尽。
  - `exhausted → active`：管理员「重新启用」（清 `exhausted_at`）。
  - `disabled → active`：管理员启用（沿用）。
  - `exhausted → disabled` / `disabled → exhausted`：不允许（状态机见 §2.2）。

### 2.2 Key 状态机

```
                 管理员·停用                       管理员·重新启用
   active ─────────────────► disabled ─────────────► active
     │  ▲                       │
     │  │ 管理员·启用            │ 不允许 ⇄ exhausted
     ▼  │
  exhausted ◄──（仅服务端）上游欠费信号，markKeyExhausted()
     │
     └─ 管理员·重新启用 ──► active（清 exhausted_at）；或管理员·删除
```

### 2.3 `schema.ts` 基线同步（新库）

`schema.ts` 的 `CREATE TABLE api_provider_keys` 基线必须同步：删除 `is_primary` 列与 `idx_api_provider_keys_primary`，写入 `priority` / `exhausted_at` 两列——否则全新部署建出旧结构、T7 补丁与其互相打架。`db/seedApiProviders.ts` 种子 Key 改为 `priority = 1`。

### 2.4 休眠死列（保留不动）

`api_providers.owner_user_id`、`api_providers.balance_check_interval_sec`：用户渠道删除后全表恒 NULL，**不 DROP**（降低迁移风险），代码零引用；下个大版本随退役时间线清理（见迁移手册 §6）。

### 2.5 索引

`idx_api_provider_keys_provider(provider_id)` 沿用，选取查询 `WHERE provider_id=? AND status='active' ORDER BY priority ASC, id ASC LIMIT 1` 走它即可，Key 数量为个位数~两位数，无需新索引。

---

## 3. 核心机制（utils/channelModel.ts 扩展）

### 3.1 Key 选取：resolveProviderContext 改造

```ts
// 签名：去掉 userId（无归属概念）；kind 沿用
export function resolveProviderContext(
  providerId: number,
  kind: 'image' | 'chat' = 'image',
): ResolvedProviderContext {
  // 渠道行：不再 SELECT owner_user_id、不再校验归属；status 校验保留
  const provider = db.prepare(`SELECT id, code, name, base_url, adapter, status
                               FROM api_providers WHERE id = ?`).get(providerId)
  if (!provider) throw new ProviderContextError('渠道不存在', 404)
  if (provider.status !== 'active') throw new ProviderContextError('渠道已停用', 400)

  // Key 选取：优先级制，取代 is_primary
  const keyRow = db.prepare(`
    SELECT id AS key_id, encrypted_key, key_iv, key_tag
    FROM api_provider_keys
    WHERE provider_id = ? AND status = 'active'
    ORDER BY priority ASC, id ASC
    LIMIT 1
  `).get(providerId)
  if (!keyRow) throw new ProviderContextError('该渠道没有可用 Key（可能已全部停用或耗尽）', 400)

  // resolveKeyPlain 解密/明文读取沿用；config 增加 keyId（供切换路径标记用）
  return { provider, config: { ..., apiKey, keyId: keyRow.key_id } }
}
```

`ProviderRuntimeConfig`（`providers/types.ts`）增加可选字段 `keyId?: number`——适配器不感知它，仅供编排层回传标记。

### 3.2 配额/欠费判定：isQuotaRotateSignal

> **2026-08 修订（取代旧版 isKeyExhaustionError 与第一版 classifyUpstreamQuotaError）**：
> 渠道为用户自配 API，项目无权因上游报错停用（拦截）用户的 Key。判定结果**只用于「本次请求」内换下一个 Key 重试**，
> 不落库、不冷却、不影响后续请求。旧版「命中信号 → markKeyExhausted 写库」机制已整体移除。

```ts
const QUOTA_SIGNAL_RE = /余额|欠费|欠款|balance|arrear|billing|rate.?limit|too\s+many\s+requests|请求过于频繁|访问频繁|频繁|限流|限速|每[日天小时分]|daily|per\s*(day|hour|minute)|quota|额度|配额|次数|exceeded|exhaust|用完|耗尽|上限|limit/i

export function isQuotaRotateSignal(e: unknown): boolean {
  if (!(e instanceof ProviderCallError)) return false
  if (e.status === 402 || e.status === 429) return true      // 402 欠费 / 429 限流（每日额度、频率等）
  if (e.status === 400 || e.status === 403) return QUOTA_SIGNAL_RE.test(e.message || '')
  return false                                               // 401 鉴权失败 / 5xx / 网络错误：不轮换
}
```

设计要点：
- 只认 `ProviderCallError`（所有适配器出站错误统一形态，带 HTTP status）；普通 `Error`/`ProviderContextError` 不触发。
- 402/429 无条件命中；400/403 需文案佐证（部分中转站把配额用完报成 400「insufficient quota」）。
- 401 主动排除：Key 失效是另一种故障，误轮换会把好 Key 也绕开。

### 3.3 轮换循环：withKeyFailover（原「耗尽标记 markKeyExhausted」已移除）

```ts
export async function withKeyFailover<T>(
  providerId: number,
  kind: 'image' | 'chat',
  fn: (ctx: ProviderRuntimeConfig) => Promise<T>,
): Promise<T> {
  const tried = new Set<number>()
  let lastQuotaError: unknown = null
  for (;;) {
    let config
    try {
      ({ config } = resolveProviderContext(providerId, kind, { excludeKeyIds: tried }))
    } catch (e) {
      // 本请求已试遍全部 Key → 透传上游最后一次的原始报错（而非笼统的「无可用 Key」）
      if (e instanceof ProviderContextError && e.code === 'ALL_TRIED' && lastQuotaError !== null) throw lastQuotaError
      throw e
    }
    try {
      return await fn(config)
    } catch (e) {
      if (config.keyId === undefined || !isQuotaRotateSignal(e)) throw e
      tried.add(config.keyId)                                // 仅本请求内跳过；不写库、不冷却
      lastQuotaError = e
    }
  }
}
```

性质说明：
- **重试的是本次请求**（F3），不是排队重发；循环上限 = 渠道可用 Key 数，无指数退避。
- **零写库**：任何上游报错都不改变 Key 状态。多 Key 渠道中某个 Key 长期配额不足时，后续请求仍会先试它再轮换（每次多一次上游调用的代价，换取「不拦截用户 Key」的原则）。
- **报错透传**：试遍全部 Key 后抛出的是上游最后一次的 `ProviderCallError` 原文——生图任务失败（`UPSTREAM_ERROR`/`SUBMIT_FAILED`）+ 全额退款，用户在任务面板看到自己 API 的原始错误信息。
- `exhausted` 状态仅为历史遗留（服务端不再写入）；管理端「重新启用」保留用于清理存量。

### 3.5 admin 侧：getFirstApiKey

`admin/aiConfig.ts` 的 `getPrimaryApiKey` 改名 `getFirstApiKey`，查询与 §3.1 的 Key 选取一致（渠道级测试/调试调用走第一个可用 Key）；`buildRuntimeConfig` 无 Key 时的报错文案同步改。

---

## 4. 接入点改造（routes）

### 4.1 generations.ts · 异步渠道提交（toapis）

```ts
// POST / 派发段（事务提交后），逐任务：
if (cm.p_adapter === 'toapis') {
  const adapter = getImageAdapter(cm.p_adapter)
  for (const t of created) {
    try {
      const submit = await withKeyFailover(cm.p_id, 'image', (config) =>
        adapter.submitImageTask({ ... }, config))
      // 回填 provider_task_id ...
    } catch (e: any) {
      if (e instanceof ProviderContextError) {
        failTaskAndRefund(t.id, 'ALL_KEYS_EXHAUSTED', e.message)   // 无可用 Key（通常全耗尽）
      } else {
        failTaskAndRefund(t.id, 'SUBMIT_FAILED', e.message)        // 其他上游错误（含 401/5xx）
      }
    }
  }
}
```

说明：`withKeyFailover` 内部第一轮的 `resolveProviderContext` 失败（渠道停用/无 Key）同样以 `ProviderContextError` 抛出，与「循环耗尽后抛出」同形态，统一归入 `ALL_KEYS_EXHAUSTED`；错误文案带「已全部停用或耗尽」字样可区分。

### 4.2 generations.ts · 同步渠道执行（runSyncTask）

`runSyncTask` 内 `adapter.submitImageTask` 同样包 `withKeyFailover`；失败映射沿用（`ProviderContextError` → `PROVIDER_CONTEXT`，改为 `ALL_KEYS_EXHAUSTED`；其余 → `UPSTREAM_ERROR`）。

### 4.3 generations.ts · 计费单轨化

- `loadChannelModel` 不再 SELECT `p_owner_user_id`；提交路径删除「无权使用该渠道模型」归属校验。
- 删除 `isPlatform` 分支（315-325 / 335 / 368 / 379 位置）：`unitPrice` 一律从 `pricing[effResolution]` 取（缺失即 400「请联系管理员配置定价」）；余额校验、预扣、流水写死为主路径。
- 存量数据保证：迁移删除了全部用户渠道（其模型 pricing 恒 NULL），平台生图模型定价必填校验（原 S6，含原用户渠道豁免删除）保证不会出现无定价模型可提交。

### 4.4 canvas-ai.ts · 文字调用

- 模型名兜底查询删除「平台渠道优先」的 owner 排序（无用户渠道后天然只有平台渠道）。
- `callChat` 的 `adapter.chat` 包 `withKeyFailover(providerId, 'chat', ...)`；全耗尽时向画布节点返回明确错误文案（沿用现有错误协议）。

### 4.5 不接入切换的路径（S3）

| 路径 | 理由 |
|------|------|
| `GET /:id/status` 异步轮询 `queryImageTask` | 任务已提交到上游，换 Key 无意义；轮询异常沿用「记警告、状态不动、下轮重试」。例外：若上游对**轮询**返回 402 且任务尚无终态，长轮询自然失败——启动清扫/超时机制兜底退款（沿用现状） |
| `POST /:id/reimport` 转存重试 | 失败可再点，无计费影响 |
| 结果转存 OSS | 与渠道 Key 无关 |

### 4.6 admin/aiConfig.ts · 端点变更汇总

| 端点 | 变更 |
|------|------|
| `POST /keys` | 入参 `{ provider_id, name, key, priority? }`；`priority` 缺省 = 该渠道 `MAX(priority)+1`（无 Key 时 1）；删除 `is_primary` 处理 |
| `PATCH /keys/:id` | 入参 `{ name?, key?, priority?, status? }`；`status` 状态机按 §2.2（`exhausted→active` 清 `exhausted_at`；`exhausted` 态拒绝改 `priority`，S4）；轮换 Key 值沿用清 `last_check_ok` |
| `DELETE /keys/:id` | 直接删除；删除「主 Key 自动提升」逻辑 |
| `POST /keys/:id/test` | 不变（按指定 Key 测试） |
| `POST /providers/:id/test`、`POST /chat` | 改走 `getFirstApiKey`（§3.5） |
| `GET /providers` | 去掉 `WHERE owner_user_id IS NULL`（全表即平台渠道）；`serializeProvider.keys` 按 `priority ASC, id ASC` 排序；`primary_key_hint` → `first_key_hint`（首个可用 Key hint + 无可用 Key 标记） |
| `GET /user-providers` | **删除**（随用户渠道下线） |
| `POST/PATCH /providers`、`POST/PATCH /models` | 删除「拒绝编辑用户渠道」守卫（无用户渠道） |

`serializeKey` 响应：`{ id, provider_id, name, key, key_hint, priority, status, exhausted_at, last_checked_at, last_check_ok, created_at }`（`key` 明文沿用 T6 现状）。

### 4.7 models.ts · 目录瘦身

`buildGroups` 删除 mine 分支（`owner_user_id = ?` 查询与 `pricing: isMine ? null : pricing`），响应体：

```jsonc
{ "success": true, "data": { "platform": [ /* 渠道分组，结构不变 */ ] } }   // mine 字段删除
```

### 4.8 用户渠道与遗留端点下线

| 对象 | 处置 |
|------|------|
| `routes/myChannels.ts` 整文件 + `index.ts` 的 `/api/my` 挂载 | 删除；路由不再注册 → 404（S6：如需过渡可临时注册返回 410 的空 router，一个版本后删） |
| `routes/me-toapis-key.ts` + `/api/me/toapis` 挂载 | 删除 |
| `me.ts` 的 `personalKeyCredits` 字段 | 删除（前端同步去引用） |
| `utils/toapis.ts` 的 `resolveUserApiKey` | 删除（先 grep 确认 me.ts 之外无调用方；文件其余工具若无引用则整文件退役） |
| `validatePricingCoverage` 的用户渠道豁免 | 删除——所有生图模型定价必填 |

---

## 5. 前端设计

### 5.1 删除清单（文件级）

| 文件 | 处置 |
|------|------|
| `src/views/user/MyChannelsPage.vue` | 删除（含内嵌 myChannelsApi client） |
| `src/stores/channelBalance.ts` | 删除 |
| `src/router/index.ts` | 删除 `/my-channels` 路由 |
| `src/components/SidebarMenu.vue` | 删除「我的渠道」菜单项、Key 余额行（`key-balance-row`）、`keyBalanceLabel`、Wallet 图标、`.key-balance-row` 样式 |
| `src/layouts/MainLayout.vue` | 删除 channelBalance 的 import / init / dispose |
| `src/views/user/MyQuotaPage.vue` | 删除我的渠道入口卡片、`mineSummary`、相关提示文案 |
| `src/views/user/PricingPage.vue` | 删除 `mineGroups` 区块与「我的渠道不扣积分」说明 |
| `src/views/admin/AdminAiConfig.vue` | 删除「用户自建渠道（只读）」Tab、`userProviders`/`loadUserProviders` |
| `src/services/aiConfigApi.ts` | 删除 `listUserProviders`、`UserProviderRow` |

### 5.2 modelCatalog store 瘦身

- 类型：`CatalogModel.mine`、`CatalogGroup.mine`、`CatalogResponse.mine` 删除；`normalize` 只剩 platform 组。
- `defaultImageModel` / `defaultTextModel`：直接取第一个可用模型（删除 mine 优先）。
- `priceFor`：删除 mine 分支；**删除 `estimatePriceFor` 与 `isMineModel`**，全部调用点（约 12 处：三表单、批量×4、买家秀、专家页、workflow 两节点）改用 `priceFor`。
- `serverStatus.ts`：仅注释更新（`canGenerate` 逻辑不变）。

### 5.3 表单与页面回归改法（模式统一）

- `isPersonalChannel` computed 全删；按钮标签恢复 `生成图片 · formatCredits(price×n)`。
- 余额预检不再跳过（删除 `if (!isPersonalChannel.value) {...}` 分支，一律校验）。
- 模型下拉 `el-option-group` 的 `group.mine ? '我的渠道 · xxx' : xxx` 与「（个人）」后缀全部拍平为 `group.providerName` / `m.displayName`。
- 「暂无可用模型…可前往我的渠道配置」提示统一改为「请联系管理员配置渠道与模型」（含 `useTaskManager` 的提交前校验文案）。

### 5.4 管理端 Key 池 UI（AdminAiConfig.vue · keys Tab）

- Key 表：按 `priority` 升序渲染；新增「优先级」列；删除「主 Key」列与「设为主 Key」按钮。
- 状态列：`active`→开关（沿用）、`disabled`→停用、`exhausted`→红色「已耗尽」标签（tooltip 显示 `exhausted_at`），操作列出现「重新启用」（确认弹窗 → `PATCH status:'active'`）。
- 新增/编辑 Key 弹窗：`priority` 用 `el-input-number`（min 1，新建默认值 = 现有最大+1，由后端缺省也可）；删除「设为主 Key」勾选。
- 渠道卡片：「主Key xxx」→「首个 Key xxx · 共 N 个」；无可用 Key 时警示样式。
- 删除确认文案去掉「删除后将自动提升其他 Key 为主 Key」。

---

## 6. 退役清单

| 对象 | 处置 |
|---|---|
| `routes/myChannels.ts` + `/api/my/*` 全部端点 + `syncPlatformToapisModels` | 删除 |
| `api_providers.owner_user_id` / `balance_check_interval_sec` / `idx_providers_owner` | 数据清空、代码零引用；列/索引保留至下个大版本（迁移手册 §6） |
| `api_provider_keys.is_primary` + `idx_api_provider_keys_primary` | DROP（T7；新库基线不再创建） |
| `user_toapis_keys` 表 | DROP（T7） |
| `routes/me-toapis-key.ts`、`me.ts#personalKeyCredits`、`utils/toapis.ts#resolveUserApiKey` | 删除 |
| generations.ts `isPlatform` 计费分支、模型目录 mine 分支、admin `GET /user-providers` | 删除 |
| 前端 `MyChannelsPage` / `channelBalance` / mine 置顶 / `estimatePriceFor` / `isMineModel` / 个人渠道文案 | 删除 |
| 上轮交付的「toapis 建渠道自动同步平台模型」「侧边栏 Key 余额」 | 随用户渠道一并退役（功能前提消失） |

---

## 7. 实施顺序（一次性交付内部依赖序）

1. **DB**：`schema.ts` 基线同步 + T7 迁移（列/回填/删约束/删数据/删表）+ `seedApiProviders` 种子改造。
2. **核心机制**：`channelModel.ts`（resolveProviderContext 新签名、keyId、isKeyExhaustionError、markKeyExhausted、withKeyFailover）。
3. **接入点**：generations.ts（提交/同步执行/计费单轨）、canvas-ai.ts（chat 切换）、models.ts（目录瘦身）、admin/aiConfig.ts（端点升级）。
4. **下线**：myChannels.ts、me-toapis-key.ts、resolveUserApiKey、/api/my 挂载移除。
5. **前端**：删除清单（§5.1）→ modelCatalog 瘦身（§5.2）→ 表单回归改法（§5.3）→ 管理端 Key 池 UI（§5.4）。
6. **验证**：单元（判定/切换循环）→ 接口 → mock 上游集成（测试文档 §3）→ 全站回归（验收文档 M5）。
7. **文档同步**：AGENTS.md、api-spec / database-schema / billing 引用文档更新。

---

## 8. 风险与对策

| 风险 | 对策 |
|------|------|
| `DROP COLUMN`（is_primary）在旧 SQLite 不可用 | try/catch 保留死列，代码不再引用；新库基线已不创建该列（§2.3），T7 幂等重跑无副作用 |
| 欠费文案误判（好 Key 被标耗尽） | 判定收敛在 402 + 白名单状态码×关键词（§3.2）；误判后果 = 换下一个 Key（可用性不受损），管理员可在管理端看到耗尽记录并重新启用；测试文档提供真值表回归 |
| 切换风暴：渠道仅 1 个 Key 且反复欠费 | 语义上等价于现状（单 Key 失败）；`ALL_KEYS_EXHAUSTED` + 管理端无可用 Key 警示引导及时补 Key |
| 并发请求同时耗尽同一 Key | `markKeyExhausted` 条件 UPDATE 幂等（§3.3）；各自重取下一 Key，无双扣（预扣在派发前、退款按任务） |
| 用户渠道删除影响历史任务 | 删除前先置空 `generation_tasks.channel_*` 外键（沿用渠道删除惯例）；`provider_code`/`model` 快照列保证报表可读 |
| 前端残留 mine 引用导致编译错 | `estimatePriceFor`/`isMineModel`/`.mine` 为强类型，`vue-tsc` 全量构建即可捕获全部残留（M5 验收项） |
| 旧缓存页调 `/api/my/*` | 404 即可；如生产确认有存量缓存页，过渡版本返回 410（S6） |
