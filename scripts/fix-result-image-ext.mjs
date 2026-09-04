/**
 * 修复历史结果图扩展名。
 *
 * 背景：部分中转渠道（易联 API 的 gpt-image-2 等）返回的结果图 URL 末段是 `.{64位哈希}`，
 * 服务端转存时把这段哈希当成了扩展名落盘，于是本地文件叫 `uuid.f0a360…c8c8`。
 * 后果：右键「图片另存为」得到无 png/jpg 后缀、系统打不开的文件；静态服务也只能给
 * application/octet-stream（<img> 靠内容嗅探仍能显示，所以下载按钮路径看不出问题）。
 * 代码侧已由 server/src/utils/storage.ts 的白名单 + 文件头嗅探兜底，本脚本清理存量。
 *
 * 做两件事：按文件头把磁盘文件改名为真实扩展名 → 全库把旧 URL 文本替换成新 URL。
 * 幂等：已是真实图片后缀的 URL 不会被再次处理；文件已改名则跳过重命名。
 *
 * 用法：
 *   node scripts/fix-result-image-ext.mjs              # 试运行，只打印将要做的改动
 *   node scripts/fix-result-image-ext.mjs --apply      # 实际执行（执行前 VACUUM INTO 备份库）
 *   DB_PATH=/path/to/db node scripts/fix-result-image-ext.mjs --apply
 */
import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = process.env.DB_PATH
  ? path.resolve(process.cwd(), process.env.DB_PATH)
  : path.resolve(__dirname, '../server/data/momo.db')
const uploadsRoot = path.resolve(__dirname, '../server/data/uploads')
const apply = process.argv.includes('--apply')

const LOCAL_URL_PREFIX = '/api/files/'
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif'])
const TEXT_TYPES = /char|text|clob/i

/** 文件头 → 真实图片扩展名（与 storage.ts 的判定保持一致） */
function extFromBytes(head) {
  if (head.length >= 4 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return 'png'
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpg'
  if (head.length >= 12 && head.subarray(0, 4).toString('ascii') === 'RIFF' && head.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp'
  if (head.length >= 3 && head.subarray(0, 3).toString('ascii') === 'GIF') return 'gif'
  return null
}

const db = new Database(dbPath)
// better-sqlite3 的 pragma 表信息含类型，直接按文本类型筛列
const textColumns = db.prepare(
  `SELECT m.name AS table_name, p.name AS column_name, p.type AS column_type
     FROM sqlite_master m, pragma_table_info(m.name) p
    WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%'`
).all().filter((c) => TEXT_TYPES.test(c.column_type || ''))

function findBadUrls() {
  const found = new Map() // oldUrl -> { objectKey, newKey, newUrl, realExt }
  const urlPattern = /\/api\/files\/[^"'\\\s)\]]+/g
  for (const { table_name: table, column_name: column } of textColumns) {
    const rows = db.prepare(`SELECT rowid AS rid, "${column}" AS v FROM "${table}" WHERE "${column}" LIKE ?`)
      .all(`%${LOCAL_URL_PREFIX}%`)
    for (const row of rows) {
      for (const match of String(row.v).matchAll(urlPattern)) {
        const url = match[0]
        if (found.has(url)) continue
        const objectKey = decodeURIComponent(url.slice(LOCAL_URL_PREFIX.length).split('?')[0])
        const base = path.basename(objectKey)
        const dot = base.lastIndexOf('.')
        const ext = dot >= 0 ? base.slice(dot + 1).toLowerCase() : ''
        if (IMAGE_EXTS.has(ext)) continue
        const abs = path.resolve(uploadsRoot, objectKey)
        if (!abs.startsWith(uploadsRoot + path.sep)) continue
        const stemKey = path.posix.join(path.posix.dirname(objectKey), dot >= 0 ? base.slice(0, dot) : base)
        // 磁盘文件还在：按文件头定真实扩展名；文件已不在但改名后的目标存在：只补库里的 URL
        let realExt = null
        if (fs.existsSync(abs)) {
          const fd = fs.openSync(abs, 'r')
          const head = Buffer.alloc(16)
          const bytes = fs.readSync(fd, head, 0, 16, 0)
          fs.closeSync(fd)
          realExt = extFromBytes(head.subarray(0, bytes))
        } else {
          realExt = ['png', 'jpg', 'webp', 'gif'].find((e) => fs.existsSync(`${stemKey}.${e}`)) || null
        }
        if (!realExt) {
          console.warn(`  跳过（磁盘文件缺失且无已改名副本: ${objectKey}）  ${table}#${row.rid}`)
          continue
        }
        found.set(url, { objectKey, newKey: `${stemKey}.${realExt}`, newUrl: `${LOCAL_URL_PREFIX}${stemKey}.${realExt}`, realExt })
      }
    }
  }
  return found
}

const bad = findBadUrls()
console.log(`库：${dbPath}`)
console.log(`待修复 URL：${bad.size} 个${apply ? '' : '（试运行，加 --apply 执行）'}`)
if (bad.size === 0) { db.close(); process.exit(0) }

for (const [oldUrl, item] of bad) {
  console.log(`  ${item.realExt.padEnd(4)} ${oldUrl.slice(-72)}  →  ${path.basename(item.newKey)}`)
}
if (!apply) { db.close(); console.log('未做任何改动。确认无误后加 --apply 执行。'); process.exit(0) }

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const backupPath = `${dbPath}.bak-fixext-${stamp}`
db.prepare('VACUUM INTO ?').run(backupPath)
console.log(`库备份：${backupPath}`)

const renamedFiles = []
try {
  for (const [oldUrl, item] of bad) {
    const absOld = path.join(uploadsRoot, item.objectKey)
    const absNew = path.join(uploadsRoot, item.newKey)
    if (!fs.existsSync(absOld)) {
      if (!fs.existsSync(absNew)) throw new Error(`源文件与目标文件都不存在：${item.objectKey}`)
      continue // 已改名过，只补库里的 URL
    }
    if (fs.existsSync(absNew)) throw new Error(`目标文件已存在，需人工处理：${item.newKey}`)
    fs.renameSync(absOld, absNew)
    renamedFiles.push([absNew, absOld])
  }
  let replaced = 0
  db.transaction(() => {
    for (const [oldUrl, item] of bad) {
      for (const { table_name: table, column_name: column } of textColumns) {
        const res = db.prepare(`UPDATE "${table}" SET "${column}" = replace("${column}", ?, ?) WHERE "${column}" LIKE ?`)
          .run(oldUrl, item.newUrl, `%${oldUrl}%`)
        replaced += res.changes
      }
    }
  })()
  console.log(`完成：磁盘改名 ${renamedFiles.length} 个文件，更新 ${replaced} 行引用`)
} catch (err) {
  for (const [absNew, absOld] of renamedFiles.reverse()) fs.renameSync(absNew, absOld)
  console.error(`失败，已回滚 ${renamedFiles.length} 个改名，库未改动：${err.message}`)
  console.error(`如需回滚库：复制 ${backupPath} 覆盖 ${dbPath}（先停服）`)
  process.exitCode = 1
}
db.close()
