# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev            # Frontend dev server (Vite, port 5173)
npm run build          # Type-check + production build
npm run dev:server     # Backend dev server (Express, port 3000, hot-reload via tsx)
npm run build:server   # Compile server TypeScript
npm run start:server   # Run compiled server
```

The backend must be running for the frontend to work — Vite proxies `/api` to `http://localhost:3000`.

## Architecture

### Stack

- **Frontend**: Vue 3 + TypeScript + Vite + Element Plus + Pinia + Vue Router (hash mode)
- **Backend**: Express + TypeScript + better-sqlite3 + JWT auth + multer
- **External services**: ToAPIs (AI image generation API relay), Alibaba Cloud OSS (image storage)

### Dual-Mode API Key System

The most important architectural pattern. The app has two operating modes controlled by the admin:

| Mode | Where key lives | How ToAPIs is called |
|------|----------------|---------------------|
| **User mode** | Browser localStorage (XOR-obfuscated, `src/utils/crypto.ts`) | Browser calls `toapis.com` directly via `fetch()` |
| **Shared mode** | Server SQLite `system_config` table | Browser calls `/api/toapis/*`, Express proxies to ToAPIs |

The mode is determined by `src/stores/serverStatus.ts` which calls `GET /api/toapis/health` on startup. The adapter in `src/adapter/toapisClient.ts` checks `isSharedMode()` before each API call and routes accordingly. Task polling (every 4 seconds in `WorkspacePage.vue`) follows the same dual-mode path.

### Frontend Data Flow

```
Vue Component → service (Axios, baseURL=/api) → Express route → SQLite
                                                      ↓ (shared mode only)
                                                   ToAPIs API
```

- `src/services/http.ts` — Axios instance, attaches JWT Bearer token, 401 → redirect to `/login`
- `src/stores/auth.ts` — token + user state, persisted to localStorage as `auth_token`
- `src/stores/keyConfig.ts` — user's personal ToAPIs key (XOR-obfuscated in localStorage)
- `src/adapter/toapisClient.ts` — dual-mode dispatch: direct fetch vs `/api/toapis` proxy

### Backend Structure

```
server/src/
  index.ts              Express app, mounts /api/* routes
  db/index.ts           SQLite init (WAL mode)
  db/schema.ts          8 tables: users, template_images, generation_tasks, prompt_library, gallery_tags, template_image_tags, feature_prompts, system_config
  db/seed.ts            Default admin: admin / admin123
  middleware/auth.ts    JWT verification → req.user
  middleware/admin.ts   Role check → 403 if not admin
  routes/               REST endpoints (auth, tasks, templates, prompts, oss, proxy, toapis-proxy, admin/*)
```

### Image Storage Flow (OSS + Worker)

```
Browser → OSS (direct upload via PostObject policy)
Browser → ToAPIs (create task with OSS URLs)
ToAPIs completed → Server → FC Worker → OSS (result import)
Browser → OSS public URL (display/download)
```

Key files:
- `src/services/imageGeneration.ts` — central orchestrator, uploads local files to OSS, re-uploads non-OSS URLs (ToAPIs, etc.) to OSS before storing in DB
- `src/utils/download.ts` — cross-origin download helper: fetches via server proxy (POST /api/proxy/image), creates blob URL, triggers download
- `workers/oss-result-import-worker.mjs` — Alibaba Cloud FC function, downloads result from ToAPIs → uploads to OSS
- `server/src/utils/oss.ts` — OSS PostObject policy generation, Worker invocation (`importResultToOss`)
- `server/src/routes/proxy.ts` — image download proxy (POST /api/proxy/image), streams from source URL to client

### Three-Panel Workspace

The main page (`src/views/workspace/WorkspacePage.vue`) uses a resizable three-panel layout:
1. **Feature nav** (180px) — 9 predefined features + free-gen mode
2. **Generation form** — `GenerationForm.vue` (free-gen) or `FeatureForm.vue` (features), with model/prompt/resolution/aspect-ratio inputs, reference image uploads, template selector
3. **Task list** — `TaskList.vue`, supports list/grid view, bulk select, polling status updates every 4s

### Design System

All styles must use `--momo-*` CSS custom properties (defined in `src/styles/tokens/`), never hardcoded values. Element Plus components are themed via `src/styles/ep-overrides.css` which maps `--el-*` to `--momo-*` — changing one token propagates everywhere. Messages/dialogs must use `useUiFeedback` composable (`src/composables/useUiFeedback.ts`), never direct `ElMessage`/`ElMessageBox` imports.

## 必读文档

修改本项目代码前，请按需阅读以下文档：

- `docs/ui/ui-design-guidelines.md` — UI 设计规范（信息结构、交互流程、视觉标准）
- `docs/project/ui-handoff.md` — UI 交接文档（历史上下文）

## 项目文档索引

| 类别 | 文件 |
|------|------|
| 产品需求 | `docs/product/prd.md` |
| AI 买家秀 | `docs/product/buyer-show.md` |
| UI 设计规范 | `docs/ui/ui-design-guidelines.md` |
| UI 模块库 | `docs/ui/ui-module-library.md` |
| API 接口 | `docs/api/api-spec.md` |
| 系统架构 | `docs/architecture/architecture.md` |
| 数据库 | `docs/database/schema.md` |
| 部署运维 | `docs/engineering/deployment.md` |
| 运维手册 | `docs/operations/runbook.md` |
| 测试计划 | `docs/testing/test-plan.md` |
| 项目交接 | `docs/project/handoff.md` |
| 变更记录 | `docs/engineering/changelog.md` |
| 技术决策 | `docs/engineering/decision-log.md` |
| Bug 修复 | `docs/engineering/bug-fixes.md` |
| 待办事项 | `docs/engineering/todo.md` |
