/**
 * 主题元数据推导：按「主题名称关键词」推导适合风格（styles）与差异化季节（season），
 * 以及主题点位字段（point_details：点位名/场景锁定/人物姿势/机位构图）的清洗 / 派生 / 回填构建。
 * 纯函数、无 DB 依赖；种子初始化（seedSuiteGen）与存量回填共用，规则调整后重跑结果确定。
 */

/** 主题点位字段：点位名 / 场景锁定 / 人物姿势 / 机位构图（存储于 sg_themes.point_details） */
export interface ThemePointDetail {
  name: string
  scene: string
  pose: string
  camera: string
}

/** 清洗 point_details 入参：数组 ≤10，字段 trim 为字符串，全空条目剔除 */
export function sanitizePointDetails(v: unknown): ThemePointDetail[] {
  if (!Array.isArray(v)) return []
  return v
    .slice(0, 10)
    .map((x) => {
      const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
      return {
        name: String(o.name ?? '').trim(),
        scene: String(o.scene ?? '').trim(),
        pose: String(o.pose ?? '').trim(),
        camera: String(o.camera ?? '').trim(),
      }
    })
    .filter((d) => d.name || d.scene || d.pose || d.camera)
}

/** 点位字段 → 旧点位描述数组（scene 首句，兜底点位名），保持 points 字段与展示同步 */
export function derivePointsFromDetails(details: ThemePointDetail[]): string[] {
  return details
    .map((d) => d.scene.split('。')[0]?.trim() || d.name)
    .filter(Boolean)
}

/** 景别递进表（与前端 src/utils/promptEngine/entries.ts 的 POINT_PROGRESSION 保持同源） */
const POINT_SHOT_PROGRESSION = [
  '全景，35mm 环境人像，人物占画面 1/3，站位画面中间，自然直立',
  '中全景，50mm 标准人像，人物占画面 1/2，站位画面中间，微侧身站立',
  '中景，85mm 人像，膝上构图，居中偏右站位，轻靠环境物（栏杆/墙面）',
  '中近景，85mm 人像，腰上构图，居中站位，端庄姿态或轻互动道具',
  '近景特写，85-135mm，胸以上构图，居中偏左站位，正面直立突出服装上身细节',
]
const SCENE_LOCK_TAIL = '姿态自然松弛，生活化抓拍感；严禁跳跃、奔跑、大幅扭身等夸张动作。'
const CAMERA_TAIL = '人物纵向主体、上下不裁切、背景简洁留白、突出服装主体。'

/** 姿势递进表（与前端 src/utils/themePoints.ts 的 POSE_PROGRESSION 保持同源） */
const POSE_PROGRESSION = [
  '自然直立，双手自然垂放，目光平视镜头',
  '缓步行走中抓拍，双臂自然摆动，侧身回望',
  '侧身轻靠环境物（栏杆/墙面/廊柱），单手轻搭',
  '端庄坐姿或站姿，手持道具自然互动',
  '微侧回头，肩颈放松，微笑看向镜头',
]

/** 按点位下标取默认姿势（姿势字段上线前的存量回填共用；超出范围循环） */
export function defaultPoseAt(i: number): string {
  return POSE_PROGRESSION[i % POSE_PROGRESSION.length]
}

/**
 * 按旧动态生成逻辑从主题数据构建点位字段。
 * 存量回填与前端编辑预填共用；字段写入后即为主题数据源，不再动态拼装。
 */
export function buildPointDetails(themeName: string, path: string, points: string[]): ThemePointDetail[] {
  const segs = String(path || '').split('→').map((s) => s.trim()).filter(Boolean)
  const pts = Array.isArray(points) ? points.map((p) => String(p ?? '').trim()).filter(Boolean) : []
  const n = Math.min(pts.length || Math.max(segs.length, 5), 10)
  return Array.from({ length: n }, (_, i) => {
    const seg = segs[i] || ''
    const base = pts[i] || seg
    return {
      name: seg ? `${themeName} · ${seg}` : themeName,
      scene: base ? `${base}。${SCENE_LOCK_TAIL}` : SCENE_LOCK_TAIL,
      pose: defaultPoseAt(i),
      camera: `${POINT_SHOT_PROGRESSION[i] || POINT_SHOT_PROGRESSION[0]}。${CAMERA_TAIL}`,
    }
  })
}

/** 适合风格选项（与管理端 AdminSuiteAssets 的 THEME_STYLES 保持一致） */
export const THEME_STYLE_OPTIONS = [
  '新中式国风', '文艺风', '休闲', '极简', '法式', '度假',
  '优雅', '职场', '运动', '喜婆婆', '小香风',
]

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

/** 名称 → 适合风格（1~3 个） */
export function themeStylesFor(name: string): string[] {
  const out: string[] = []
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
