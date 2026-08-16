/**
 * 内置兜底条目（与数据库种子同源；DB 模板资产缺失时保证引擎可用）。
 * 这些条目依赖上下文占位符（{{track.mood}} 等），不适合做成静态资产，
 * 因此固定内置；同 key 的 DB 资产可覆盖其 content。
 */
import type { PromptEntry } from './types'

export const BUILT_IN_ENTRIES: PromptEntry[] = [
  {
    key: 'identity.dna', name: '模特 DNA', grp: 'identity', order: 100,
    content: '【模特锁定】{{persona.dna}}。全套图片必须为同一位模特，面部特征、肤色、体态完全一致。',
    condKind: 'persona', scope: ['suite', 'fusion', 'swap'], origin: 'built-in',
  },
  {
    key: 'identity.fingerprint', name: '指纹库身份锚定', grp: 'identity', order: 107,
    content: '【身份锚定】参考图组中包含该模特的多角度与五官特写图（正面/侧面/3-4侧面 + 眼/鼻唇/脸颊/耳/发际），生图时以这一组参考图作为人物身份的唯一基准，5 张成图人脸严格一致。',
    condKind: 'fingerprint', scope: ['suite', 'fusion', 'swap'], origin: 'built-in',
  },
  {
    key: 'garment.detail', name: '服装细节四层描述', grp: 'garment', order: 150,
    content: '【服装细节描述】\n版型轮廓：{{garment.shape}}\n面料层次：{{garment.fabric}}\n结构细节：{{garment.structure}}\n专属元素：{{garment.element}}\n印花/图案：{{garment.print}}\n自带配饰清单：{{garment.accessories}}',
    condKind: 'garment-detail', scope: ['suite', 'fusion', 'swap'], origin: 'built-in',
  },
  {
    key: 'scene.mood', name: '赛道氛围', grp: 'scene', order: 300,
    content: '【赛道氛围】{{track.mood}}',
    scope: ['suite', 'fusion', 'swap'], origin: 'built-in',
  },
  {
    key: 'identity.makeup', name: '妆发统一锁定', grp: 'identity', order: 330,
    content: '【妆发·全套统一锁定】{{persona.hair}}。全套图片发型与妆容必须完全一致，禁止每张图发型/妆容不同。',
    scope: ['suite'], origin: 'built-in',
  },
  {
    key: 'light.main', name: '光影统一锁定', grp: 'light', order: 340,
    content: '【光影·全套统一锁定】{{track.light}}。全套图片光源方向/色温/曝光必须完全一致，禁止光线漂移。',
    scope: ['suite'], origin: 'built-in',
  },
  {
    key: 'garment.acc', name: '配饰方向', grp: 'garment', order: 350,
    content: '【配饰方向】{{track.acc}}',
    scope: ['suite'], origin: 'built-in',
  },
  {
    key: 'pose.hand', name: '手部姿态', grp: 'pose', order: 360,
    content: '【手部姿态】{{track.hand}}',
    scope: ['suite'], origin: 'built-in',
  },
  {
    key: 'pose.node', name: '本张点位', grp: 'pose', order: 1000,
    content: '【本张点位 {{point.idx}}/5】{{theme.name}} · {{theme.pathSeg}}',
    scope: ['suite'], origin: 'built-in',
  },
  {
    key: 'pose.scene', name: '本张场景锁定', grp: 'pose', order: 1010,
    content: '【本张场景锁定·必须严格遵守】{{theme.point}}。姿态自然松弛，生活化抓拍感；严禁跳跃、奔跑、大幅扭身等夸张动作。',
    scope: ['suite'], origin: 'built-in',
  },
  {
    key: 'camera.shot', name: '本张机位景别', grp: 'camera', order: 1020,
    content: '【机位构图】{{point.shot}}。3:4 画幅内保留竖版全身机位：人物纵向主体、上下不裁切、背景简洁留白、突出服装主体。',
    scope: ['suite'], origin: 'built-in',
  },
]

/** 5 张点位递进：景别 / 焦段 / 站位（源自工作台 poseProgress 方法论） */
export const POINT_PROGRESSION = [
  { shot: '全景，35mm 环境人像，人物占画面 1/3，站位于右 1/3 线，自然直立' },
  { shot: '中全景，50mm 标准人像，人物占画面 1/2，站位于左 1/3 线，微侧身站立' },
  { shot: '中景，85mm 人像，膝上构图，居中偏右站位，轻靠环境物（栏杆/墙面）' },
  { shot: '中近景，85mm 人像，腰上构图，居中站位，端庄姿态或轻互动道具' },
  { shot: '近景特写，85-135mm，胸以上构图，居中偏左站位，正面直立突出服装上身细节' },
]
