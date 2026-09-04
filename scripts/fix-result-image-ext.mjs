/**
 * 修复历史图片 URL 的假扩展名（本地盘 / OSS 两种存储模式都覆盖）。
 *
 * 背景：部分中转渠道（易联 API 的 gpt-image-2 等）返回的结果图 URL 末段是 `.{64位哈希}`，
 * 服务端按 URL 末段取扩展名，于是本地文件名 / OSS objectKey 一起变成 `uuid.f0a360…c8c8`。
 * 后果：预览弹窗里右键「图片另存为」得到没有 png/jpg 后缀、系统打不开的文件（<img> 靠内容
 * 嗅探仍能显示，下载按钮自定文件名，所以只有右键暴露问题）。用户上传的参考图同理会带上
 * `.download` 这类假后缀。
 * 代码侧已由 server/src/utils/imageExt.ts 的白名单 + 文件头嗅探兜底，本脚本清理存量。
 *
 * 做三件事：定真实扩展名 → 落地改名（本地 rename / OSS CopyObject 到新 key）→ 全库把旧 URL
 * 文本替换成新 URL。OSS 默认保留旧对象，确认无误后再用 --purge 删除。
 * 幂等：已是可信图片后缀的 URL 不再处理；目标已存在则跳过改名/复制，只补库里的 URL。
 *
 * 用法：
 *   node scripts/fix-result-image-ext.mjs                 # 试运行，只打印计划
 *   node scripts/fix-result-image-ext.mjs --apply         # 执行（执行前 VACUUM INTO 备份库）
 *   node scripts/fix-result-image-ext.mjs --apply --purge # 执行并删除 OSS 旧对象
 *   DB_PATH=/path/to/db node scripts/fix-result-image-ext.mjs
 */
import Database from 'better-sqlite3'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = process.env.DB_PATH
  ? path.resolve(process.cwd(), process.env.DB_PATH)
  : path.resolve(__dirname, '../server/data/momo.db')
const uploadsRoot = process.env.UPLOADS_PATH
  ? path.resolve(process.cwd(), process.env.UPLOADS_PATH)
  : path.resolve(__dirname, '../server/data/uploads')
const apply = process.argv.includes('--apply')
const purge = process.argv.includes('--purge')

const LOCAL_URL_PREFIX = '/api/files/'
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif'])
const PLAUSIBLE_EXT = /^[a-z0-9]{1,5}$/
const MIME_TO_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }
const TEXT_TYPES = /char|text|clob/i

