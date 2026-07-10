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

### API Key System (Shared + Personal)

All ToAPIs calls are proxied through Express (`/api/toapis/*`); the browser never calls ToAPIs directly. Which key the proxy uses depends on the requesting user:

| Mode | Where the key lives | Points |
|------|---------------------|--------|
| **Shared** (default) | Server `system_config.toapis_api_key`, configured by admin in `/admin/toapis-key` | Consumed per `pricing.ts` on each generation |
| **Personal** (opt-in per user) | Server `user_toapis_keys` (AES-256-GCM encrypted, see `server/src/utils/crypto.ts`), configured by the user in `/settings` | **Not consumed** — billed to the user's own ToAPIs account |

- The proxy resolves the key per request via `resolveUserApiKey(userId)` in `server/src/utils/toapis.ts`: personal key (when enabled) wins, otherwise the shared key.
- `GET /api/toapis/health` returns `{ sharedKeyConfigured, personalKeyConfigured, personalKeyActive }` for the current user; `src/stores/serverStatus.ts` exposes computed `canGenerate` (= either key usable) and `usingPersonalKey` (used to hide points UI and skip balance checks across all generation forms).
- Personal-key CRUD lives under `/api/me/toapis/*` (`server/src/routes/me-toapis-key.ts`): `GET/PUT/DELETE /key`, `PATCH /key-mode`, `POST /test`, `GET /balance`.
- Billing branch: `server/src/routes/tasks.ts` `POST /` skips balance check / deduction / `points_transactions` when the user is in personal mode (still writes the `generation_tasks` row with `points_cost=0`).

### Credits System (新积分)

Storage and billing are in **新积分 (credits)**; **1 credit = ¥0.035 RMB**. The RMB value is always shown parenthetically.

- Conversion: `server/src/utils/credits.ts` (`YUAN_PER_CREDIT=0.035`, `creditsToYuan`, `yuanToCredits`) + frontend mirror `src/types/adapter.ts` (`formatCredits(c, opts?)` — every display calls this, never hand-write `×0.035`).
- Pricing (`server/src/utils/pricing.ts` + `src/types/adapter.ts` `MODELS[].pricing`) is in credits (integers: gpt-image-2 `1K:3/2K:4/4K:5`; gemini-3-pro `1K:10/2K:12/4K:16`; gemini-3.1-flash `512:5/1K:6/2K:8/4K:12`; gemini-2.5-flash `1K:2.4`). `calculateCost`/`getPrice` logic is unit-agnostic.
- `users.points`, `points_transactions.{amount,balance_after}`, `generation_tasks.{points_cost,points_balance_after}` all store credits. A one-time idempotent migration (`system_config.migration_credits_v1`) multiplied legacy 元 values by `200/7`.
- Admin recharge (`/api/admin/users/:id/points`) and user quota (`GET /api/me/quota`) are in credits.
- **Key credits**: each key's 新积分 comes from a TBD upstream API; `fetchKeyCredits()` in `credits.ts` is a placeholder (returns ToAPIs CNY with `credits=null`, shown as "新积分待接口"). ToAPIs `credits` (1 USD = 200 credits) is unrelated — labeled "credits" in UI, never ×0.035.
- 「我的额度」(`/my-quota`) + 「计费说明」(`/pricing`) pages live under the avatar dropdown.

### Frontend Data Flow

```
Vue Component → service (Axios, baseURL=/api) → Express route → SQLite
                                                      ↓ (shared mode only)
                                                   ToAPIs API
```

- `src/services/http.ts` — Axios instance, attaches JWT Bearer token, 401 → redirect to `/login`
- `src/stores/auth.ts` — token + user state, persisted to localStorage as `auth_token`
- `src/stores/serverStatus.ts` — key-mode state (`canGenerate` / `usingPersonalKey`) from `GET /api/toapis/health`
- `src/services/userKeyApi.ts` — personal-key CRUD/test/balance (`/api/me/toapis/*`)
- `src/adapter/toapisClient.ts` — thin client over `/api/toapis/*` proxy

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

- `docs/reference/ui-design-guidelines.md` — UI 设计规范（信息结构、交互流程、视觉标准）
- `docs/reference/ui-handoff.md` — UI 交接文档（历史上下文）

## 项目文档索引

| 类别 | 文件 |
|------|------|
| 产品需求 | `docs/requirements/prd.md` |
| AI 买家秀 | `docs/requirements/buyer-show.md` |
| UI 设计规范 | `docs/reference/ui-design-guidelines.md` |
| UI 模块库 | `docs/reference/ui-module-library.md` |
| API 接口 | `docs/reference/api-spec.md` |
| 系统架构 | `docs/reference/architecture.md` |
| 数据库 | `docs/reference/database-schema.md` |
| 部署运维 | `docs/reference/deployment.md` |
| 运维手册 | `docs/reference/runbook.md` |
| 测试计划 | `docs/reference/test-plan.md` |
| 项目交接 | `docs/reference/handoff.md` |
| 变更记录 | `docs/records/changelog.md` |
| 技术决策 | `docs/records/decision-log.md` |
| Bug 修复 | `docs/records/bug-fixes.md` |
| 待办事项 | `docs/todo.md` |
