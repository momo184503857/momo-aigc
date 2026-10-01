# 本地故障报警与黑匣子

## 状态与边界

2026-10-01：本地实现，生产尚未安装或启用。设计规格见 `incident-monitoring-spec.md`。

- 独立 Python 服务探测 Node / Nginx / SQLite，业务进程卡死或退出不会停止监控。
- 项目内诊断记录请求、事件循环、SQLite 慢执行及生图提交/轮询/转存/图片代理阶段。
- 只写服务器本地文件，无外发、自动重启、自动切渠道或计费状态变更。
- 无新 npm/Python 依赖；Python 需 3.9+（Ubuntu 生产环境满足前仍须确认）。
- 整机宕机或磁盘不可写时不能保证落盘。发现原因依赖现场证据，不承诺直接确定代码根因。

## 默认规则

每 5 秒并行执行三项回环 HTTP 探测，单项整个请求（含响应体）最多 2 秒；不重叠采样轮次。
任一项连续 3 轮失败开启一个事故；全部连续 3 轮成功关闭事故。
报警触发需要约 10–17 秒，取决于故障相对采样的时刻与请求耗时。
故障持续期间约每 30 秒覆盖更新同一个事故包，不重复发开启报警。
重启独立监控会恢复已落盘的事故 ID，避免重复开启。

正常慢生图不直接触发「全站故障」：只要三项本机探测正常，不会因上游等待而报警。
恢复日志的 `durationSeconds` 是从报警开启到确认恢复的时间，并非精确故障起止时间；原始探测时间可用于进一步缩小区间。

### 保存内容

建议固定根目录 `/var/log/momo-aigc-monitor/`：

| 路径 | 用途 |
|---|---|
| `watchdog/alerts.jsonl` | `incident_open` / `incident_recovered` 和独立探测历史 |
| `watchdog/state.json` | 独立监控重启后恢复事故状态 |
| `incidents/<UUID>.json` | 开启前采样、开启时应用日志、最近采样、当前应用日志、Nginx 时序及最后成功探测现场 |
| `app/events.jsonl` | 请求开始/结束、在途请求、上游阶段、事件循环/CPU/内存、SQLite 慢执行 |

应用每 5 秒采样，保留最长等待的前 24 个请求/操作，内部最多跟踪 256 个，计数仍覆盖全部请求/操作。
日志写入队列最多 512 条，过载会丢弃诊断记录而非阻塞业务；`droppedLogs` 标识证据可能不完整。
请求超过 3 秒标记 slow，生图阶段超过 10 秒标记 slow，SQLite `run/get/all` 超过 200ms 或异常记录指纹；不记录 SQL 或绑定参数。
SQLite `iterate`、`exec`、prepare 编译耗时目前不做逐执行诊断，事务及 SQLite 错误保持原语义。
`upstream_headers` 只计连接至响应头的总时间（不分离 DNS/TLS），响应体耗时由外围提交/轮询/转存/代理阶段覆盖。
只读数据库探测在独立 Worker 线程读取 `sqlite_master`，锁等待最多 100ms，健康检查最多等待 500ms，不在业务主线程执行同步探测；不执行迁移、业务写入、checkpoint 或长事务。

JSON 时间保存为带时区 UTC；下方查看命令转换为北京时间。
请求 ID 为服务器生成 UUID。只保留固定路径标签、方法、耗时、数值状态、任务号和渠道 ID。
不复制请求体、提示词、图片、Cookie、Authorization、完整 URL、渠道 Key、异常消息、进程命令行或环境变量。
现有 PM2/业务日志不因此自动脱敏；黑匣子不直接复制它们。

### 保留与容量

