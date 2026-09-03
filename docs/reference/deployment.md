# momoAigc 云服务器部署文档

## 环境信息

- **服务器**：阿里云 ECS
- **操作系统**：Ubuntu 26.04 LTS (64位)
- **域名/IP**：`http://<生产服务器IP>`

> **2026-08-08 迁移记录**：生产服务器已从 `<旧服务器IP>` 整机迁移至 `<生产服务器IP>`（应用、PM2、Nginx、SQLite 数据均在迁移范围内）。下方文档中涉及服务器 IP 的命令均应使用新地址。历史地址已废弃，请勿再连接。
>
> 迁移当日一并完成的运维配置（后续部署依赖，勿回退）：
> - **SSH 免密登录**：开发机 Mac 的 `~/.ssh/id_ed25519.pub` 已加入服务器 root 授权列表，可直接 `ssh root@<生产服务器IP>`。
> - **代码仓库已迁至 GitHub**：`https://github.com/momo184503857/momo-aigc`（gitee 仓库已弃用，不再推送；服务器 remote 已指向 GitHub）。历史重写后旧克隆的对齐步骤见 `runbook.md`「服务器拉代码」。
- **代码仓库**：`https://github.com/momo184503857/momo-aigc`

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3 + Vite + Element Plus + Pinia |
| 后端 | Express.js + TypeScript |
| 数据库 | SQLite (better-sqlite3) |
| 文件存储 | 阿里云 OSS |
| 进程守护 | PM2 |
| 反向代理 | Nginx |

---

## 首次部署步骤

### 1. 基础环境

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git build-essential python3
```

`build-essential` 是必须的，因为 `better-sqlite3` 需要编译原生 C++ 模块。

### 2. 安装 Node.js（通过 nvm）

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.nvm/nvm.sh
nvm install 20
nvm alias default 20
```

验证：

```bash
node -v    # 应输出 v20.x.x
npm -v     # 应输出 10.x.x
```

### 3. 拉取代码

```bash
cd ~
git clone https://github.com/momo184503857/momo-aigc.git
cd momo-aigc
```

### 4. 安装依赖

```bash
npm install
```

### 5. 配置环境变量

```bash
cp .env.example .env
nano .env
```

最小配置（直接传模式，无需任何云存储）：

```env
# Server
JWT_SECRET=<随机字符串，用 openssl rand -hex 32 生成>
PORT=3000

# ToAPIs Base URL
TOAPIS_BASE_URL=https://toapis.xyz
```

直接传模式下：上传图片保存在 `server/data/uploads/`（由 `/api/files/` 静态服务），生图参考图提交时直传 AI 渠道（ToAPIs 走 `/v1/uploads/images` 官方上传接口，OpenAI 兼容 / 火山走 base64），结果图由服务端直接下载落盘。**无需 OSS、无需 CORS 配置。**

可选：改用阿里云 OSS 存储。推荐在管理后台「配置 → 存储」页签切换并填写（支持测试连接，密钥存数据库 `system_config`，不进代码仓库）；也可用 `.env` 兜底：

```env
# Alibaba Cloud OSS（可选；后台配置优先）
OSS_ENDPOINT=oss-cn-hangzhou.aliyuncs.com
OSS_BUCKET=momo-aigc
OSS_ACCESS_KEY_ID=<你的 AccessKey ID>
OSS_ACCESS_KEY_SECRET=<你的 AccessKey Secret>

# OSS Result Import Worker (阿里云函数计算；仅 OSS 模式需要，直接传模式无需配置)
OSS_RESULT_IMPORT_WORKER_URL=https://oss-rest-worker-xxx.cn-hangzhou.fcapp.run
OSS_RESULT_IMPORT_WORKER_SECRET=<与 FC Worker 侧一致的长随机串>
```

> OSS 模式说明：浏览器直传 bucket（需 bucket 开公共读 + CORS 允许 POST），结果图经 FC Worker 流式转存后才展示和下载，不向浏览器暴露上游 URL。切换模式即时生效（无需重启），历史图片 URL 不受影响。

### 6. 构建项目

先构建后端：

```bash
npm run build:server
```

再构建前端：

```bash
npm run build
```

构建成功后，后端输出在 `server/dist/`，前端输出在 `dist/`。

> 前端为**双入口**：`vite.config.ts` 通过 `build.rollupOptions.input` 注册 `index.html`（用户端）和 `admin.html`（管理后台），`npm run build` 会同时产出 `dist/index.html` 与 `dist/admin.html` 两个入口（各自独立的入口 chunk）。后端 `/api/admin/*` 路由与 JWT 账号体系两端共用，无需为管理后台单独部署后端。

