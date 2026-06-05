# momoAigc 云服务器部署文档

## 环境信息

- **服务器**：阿里云 ECS
- **操作系统**：Ubuntu 26.04 LTS (64位)
- **域名/IP**：`http://REDACTED-OLD-SERVER-IP`
- **代码仓库**：`https://gitee.com/hellolihaoran/momo-aigc`

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
git clone https://gitee.com/hellolihaoran/momo-aigc.git
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

填入以下内容：

```env
# Server
JWT_SECRET=<随机字符串，用 openssl rand -hex 32 生成>
PORT=3000

# Alibaba Cloud OSS
OSS_ENDPOINT=oss-cn-hangzhou.aliyuncs.com
OSS_BUCKET=momo-aigc
OSS_ACCESS_KEY_ID=<你的 AccessKey ID>
OSS_ACCESS_KEY_SECRET=<你的 AccessKey Secret>

# OSS Result Import Worker (阿里云函数计算)
OSS_RESULT_IMPORT_WORKER_URL=https://oss-rest-worker-ykaraoaubf.cn-hangzhou.fcapp.run
OSS_RESULT_IMPORT_WORKER_SECRET=REDACTED-WORKER-SECRET

# ToAPIs Base URL
TOAPIS_BASE_URL=https://toapis.com
```

> ⚠️ `OSS_RESULT_IMPORT_WORKER_*` 两个变量**必须配置**，否则结果图不会被转存到 OSS，会降级保留 ToAPIs URL（可能过期或无法跨域下载）。

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

    # SPA 路由支持
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 后端 API 代理
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

启用站点并修复目录权限：

```bash
ln -sf /etc/nginx/sites-available/momo-aigc /etc/nginx/sites-enabled/momo-aigc
rm -f /etc/nginx/sites-enabled/default
chmod o+x /root
chmod -R o+rX /root/momo-aigc/dist
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
- 密码：`admin123`

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

当本地代码有更新，需要同步到服务器时：

### 步骤 1：本地提交并推送

```bash
# 在本地项目目录
git add -A
git commit -m "描述你的改动"
git push origin master
```

### 步骤 2：服务器拉取代码

```bash
ssh root@你的服务器IP
cd ~/momo-aigc
git pull origin master
```

### 步骤 3：重新构建

```bash
npm run build:server   # 如果后端代码有改动
npm run build           # 如果前端代码有改动
```

> 如果只有前端改动，只需要 `npm run build`；只有后端改动，只需要 `npm run build:server`。

### 步骤 4：重启后端服务

```bash
pm2 restart momo-aigc --update-env
```

> `--update-env` 很重要：如果 `.env` 有新变量或修改，不加这个参数 PM2 不会重新加载。

### 步骤 5：验证

浏览器刷新页面，检查新功能是否生效。

### 快捷脚本

可以在项目根目录创建一个 `deploy.sh`：

```bash
#!/bin/bash
set -e
echo "[Deploy] Pulling latest code..."
git pull origin master
echo "[Deploy] Building frontend..."
npm run build
echo "[Deploy] Building backend..."
npm run build:server
echo "[Deploy] Restarting server..."
pm2 restart momo-aigc --update-env
echo "[Deploy] Done!"
```

以后只需要：

```bash
cd ~/momo-aigc && bash deploy.sh
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
5. **首次登录后修改密码**：默认账号 `admin / admin123` 在正式使用时应修改。
6. **SSL 证书**：如果后续有域名，建议配置 Let's Encrypt 免费 SSL（或阿里云免费 SSL），将 HTTP 升级为 HTTPS。
7. **`server/data/` 目录**：应用启动时会自动创建，不需要手动 `mkdir`。但如果手动删库重来，确保目录存在或重启应用。
8. **每次 pushes 之前本地跑一下构建**：`npm run build && npm run build:server`，确保类型检查和编译都通过，问题 7 那种情况就不会推到服务器上。
