/**
 * 宽高比 × 分辨率 → 渠道像素尺寸换算（纯函数，供生图适配器共用）。
 *
 * 规则（见 ai-provider 技术方案 §3.3）：
 *   基准边长：512→512 · 1K→1024 · 2K→2048 · 4K→4096
 *   aspectRatio 'w:h' → 长边 = 基准，短边 = 基准 × min/max，16px 对齐
 *   toapis 渠道直接透传字符串（size='3:4' + resolution='1K'），不经本换算
 */

const BASE_EDGE: Record<string, number> = {
  '512': 512,
  '1K': 1024,
  '2K': 2048,
  '4K': 4096,
}

const ALIGN = 16

function align16(n: number): number {
  return Math.max(ALIGN, Math.round(n / ALIGN) * ALIGN)
}

/** 解析 'w:h'（如 '3:4'）→ [w, h] 数字对；非法格式抛错 */
export function parseAspectRatio(ratio: string): [number, number] {
  const m = /^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/.exec(String(ratio || '').trim())
  if (!m) throw new Error(`非法的宽高比格式：${ratio}`)
  const w = Number(m[1])
  const h = Number(m[2])
  if (w <= 0 || h <= 0) throw new Error(`非法的宽高比数值：${ratio}`)
  return [w, h]
}

/**
 * 宽高比 + 分辨率 → 'WxH' 像素字符串（长边 = 基准边长，短边按比例，16px 对齐）。
 * 例：toPixelSize('3:4', '1K') → '768x1024'
 */
export function toPixelSize(aspectRatio: string, resolution: string): string {
  const base = BASE_EDGE[resolution]
  if (!base) throw new Error(`不支持的分辨率：${resolution}`)
  const [w, h] = parseAspectRatio(aspectRatio)
  if (w >= h) {
    // 横向/方形：长边 = 宽
    return `${align16(base)}x${align16(base * h / w)}`
  }
  // 纵向：长边 = 高
  return `${align16(base * w / h)}x${align16(base)}`
}

/** 从 'WxH' 解析像素对 */
export function parsePixelSize(size: string): [number, number] {
  const m = /^(\d+)\s*x\s*(\d+)$/i.exec(String(size || '').trim())
  if (!m) throw new Error(`非法的像素尺寸：${size}`)
  return [Number(m[1]), Number(m[2])]
}

/**
 * 在渠道支持的离散尺寸列表中取与目标最接近的一个。
 * 偏差（面积对角线近似，按长短边比例）> 10% 时报错 —— 属于管理员能力配置失误。
 */
export function nearestSupportedSize(target: string, supported: string[]): string {
  const [tw, th] = parsePixelSize(target)
  const tRatio = Math.max(tw, th) / Math.min(tw, th)
  let best: string | null = null
  let bestDiff = Infinity
  for (const s of supported) {
    let sw: number, sh: number
    try {
      [sw, sh] = parsePixelSize(s)
    } catch {
      continue
    }
    // 面积差 + 比例差 加权（比例差异对观感影响更大）
    const areaDiff = Math.abs(Math.log((sw * sh) / (tw * th)))
    const sRatio = Math.max(sw, sh) / Math.min(sw, sh)
    const ratioDiff = Math.abs(Math.log(sRatio / tRatio))
    const diff = ratioDiff * 2 + areaDiff
    if (diff < bestDiff) {
      bestDiff = diff
      best = s
    }
  }
  if (!best) throw new Error(`渠道不支持任何可用尺寸（目标 ${target}）`)
  const [bw, bh] = parsePixelSize(best)
  const deviation = Math.abs(Math.log((bw * bh) / (tw * th)))
  if (deviation > 0.1) {
    throw new Error(`目标尺寸 ${target} 与渠道支持的最接近尺寸 ${best} 偏差过大，请检查渠道能力配置`)
  }
  return best
}