### 7. 安装 Nginx

```bash
sudo apt install -y nginx
```

创建站点配置：

```bash
sudo nano /etc/nginx/sites-available/momo-aigc
```

```nginx
server {
    listen 80;
    server_name _;

    # 前端静态文件
    root /root/momo-aigc/dist;
    index index.html;

    # SPA 路由支持（同时覆盖用户端 index.html 与管理后台 admin.html）
    # admin.html 是 dist 下的真实文件，try_files 第一段 $uri 会直接命中并返回，
    # 因此管理后台无需任何额外 SPA 回退配置；深链刷新（/admin.html#/xxx）由
    # 浏览器侧 hash 路由处理，请求的始终是 /admin.html 本身。
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 用户帮助文档静态目录（与 dist 构建产物解耦：改文档只需 git pull，无需 build）
    # alias 只指向 docs/help/，docs/ 下其余目录为内部文档，不对外暴露
    location /docs/ {
        alias /root/momo-aigc/docs/help/;
        add_header Cache-Control "no-cache";
    }

    # 后端 API 代理
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # ToAPIs 结果转存可能包含 FC 冷启动和大图传输。
    location = /api/oss/import-result {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_connect_timeout 10s;
        proxy_send_timeout 140s;
        proxy_read_timeout 140s;
    }
}
```

启用站点并修复目录权限：

```bash
ln -sf /etc/nginx/sites-available/momo-aigc /etc/nginx/sites-enabled/momo-aigc
rm -f /etc/nginx/sites-enabled/default
chmod o+x /root
chmod -R o+rX /root/momo-aigc/dist
chmod -R o+rX /root/momo-aigc/docs   # 帮助文档静态目录（Nginx /docs/ 需要读取权限）
nginx -t && systemctl reload nginx
```

### 8. 安装 PM2 并启动后端

```bash
npm install -g pm2
pm2 start server/dist/index.js --name momo-aigc
pm2 save
pm2 startup
```

### 9. 配置阿里云安全组

进入 ECS 控制台 → 安全组 → 入方向，添加规则：

| 端口 | 协议 | 来源 | 说明 |
|------|------|------|------|
| 80 | TCP | 0.0.0.0/0 | HTTP 访问 |

> 3000 端口不需要对外开放，通过 Nginx 反向代理即可。

### 10. 验证

浏览器访问 `http://<公网IP>/`，使用默认管理员账号登录：

- 用户名：`admin`
- 密码：`<初始管理员密码>`（首次登录后必须修改）

管理后台独立入口：访问 `http://<公网IP>/admin.html`，同一套账号登录（普通用户登录会被拒绝）。两端共享登录态，无需重复登录。

---

## 部署过程中遇到的问题及解决方案

### 问题 1：`tsc -p server/tsconfig.json` 构建报类型错误

**错误信息**：
```
error TS2769: No overload matches this call.
Type 'string' is not assignable to type 'number | StringValue | undefined'.
```

**原因**：新版本 `@types/jsonwebtoken` 中 `expiresIn` 参数类型收窄，不再接受普通 `string` 类型。

**解决**：`server/src/utils/jwt.ts` 第 11 行，将 options 显式断言：

```ts
// 修改前
return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn })

// 修改后
return jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn } as jwt.SignOptions)
```

### 问题 2：`vue-tsc -b` 构建报 composite 错误

**错误信息**：
```
error TS6306: Referenced project 'tsconfig.node.json' must have setting "composite": true.
```

**原因**：TypeScript 项目引用模式下，被引用的项目必须开启 `composite` 选项。

**解决**：在 `tsconfig.node.json` 的 `compilerOptions` 中添加 `"composite": true`。

### 问题 3：`vue-tsc` 报 `Property 'window' does not exist` 错误

**错误信息**：
```
error TS2339: Property 'window' does not exist on type 'CreateComponentPublicInstanceWithMixins<...>'
```

**原因**：Vue 3 模板中的 `@click="window.open(url, '_blank')"`，`window` 不能直接在模板中访问。

**解决**：在 `<script setup>` 中定义一个方法，模板中调用方法：

```ts
function openImage(url: string) {
  window.open(url, '_blank')
}
```

模板改为 `@click="openImage(url)"`。

### 问题 4：`vue-tsc` 报重复导入 `computed` 错误

**错误信息**：
```
error TS2300: Duplicate identifier 'computed'.
```

**原因**：`PromptLibraryPage.vue` 中第 2 行已从 `vue` 导入了 `computed`，第 38 行又写了一条重复的 import。

