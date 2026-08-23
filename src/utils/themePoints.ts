/**
 * 主题点位字段（点位名/场景锁定/人物姿势/机位构图）前端工具。
 * 与服务端 server/src/db/themeMeta.ts 的 buildPointDetails 保持同源：
 * 均为「把旧动态生成逻辑的输出固化为可编辑数据」的预填构建。
 */
import { POINT_PROGRESSION } from '@/utils/promptEngine/entries'

export interface ThemePointDetail {
  name: string
  scene: string
  pose: string
  camera: string
}

const SCENE_LOCK_TAIL = '姿态自然松弛，生活化抓拍感；严禁跳跃、奔跑、大幅扭身等夸张动作。'
const CAMERA_TAIL = '人物纵向主体、上下不裁切、背景简洁留白、突出服装主体。'

/** 姿势递进表（与 server/src/db/themeMeta.ts 的 POSE_PROGRESSION 保持同源） */
const POSE_PROGRESSION = [
  '自然直立，双手自然垂放，目光平视镜头',
  '缓步行走中抓拍，双臂自然摆动，侧身回望',
  '侧身轻靠环境物（栏杆/墙面/廊柱），单手轻搭',
  '端庄坐姿或站姿，手持道具自然互动',
  '微侧回头，肩颈放松，微笑看向镜头',
]

/** 空白行（用于表单可编辑行） */
export function emptyPointDetail(): ThemePointDetail {
  return { name: '', scene: '', pose: '', camera: '' }
}

/** 按旧动态生成逻辑预填点位字段（编辑旧主题 / 无点位字段主题时兜底） */
export function buildPointDetails(
  themeName: string,
  path: string,
  points: string[],
): ThemePointDetail[] {
  const segs = String(path || '').split('→').map((s) => s.trim()).filter(Boolean)
  const pts = (points || []).map((p) => String(p ?? '').trim()).filter(Boolean)
  const n = Math.min(pts.length || Math.max(segs.length, 5), 10)
  return Array.from({ length: n }, (_, i) => {
    const seg = segs[i] || ''
    const base = pts[i] || seg
    return {
      name: seg ? `${themeName} · ${seg}` : themeName,
      scene: base ? `${base}。${SCENE_LOCK_TAIL}` : SCENE_LOCK_TAIL,
      pose: POSE_PROGRESSION[i] || POSE_PROGRESSION[0],
      camera: `${POINT_PROGRESSION[i]?.shot || POINT_PROGRESSION[0].shot}。${CAMERA_TAIL}`,
    }
  })
}
