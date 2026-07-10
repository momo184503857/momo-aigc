#!/usr/bin/env bash
#
# pull-db.sh — 把服务器上的生产 SQLite 数据库拉到本地，覆盖 server/data/momo.db
#
# 流程：
#   1. ssh 到服务器，对 momo.db 执行 PRAGMA wal_checkpoint(TRUNCATE)
#      （把 WAL 日志合并进主库，保证拿到一致快照；该操作对运行中的应用是安全的）
#   2. rsync 只拉 momo.db 到本地（图片等大文件都在 OSS，不需要从服务器下载）
#   3. 本地用 sqlite3 做一次完整性检查并打印关键表的行数
#
# 配置优先级：shell 环境变量 > 项目根 .env > 脚本内默认值
#   REMOTE_USER  默认 root
#   REMOTE_HOST  默认 REDACTED-OLD-SERVER-IP
#   REMOTE_PORT  默认 22
#   REMOTE_PATH  默认 ~/momo-aigc
#
# 用法：
#   bash scripts/pull-db.sh
#   或：npm run pull-db

set -euo pipefail

# ── 定位项目根 ──────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOCAL_DB="$PROJECT_ROOT/server/data/momo.db"
LOCAL_DB_DIR="$(dirname "$LOCAL_DB")"

# ── 读取配置：shell env > .env > 默认值 ──────────────────────────────────────
if [[ -f "$PROJECT_ROOT/.env" ]]; then
  while IFS='=' read -r k v; do
    case "$k" in
      REMOTE_HOST) REMOTE_HOST="${REMOTE_HOST:-$v}" ;;
      REMOTE_USER) REMOTE_USER="${REMOTE_USER:-$v}" ;;
      REMOTE_PORT) REMOTE_PORT="${REMOTE_PORT:-$v}" ;;
      REMOTE_PATH) REMOTE_PATH="${REMOTE_PATH:-$v}" ;;
    esac
  done < <(grep -E '^REMOTE_(HOST|USER|PATH|PORT)=' "$PROJECT_ROOT/.env" || true)
fi

REMOTE_USER="${REMOTE_USER:-root}"
REMOTE_HOST="${REMOTE_HOST:-REDACTED-OLD-SERVER-IP}"
REMOTE_PORT="${REMOTE_PORT:-22}"
REMOTE_PATH="${REMOTE_PATH:-~/momo-aigc}"

REMOTE="$REMOTE_USER@$REMOTE_HOST"
REMOTE_DB="$REMOTE_PATH/server/data/momo.db"

# ── 辅助 ────────────────────────────────────────────────────────────────────
c_blue()  { printf '\033[1;34m%s\033[0m\n' "$*"; }
c_green() { printf '\033[1;32m%s\033[0m\n' "$*"; }
c_red()   { printf '\033[1;31m%s\033[0m\n' "$*"; }
c_dim()   { printf '\033[2m%s\033[0m\n' "$*"; }

# rsync 远端不经过登录 shell，`~` 不会被展开。若路径以 ~ 开头，
# 通过 ssh 解析成绝对路径（仅在首次连接时多一次往返）。
# 注意：`~` 在双引号内不展开，所以这里用 echo 让远端 shell 展开。
if [[ "$REMOTE_PATH" == '~'* ]]; then
  if ! RESOLVED_PATH="$(ssh -p "$REMOTE_PORT" -o BatchMode=yes "$REMOTE" "echo ${REMOTE_PATH}" 2>/dev/null)"; then
    c_red "✗ 无法解析远端路径 ${REMOTE_PATH}（ssh 连接失败）。"
    c_red "  请确认免密登录已配置（ssh-copy-id）且 REMOTE_HOST/USER 正确。"
    exit 1
  fi
  REMOTE_PATH="$RESOLVED_PATH"
  REMOTE_DB="$REMOTE_PATH/server/data/momo.db"
fi

# ── 前置检查 ─────────────────────────────────────────────────────────────────
for bin in ssh rsync sqlite3; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    c_red "✗ 缺少命令：$bin"
    exit 1
  fi
done

c_blue "► 目标服务器 : $REMOTE:$REMOTE_PORT"
c_blue "► 远端数据库 : $REMOTE_DB"
c_blue "► 本地落点   : $LOCAL_DB"
echo

# 若本地后端正在运行（持有数据库句柄），提醒一下：覆盖文件不会损坏库，
# 但运行中的进程仍会用旧数据，重启后才会看到新数据。
if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
  c_dim "ℹ 检测到本地 3000 端口在监听（dev:server 可能正在运行）。"
  c_dim "  覆盖文件后请重启本地服务才能看到拉下来的数据。"
fi

mkdir -p "$LOCAL_DB_DIR"

# 给本地旧库留一个滚动备份（单份，下次再拉会被覆盖）
if [[ -f "$LOCAL_DB" ]]; then
  cp "$LOCAL_DB" "$LOCAL_DB.bak"
  c_dim "ℹ 已备份本地旧库 → server/data/momo.db.bak"
