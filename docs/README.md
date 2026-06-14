# 项目文档

本目录按四类组织。所有文档以「业务域 → 历史记录 → 参考资料」的层级维护。

## 目录结构

```
docs/
├── README.md            本文件（总索引）
├── todo.md              待办事项与风险点
├── requirements/        业务域需求文档（每个稳定业务域一个文件）
│   └── README.md        业务域索引
├── records/             历史记录（变更/决策/Bug）
│   ├── changelog.md
│   ├── decision-log.md
│   └── bug-fixes.md
└── reference/           技术参考（架构/API/数据库/UI/运维等事实性资料）
```

## 文档清单

### 业务域需求（`requirements/`）
产品/业务规则、流程、默认值、边界、验收标准。新增稳定业务域时在此新增文件并更新 `requirements/README.md`。

| 业务域 | 文件 |
|------|------|
| 产品总览 PRD | `requirements/prd.md` |
| AI 买家秀 | `requirements/buyer-show.md` |

### 历史记录（`records/`）
| 类别 | 文件 |
|------|------|
| 变更记录（按时间倒序） | `records/changelog.md` |
| 技术决策 | `records/decision-log.md` |
| Bug 修复（根因与预防） | `records/bug-fixes.md` |

### 技术参考（`reference/`）
| 类别 | 文件 |
|------|------|
| 系统架构 | `reference/architecture.md` |
| API 接口 | `reference/api-spec.md` |
| 数据库 schema | `reference/database-schema.md` |
| UI 设计规范 | `reference/ui-design-guidelines.md` |
| UI 模块库 | `reference/ui-module-library.md` |
| 部署运维 | `reference/deployment.md` |
| 运维手册 | `reference/runbook.md` |
| 测试计划 | `reference/test-plan.md` |
| 项目交接 | `reference/handoff.md` |
| UI 交接（历史） | `reference/ui-handoff.md` |
| OSS 结果导入 Worker | `reference/oss-result-import-worker.md` |
| OSS ↔ ToAPIs 交接 | `reference/oss-toapis-handoff.md` |

### 待办
| 文件 | 说明 |
|------|------|
| `todo.md` | 待办事项与风险，按优先级 |

## 维护约定

- 改了页面/功能：更新对应 `requirements/<域>.md`（合并最终确认的目标/流程/默认值/规则/边界/验收），更新「最后更新」日期，并在「需求变更」追加一条带日期的记录。
- 重要设计取舍 → `records/decision-log.md`；有复用价值的故障根因 → `records/bug-fixes.md`；已落地且值得追踪的功能变化 → `records/changelog.md`；未完成/待确认/有风险 → `todo.md`。
- 不为每次对话新建文档；只有形成新的稳定业务域时，才在 `requirements/` 新建文件并更新其 `README.md`。
- 不编造信息；无法确认的标记「待确认」，规划内容不得写成「已实现」。
