/**
 * 预置画布工作流 seed：中高客单女装「主图 5 张套装」+「详情页 8 页套装」。
 *
 * 知识库/提示词文本蒸馏自 mid-high-womenswear-detail-page skill（背景基调统一、
 * 动作多样性与证据规则、无文字主图、8 页结构知识库）。
 *
 * 幂等：同名项目先删后插。写入 admin 用户（本地库/生产库 admin id 均为 1）。
 *
 * 用法：
 *   node scripts/seed-canvas-womenswear-workflows.mjs            # 写入默认库 server/data/momo.db
 *   DB_PATH=/path/to/db node scripts/seed-canvas-womenswear-workflows.mjs
 */
import Database from 'better-sqlite3'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = process.env.DB_PATH
  ? path.resolve(process.cwd(), process.env.DB_PATH)
  : path.resolve(__dirname, '../server/data/momo.db')

const AUDIT_RULES = `# 商品信息审计规则（识图）
对用户提供的商品图/模特图做审计，输出商品信息表。规则：
1. 用户提供的商品与模特参考图是唯一事实来源。不得臆造服装颜色、结构、面料、闭合方式、装饰或未提供的视角。
2. 逐项描述：品类、颜色色系、廓形、领口、袖型、门襟、纽扣/刺绣/印花等可见结构、面料观感、模特信息（如有）。
3. 图片识别出的信息标注「图片识别 / 待确认」；不得虚构尺码、面料成分、洗护、功能科技、认证或专利。
4. 未提供背面/里衬/闭合结构/隐藏细节时，明确写「未提供，不得生成」。`

const MAINIMAGE_RULES = `# 女装主图生成规则（5 张套装）
你是中高客单女装电商主图提示词专家。基于上游的商品审计信息，为 5 张 1:1 方形主图各写一段生图提示词，用 --- 分隔，正好 5 段。

## 背景基调统一（最重要）
先为整套确定一段共享背景基调：默认室内影棚（用户另有说明时按其选择）。
- 室内：写一段固定描述（背景色系、光线布置、渐变、景深，如「暖棕奶杏色无缝影棚背景，柔和顶光加左侧补光，轻微明暗渐变，浅景深虚化，无杂物」）。5 张背景基本一致，差异化只来自姿势/景别/机位。
- 户外：选定唯一一个场景并固定其身份（地点类型、时间段、光线方向、色调）。5 张描述同一场景的不同机位，不得跳到其他地点。
该基调段落逐字写进全部 5 段提示词。

## 5 张差异化（姿势/景别/机位）
5 张必须分别采用不同组合，如：正面全身 / 四十五度侧身 / 上半身特写 / 细节特写（领口、纽扣、面料）/ 行走或转身感。不得同一站姿重复。

## 证据规则
未提供背面、里衬、闭合结构或隐藏细节时不得出现。不得擅自增加腰带、口袋、肩带、配饰或装饰。服装本身严格同一件（以参考图为准）。

## 每段提示词必须包含
- 方形 1:1 画幅、画面无任何文字/水印/logo/边框/UI
- 商品或模特居中，关键内容（服装结构、身体、手部、配饰）落在画面中央 75% 宽度内，左右各约 12.5% 为可裁切背景区
- 保持参考商品严格一致
- 共享背景基调段（逐字粘贴）
- 该张特有的姿势/景别/机位描述

输出格式：5 段提示词，段与段之间用单独一行 --- 分隔。每段开头用【第N张·景别名】标注。不要输出其他解释。`