**解决**：删除第 38 行的重复导入。

### 问题 5：Nginx 返回 500 Internal Server Error

**错误信息**：
```
stat() "/root/momo-aigc/dist/index.html" failed (13: Permission denied)
```

**原因**：Nginx 默认以 `www-data` 用户运行，而项目放在 `/root` 目录下，`www-data` 无权进入 `/root` 目录。

**解决**：
```bash
chmod o+x /root
chmod -R o+rX /root/momo-aigc/dist
```

### 问题 6：Git 中跟踪了不该跟踪的文件 —— 导致部署全线崩溃

**现象**：服务器执行 `git pull` 时报错：

```
error: Your local changes to the following files would be overwritten by merge:
        server/data/momo.db
        server/data/momo.db-shm
        server/data/momo.db-wal
Please commit your changes or stash them before you merge.
error: The following untracked working tree files would be overwritten by merge:
        tsconfig.node.tsbuildinfo
        tsconfig.tsbuildinfo
Please move or remove them before you merge.
Aborting
```

**为什么会遇到**：

早期开发时，以下文件被意外提交到了 git 仓库：

| 文件 | 性质 | 为什么不该提交 |
|------|------|---------------|
| `server/data/momo.db` | SQLite 数据库 | 包含运行时的用户数据，每次部署不同 |
| `server/data/momo.db-shm` | SQLite WAL 共享内存 | 运行时临时文件 |
| `server/data/momo.db-wal` | SQLite WAL 日志 | 运行时临时文件 |
| `server/data/database.sqlite` | SQLite 数据库（重命名后） | 同上，提交 `199f967` 引入 |
| `tsconfig.tsbuildinfo` | TypeScript 增量编译缓存 | 每次编译重新生成，不同机器内容不同 |
| `tsconfig.node.tsbuildinfo` | TypeScript 增量编译缓存 | 同上 |

这些文件虽然在 `.gitignore` 中配置了忽略规则，但 `.gitignore` **只能阻止未跟踪的文件被添加**，对于已经在 git 历史中的文件不起作用。

当服务器上的数据库文件被运行中的应用持续写入时，`git pull` 发现本地有修改，拉取的新提交又要覆盖这些文件，于是就冲突了。

**解决步骤**：

1. 将所有不该跟踪的文件从 git 索引中移除（`--cached` 保留本地文件）：
   ```bash
   git rm --cached server/data/momo.db server/data/momo.db-shm server/data/momo.db-wal
   git rm --cached server/data/database.sqlite
   git rm --cached tsconfig.tsbuildinfo tsconfig.node.tsbuildinfo
   ```

2. 修正 `.gitignore`，确保所有模式正确匹配：
   ```
   server/data/momo.db*
   server/data/database.sqlite*
   *.tsbuildinfo
   ```
   > **教训**：`tsconfig.*.tsbuildinfo` 只能匹配 `tsconfig.node.tsbuildinfo`，匹配不到 `tsconfig.tsbuildinfo`（因为模式要求中间必须有一个 `.`）。用 `*.tsbuildinfo` 更可靠。

3. 提交并推送。

**如何避免**：

- 提交前检查 `git status`，确认没有把数据库文件、编译缓存、IDE 配置等加进去
- `.gitignore` 写清楚后再 `git add`，而不是反过来
- 如果发现已经提交了不该提交的文件，立刻 `git rm --cached` + 更新 `.gitignore`

---

### 问题 7：构建通过但 TypeScript 类型报错 —— 返回类型缺了嵌套层

**现象**：服务器 `npm run build`（`vue-tsc -b && vite build`）报错：

```
src/adapter/toapisClient.ts:84:21 - error TS2339: Property 'data' does not exist on type '{ url: string; }'.
     return res.data.data.url
                        ~~~~
src/adapter/toapisClient.ts:120:21 - error TS2339: Property 'data' does not exist on type '{ id: string; }'.
src/adapter/toapisClient.ts:154:27 - error TS2339: Property 'data' does not exist on type '...'.
```

**原因**：`src/services/toapisProxyApi.ts` 中三个代理方法的返回类型声明少写了一层 `data`。

实际运行时，axios 响应的结构是：
```
axiosResponse.data → { success: true, data: { url: string } }
```

所以访问路径是 `res.data.data.url`。但类型声明只写到了 `{ data: { url: string } }`，漏掉了服务器 JSON 响应中那层 `data` 包装，导致 TypeScript 认为 `res.data` 就已经是 `{ url: string }` 了，再 `.data` 就报错。

**解决**：在 `toapisProxyApi.ts` 的三个方法返回值类型中补上嵌套的 `data` 层：

