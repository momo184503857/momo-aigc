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

# ToAPIs Base URL
TOAPIS_BASE_URL=https://toapis.com
```

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

### 问题 6：本地开发数据出现在服务器上

**原因**：SQLite 数据库文件（`server/data/momo.db` 及其 WAL 日志）被 git 追踪并提交到了仓库。

**解决**：
1. 将 `.gitignore` 中的 `server/data/*.sqlite` 改为 `server/data/momo.db*`
2. 从 git 追踪中移除：
```bash
git rm --cached server/data/momo.db server/data/momo.db-shm server/data/momo.db-wal
```

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
pm2 restart momo-aigc
```

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
pm2 restart momo-aigc
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

1. **不要在 git 中提交数据库文件**：`.gitignore` 已配置忽略 `server/data/momo.db*`，确保 SQLite 文件不会被提交。
2. **不要提交 .env 文件**：`.gitignore` 已配置忽略 `.env`，敏感信息（AccessKey 等）不要提交到仓库。
3. **AccessKey 安全**：如果 AccessKey 曾经泄露在聊天或代码中，去阿里云 RAM 控制台及时更换。
4. **首次登录后修改密码**：默认账号 `admin / admin123` 在正式使用时应修改。
5. **SSL 证书**：如果后续有域名，建议配置 Let's Encrypt 免费 SSL（或阿里云免费 SSL），将 HTTP 升级为 HTTPS。