const DETAILPAGE_RULES = `# 女装详情页生成规则（8 页套装，9:16 竖版）
你是中高客单女装电商详情页提示词专家。基于上游的商品审计信息，为 8 张 9:16 竖版详情页各写一段生图提示词，用 --- 分隔，正好 8 段。

## 固定 8 页结构（每页一段）
1. 主视觉页：大面积模特主图建立第一眼高级感；最多一个主标题+一个短副标题。
2. 整体上身页：正面全身，看清裙长、领口、腰带、整体比例；标题+3 结构词。
3. 上身气质页：半身/七分身，突出脸、肩颈、领口与气质；标题+短副标题。
4. 版型收腰页：站姿主图+腰部局部，聚焦腰线；标题+3 短标签。
5. 细节展示页：领口、纽扣、印花、腰带、袖口等细节集中展示；标题+4-5 细节词。
6. 面料质感页：面料肌理近景、裙摆垂感、自然褶感；标题+短副标题+3-4 词。
7. 尺码信息页：真实尺码表、号型、面料；此页允许表格。
8. 收尾海报页：完整大图收尾，干净留白，强化氛围；标题+短副标题。

## 页面文字与设计
- 视觉优先、少字高级：除尺码页外每页中文文字 20-45 字，绝不超 80 字。
- 字体气质：优雅纤细宋体为主，黑体少用；主标题 100-108px，副标题 72-76px（按 1440x2560 画布规格）。
- 配色：低饱和暖色渐变（深暖棕→奶咖金棕、奶杏→暖棕）；禁止高饱和促销红、荧光色、大面积纯黑纯白。
- 装饰：半透明标签底板（8%-18% 透明度暖奶白）、柔和叠层、花朵细线圆角轻装饰。

## 真实性红线
- 尺码、面料成分、洗护、认证只能用用户提供的内容；未提供则该页弱化为视觉化呈现并标注待确认，不得编造。
- 未提供背面/里衬/隐藏细节不得出现；不得擅自增减配饰。
- 8 页之间姿势/景别/目光方向/机位必须多样化，不得同一站姿重复。

## 每段提示词必须包含
- 9:16 竖版画幅；该页的版式结构（图片占比、文字模块与位置）
- 该页要出现的具体文字内容（标题/副标题/标签词）
- 保持参考商品严格一致 + 共享的暖色系视觉基调
输出格式：8 段提示词，段间用单独一行 --- 分隔。每段开头【第N页·页面名】。不要输出其他解释。`

const MAINIMAGE_QA_NOTE = `主图套装质检补充说明：本组为 5 张 1:1 方图 + 各自 3:4 居中裁切。检查时特别注意：主体是否落在中央 75% 安全区（左右各 12.5% 裁切后不伤商品）；5 张背景是否符合统一基调（室内应基本一致）；姿势/景别是否有差异化；画面无任何文字/水印/logo。`