```ts
// upload: Promise<{ data: { url: string } }>
//   → Promise<{ data: { data: { url: string } } }>

// createTask: Promise<{ data: { id: string } }>
//   → Promise<{ data: { data: { id: string } } }>

// getTaskStatus: Promise<{ data: { status, ... } }>
//   → Promise<{ data: { data: { status, ... } } }>
```

**如何避免**：

- API 服务的类型声明要对应**实际**返回结构，不要偷懒少写层级
- 新加代理 API 后，确保前端调用的地方类型检查能通过
- 提交前本地跑一次 `npm run build` 验证

---

### 问题 8：数据库目录不存在，服务无法启动

**现象**：删除数据库文件后重启，`pm2 logs` 显示：

```
TypeError: Cannot open database because the directory does not exist
```

`curl localhost:3000` 连接失败，`ls server/data/` 显示目录不存在。

**原因**：`better-sqlite3` 不会自动创建数据库文件的父目录。当 `server/data/momo.db*` 文件被删除后，git 不跟踪空目录，`server/data/` 目录也就丢失了。应用启动时尝试打开 `server/data/momo.db` 失败，因为目录不存在。

**解决**：

1. 临时救急：手动创建目录
   ```bash
   mkdir -p server/data && pm2 restart momo-aigc
   ```

2. 根本修复：在代码中自动创建目录（`server/src/db/index.ts`）：
   ```ts
   import fs from 'node:fs'
   import path from 'node:path'
   
   // Ensure the data directory exists so better-sqlite3 can create the database file
   fs.mkdirSync(path.dirname(config.dbPath), { recursive: true })
   ```

**如何避免**：

- 操作数据库文件时，确保目录还在（`rm -f server/data/*.db*` 不会删目录，只有空目录会在 git 操作后消失）
- 应用启动代码应对必要目录做防御性创建

---

## 日常更新部署流程

当本地代码有更新，需要同步到服务器时。

> 前提：开发机已配置 SSH 免密登录（见上文迁移记录）。未配置时，下面的远程命令会要求输入服务器密码。

### 步骤 1：本地提交并推送

```bash
# 在本地项目目录
git add -A
git commit -m "描述你的改动"
git push origin master
```

### 步骤 2：判断本次需要构建什么

在服务器上构建前，先看本次改动涉及哪些目录，避免无谓的 `build` / `restart`：

```bash
# 在本地（或任何能看到远程仓库的机器）查看待部署提交的改动
git fetch origin
git diff --stat <服务器当前 HEAD>..origin/master
```

| 本次改动了 | 需要执行 | 是否要重启 PM2 |
|------------|---------|---------------|
| 仅 `src/`（前端） | `npm run build` | ❌ 不需要（静态产物即时生效） |
| `server/`（后端） | `npm run build:server` | ✅ `pm2 restart momo-aigc --update-env` |
| 仅 `docs/help/`（用户帮助文档） | ❌ 什么都不用执行 | ❌ 不需要（Nginx 直接读仓库目录，`git pull` 后刷新即生效） |
| `package.json` / `package-lock.json` | `npm install` 后再构建对应部分 | 视情况 |
| `.env` | 改服务器 `.env` 后 | ✅ `--update-env` 必须加 |

> 帮助文档与前端构建解耦（见 `docs/requirements/Vue3 后台内嵌帮助文档系统方案.md`）：
> `docs/help/**` 是运行时经 `GET /docs/**` 动态加载的静态 Markdown，修改后只需要
> 服务器 `git pull`，不执行 `npm run build`，不重启任何服务。新增文档目录时记得
> `chmod -R o+rX /root/momo-aigc/docs`（Nginx 以 www-data 运行，`/root` 下默认不可读）。

### 步骤 3：远程部署（推荐方式 —— 一条命令，无需 ssh 进去）

利用 SSH 免密，直接从开发机远程执行：

```bash
# 仅前端改动的最常见情况
ssh root@<生产服务器IP> 'cd ~/momo-aigc && git pull origin master && npm run build'
```

> 注意：`npm run build` 包含 `vue-tsc -b` 类型检查，类型错误会中断构建。提交前最好本地跑一次 `npm run build`。

### 步骤 4：验证

```bash
# 服务可用性
ssh root@<生产服务器IP> 'curl -s -o /dev/null -w "首页: %{http_code}\n" http://localhost/'
# 期望输出: 首页: 200

# PM2 状态
ssh root@<生产服务器IP> 'pm2 status'
```

浏览器打开 `http://<生产服务器IP>/`，**强制刷新**（Cmd+Shift+R）验收新功能。