/** 文件头 → 真实图片扩展名（与 utils/imageExt.ts 判定一致） */
function extFromBytes(head) {
  if (head.length >= 4 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return 'png'
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpg'
  if (head.length >= 12 && head.subarray(0, 4).toString('ascii') === 'RIFF' && head.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp'
  if (head.length >= 3 && head.subarray(0, 3).toString('ascii') === 'GIF') return 'gif'
  return null
}

function normalizeImageExt(ext) {
  const value = (ext || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!IMAGE_EXTS.has(value)) return null
  return value === 'jpeg' ? 'jpg' : value
}

const db = new Database(dbPath)
// URL 都以文本存放，只扫文本列
const textColumns = db.prepare(
  `SELECT m.name AS table_name, p.name AS column_name, p.type AS column_type
     FROM sqlite_master m, pragma_table_info(m.name) p
    WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%'`
).all().filter((c) => TEXT_TYPES.test(c.column_type || ''))

function storageConfig() {
  try {
    const row = db.prepare("select value from system_config where key='storage_config'").get()
    return JSON.parse(row?.value || '{}')
  } catch { return {} }
}

/** 本 bucket 的公网前缀：只认自己 bucket，避免碰到第三方 OSS 地址 */
function ossPrefixes() {
  const { bucket, endpoint } = storageConfig().oss || {}
  return bucket && endpoint ? [`https://${bucket}.${endpoint}/`] : []
}

function ossCredentials() {
  const { bucket, endpoint, accessKeyId, accessKeySecret } = storageConfig().oss || {}
  if (!bucket || !endpoint || !accessKeyId || !accessKeySecret) {
    throw new Error('system_config.storage_config 缺少完整 OSS 凭证，无法搬迁对象')
  }
  return { bucket, endpoint, accessKeyId, accessKeySecret, host: `${bucket}.${endpoint}` }
}

/** OSS v1 签名请求（Authorization 头方案用 Date 参与签名；Expires 只属于预签名 URL） */
async function ossSigned(method, objectKey, oss, { copySource = null, contentType = '', extraHeaders = {} } = {}) {
  const ossHeaders = copySource ? `x-oss-copy-source:${copySource}\n` : ''
  const headers = copySource ? { 'x-oss-copy-source': copySource } : {}
  if (contentType) headers['Content-Type'] = contentType
  Object.assign(headers, extraHeaders)

  let lastErr = null
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 400 * attempt))
    const date = new Date().toUTCString()
    const stringToSign = `${method}\n\n${contentType}\n${date}\n${ossHeaders}/${oss.bucket}/${objectKey}`
    const signature = crypto.createHmac('sha1', oss.accessKeySecret).update(stringToSign).digest('base64')
    try {
      const resp = await fetch(`https://${oss.host}/${objectKey}`, {
        method,
        headers: { ...headers, Date: date, Authorization: `OSS ${oss.accessKeyId}:${signature}` },
      })
      if (resp.status < 500 || attempt === 3) return resp
      lastErr = new Error(`${method} ${objectKey} → HTTP ${resp.status}`)
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr
}

/** 签名探测对象真实格式：HEAD 的 content-type 可信就用，否则 Range 取文件头嗅探 */
async function probeOssExt(objectKey, oss) {
  try {
    const head = await ossSigned('HEAD', objectKey, oss)
    if (!head.ok) {
      console.warn(`  跳过（对象不可读 HTTP ${head.status}：${objectKey}）`)
      return null
    }
    const fromMime = MIME_TO_EXT[(head.headers.get('content-type') || '').split(';')[0]]
    if (fromMime) return fromMime
    const ranged = await ossSigned('GET', objectKey, oss, { extraHeaders: { Range: 'bytes=0-15' } })
    if (ranged.ok) return extFromBytes(Buffer.from(await ranged.arrayBuffer())) || 'png'
    console.warn(`  跳过（无法读取对象内容：${objectKey}）`)
  } catch (err) {
    console.warn(`  跳过（探测异常：${objectKey} ${err.message}）`)
  }
  return null
}

/** 扫全库文本列，找出末段后缀不可信的图片 URL（本地 + 本 bucket） */
function findBadUrls() {
  const prefixes = ossPrefixes()
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const localPattern = new RegExp(`${escapeRe(LOCAL_URL_PREFIX)}[^"'\\\\\\s)\\]]+`, 'g')
  const ossPattern = prefixes.length
    ? new RegExp(`(${prefixes.map(escapeRe).join('|')})[^"'\\\\\\s)\\]]+`, 'g')
    : null

  const seen = new Map() // oldUrl -> candidate
  for (const { table_name: table, column_name: column } of textColumns) {
    const likeArgs = [`%${LOCAL_URL_PREFIX}%`]
    if (prefixes.length) likeArgs.push('%aliyuncs%')
    const rows = db.prepare(
      `SELECT rowid AS rid, "${column}" AS v FROM "${table}" WHERE ${likeArgs.map(() => `"${column}" LIKE ?`).join(' OR ')}`
    ).all(...likeArgs)
    for (const row of rows) {
      const text = String(row.v)
      const harvest = (matches, kind, strip) => {
        for (const m of matches) {
          const url = m[0]
          if (seen.has(url)) continue
          const objectKey = decodeURIComponent(url.slice(strip(url)).split('?')[0])
          const base = path.posix.basename(objectKey)
          const dot = base.lastIndexOf('.')
          const ext = dot >= 0 ? base.slice(dot + 1).toLowerCase() : ''
          if (normalizeImageExt(ext) || PLAUSIBLE_EXT.test(ext)) continue // 已是可信/正常后缀，不动
          const pathUrl = url.split('?')[0]
          seen.set(url, {
            kind, objectKey, pathUrl, query: url.slice(pathUrl.length), where: `${table}#${row.rid}`,
            stemKey: path.posix.join(path.posix.dirname(objectKey), dot >= 0 ? base.slice(0, dot) : base),
          })
        }
      }
      harvest(text.matchAll(localPattern), 'local', (u) => LOCAL_URL_PREFIX.length)
      if (ossPattern) harvest(text.matchAll(ossPattern), 'oss', (u) => u.indexOf('/', 8) + 1)
    }
  }
  return seen
}

/** 为每个待修 URL 定真实扩展名（本地读文件头 / OSS 探测），定不了的跳过并告警 */
async function planRenames(pending) {
  const plan = new Map()
  const oss = [...pending.values()].some((p) => p.kind === 'oss') ? ossCredentials() : null
  for (const [url, item] of pending) {
    let realExt = null
    if (item.kind === 'local') {
      const abs = path.resolve(uploadsRoot, item.objectKey)
      if (!abs.startsWith(uploadsRoot + path.sep)) continue
      if (fs.existsSync(abs)) {
        const fd = fs.openSync(abs, 'r')
        const head = Buffer.alloc(16)
        const bytes = fs.readSync(fd, head, 0, 16, 0)
        fs.closeSync(fd)
        realExt = extFromBytes(head.subarray(0, bytes))
      } else {
        const absStem = path.join(uploadsRoot, item.stemKey)
        realExt = ['png', 'jpg', 'webp', 'gif'].find((e) => fs.existsSync(`${absStem}.${e}`)) || null
      }
      if (!realExt) {
        console.warn(`  跳过（本地文件不存在且无已改名副本：${item.objectKey}）  ${item.where}`)
        continue
      }
    } else {
      realExt = await probeOssExt(item.objectKey, oss)
      if (!realExt) continue
    }
    const newKey = `${item.stemKey}.${realExt}`
    const newUrl = item.kind === 'local'
      ? `${LOCAL_URL_PREFIX}${newKey}`
      : `${item.pathUrl.slice(0, item.pathUrl.length - path.posix.basename(item.objectKey).length)}${path.posix.basename(newKey)}${item.query}`
    plan.set(url, { ...item, newKey, newUrl, realExt })
  }
  return plan
}

const pending = findBadUrls()
console.log(`库：${dbPath}`)
console.log(`本地盘：${uploadsRoot}`)
console.log(`OSS 前缀：${ossPrefixes().join(', ') || '（无，纯本地模式）'}`)
const bad = await planRenames(pending)
console.log(`待修复 URL：${bad.size} 个${apply ? '' : '（试运行，加 --apply 执行）'}`)
if (bad.size === 0) { db.close(); process.exit(0) }

for (const [oldUrl, item] of bad) {
  console.log(`  ${item.kind.padEnd(4)} ${item.realExt.padEnd(4)} …${path.posix.basename(oldUrl).slice(-70)}  →  ${path.posix.basename(item.newKey)}`)
}
if (!apply) { db.close(); console.log('未做任何改动。确认无误后加 --apply 执行。'); process.exit(0) }

const oss = [...bad.values()].some((i) => i.kind === 'oss') ? ossCredentials() : null
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const backupPath = `${dbPath}.bak-fixext-${stamp}`
db.prepare('VACUUM INTO ?').run(backupPath)
console.log(`库备份：${backupPath}`)

const undoLocal = []
const undoOss = []
let committed = false
let replaced = 0
try {
  // 1) 先把文件/对象落到新名字（这一步失败即中止，库还没动）
  for (const [, item] of bad) {
    if (item.kind === 'local') {
      const absOld = path.join(uploadsRoot, item.objectKey)
      const absNew = path.join(uploadsRoot, item.newKey)
      if (!fs.existsSync(absOld)) {
        if (!fs.existsSync(absNew)) throw new Error(`源文件与目标文件都不存在：${item.objectKey}`)
        continue // 已改名过，只补库里的 URL
      }
      if (fs.existsSync(absNew)) throw new Error(`目标文件已存在，需人工处理：${item.newKey}`)
      fs.renameSync(absOld, absNew)
      undoLocal.push([absNew, absOld])
    } else {
      const exists = await ossSigned('HEAD', item.newKey, oss)
      if (exists.status === 200) continue // 已复制过，只补库里的 URL
      if (exists.status !== 404) throw new Error(`新对象状态检查失败 (${exists.status})：${item.newKey}`)
      const copySource = `/${oss.bucket}/${item.objectKey.split('/').map(encodeURIComponent).join('/')}`
      const res = await ossSigned('PUT', item.newKey, oss, { copySource })
      if (!res.ok) throw new Error(`OSS CopyObject 失败 (${res.status}) ${item.objectKey}：${(await res.text()).slice(0, 160)}`)
      if ((await ossSigned('HEAD', item.newKey, oss)).status !== 200) throw new Error(`新对象校验失败：${item.newKey}`)
      undoOss.push(item.newKey)
    }
  }

  // 2) 全库替换 URL 文本
  db.transaction(() => {
    for (const [oldUrl, item] of bad) {
      for (const { table_name: table, column_name: column } of textColumns) {
        const res = db.prepare(`UPDATE "${table}" SET "${column}" = replace("${column}", ?, ?) WHERE "${column}" LIKE ?`)
          .run(oldUrl, item.newUrl, `%${oldUrl}%`)
        replaced += res.changes
      }
    }
  })()
  committed = true
  console.log(`完成：改名/复制 ${undoLocal.length + undoOss.length} 个，更新 ${replaced} 行引用`)

  // 3) 可选清理旧 OSS 对象：逐项确认新对象已在才删，单项失败只告警（新对象绝不能删）
  const ossItems = [...bad.values()].filter((i) => i.kind === 'oss')
  if (purge) {
    let removed = 0
    for (const item of ossItems) {
      try {
        if ((await ossSigned('HEAD', item.newKey, oss)).status !== 200) {
          console.warn(`  未删（新对象不在位：${item.newKey}）`)
          continue
        }
        const res = await ossSigned('DELETE', item.objectKey, oss)
        if (res.ok || res.status === 404) removed++
        else console.warn(`  旧对象删除失败 (${res.status})：${item.objectKey}`)
      } catch (e) {
        console.warn(`  旧对象删除中断（${e.message}）：${item.objectKey}`)
      }
    }
    console.log(`已删除旧 OSS 对象 ${removed}/${ossItems.length} 个`)
  } else if (ossItems.length) {
    console.log(`旧 OSS 对象已保留 ${ossItems.length} 个；确认无误后加 --purge 删除`)
  }
} catch (err) {
  if (committed) {
    console.error(`库已更新（${replaced} 行）且线上正用新地址 —— 不回滚、新对象保留。未完成部分：${err.message}`)
    console.error(`重跑本脚本即可续做（幂等）。如需回退库：停服后用 ${backupPath} 覆盖 ${dbPath}`)
  } else {
    for (const [absNew, absOld] of undoLocal.reverse()) fs.renameSync(absNew, absOld)
    for (const key of undoOss) await ossSigned('DELETE', key, oss)
    console.error(`失败（库未改动）：已回滚 ${undoLocal.length} 个本地改名、${undoOss.length} 个新 OSS 对象 —— ${err.message}`)
    console.error(`如需回滚库：停服后用 ${backupPath} 覆盖 ${dbPath}`)
  }
  process.exitCode = 1
}
db.close()
