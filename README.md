# 墨墨 AI 生图（momo-aigc）

面向电商与内容创作场景的多渠道 AI 生图平台：模板生图、自由生图、AI 摄影、商品素材图、成套生图与提示词工坊一体化，内置积分计费、作品社区与管理后台。前端 Vue 3，后端 Express + SQLite，生图链路服务端编排、多渠道多 Key 轮换。

## 功能特性

- **多形态生图**：快速生图（工作台模板流）、自由生图、AI 摄影
- **商品素材**：细节图 / 面料图 / 平铺图 / 3D 图，支持模板库快捷选取与补充图片
- **成套生图与提示词专家**：套系、主题库、点位编排，一键产出整套商品图
- **提示词体系**：提示词工坊、提示词库、模板库
- **画布编辑**：生成结果画布化二次编辑
- **作品社区**：作品广场、买家秀
- **管理后台**：用户与积分、AI 渠道与模型定价、模板 / 主题 / 套系管理
- **多渠道 AI 接入**：ToAPIs（异步任务式）、火山方舟 Seedream、任意 OpenAI 兼容渠道；渠道内 Key 池优先级轮换、耗尽自动故障转移
- **积分计费**：按「模型 × 分辨率 × 张数」预扣、失败全额自动退还，定价存于数据库不硬编码
- **存储双模式**：默认「直接传」——图片存本机磁盘、参考图直传 AI 渠道（ToAPIs 官方上传接口 / OpenAI 兼容与火山走 base64），零云存储依赖；可在管理后台一键切换为阿里云 OSS（浏览器直传 bucket + 结果转存 Worker），不向前端暴露上游 URL

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | Vue 3 + TypeScript + Vite + Element Plus + Pinia + Vue Router |
| 后端 | Express + TypeScript + better-sqlite3（SQLite WAL）+ JWT |
| 存储 | 本机磁盘（默认，直接传）/ 阿里云 OSS（管理后台可切换） |
| AI 适配 | toapis / openai_image / volcengine_image / openai_compat / volcengine |

## 快速开始

环境要求：Node.js 20+；`better-sqlite3` 含原生模块，Windows 需 VS Build Tools，Ubuntu 需 `build-essential`。

```bash
git clone https://github.com/momo184503857/momo-aigc.git
cd momo-aigc
npm install

cp .env.example .env    # 改 JWT_SECRET 即可跑通（无需配置对象存储）

npm run dev:server      # 后端：Express，端口 3000，热重载
npm run dev             # 前端：Vite，端口 5273，/api 代理到 3000
```

后端必须在运行，前端才能正常工作（Vite 将 `/api` 代理至 `http://localhost:3000`）。

默认管理员账号 `admin / admin123`（登录后请立即修改）。

### 图片存储说明

开箱默认「直接传」模式：上传图片保存在 `server/data/uploads/`（由 `/api/files/` 提供访问），提交生图时参考图直传 AI 渠道——**无需阿里云 OSS、无需 CORS 配置**。

如需改用阿里云 OSS：管理后台 → 配置 → 存储，切换为 OSS 并填写 Bucket 与 AccessKey（支持「测试连接」，密钥存数据库不进代码仓库；亦可用 `.env` 中 `OSS_*` 变量兜底）。切换即时生效，历史图片 URL 不受影响。

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 前端开发服务器（Vite，5273） |
| `npm run dev:server` | 后端开发服务器（Express，3000，tsx 热重载） |
| `npm run build` | 前端类型检查 + 生产构建 |
| `npm run build:server` | 编译后端 TypeScript |
| `npm run check` | 前后端全量类型检查 |

## 目录结构

```
src/             前端源码（views / components / stores / services / composables）
server/src/      后端源码（routes / providers / db / middleware / utils）
docs/            文档（产品需求 / 技术方案 / API 参考 / 数据库结构）
scripts/         运维与校验脚本
```

## 文档

主要文档位于 `docs/`：产品需求（`requirements/prd.md`）、UI 设计规范（`ui/ui-design-guidelines.md`）、API 参考（`reference/api-spec.md`）、数据库结构（`reference/database-schema.md`）、渠道与 Key 池设计（`requirements/fixed-channels.md`）等。

## 许可

本项目暂未附加开源许可证（LICENSE），代码保留所有权利。如需引用或合作请先联系作者。