fi

# 清掉本地残留的 WAL/SHM 临时文件。服务器端 checkpoint 后主库已是完整的，
# 但本地这两个文件是上一次 dev:server 运行留下的，与新主库不匹配会导致
# 「database disk image is malformed」。删掉后 SQLite 打开时会按需重建。
rm -f "$LOCAL_DB-wal" "$LOCAL_DB-shm"

# ── 1. 服务器端 checkpoint ───────────────────────────────────────────────────
# 用项目自带的 better-sqlite3（Node API）做 checkpoint，不依赖系统 sqlite3 CLI。
# 在 WAL 模式下，最新写入还停留在 -wal 文件里，必须先 TRUNCATE 合并进主库，
# 否则 rsync 只拉主文件会丢掉这部分数据。对运行中的应用是安全的。
c_blue "► [1/3] 远端 WAL checkpoint（合并未落盘日志）..."

# 把 checkpoint 脚本上传到服务器临时目录执行，避免多层引号转义。
CHECKPOINT_FILE="$(mktemp -t pull-db-checkpoint.XXXXXX).cjs"
trap 'rm -f "$CHECKPOINT_FILE"' EXIT
cat > "$CHECKPOINT_FILE" <<'JS'
const Database = require('better-sqlite3')
const db = new Database(process.argv[1], { readonly: false })
const r = db.pragma('wal_checkpoint(TRUNCATE)')
const row = Array.isArray(r) ? r[0] : r
if (row && row.busy === 1) {
  console.error('checkpoint busy（有活跃写事务），数据可能未完全合并')
  process.exit(2)
}
console.log('ok')
JS

REMOTE_CHECKPOINT="/tmp/pull-db-checkpoint-$$.cjs"
if ! scp -P "$REMOTE_PORT" -q "$CHECKPOINT_FILE" "$REMOTE:$REMOTE_CHECKPOINT" 2>/dev/null; then
  c_red "✗ 上传 checkpoint 脚本失败（ssh 连接异常）。"
  rm -f "$CHECKPOINT_FILE"
  exit 1
fi

if ssh -p "$REMOTE_PORT" "$REMOTE" \
  "cd \"$REMOTE_PATH\" && node \"$REMOTE_CHECKPOINT\" \"$REMOTE_DB\"; rm -f \"$REMOTE_CHECKPOINT\"" 2>/dev/null; then
  c_green "✓ checkpoint 完成"
else
  rc=$?
  rm -f "$CHECKPOINT_FILE"
  c_red "✗ 服务器端 checkpoint 失败。"
  c_red "  继续 rsync 会拿到缺少最新提交的库（-wal 未合并），已中止。"
  if [[ $rc -eq 2 ]]; then
    c_red "  原因：checkpoint busy（服务器此刻有活跃写事务）。稍等几秒重试即可。"
  else
    c_red "  请确认：node_modules 是否已安装、REMOTE_PATH 是否指向项目根。"
  fi
  exit 1
fi
rm -f "$CHECKPOINT_FILE"

# ── 2. rsync 下载 ────────────────────────────────────────────────────────────
c_blue "► [2/3] rsync 下载数据库..."
rsync -az --progress -e "ssh -p $REMOTE_PORT" \
  "$REMOTE:\"$REMOTE_DB\"" "$LOCAL_DB"
c_green "✓ 下载完成"

# ── 3. 本地校验 ──────────────────────────────────────────────────────────────
c_blue "► [3/3] 完整性检查 + 关键表行数..."
integrity="$(sqlite3 "$LOCAL_DB" 'PRAGMA integrity_check;' 2>&1 | head -n1)"
if [[ "$integrity" == "ok" ]]; then
  c_green "✓ integrity_check: ok"
else
  c_red "✗ integrity_check 异常：$integrity"
  exit 1
fi

echo
c_blue "▼ 关键表行数"
printf '  %-28s %s\n' "users"               "$(sqlite3 "$LOCAL_DB" 'SELECT COUNT(*) FROM users;'               2>/dev/null || echo '—')"
printf '  %-28s %s\n' "generation_tasks"    "$(sqlite3 "$LOCAL_DB" 'SELECT COUNT(*) FROM generation_tasks;'    2>/dev/null || echo '—')"
printf '  %-28s %s\n' "points_transactions"  "$(sqlite3 "$LOCAL_DB" 'SELECT COUNT(*) FROM points_transactions;' 2>/dev/null || echo '—')"
printf '  %-28s %s\n' "template_images"     "$(sqlite3 "$LOCAL_DB" 'SELECT COUNT(*) FROM template_images;'     2>/dev/null || echo '—')"
printf '  %-28s %s\n' "canvas_projects"     "$(sqlite3 "$LOCAL_DB" 'SELECT COUNT(*) FROM canvas_projects;'     2>/dev/null || echo '—')"

echo
c_green "✓ 完成。数据库已覆盖到 $LOCAL_DB"