### 回滚

每次部署前，服务器会自动把上一个 HEAD 写入 `~/.momo-aigc-last-deploy-head`。需要回滚时：

```bash
ssh root@<生产服务器IP> 'cd ~/momo-aigc && git reset --hard $(cat ~/.momo-aigc-last-deploy-head) && npm run build && npm run build:server && pm2 restart momo-aigc --update-env'
```

> 若只回滚前端，去掉 `build:server` 和 `pm2 restart` 即可。

### 旧方式（手动 ssh 进服务器逐条敲）

仍可用，适合不确定改动范围时交互式排查：

```bash
ssh root@<生产服务器IP>
cd ~/momo-aigc
git pull origin master
npm run build           # 前端有改动时
npm run build:server    # 后端有改动时
pm2 restart momo-aigc --update-env   # 仅后端改动时需要
```

---

## PM2 常用命令

| 命令 | 说明 |
|------|------|
| `pm2 status` | 查看所有进程状态 |
| `pm2 logs momo-aigc` | 查看后端日志 |
| `pm2 restart momo-aigc` | 重启后端 |
| `pm2 stop momo-aigc` | 停止后端 |
| `pm2 start momo-aigc` | 启动后端 |
| `pm2 monit` | 实时监控 CPU/内存 |

## Nginx 常用命令

| 命令 | 说明 |
|------|------|
| `nginx -t` | 检查配置语法 |
| `systemctl reload nginx` | 重载配置（不中断服务） |
| `systemctl restart nginx` | 重启 Nginx |
| `tail -f /var/log/nginx/error.log` | 查看错误日志 |

---

## 注意事项

1. **数据库文件绝对不能提交到 git**：当前 `.gitignore` 已配置 `server/data/momo.db*`、`server/data/database.sqlite*`，确保所有 SQLite 相关文件（含 WAL/SHM）不会被追踪。**如果 `.gitignore` 改了记得同步检查已跟踪文件不是还残留。**
2. **编译缓存不能提交**：`.gitignore` 已配置 `*.tsbuildinfo`，TypeScript 增量编译缓存不应进入仓库。
3. **不要提交 .env 文件**：`.gitignore` 已配置忽略 `.env`，敏感信息（AccessKey 等）不要提交到仓库。
4. **AccessKey 安全**：如果 AccessKey 曾经泄露在聊天或代码中，去阿里云 RAM 控制台及时更换。
5. **首次登录后修改密码**：默认管理员账号在正式使用前必须修改密码。
6. **SSL 证书**：如果后续有域名，建议配置 Let's Encrypt 免费 SSL（或阿里云免费 SSL），将 HTTP 升级为 HTTPS。
7. **`server/data/` 目录**：应用启动时会自动创建，不需要手动 `mkdir`。但如果手动删库重来，确保目录存在或重启应用。
8. **每次 pushes 之前本地跑一下构建**：`npm run build && npm run build:server`，确保类型检查和编译都通过，问题 7 那种情况就不会推到服务器上。
9. **数据库自动迁移（2026-08-09 作品库 + 提示词工坊上线）**：本次上线涉及数据库迁移--新增 6 张表（`works`/`work_tags`/`work_tag_relations`/`work_likes`/`work_favorites`/`prompt_cases`）+ 3 个迁移列（`prompt_library.segments`、`generation_tasks.prompt_segments`/`negative_prompt`）。迁移在 `server/src/db/schema.ts` 启动时幂等执行（`CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ... ADD COLUMN` 用 try/catch 容错），**部署后首次 `pm2 restart` 即自动跑迁移，无需手动 SQL**。观察 PM2 日志确认出现 `[DB] Schema initialized`。
10. **部署后验证新页面**：访问 `/works`（作品库广场）、`/works/:id`（作品详情）、`/prompt-workshop`（提示词工坊）、`/admin/works`（作品库管理）、`/admin/prompt-cases`（案例管理）确认页面正常加载。
11. **管理后台独立入口（2026-08-09 上线）**：前端改为双入口构建——`index.html`（用户端）+ `admin.html`（管理后台）。部署 `npm run build` 后确认 `dist/` 下同时存在这两个文件。管理后台访问 `/admin.html`（账号与用户端共用，普通用户登录被拒）；用户端侧边栏不再显示管理员菜单。**Nginx 无需改动**：现有 `try_files $uri $uri/ /index.html` 的 `$uri` 段会直接命中 `admin.html` 这个静态文件。管理后台用 hash 路由（`/admin.html#/users`），深链刷新不会回退到 `index.html`。
