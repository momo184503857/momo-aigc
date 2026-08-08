# 运维手册（Runbook）

本手册记录 momoAigc 生产环境的日常运维操作与故障排查。面向需要直接操作服务器的人（或 AI 代理）。

首次部署、架构、数据库结构等背景信息见 `deployment.md`、`architecture.md`、`database-schema.md`。

---

## 环境速查

| 项 | 值 |
|----|----|
| 服务器 | 阿里云 ECS，`REDACTED-SERVER-IP`（2026-08-08 由 `REDACTED-OLD-SERVER-IP` 迁移而来，旧地址已废弃） |
| 系统 | Ubuntu 26.04 LTS |
| 项目目录 | `/root/momo-aigc`（即 `~/momo-aigc`） |
| 进程管理 | PM2，进程名 `momo-aigc` |
| 反向代理 | Nginx，静态根目录 `/root/momo-aigc/dist` |
| 数据库 | SQLite，`~/momo-aigc/server/data/momo.db`（WAL 模式） |
| 访问入口 | `http://REDACTED-SERVER-IP/` |
| 代码仓库 | `git@gitee.com:hellolihaoran/momo-aigc.git`（服务器走 SSH，见下） |

---

## SSH 访问

### 开发机免密登录（已配置）

开发机（Mac）的 `~/.ssh/id_ed25519.pub` 已加入服务器 root 授权列表。直接：

```bash
ssh root@REDACTED-SERVER-IP
```

### 服务器拉代码（Gitee SSH，已配置）

服务器仓库 remote 为 SSH 协议，使用专用密钥 `~/.ssh/id_ed25519_gitee`（通过 `~/.ssh/config` 的 `Host gitee.com` 段指定，`IdentitiesOnly yes`）。`git pull` 不需要 Gitee 账号密码。

```bash
# 在服务器上
cd ~/momo-aigc
git pull origin master
```

> 若 Gitee 密钥失效（拉代码报 `Permission denied (publickey)`），重新生成密钥并把公钥加到 Gitee 个人设置 → SSH 公钥。详见 `deployment.md` 的 2026-08-08 迁移记录。

---

## 常用运维命令

所有命令均可在开发机用 `ssh root@REDACTED-SERVER-IP '<命令>'` 远程执行，无需登录服务器。

### PM2

```bash
pm2 status                        # 进程状态
pm2 logs momo-aigc --lines 100    # 看最近 100 行日志
pm2 logs momo-aigc                # 实时跟踪日志（Ctrl+C 退出）
pm2 restart momo-aigc --update-env   # 重启（--update-env 用于 .env 变更后重新加载）
pm2 stop momo-aigc                # 停止
pm2 start momo-aigc               # 启动
pm2 monit                         # 实时 CPU/内存监控
```

### Nginx

```bash
nginx -t                           # 检查配置语法
systemctl reload nginx             # 重载配置（不中断服务）
systemctl restart nginx            # 重启
tail -f /var/log/nginx/error.log   # 跟踪错误日志
```

### 健康检查

```bash
curl -s -o /dev/null -w "首页: %{http_code}\n" http://localhost/                         # 期望 200
curl -s -o /dev/null -w "健康检查: %{http_code}\n" http://localhost/api/toapis/health    # 期望 401（需鉴权，非 200 即可）
```

### 数据库

```bash
# 在线触发 WAL checkpoint（把 WAL 合并进主库，对运行中的应用安全）
sqlite3 ~/momo-aigc/server/data/momo.db 'PRAGMA wal_checkpoint(TRUNCATE);'

# 查看各表行数
sqlite3 ~/momo-aigc/server/data/momo.db "SELECT name FROM sqlite_master WHERE type='table';" \
  | xargs -I{} sh -c 'echo "{}: $(sqlite3 ~/momo-aigc/server/data/momo.db "SELECT COUNT(*) FROM {};")"'
```

> 拉取生产数据库到本地调试，用 `bash scripts/pull-db.sh`（默认连 `REDACTED-SERVER-IP`）。

---

## 部署

完整流程见 `deployment.md` 的「日常更新部署流程」。要点速记：

```bash
# 最常见：仅前端改动，从开发机一键远程部署
ssh root@REDACTED-SERVER-IP 'cd ~/momo-aigc && git pull origin master && npm run build'
```

- 改了 `src/` → `npm run build`（前端），**无需** 重启 PM2。
- 改了 `server/` → `npm run build:server` + `pm2 restart momo-aigc --update-env`。
- 改了 `package.json` → 先 `npm install`。
- 改了 `.env` → 改服务器 `.env` 后 `pm2 restart momo-aigc --update-env`。

每次部署前会自动把上一个 HEAD 存到 `~/.momo-aigc-last-deploy-head`，回滚见 `deployment.md`。

---

## 故障排查

### 现象：访问首页返回 502 Bad Gateway

**原因**：后端 PM2 进程没起来，Nginx 反代 `127.0.0.1:3000` 连接被拒。

**排查**：
```bash
pm2 status                          # momo-aigc 是否 online？
pm2 logs momo-aigc --lines 50       # 看崩溃原因
```

**常见崩溃原因**：
- `.env` 缺变量（如 `OSS_ACCESS_KEY_ID`）→ 补全后 `pm2 restart momo-aigc --update-env`
- `server/data/` 目录被删 → 应用启动时会自动重建，若仍报 `directory does not exist`，手动 `mkdir -p ~/momo-aigc/server/data && pm2 restart momo-aigc`
- 端口 3000 被占用 → `lsof -i:3000` 查占用，kill 或换端口

### 现象：首页能打开，但 API 全 404 / 跨域报错

**原因**：Nginx 的 `/api/` 反代配置丢失或 `server_name` 不对。

**排查**：
```bash
cat /etc/nginx/sites-enabled/momo-aigc   # 确认反代配置存在
nginx -t && systemctl reload nginx
```

### 现象：`git pull` 报 `could not read Username for 'https://gitee.com'`

**原因**：仓库 remote 退化成了 HTTPS（或新克隆的机器没配 SSH）。

**修复**：
```bash
git remote set-url origin git@gitee.com:hellolihaoran/momo-aigc.git
```
若仍报 `Permission denied (publickey)`，按上文「SSH 访问」重新配置 Gitee 密钥。

### 现象：`git pull` 报本地修改冲突（通常是 `server/data/momo.db*`）

**原因**：运行中的应用持续写数据库，与 git 跟踪的旧版本冲突。这些文件不应进 git。

**修复**：见 `deployment.md`「问题 6」——`git rm --cached` 后确认 `.gitignore` 含 `server/data/momo.db*`。

---

## 安全清单

- [ ] 默认管理员 `admin / admin123` 已在生产环境修改
- [ ] `.env` 不在 git 跟踪中（`.gitignore` 已配置）
- [ ] `server/data/momo.db*` 不在 git 跟踪中
- [ ] 阿里云安全组仅开放必要端口（80 对外，22 限定来源 IP，3000 不对外）
- [ ] OSS AccessKey 未曾明文泄露；若泄露过已在 RAM 控制台轮换
- [ ] Gitee / 服务器 SSH 私钥仅存于对应机器，未进入 git 或聊天记录