/** 主图 5 张模板 */
function buildMainImageWorkflow() {
  const poseNames = ['正面全身', '四十五度侧身', '上半身特写', '细节特写', '行走感']
  const nodes = []
  const edges = []
  const node = (id, type, title, x, y, config = {}, extra = {}) => {
    const def = {
      id,
      type,
      title,
      position: { x, y },
      inputs: [],
      outputs: [],
      config,
      status: 'idle',
      disabled: false,
      logs: [],
      width: 240,
      ...extra,
    }
    nodes.push(def)
    return def
  }
  const port = (id, name, dataType, direction, required = false) => ({ id, name, dataType, direction, required })
  const edge = (source, sourcePort, target, targetPort) => {
    edges.push({ id: `edge_${source}_${sourcePort}_${target}_${targetPort}`, sourceNodeId: source, sourcePortId: sourcePort, targetNodeId: target, targetPortId: targetPort })
  }

  // 1. 图片输入：商品图 + 模特图
  node('n_input', 'image-input', '商品图/模特图', 40, 260, { images: [] }, {
    outputs: [port('image', 'Image', 'Image', 'output')],
  })

  // 2. 知识库：审计规则
  node('n_audit_rules', 'knowledge', '审计规则库', 360, 40, { content: AUDIT_RULES, mergeMode: 'rules-first' }, {
    outputs: [port('text', 'Text', 'Text', 'output')],
  })

  // 3. 文字 AI：识图审计（vision）
  node('n_audit', 'text-ai', '商品识图审计', 360, 170, {
    modelName: '',
    channelModelId: undefined,
    taskPrompt: '根据下方规则对附带图片做商品信息审计，输出商品信息表。',
    detailPrompt: '输出：品类/颜色/廓形/领口/袖型/门襟/装饰/面料观感，逐项标注信息来源（用户提供 or 图片识别/待确认）。未提供的视角与细节明确列出「不得生成」。',
    pauseAfterRun: false,
  }, {
    inputs: [port('text', 'Text', 'Text', 'input'), port('image', 'Image', 'Image', 'input')],
    outputs: [port('text', 'Text', 'Text', 'output')],
  })

  // 4. 知识库：主图规则（合并上游审计结果）
  node('n_main_rules', 'knowledge', '主图规则库', 360, 340, { content: MAINIMAGE_RULES, mergeMode: 'rules-first' }, {
    inputs: [port('text', 'Text', 'Text', 'input')],
    outputs: [port('text', 'Text', 'Text', 'output')],
  })

  // 5. 文字 AI：提示词专家（5 段）
  node('n_prompter', 'text-ai', '主图提示词专家', 360, 490, {
    modelName: '',
    channelModelId: undefined,
    taskPrompt: '按上游规则生成 5 张主图的生图提示词（--- 分隔，正好 5 段）。',
    detailPrompt: '第一段之前先单独输出你选定的「共享背景基调」一句话，然后 5 段提示词。',
    pauseAfterRun: false,
  }, {
    inputs: [port('text', 'Text', 'Text', 'input')],
    outputs: [port('text', 'Text', 'Text', 'output')],
  })

  // 6. 提示词拆分（预置全部输出口：运行前就能渲染完整连线；运行后 setNodeOutputs 重新生成相同端口）
  node('n_split', 'prompt-splitter', '拆分 5 段', 360, 640, { delimiter: '---', trimWhitespace: true, ignoreEmpty: true, editedOutputs: {} }, {
    inputs: [port('text', 'Text', 'Text', 'input', true)],
    outputs: poseNames.map((_, i) => port(`output_${i + 1}`, `输出${i + 1}`, 'Text', 'output')),
  })

  // 7-11. 五个 image-ai（各自 prompt + 参考图直连输入节点）
  const imageAiIds = []
  poseNames.forEach((pose, i) => {
    const id = `n_img_${i + 1}`
    imageAiIds.push(id)
    node(id, 'image-ai', `主图 ${i + 1}·${pose}`, 700, 160 + i * 170, {
      modelName: 'gpt-image-2',
      logicalModelId: undefined,
      aspectRatio: '1:1',
      outputSize: '2K',
      imageCount: 1,
    }, {
      inputs: [port('prompt', 'Prompt', 'Text', 'input', true), port('image_1', '图1', 'Image', 'input')],
      outputs: [port('image', 'Image', 'Image', 'output')],
    })
  })

  // 12-16. 五个裁剪（3:4）
  const cropIds = []
  imageAiIds.forEach((imgId, i) => {
    const id = `n_crop_${i + 1}`
    cropIds.push(id)
    node(id, 'image-crop', `裁 3:4 · ${i + 1}`, 1030, 160 + i * 170, { ratio: '3:4' }, {
      inputs: [port('image', 'Image', 'Image', 'input', true)],
      outputs: [port('image', 'Image', 'Image', 'output')],
    })
  })

  // 17. 图片质检（5 张裁切图 + 1 张商品参考图对比由 text-ai 审计文本补充）
  node('n_qa', 'image-qa', '组图质检', 1360, 400, {
    channelModelId: undefined,
    modelName: '',
    qaPrompt: '__DEFAULT__',
    strict: false,
  }, {
    inputs: [
      ...Array.from({ length: 5 }, (_, i) => port(`image_${i + 1}`, `图${i + 1}`, 'Image', 'input')),
      port('text', '质检说明', 'Text', 'input'),
    ],
    outputs: [port('report', '质检报告', 'Text', 'output')],
  })

  // 连线
  edge('n_audit_rules', 'text', 'n_audit', 'text')
  edge('n_input', 'image', 'n_audit', 'image')
  edge('n_audit', 'text', 'n_main_rules', 'text')
  edge('n_main_rules', 'text', 'n_prompter', 'text')
  edge('n_prompter', 'text', 'n_split', 'text')
  imageAiIds.forEach((id, i) => {
    edge('n_split', `output_${i + 1}`, id, 'prompt')
    edge('n_input', 'image', id, 'image_1')
    edge(id, 'image', cropIds[i], 'image')
    edge(cropIds[i], 'image', 'n_qa', `image_${i + 1}`)
  })

  return {
    id: 'workflow_womenswear_main',
    name: '女装主图·5 图套装',
    nodes,
    edges,
    viewport: { x: 0, y: 0, zoom: 0.55 },
    updatedAt: new Date().toISOString(),
  }
}

