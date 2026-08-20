# 固定渠道与多 Key 轮换 · 测试文档（fixed-channels）

> 对应功能方案 `docs/requirements/fixed-channels.md`、技术方案 `docs/design/fixed-channels-tech.md`、验收标准 `docs/requirements/fixed-channels-acceptance.md`（已实施）。
> 本文档定义测试范围、分层用例、环境与退出标准；验收文档中的 S/A/B 用例以本文的执行细节为基础。
> 测试原则：**欠费切换是全新核心能力，必须 mock 上游做确定性验证；用户渠道下线是减法，靠全站回归兜底。**

---

## 1. 测试范围与目标

| 范围 | 内容 | 测试类型 |
|------|------|---------|
| 核心新能力 | 欠费判定、Key 耗尽标记、优先级切换、全部耗尽失败退款 | 单元 + 集成（mock 上游） |
| Key 池管理 | 管理端 keys CRUD、优先级排序与缺省、状态机（active/disabled/exhausted）、重新启用 | 接口 + GUI |
| 渠道固定化 | `/api/my/*` 下线、目录响应去 mine、计费单轨、归属校验删除 | 接口 + 回归 |
| 前端移除 | 我的渠道页/菜单/余额行/入口卡片/个人渠道文案全站清除 | 回归（构建强校验 + GUI 抽查） |
| 存量迁移 | T7 各步骤正确性、幂等、备份、历史任务不受影响 | 迁移验证 |
| 安全 | Key 明文只出现在 admin 端点；用户端无 Key 泄露面 | 安全 |

不在范围：适配器协议本身（ai-provider 已验收）、OSS 转存、积分流水口径（除退款触发点）。

---

## 2. 环境与账号矩阵

### 2.1 环境

- 测试环境全量部署：前端 + Express + T7 迁移已执行；`MIGRATION_DRY_RUN` 仅用于迁移预检。
- **mock 上游服务**（核心能力测试的关键设施）：本地起一个 HTTP stub（node 脚本即可），按请求携带的 Key 返回不同结果：

| mock Key | 行为 |
|----------|------|
| `key-A-exhausted` | 返回 `402 {"message":"余额不足"}` |
| `key-B-ok` | 返回正常响应（生图提交返回任务号 / chat 返回 completion） |
| `key-C-401` | 返回 `401 {"error":{"message":"Invalid key"}}` |
| `key-D-text-400` | 返回 `400 {"error":{"message":"insufficient quota"}}` |
| `key-E-5xx` | 返回 `500` |

- mock 渠道配置：测试库建一个 `openai_image`（或 toapis）协议渠道，base_url 指向 mock 服务，按用例动态增删 Key 并指定优先级。

### 2.2 账号矩阵

| 账号 | 角色 | 用途 |
|------|------|------|
| admin | 管理员 | Key 池管理、目录/计费配置、迁移验证 |
| userA | 普通用户 | 生图主流程、个人渠道文案清除回归 |
| userB | 普通用户 | 隔离与越权残留检查（`/api/my/*`、他人渠道模型 id 提交） |

---

## 3. 测试分层与用例

### 3.1 单元测试（`isKeyExhaustionError` / `markKeyExhausted` / `withKeyFailover`）

以临时 tsx 脚本或正式单测文件执行（不留业务副作用，DB 用例走事务回滚）。

**U-01 判定真值表**（`isKeyExhaustionError`）：

| 输入 | 预期 |
|------|------|
| `ProviderCallError(任何消息, 402)` | true |
| `ProviderCallError('余额不足', 400)` | true |
| `ProviderCallError('Insufficient quota', 429)` | true |
| `ProviderCallError('your balance is not enough', 403)` | true |
| `ProviderCallError('Invalid key', 401)` | **false** |
| `ProviderCallError('upstream error', 500)` | false |
| `ProviderCallError('余额不足', 500)` | **false**（状态码不在白名单，文案不算数） |
| `new Error('余额不足')`（非 ProviderCallError） | false |
| `ProviderContextError(...)` | false |

**U-02 markKeyExhausted**：active Key → 置 exhausted 且 `exhausted_at` 非空；对已 exhausted 的 Key 重复调用 → changes=0、时间戳不变（幂等）。

**U-03 withKeyFailover**（fn 为注入的 stub）：

| 场景 | stub 行为 | 预期 |
|------|----------|------|
| a. 一次成功 | 第一轮即返回 | 不标记任何 Key；返回值透传 |
| b. 切换后成功 | key1 抛 402，key2 成功 | key1 → exhausted；fn 收到 key2 的 config；调用方拿到成功结果 |
| c. 全部耗尽 | 所有 Key 均抛 402 | 全部 → exhausted；最终抛 `ProviderContextError`（无可用 Key） |
| d. 非欠费不切换 | key1 抛 401 | key1 状态仍 active；原错误透传给调用方 |
| e. 并发耗尽 | 两协程同时以 key1 抛 402 | 仅一次 UPDATE 生效（exhausted_at 唯一）；两协程均在 key2 成功 |