- 独立监控每轮清理专用目录中已识别的归档：保留 7 天，总预算 300 MiB。
- 保留活跃写入文件、状态文件及当前事故；单个事故包最多 2 MiB。
- 应用日志每约 2 MiB 轮转（最多额外一个小批次），最多 10 个归档；独立报警历史同样约 2 MiB 轮转。
- 当前文件滚动保留最新数据，不保证精确保留整整 7 天；达到预算时旧事故可能提前删除。
- 预算按采样轮次清理，并非文件系统硬配额；可能短时超过预算一个写入批次。若活跃文件本身超过预算，保留现场并写本地兜底警告。
- Nginx 原始结构化诊断日志单独由 logrotate 管理，**不计入 300 MiB 黑匣子预算**；它只把有界、白名单过滤后的摘要复制入事故包。
- Nginx 的 `maxsize` 在 logrotate 运行时检查，不是实时硬上限。当前示例每天运行一次；高流量环境另行配置更频繁的系统 logrotate 执行。

## 本地验证

```bash
npm run test:monitor
npm run check
npm run build:server
```

测试使用临时目录、内存数据库及回环端口：包含真实独立 Node 进程的主线程阻塞与退出。
集成测试的 Nginx 探测使用回环 HTTP 替身，不代表生产 Nginx 配置验收；生产故障注入禁止执行。

## 生产安装流程（另需授权；不是自动部署脚本）

以下以 `/root/momo-aigc` 为生产代码目录。必须先审查所有配置；不改变现有业务 location、超时或缓存规则。
代码部署遵循 `deployment.md`；不要为启用监控默认执行 git pull、提交或推送。

### 1. 安装私有目录与共享探测令牌

```bash
install -d -m 700 /etc/momo-aigc-monitor /var/log/momo-aigc-monitor
install -d -m 755 /opt/momo-aigc-monitor
# 仅第一次生成。已有令牌时保留；轮换必须同时更新项目和独立监控并重启两者。
if [ ! -f /etc/momo-aigc-monitor/token ]; then
  (umask 077; openssl rand -hex 32 > /etc/momo-aigc-monitor/token)
fi
install -m 600 /root/momo-aigc/ops/monitor/config.example.json /etc/momo-aigc-monitor/config.json
install -m 755 /root/momo-aigc/scripts/incident-watchdog.py /opt/momo-aigc-monitor/incident-watchdog.py
```

令牌不输出到聊天、日志或命令行参数；不复用 JWT/渠道 Key。监控脚本复制到项目目录之外，即使项目目录临时不可用也能运行。

### 2. 先限制 Nginx 入口，再启用后端

- 将 `ops/monitor/nginx-http.conf.example` 内容放在 Nginx `http{}` 范围（如 `/etc/nginx/conf.d/momo-diagnostics.conf`）。
- 将 `ops/monitor/nginx-server.conf.example` 合并到现有 momo-aigc `server{}`；不要整文件覆盖站点配置。
- 额外诊断日志的 `map` 路径只输出固定标签，健康检查不写入 Nginx 诊断日志。
- 如现有 access_log 继承自 http{}，增加 server{} access_log 时，须把现有指令也显式保留，否则 Nginx 会停止继承旧 access_log。
- 将 logrotate 示例安装到 `/etc/logrotate.d/momo-diagnostics`。

```bash
nginx -t && systemctl reload nginx
```

健康端点同时校验实际 socket 回环来源和令牌，不信任 X-Forwarded-For。
Nginx `allow/deny` 校验的是连接客户端，不能通过伪造请求头绕过。
本机 Nginx 转发会表现为回环连接，因此应用层令牌不可省略；必须先安装公网拒绝规则。

在生产项目 `.env` 中分别去重设置（不是追加重复变量）：

```env
MONITOR_ENABLED=1
MONITOR_DIR=/var/log/momo-aigc-monitor
MONITOR_TOKEN_FILE=/etc/momo-aigc-monitor/token
```

默认未设置 `MONITOR_ENABLED=1` 时，诊断不采样、不写盘、不包装数据库，健康端点返回 404。
本地开发可用 `MONITOR_TOKEN` 代替令牌文件；文件配置优先，禁止把真实令牌提交到仓库。
按现有后端部署流程编译，并在获得部署授权后执行 PM2 restart --update-env。

### 3. 安装并启动独立服务