/** 详情页 8 页模板 */
function buildDetailPageWorkflow() {
  const pageNames = ['主视觉', '整体上身', '上身气质', '版型收腰', '细节展示', '面料质感', '尺码信息', '收尾海报']
  const nodes = []
  const edges = []
  const node = (id, type, title, x, y, config = {}, extra = {}) => {
    const def = {
      id, type, title, position: { x, y }, inputs: [], outputs: [],
      config, status: 'idle', disabled: false, logs: [], width: 240, ...extra,
    }
    nodes.push(def)
    return def
  }
  const port = (id, name, dataType, direction, required = false) => ({ id, name, dataType, direction, required })
  const edge = (source, sourcePort, target, targetPort) => {
    edges.push({ id: `edge_${source}_${sourcePort}_${target}_${targetPort}`, sourceNodeId: source, sourcePortId: sourcePort, targetNodeId: target, targetPortId: targetPort })
  }

  node('n_input', 'image-input', '商品图/模特图', 40, 300, { images: [] }, {
    outputs: [port('image', 'Image', 'Image', 'output')],
  })

  node('n_audit_rules', 'knowledge', '审计规则库', 360, 40, { content: AUDIT_RULES, mergeMode: 'rules-first' }, {
    outputs: [port('text', 'Text', 'Text', 'output')],
  })

  node('n_audit', 'text-ai', '商品识图审计', 360, 170, {
    modelName: '',
    channelModelId: undefined,
    taskPrompt: '根据下方规则对附带图片做商品信息审计，输出商品信息表。',
    detailPrompt: '输出：品类/颜色/廓形/领口/袖型/门襟/装饰/面料观感 + 用户已确认的尺码/面料信息（如有）。未提供的明确列出「不得生成」。',
    pauseAfterRun: false,
  }, {
    inputs: [port('text', 'Text', 'Text', 'input'), port('image', 'Image', 'Image', 'input')],
    outputs: [port('text', 'Text', 'Text', 'output')],
  })

  node('n_page_rules', 'knowledge', '详情页规则库', 360, 340, { content: DETAILPAGE_RULES, mergeMode: 'rules-first' }, {
    inputs: [port('text', 'Text', 'Text', 'input')],
    outputs: [port('text', 'Text', 'Text', 'output')],
  })

  node('n_prompter', 'text-ai', '详情页提示词专家', 360, 490, {
    modelName: '',
    channelModelId: undefined,
    taskPrompt: '按上游规则生成 8 页详情页的生图提示词（--- 分隔，正好 8 段）。',
    detailPrompt: '',
    pauseAfterRun: false,
  }, {
    inputs: [port('text', 'Text', 'Text', 'input')],
    outputs: [port('text', 'Text', 'Text', 'output')],
  })

  node('n_split', 'prompt-splitter', '拆分 8 段', 360, 640, { delimiter: '---', trimWhitespace: true, ignoreEmpty: true, editedOutputs: {} }, {
    inputs: [port('text', 'Text', 'Text', 'input', true)],
    outputs: pageNames.map((_, i) => port(`output_${i + 1}`, `输出${i + 1}`, 'Text', 'output')),
  })

  const imageAiIds = []
  pageNames.forEach((p, i) => {
    const id = `n_img_${i + 1}`
    imageAiIds.push(id)
    node(id, 'image-ai', `详情页 ${i + 1}·${p}`, 700, 60 + i * 170, {
      modelName: 'gpt-image-2',
      logicalModelId: undefined,
      aspectRatio: '9:16',
      outputSize: '2K',
      imageCount: 1,
    }, {
      inputs: [port('prompt', 'Prompt', 'Text', 'input', true), port('image_1', '图1', 'Image', 'input')],
      outputs: [port('image', 'Image', 'Image', 'output')],
    })
  })

  node('n_qa', 'image-qa', '组图质检', 1030, 500, {
    channelModelId: undefined,
    modelName: '',
    qaPrompt: '__DEFAULT__',
    strict: false,
  }, {
    inputs: [
      ...Array.from({ length: 8 }, (_, i) => port(`image_${i + 1}`, `图${i + 1}`, 'Image', 'input')),
      port('text', '质检说明', 'Text', 'input'),
    ],
    outputs: [port('report', '质检报告', 'Text', 'output')],
  })

  edge('n_audit_rules', 'text', 'n_audit', 'text')
  edge('n_input', 'image', 'n_audit', 'image')
  edge('n_audit', 'text', 'n_page_rules', 'text')
  edge('n_page_rules', 'text', 'n_prompter', 'text')
  edge('n_prompter', 'text', 'n_split', 'text')
  imageAiIds.forEach((id, i) => {
    edge('n_split', `output_${i + 1}`, id, 'prompt')
    edge('n_input', 'image', id, 'image_1')
    edge(id, 'image', 'n_qa', `image_${i + 1}`)
  })

  return {
    id: 'workflow_womenswear_detail',
    name: '女装详情页·8 页套装',
    nodes,
    edges,
    viewport: { x: 0, y: 0, zoom: 0.45 },
    updatedAt: new Date().toISOString(),
  }
}