**U-04 优先级选取**：同渠道插入 priority 2(id 小)/1(id 大)/1(id 小)/disabled(0) 四个 Key → 选取序为 `1(id 小) → 1(id 大) → 2`，disabled 永不被选。

### 3.2 接口测试（curl / httpie，admin 登录）

**A 组 · Key 池管理（`/api/admin/ai-config/keys*`）**

| 用例 | 步骤 | 预期 |
|------|------|------|
| A-01 | POST /keys 不带 priority | 成功；priority = 该渠道 MAX+1（首个为 1） |
| A-02 | POST /keys priority=0 / 负数 / 非整数 | 400 校验拒绝 |
| A-03 | GET /providers | keys 按 priority ASC, id ASC 排序；含 `priority`/`exhausted_at` 字段；响应含 `first_key_hint`、无 `primary_key_hint` |
| A-04 | PATCH /keys/:id 改 priority | 生效；耗尽态 Key 改 priority → 400（S4） |
| A-05 | PATCH /keys/:id status 状态机 | active↔disabled 双向 OK；exhausted→active OK 且清 exhausted_at；exhausted→disabled → 400；disabled→exhausted → 400 |
| A-06 | DELETE /keys/:id 删唯一 Key | 成功；渠道级测试端点返回「没有可用 Key」类错误 |
| A-07 | POST /keys/:id/test | 指定 Key 测试，写 last_checked_at/last_check_ok（沿用） |
| A-08 | POST /providers/:id/test | 使用优先级最高的可用 Key（用 mock 验证出站 Key） |

**B 组 · 下线与目录**

| 用例 | 步骤 | 预期 |
|------|------|------|
| B-01 | GET /api/my/channels、POST /api/my/channels、GET /api/my/meta 等全组 | 404（或过渡版 410），无业务副作用 |
| B-02 | GET /api/models/catalog?kind=image / text | 响应仅 `{ platform: [...] }`，无 `mine` 字段 |
| B-03 | GET /api/me/quota | 无 `personalKeyCredits` 字段 |
| B-04 | GET /api/me/toapis*（旧个人 Key 端点） | 404/410 |
| B-05 | userB 用 userA 名下（已不存在的）渠道模型 id 提交 | 404 渠道模型不存在（归属 403 分支已删，404 兜底） |
| B-06 | GET /api/admin/ai-config/user-providers | 404（端点删除） |
| B-07 | 非管理员调 keys 端点 | 403（沿用 adminMiddleware） |

**C 组 · 计费单轨**

| 用例 | 步骤 | 预期 |
|------|------|------|
| C-01 | userA 平台模型 n=1 提交 | 预扣 `pricing[分辨率]`；流水 generation；任务创建 |
| C-02 | 余额不足提交 | 402，任务不创建、无流水（沿用） |
| C-03 | 上游失败（mock 5xx Key） | failed + 全额 refund 流水（沿用，验证未因改造回归） |
| C-04 | 全部耗尽（见 3.3 I-03） | failed，errorCode=ALL_KEYS_EXHAUSTED，全额 refund |

### 3.3 集成测试（mock 上游，核心能力）

前置：mock 渠道（§2.1）+ 对应渠道模型（关联逻辑模型、定价完整）。

| 用例 | 场景布置 | 步骤 | 预期 |
|------|---------|------|------|
| I-01 | 欠费自动切换，本次成功 | keys: A(1)→402、B(2)→ok | userA 提交生图 | 任务成功；出站请求第 1 次带 A、第 2 次带 B；DB 中 A=exhausted、B=active；用户端无任何切换痕迹（任务不 failed） |
| I-02 | 欠费文案变体命中 | keys: D(1)→400 "insufficient quota"、B(2)→ok | 提交 | 同 I-01（文案判定路径生效） |
| I-03 | 全部耗尽 | keys: A(1)、D-text(2) 均欠费 | 提交 | 任务 failed、errorCode=ALL_KEYS_EXHAUSTED、错误文案含「已耗尽或停用」；全额退款流水；两个 Key 均 exhausted |
| I-04 | 非欠费错误不切换 | keys: C-401(1)、B(2) | 提交 | 失败原因为上游 401 文案；C 状态仍 active（未被误标）；无切换出站 |
| I-05 | 重新启用恢复 | 承接 I-01/03 | admin 对 exhausted Key PATCH status=active | 状态 active、exhausted_at 清空；下一次提交出站重新使用该 Key（优先级最小） |
| I-06 | 同步渠道切换 | 渠道协议 openai_image，keys 同 I-01 | 提交 | 结果同 I-01（runSyncTask 路径覆盖） |
| I-07 | 文字调用切换 | 画布文字节点（chat），keys 同 I-01 | 触发一次 AI 文字生成 | 请求成功，A 被标耗尽、出站第二请求带 B |
| I-08 | 并发切换 | keys: A(1)、B(2)，10 并发提交同时触发 A 欠费 | 并发提交 | A 恰好标记一次（exhausted_at 单值）；全部任务要么走 B 成功、要么 A 的一次成功响应；无任务卡死 |
| I-09 | 停用 Key 不参与 | keys: B(1, disabled)、A(2) | 提交 | 出站只用 A；B 不被选也不被标耗尽 |
| I-10 | 无可用 Key 渠道 | 全部 Key disabled/exhausted | 提交 | 任务 failed（ALL_KEYS_EXHAUSTED 文案含「停用」）+ 退款；管理端渠道卡片有无可用 Key 警示 |

