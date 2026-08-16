/**
 * 图片分析纯函数：主色提取 / 亮度 / 构图分布（源自工作台 Canvas 方法论）。
 * 零 UI 依赖；输入图片压缩后的小图（建议短边 ≤ 200px），耗时 < 100ms。
 */

export interface ImageAnalysis {
  /** 主色 HEX（如 #7d8e77） */
  dominantColor: string
  /** 主色所属色系名 */
  colorFamily: string
  /** 平均亮度 0-1 */
  brightness: number
  /** 构图分布：左/中/右三列的能量占比（和为 1） */
  composition: { left: number; center: number; right: number }
}

const COLOR_FAMILIES: Array<{ name: string; test: (r: number, g: number, b: number) => boolean }> = [
  { name: '红色系', test: (r, g, b) => r > 140 && r - g > 50 && r - b > 50 },
  { name: '粉色系', test: (r, g, b) => r > 200 && g > 150 && b > 160 && r - g < 60 },
  { name: '黄色系', test: (r, g, b) => r > 180 && g > 150 && b < 120 },
  { name: '绿色系', test: (r, g, b) => g > 100 && g - r > 20 && g - b > 20 },
  { name: '蓝色系', test: (r, g, b) => b > 110 && b - r > 30 && b - g > 15 },
  { name: '紫色系', test: (r, g, b) => r > 100 && b > 110 && Math.abs(r - b) < 60 && g < Math.min(r, b) - 15 },
  { name: '白色系', test: (r, g, b) => r > 215 && g > 215 && b > 215 },
  { name: '黑灰色系', test: (r, g, b) => r < 80 && g < 80 && b < 80 },
  { name: '棕色系', test: (r, g, b) => r > 90 && r < 200 && g > 50 && g < 130 && b < 100 && r - b > 30 },
  { name: '大地色系', test: () => false },
]

export function detectColorFamily(r: number, g: number, b: number): string {
  for (const f of COLOR_FAMILIES) {
    if (f.test(r, g, b)) return f.name
  }
  return '大地色系'
}

function toHex(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
}

/**
 * 从 ImageData（建议压缩后的小图）提取分析结果。
 * 主色 = 除去近白/近黑背景像素后，按量化桶聚合的最大簇均值。
 */
export function analyzeImageData(data: ImageData): ImageAnalysis {
  const { width, height } = data
  const d = data.data
  let sr = 0, sg = 0, sb = 0, sn = 0
  const buckets = new Map<string, { r: number; g: number; b: number; n: number }>()
  const colEnergy = [0, 0, 0]

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const r = d[i], g = d[i + 1], b = d[i + 2]
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
      sr += r; sg += g; sb += b; sn++
      // 构图能量：按三列累计亮度
      colEnergy[Math.min(2, Math.floor((x / width) * 3))] += lum
      // 主色聚合：跳过近白/近黑背景
      if (lum > 0.94 || lum < 0.06) continue
      const key = `${r >> 5}-${g >> 5}-${b >> 5}`
      const cur = buckets.get(key) || { r: 0, g: 0, b: 0, n: 0 }
      cur.r += r; cur.g += g; cur.b += b; cur.n++
      buckets.set(key, cur)
    }
  }

  let best = { r: 128, g: 128, b: 128, n: 0 }
  for (const v of buckets.values()) {
    if (v.n > best.n) best = v
  }
  const fr = best.r / best.n, fg = best.g / best.n, fb = best.b / best.n
  const totalEnergy = colEnergy.reduce((s, v) => s + v, 0) || 1

  return {
    dominantColor: `#${toHex(fr)}${toHex(fg)}${toHex(fb)}`,
    colorFamily: detectColorFamily(fr, fg, fb),
    brightness: sn > 0 ? (0.299 * (sr / sn) + 0.587 * (sg / sn) + 0.114 * (sb / sn)) / 255 : 0.5,
    composition: {
      left: colEnergy[0] / totalEnergy,
      center: colEnergy[1] / totalEnergy,
      right: colEnergy[2] / totalEnergy,
    },
  }
}

/** 便捷入口：File/HTMLImageElement → 压缩 → 分析 */
export async function analyzeImage(source: File | HTMLImageElement): Promise<ImageAnalysis> {
  const img = source instanceof File
    ? await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image()
        const url = URL.createObjectURL(source)
        el.onload = () => { URL.revokeObjectURL(url); resolve(el) }
        el.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片加载失败')) }
        el.src = url
      })
    : source
  const shortSide = Math.min(img.naturalWidth, img.naturalHeight)
  const scale = Math.min(1, 200 / Math.max(1, shortSide))
  const w = Math.max(1, Math.round(img.naturalWidth * scale))
  const h = Math.max(1, Math.round(img.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx2d = canvas.getContext('2d')
  if (!ctx2d) throw new Error('Canvas 不可用')
  ctx2d.drawImage(img, 0, 0, w, h)
  return analyzeImageData(ctx2d.getImageData(0, 0, w, h))
}