// ============ 主流程 ============
const db = new Database(dbPath)

const admin = db.prepare(`SELECT id FROM users WHERE username = 'admin' LIMIT 1`).get()
if (!admin) {
  console.error(`未找到 admin 用户，db=${dbPath}`)
  process.exit(1)
}

const templates = [
  { name: '女装主图·5 图套装', description: '识图审计 → 5 段提示词 → 并行生图 → 3:4 居中裁切 → 组图质检（不合格自动重跑该张）', build: buildMainImageWorkflow },
  { name: '女装详情页·8 页套装', description: '识图审计 → 8 页提示词 → 并行生图（9:16）→ 组图质检（不合格自动重跑该页）', build: buildDetailPageWorkflow },
]

const del = db.prepare(`DELETE FROM canvas_projects WHERE user_id = ? AND name = ?`)
const ins = db.prepare(`
  INSERT INTO canvas_projects (user_id, name, description, notes, thumbnail, workflow_data, node_count, created_at, updated_at)
  VALUES (?, ?, ?, '', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
`)

for (const t of templates) {
  const wf = t.build()
  // '__DEFAULT__' 占位 → 空 qaPrompt（节点运行时用内置默认质检清单）
  for (const n of wf.nodes) {
    if (n.type === 'image-qa' && n.config.qaPrompt === '__DEFAULT__') n.config.qaPrompt = ''
  }
  del.run(admin.id, t.name)
  const info = ins.run(admin.id, t.name, t.description, '#c32bac', JSON.stringify(wf), wf.nodes.length)
  console.log(`✓ 已写入「${t.name}」 (id=${info.lastInsertRowid}, ${wf.nodes.length} 节点, ${wf.edges.length} 连线) → ${dbPath}`)
}

db.close()