### 3.4 迁移验证（T7，对应验收 M1）

在**复制的生产快照库**上演练（或至少：迁移前记录基线 → 执行 → 比对）：

| 用例 | 验证点 |
|------|--------|
| V-01 | 迁移后 `api_providers WHERE owner_user_id IS NOT NULL` 行数 = 0；其关联 keys/models 行数 = 0（CASCADE 生效） |
| V-02 | 原主 Key（is_primary=1）→ priority=1；其余 Key priority=100 |
| V-03 | `idx_api_provider_keys_primary` 不存在；`is_primary` 列已删（或保留死列时：全表无引用、允许重复值） |
| V-04 | `user_toapis_keys` 表不存在 |
| V-05 | 原指向用户渠道的历史任务 `channel_model_id/channel_provider_id` 为 NULL，任务展示/搜索正常 |
| V-06 | 历史任务数、积分流水汇总、平台渠道/模型/Key 数与迁移前基线一致（平台侧零变化） |
| V-07 | 重启服务二次：T7 标记命中，无任何行变化（幂等） |
| V-08 | 全新空库初始化：基线 schema 直接建出 priority/exhausted_at 结构、无 is_primary；种子 Key priority=1 |
| V-09 | 迁移前自动备份文件生成且可打开（`backupBeforeMigration`） |

### 3.5 回归测试（前端，对应验收 M5）

1. **构建强校验**：`npm run build`（含 vue-tsc）零错误——`mine` 类型删除后任何残留引用都会编译失败，这是清除完整性的第一道闸。
2. **静态扫描**：grep `src/` 无 `isPersonalChannel|我的渠道|个人渠道|不扣积分|channelBalance|myChannelsApi|estimatePriceFor|isMineModel|/my/channels` 残留（`mine` 一词注意排除素材库 scope 等无关命中）。
3. **GUI 抽查**：
   - 侧边栏：无「我的渠道」菜单、无左下角 Key 余额行；平台积分行仍在。
   - 「我的额度」「计费说明」页：无我的渠道卡片/区块，积分区正常。
   - 工作台 / 自由生图 / AI 摄影 / 专家 / 批量×4 / 买家秀：模型下拉仅平台分组；按钮价格文案统一；余额不足拦截生效（不再跳过）。
   - 画布：文字节点模型下拉仅平台分组、可用；图片节点生图正常。
   - 管理端配置页：无用户渠道 Tab；Key 池表（优先级/耗尽/重新启用）正常。
   - 直接访问 `#/my-channels`：路由不存在（重定向/404）。
4. **业务回归**：沿用 ai-provider 验收 M8 的全站清单跑通主流程（提交→轮询→结果→发布）。

---

## 4. 缺陷分级

| 级别 | 定义 | 示例 |
|------|------|------|
| 致命(S1) | 计费错误（多扣/不退/漏扣）、任务丢失、Key 明文泄露到用户端、迁移数据损坏 | 全耗尽未退款；迁移误删平台渠道 |
| 严重(S2) | 核心切换能力失效或误判 | 402 未切换；401 被误标耗尽；exhausted Key 仍被调用 |
| 一般(S3) | 功能/交互缺陷有绕行 | 管理端耗尽标签展示错误；优先级排序不稳 |
| 轻微(S4) | 文案/样式 | 残留「个人渠道」字样 |

## 5. 退出标准

1. 单元用例（U-01~04）100% 通过；判定真值表逐行核对。
2. 接口 A/B/C 组全部通过；B 组下线端点无业务副作用。
3. 集成 I-01~I-10 全部通过（mock 上游确定性验证，其中 I-01/I-03/I-05 为发布阻断项）。
4. 迁移 V-01~V-09 全部通过（生产快照演练至少一次）。
5. 回归：构建零错误 + 静态扫描零残留 + GUI 抽查与业务回归主流程通过。
6. 无未关闭的 S1/S2 缺陷；S3 缺陷 ≤ 2 项带修复计划放行。
