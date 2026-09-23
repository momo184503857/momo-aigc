import { FEATURE_CONFIGS } from '@/configs/featureConfig'

export const MODES = ['free-gen', 'change-clothes', 'change-bg', 'change-face', 'detail-pic', 'fabric-pic', 'flat-pic', '3d-pic', 'model-gen', 'three-view'] as const
export type Mode = typeof MODES[number]
export type Scenario = 'empty' | 'running' | 'results' | 'partial'
export interface Reference { id: string; slot: string; name: string }
export interface Draft {
  prompt: string; model: string; ratio: string; count: number; resolution: string; negative: string; references: Reference[]
}
export interface ImageTask { id: string; status: 'running' | 'success' | 'failed'; source: string; error?: string }
export interface Round { id: string; createdAt: number; mode: Mode; params: Draft; tasks: ImageTask[] }
export interface Creation {
  id: string; title: string; createdAt: number; mode: Mode; drafts: Partial<Record<Mode, Draft>>; rounds: Round[]
}
export interface PrototypeState { version: 1; activeId: string; creations: Creation[] }
export const STORAGE_KEY = 'momo.creation-prototype.v1'
export const DB_NAME = 'momo-creation-prototype-v1'
export const EXAMPLE_PROMPT = '一组自然、松弛的春日穿搭。柔和日光，干净的背景，保留衣服真实的面料质感，像一本生活方式杂志里的日常瞬间。'
// Public photography samples, never represented as generated images or private assets.
export const SAMPLES = [
  'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=max&w=1100&q=85',
  'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=max&w=1100&q=85',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=max&w=1100&q=85',
  'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=max&w=1100&q=85',
]
export const modeLabel = (mode: Mode) => mode === 'free-gen' ? '自由生图' : FEATURE_CONFIGS[mode].label
export const uid = () => crypto.randomUUID()
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
export function newDraft(): Draft {
  return { prompt: '', model: '标准画质 · 演示', ratio: '1:1', count: 2, resolution: '2K', negative: '', references: [] }
}
export function newCreation(title = '未命名创作'): Creation {
  return { id: uid(), title, createdAt: Date.now(), mode: 'free-gen', drafts: { 'free-gen': newDraft() }, rounds: [] }
}
export function slotsFor(mode: Mode) {
  if (mode === 'free-gen') return [{ key: 'reference', label: '参考图片', required: false, maxCount: 6 }]
  const feature = FEATURE_CONFIGS[mode]
  return [...feature.imageSlots, ...(feature.hasSupplementaryImages ? [{ key: 'supplementary', label: '补充图片', required: false, maxCount: 6 }] : [])]
}
export function makeRound(mode: Mode, params: Draft, status: ImageTask['status'] = 'running'): Round {
  return {
    id: uid(), createdAt: Date.now(), mode, params: clone(params),
    tasks: Array.from({ length: params.count }, (_, i) => ({ id: uid(), status, source: SAMPLES[i % SAMPLES.length] })),
  }
}
export function scenarioCreation(scenario: Scenario): Creation {
  const record = newCreation({ empty: '新的灵感', running: '日光下的片刻', results: '春日，轻盈一点', partial: '另一种可能' }[scenario])
  if (scenario === 'empty') return record
  const draft = record.drafts['free-gen']!
  draft.prompt = EXAMPLE_PROMPT
  draft.count = 2
  if (scenario === 'results') {
    const previous = makeRound('free-gen', { ...draft, prompt: '自然光人像，轻松的神态，安静的午后。' }, 'success')
    previous.createdAt -= 8 * 60000
    previous.tasks.forEach((task, i) => { task.source = SAMPLES[i + 2] })
    record.rounds.push(previous)
  }
  const latest = makeRound('free-gen', draft, scenario === 'running' ? 'running' : 'success')
  if (scenario === 'partial') {
    latest.tasks[1].status = 'failed'
    latest.tasks[1].error = '演示：这张图片暂时没有完成，请重试。'
  }
  record.rounds.unshift(latest)
  return record
}

// Treat browser storage as untrusted: reject incompatible/corrupt state before rendering.
export function validState(value: unknown): value is PrototypeState {
  if (!value || typeof value !== 'object') return false
  const s = value as PrototypeState
  const validDraft = (d: Draft) => d && typeof d.prompt === 'string' && typeof d.model === 'string'
    && ['1:1', '3:4', '4:3', '9:16', '16:9'].includes(d.ratio) && Number.isInteger(d.count) && d.count >= 1 && d.count <= 4
    && ['1K', '2K', '4K'].includes(d.resolution) && typeof d.negative === 'string' && Array.isArray(d.references)
    && d.references.every(r => typeof r.id === 'string' && typeof r.slot === 'string' && typeof r.name === 'string')
  return s.version === 1 && typeof s.activeId === 'string' && Array.isArray(s.creations) && s.creations.length > 0
    && s.creations.some(c => c.id === s.activeId)
    && s.creations.every(c => typeof c.id === 'string' && typeof c.title === 'string' && Number.isFinite(c.createdAt)
      && MODES.includes(c.mode) && c.drafts && validDraft(c.drafts[c.mode]!) && Object.values(c.drafts).every(d => validDraft(d!))
      && Array.isArray(c.rounds) && c.rounds.every(r => typeof r.id === 'string' && Number.isFinite(r.createdAt)
        && MODES.includes(r.mode) && validDraft(r.params) && Array.isArray(r.tasks)
        && r.tasks.every(t => typeof t.id === 'string' && ['running', 'success', 'failed'].includes(t.status) && SAMPLES.includes(t.source))))
}
