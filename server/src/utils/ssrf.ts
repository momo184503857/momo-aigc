import dns from 'node:dns/promises'
import net from 'node:net'

/**
 * 用户/管理员自建渠道 base_url 的 SSRF 基本防护（ai-provider 方案 S7）。
 * 规则：仅 http/https；主机名 DNS 解析后拒绝私网/环回/链路本地/唯一本地地址。
 */

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number)
    if (a === 0 || a === 10 || a === 127) return true                 // 0/8 10/8 127/8
    if (a === 169 && b === 254) return true                            // 169.254/16
    if (a === 172 && b >= 16 && b <= 31) return true                   // 172.16/12
    if (a === 192 && b === 168) return true                            // 192.168/16
    if (a === 100 && b >= 64 && b <= 127) return true                  // 100.64/10 CGNAT
    if (a >= 224) return true                                         // 组播/保留段
    return false
  }
  const lower = ip.toLowerCase()
  if (lower === '::1' || lower === '::') return true
  if (lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) return true // 链路本地 / ULA
  if (lower.startsWith('::ffff:')) return isPrivateIp(lower.slice(7))  // IPv4-mapped
  if (lower.startsWith('ff')) return true                              // 组播
  return false
}

export interface UrlValidationResult {
  ok: boolean
  error?: string
  normalized: string
}

/** 校验渠道 base_url（http/https + 非私网主机）。异步：需要 DNS 解析。 */
export async function validateProviderBaseUrl(raw: string): Promise<UrlValidationResult> {
  const trimmed = String(raw || '').trim()
  const fail = (error: string): UrlValidationResult => ({ ok: false, error, normalized: trimmed })

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return fail('Base URL 格式非法')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return fail('Base URL 仅支持 http/https 协议')
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (!host) return fail('Base URL 缺少主机名')

  if (net.isIP(host)) {
    if (isPrivateIp(host)) {
      return fail('Base URL 不允许指向私网 / 本机 / 环回地址')
    }
  } else {
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
      return fail('Base URL 不允许指向内网域名')
    }
    let addrs: string[]
    try {
      const resolved = await dns.lookup(host, { all: true })
      addrs = resolved.map((r) => r.address)
    } catch {
      return fail(`域名 ${host} 解析失败`)
    }
    if (addrs.length === 0) return fail(`域名 ${host} 解析失败`)
    const bad = addrs.find((a) => isPrivateIp(a))
    if (bad) {
      return fail(`域名 ${host} 解析到内网/保留地址（${bad}），不允许使用`)
    }
  }
  return { ok: true, normalized: trimmed.replace(/\/+$/, '') }
}
