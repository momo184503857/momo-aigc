/**
 * 主题元数据推导：按「主题名称关键词 + 赛道」推导适合风格（styles）与差异化季节（season）。
 * 纯函数、无 DB 依赖；种子初始化（seedSuiteGen）与存量回填共用，规则调整后重跑结果确定。
 */

/** 适合风格选项（与管理端 AdminSuiteAssets 的 THEME_STYLES 保持一致） */
export const THEME_STYLE_OPTIONS = [
  '新中式国风', '文艺风', '休闲', '极简', '法式', '度假',
  '优雅', '职场', '运动', '喜婆婆', '小香风',
]

/** 赛道 → 基础风格（赛道基调决定的默认标签） */
const TRACK_BASE_STYLES: Record<string, string[]> = {
  A: ['新中式国风'],
  B: ['文艺风', '度假'],
  C: ['休闲'],
  D: ['极简'],
  E: ['法式'],
  F: ['优雅'],
  G: ['职场'],
}

/** 名称关键词 → 附加风格（按序叠加、去重，至多 3 个） */
const STYLE_RULES: Array<[RegExp, string[]]> = [
  [/咖啡|书店|图书馆|阅读|文创|艺术|雕塑|美术馆|梧桐|老街/, ['文艺风']],
  [/野餐|公园|草坪|漫步|广场|步行街|湖边|湖畔|草地|大树/, ['休闲']],
  [/沙滩|椰|海边|临海|温泉|民宿|度假/, ['度假']],
  [/毛呢|针织|羊绒|大衣/, ['小香风']],
  [/宴会厅|红墙|礼服/, ['喜婆婆']],
  [/通勤|写字楼|会议|幕墙|知性|干练/, ['职场']],
  [/中式|园林|庭院|古镇|水墨|竹|瓦|紫藤|水榭|回廊|石庭|提灯|闺秀|茶室|茶楼|茶座/, ['新中式国风']],
  [/法式|庄园|公主|沙龙|复古花|薰衣草/, ['法式']],
  [/极简|纯白|微水泥|百叶|侘寂|奶油|画廊|影棚|棚拍|静物/, ['极简']],
]

/** 名称关键词 → 明确季节（优先于室内全季判断） */
const SEASON_RULES: Array<[RegExp, string[]]> = [
  [/樱花|紫藤|薰衣草|花田|花墙|花房|花店|花径|花园|梅屏/, ['春']],
  [/银杏|枫叶|金秋|秋日|暖秋|深秋/, ['秋']],
  [/冬|雪|温泉|毛呢|羊绒|针织|大衣|枯枝|雾景/, ['冬']],
  [/沙滩|椰|海边|临海|泳池|溪|草地|野餐|薄雾|清晨|草原/, ['夏']],
]

/** 室内/棚拍等与季节无关的场景 → 全季（空数组） */
const INDOOR_RE =
  /影棚|棚拍|微水泥|纯白|百叶|侘寂|奶油|画廊|楼梯|工作室|中庭|展厅|静物|书房|大堂|会议|幕墙|宴会厅|沙龙|家居|客厅|房间|空间|图书馆|茶楼雅间/

function hashOf(name: string): number {
  return [...name].reduce((a, c) => a + c.charCodeAt(0), 0)
}

/** 名称 + 赛道 → 适合风格（1~3 个） */
export function themeStylesFor(name: string, trackKey: string): string[] {
  const out: string[] = [...(TRACK_BASE_STYLES[trackKey] || [])]
  for (const [re, styles] of STYLE_RULES) {
    if (re.test(name)) {
      for (const s of styles) if (!out.includes(s)) out.push(s)
    }
  }
  return out.slice(0, 3)
}

/**
 * 名称 + 当前季节 → 差异化季节。
 * 优先级：明确季节关键词 > 室内全季 > 按名称哈希在原 ss/aw 半年内打散（避免清一色双季）。
 * current 兼容旧值（'ss'/'aw'/'all'）、JSON 字符串与新数组格式。
 */
export function themeSeasonsFor(name: string, current?: string | string[]): string[] {
  for (const [re, seasons] of SEASON_RULES) {
    if (re.test(name)) return seasons
  }
  if (INDOOR_RE.test(name)) return []

  const flat = (Array.isArray(current) ? current : [current])
    .flatMap((c) => {
      if (typeof c !== 'string') return []
      try {
        const p = JSON.parse(c)
        return Array.isArray(p) ? p : [c]
      } catch {
        return [c]
      }
    })
  const isSs = flat.includes('ss') || flat.includes('春') || flat.includes('夏')
  const isAw = flat.includes('aw') || flat.includes('秋') || flat.includes('冬')

  const patterns = isSs && !isAw
    ? [['春'], ['夏'], ['春', '夏']]
    : isAw && !isSs
      ? [['秋'], ['冬'], ['秋', '冬']]
      : [['春'], ['夏'], ['秋'], ['冬']]
  return patterns[hashOf(name) % patterns.length]
}