```bash
install -m 644 /root/momo-aigc/ops/monitor/momo-aigc-monitor.service /etc/systemd/system/momo-aigc-monitor.service
systemctl daemon-reload
# 单轮探测会记录 probe_sample；检查三项 ok 后再启动常驻服务。
python3 /opt/momo-aigc-monitor/incident-watchdog.py --config /etc/momo-aigc-monitor/config.json --once
systemctl enable --now momo-aigc-monitor
systemctl status momo-aigc-monitor --no-pager
```

单实例文件锁阻止重复运行，包括常驻服务运行时另起 `--once`；需要单轮检查时先在常驻服务启动前执行。不得同时启动多个常驻 watcher。服务与 PM2 业务进程无 Requires/PartOf/BindsTo 关系，项目重启不会停止监控。
服务只允许回环网络，只可写黑匣子目录，并设置资源限制；单轮手工检查须在常驻服务启动前运行。
`--once` 返回 0 表示采样程序完成，不表示三项探测健康，需读取最新 probe_sample 确认。

### 4. 必须完成生产只读验收

- 三项探测均 `ok: true`，事件循环指标和请求日志实际落盘。
- 本机直接 Node 和 Nginx 的无令牌探测失败；带令牌探测成功。
- 从开发机访问公网 `/api/internal/monitor/health` 与 `/database` 均被拒绝；不能只在服务器 curl 回环来替代该验证。
- 日志权限、服务启动/配置、Nginx `nginx -t` 和 logrotate dry-run 通过。
- 不通过停止生产进程、阻塞生产接口或调用付费生图来验收。

## 查询事故（服务器执行）

只查看报警/恢复行，不被每轮探测记录淹没：

```bash
grep -h -E '"event": "incident_(open|recovered)"' /var/log/momo-aigc-monitor/watchdog/alerts*.jsonl | tail -n 20
ls -lt /var/log/momo-aigc-monitor/incidents/ | head
journalctl -u momo-aigc-monitor --since '30 minutes ago' --no-pager
```

查看最新探测的健康状态：

```bash
python3 - <<'PY'
import json
from pathlib import Path
lines = Path('/var/log/momo-aigc-monitor/watchdog/alerts.jsonl').read_text().splitlines()
for line in reversed(lines):
    entry = json.loads(line)
    if entry['event'] == 'probe_sample':
        print(entry['timestamp'], {name: result['ok'] for name, result in entry['probes'].items()})
        break
PY
```

将报警时间转换为北京时间：

```bash
python3 - <<'PY'
import datetime, json
from pathlib import Path
bj = datetime.timezone(datetime.timedelta(hours=8))
for line in Path('/var/log/momo-aigc-monitor/watchdog/alerts.jsonl').read_text().splitlines():
    item = json.loads(line)
    if item['event'] in ('incident_open', 'incident_recovered'):
        time = datetime.datetime.fromisoformat(item['timestamp']).astimezone(bj)
        print(time.isoformat(), item['event'], item['incidentId'])
PY
```

事故包中：`onsetSamples` 是开启前最多 60 轮独立指标，`onsetAppEvents` 保留开启时应用日志；`recentSamples` 和 `appEvents` 展示最近现场。
`lastSuccessfulBackendDiagnostics` 保留最后一次能响应时的在途请求/阶段；卡死时仍可结合独立 `/proc` 资源/进程计数判断。
事件循环延迟或 SQLite 慢执行可能在恢复后才落盘，需结合恢复时事故包、请求 ID、SQL 指纹、任务号和 Nginx 时序，不单凭一个指标下结论。
所有日志/事故包只作证据，不包含自动判定的「确定根因」。

## 停用与升级

停用独立服务：`systemctl disable --now momo-aigc-monitor`。证据保留，不自动删除。
停用项目内诊断：将 `MONITOR_ENABLED` 改为 `0`，经授权重启后端；保留 Nginx 公网拒绝规则。
升级独立脚本：经授权替换 `/opt/momo-aigc-monitor/incident-watchdog.py` 并重启独立服务，无需重启业务进程。
改变目录时，同时修改项目环境、watcher config 及 systemd ReadWritePaths；不能只修改其中一处。
