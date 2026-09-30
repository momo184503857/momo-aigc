# 后台用户消耗统计

新增后台“用户与运行 → 用户消耗”，支持用户端内嵌后台 `/#/admin/consumption` 与独立后台 `/admin.html#/consumption`。保留现有生图日志及统计。

## 业务口径

统计所有角色及停用账号的保留任务，以任务创建时间归属北京时间区间。净消耗为当前 `generation_tasks.points_cost` 汇总，包含进行中预扣；失败退款后按当前账目更新历史区间。充值、管理员调账和已删除任务不计入。当前余额为实时快照。

默认最近30个自然日（含今天）；日期快捷项只修改待查询条件，点击查询才生效。趋势切换日/周/月只使用已查询条件；周按周一日期标识，月按当月第一天标识，区间边缘周期只统计选定日期内的任务；空周期补零。

总览：净消耗积分、净消耗大于0的账号数、全部提交任务数、进行中预扣积分。
用户表：区间内有任务的所有账号（含0消耗），默认按消耗降序，支持消耗/任务数排序及每页20条分页。明细抽屉沿用打开时已查询日期，默认展示该用户逐日净消耗（无消耗日期补0），可切换“任务明细”分页展示时间、任务号、模型、状态、当前净消耗，不返回提示词、图片或渠道信息。

## 接口

全部由现有管理员统计路由的身份校验保护，沿用 `{ success, data }`。

| GET 路径（`/api/admin/stats/consumption` 下） | 参数 | data |
|---|---|---|
| `/overview` | `start_date`, `end_date`, `search?`, `granularity?=day\|week\|month` | `summary: {net_consumed, consuming_users, submitted_count, in_progress_credits}`, `trend: [{date, net_consumed}]` |
| `/users` | 日期、`search?`, `page?=1`, `pageSize?=20`, `sort?=net_consumed\|submitted_count`, `order?=desc\|asc` | `records`, `total`, `page`, `pageSize` |
| `/records` | 日期、`user_id`, 分页 | `user`, `net_consumed`, `daily: [{date, net_consumed}]`, `records`, `total`, `page`, `pageSize` |

日期格式 YYYY-MM-DD，必须有效且开始不晚于结束。结束日次日零点为排他上界。搜索文字匹配用户名/昵称/邮箱，`%` 与 `_` 按普通字符匹配。分页为正整数，pageSize 最大100；非法参数400，无用户404，未登录401，非管理员403，查询异常500。

## 实现与验收

Vue 3 + TypeScript，复用公共设计系统、图表主题与 modelCatalog 的模型显示名称，不扩展公共组件、不新增依赖、不修改数据库结构或计费。
独立请求序号隔离总览/用户表/抽屉，卸载时作废请求，避免旧响应覆盖当前筛选。加载时隐藏旧结果；错误时提供各区域重试。

- 类型检查：`npm run check`。
- 隔离接口测试：`npx tsx scripts/test-admin-consumption.ts`（临时 SQLite、独立 JWT，不修改业务数据或调用付费服务）。
- 可重复的隔离浏览器环境：`npx tsx scripts/preview-admin-consumption.ts`，监听 `http://127.0.0.1:5274`，运行时输出仅临时环境有效的验收账号，退出后清理数据库。
- 浏览器：两个入口、日期快捷项与自定义区间、搜索、排序、用户与明细分页、抽屉键盘关闭、空态、错误重试、明暗主题及窄屏布局。

第一版不提供导出、充值报表、渠道成本、已删除任务账目恢复。视觉遵循 `docs/ui/ui-design-guidelines.md`。

## 需求变更记录

- 2026-09-30：新增独立用户消耗页，用户确认全账号、净消耗、日期粒度及单用户明细；首版不做导出。
- 2026-09-30：单用户抽屉默认展示每日积分消耗，按精确 user_id 与北京时间汇总，复用总览分桶逻辑；每日数据覆盖完整日期范围，不受任务分页影响。
