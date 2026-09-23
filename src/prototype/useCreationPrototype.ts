import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { clone, makeRound, newCreation, newDraft, scenarioCreation, slotsFor, STORAGE_KEY, uid, validState, type Creation, type ImageTask, type Mode, type PrototypeState, type Round, type Scenario } from './model'
import { imageOperation } from './storage'

export function useCreationPrototype() {
  const notice = ref('')
  const storageWarning = ref('')
  const ready = ref(false)
  const uploading = ref(false)
  const mobileTab = ref<'input' | 'results'>('input')
  const scenario = ref<Scenario | ''>('results')
  const imageUrls = reactive<Record<string, string>>({})
  const initial = scenarioCreation('results')
  const state = reactive<PrototypeState>({ version: 1, activeId: initial.id, creations: [initial] })
  const active = computed(() => state.creations.find(c => c.id === state.activeId)!)
  const draft = computed(() => active.value.drafts[active.value.mode]!)
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  let noticeTimer: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  let recoveryRequired = false

  function notify(message: string) {
    notice.value = message
    clearTimeout(noticeTimer)
    noticeTimer = setTimeout(() => { notice.value = '' }, 4500)
  }
  function save() {
    if (!ready.value || recoveryRequired) return
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) }
    catch { storageWarning.value = '当前内容未保存：浏览器存储不可用或空间不足。请先下载需要的图片。' }
  }
  watch(state, save, { deep: true })
  function finishTask(recordId: string, roundId: string, taskId: string) {
    const task = state.creations.find(c => c.id === recordId)?.rounds.find(r => r.id === roundId)?.tasks.find(t => t.id === taskId)
    if (task) { task.status = 'success'; delete task.error }
    timers.delete(taskId)
  }
  function schedule(recordId: string, round: Round, task: ImageTask, delay: number) {
    clearTimeout(timers.get(task.id))
    timers.set(task.id, setTimeout(() => finishTask(recordId, round.id, task.id), delay))
  }
  function addRecord(record = newCreation()) {
    state.creations.unshift(record)
    state.activeId = record.id
    mobileTab.value = 'input'
    scenario.value = ''
  }
  function selectRecord(id: string) {
    if (!state.creations.some(c => c.id === id)) return
    state.activeId = id
    scenario.value = ''
    mobileTab.value = active.value.rounds.length ? 'results' : 'input'
  }
  function selectScenario(value: Scenario) {
    addRecord(scenarioCreation(value))
    scenario.value = value
    mobileTab.value = value === 'empty' ? 'input' : 'results'
  }
  function setMode(mode: Mode) {
    if (!active.value.drafts[mode]) active.value.drafts[mode] = newDraft()
    active.value.mode = mode
  }
  function rename(value: string) {
    if (!value.trim()) return false
    active.value.title = value.trim().slice(0, 60)
    return true
  }
  function generate() {
    if (!ready.value || uploading.value) return
    const missing = slotsFor(active.value.mode).find(slot => slot.required && !draft.value.references.some(r => r.slot === slot.key && imageUrls[r.id]))
    if (missing) return notify(`请先上传${missing.label}`)
    if (active.value.mode === 'free-gen' && !draft.value.prompt.trim()) return notify('先写下你想看到的画面。')
    const round = makeRound(active.value.mode, draft.value)
    active.value.rounds.unshift(round)
    if (active.value.title === '未命名创作' || active.value.title === '新的灵感') active.value.title = draft.value.prompt.trim().slice(0, 18) || '我的创作'
    // Always schedule the reactive tasks through IDs; raw fixture objects are never mutated later.
    round.tasks.forEach((task, i) => schedule(active.value.id, round, task, 2400 + i * 700))
    mobileTab.value = 'results'
    scenario.value = ''
    notify('正在演示生成流程，不调用生图接口、不扣积分。')
  }
  function retry(round: Round, task: ImageTask) {
    task.status = 'running'
    delete task.error
    schedule(active.value.id, round, task, 1800)
  }
  function finishDemo() {
    active.value.rounds.forEach(round => round.tasks.filter(t => t.status === 'running').forEach(task => {
      clearTimeout(timers.get(task.id))
      finishTask(active.value.id, round.id, task.id)
    }))
  }
  function reuse(round: Round) {
    const currentCount = draft.value.count
    active.value.drafts[round.mode] = { ...clone(round.params), count: currentCount }
    active.value.mode = round.mode
    mobileTab.value = 'input'
    notify('已复用这一轮的参数，生成数量保持不变。')
  }
  async function storeImage(blob: Blob, name: string, slot: string, target = draft.value) {
    const id = uid()
    const url = URL.createObjectURL(blob)
    imageUrls[id] = url
    try { await imageOperation('put', id, blob) }
    catch { storageWarning.value = '当前图片未保存：浏览器图片存储不可用。刷新后需重新上传。' }
    if (disposed) { URL.revokeObjectURL(url); return }
    target.references.push({ id, slot, name })
  }
  async function upload(files: FileList | File[], slot: string) {
    if (uploading.value) return
    const target = draft.value
    const config = slotsFor(active.value.mode).find(s => s.key === slot)
    if (!config) return
    const capacity = config.maxCount - target.references.filter(r => r.slot === slot).length
    if (capacity <= 0) return notify(`最多上传 ${config.maxCount} 张${config.label}`)
    uploading.value = true
    try {
      let accepted = 0
      for (const file of Array.from(files)) {
        if (accepted >= capacity) { notify(`此位置最多容纳 ${config.maxCount} 张图片。`); break }
        if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type) || file.size > 10 * 1024 * 1024) {
          notify('请选择 10MB 以内的 JPG、PNG、WebP 或 GIF 图片。'); continue
        }
        try { const decoded = await createImageBitmap(file); decoded.close() }
        catch { notify(`无法读取图片：${file.name}`); continue }
        await storeImage(file, file.name, slot, target)
        accepted++
      }
    } finally { uploading.value = false }
  }
  async function useAsReference(task: ImageTask) {
    if (uploading.value) return
    const available = slotsFor(active.value.mode)
    const slot = available.find(s => draft.value.references.filter(r => r.slot === s.key).length < s.maxCount)
    if (!slot) return notify('当前模式没有可用参考图位置，请切换自由生图或移除已有图片。')
    const target = draft.value
    uploading.value = true
    try {
      const response = await fetch(task.source)
      if (!response.ok) throw new Error('fetch failed')
      const blob = await response.blob()
      const decoded = await createImageBitmap(blob); decoded.close()
      await storeImage(blob, '摄影示例.jpg', slot.key, target)
      mobileTab.value = 'input'
      notify(`已添加到${slot.label}，可继续调整描述。`)
    } catch { notify('示例图片暂时无法读取，请稍后重试或上传本地图片。') }
    finally { uploading.value = false }
  }
  async function download(task: ImageTask) {
    try {
      const response = await fetch(task.source)
      if (!response.ok) throw new Error('download failed')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `墨墨-摄影示例-${task.id.slice(0, 8)}.${blob.type.includes('webp') ? 'webp' : blob.type.includes('png') ? 'png' : 'jpg'}`
      link.hidden = true
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 30000)
      notify('已请求下载示例图片，请查看浏览器下载列表。')
    } catch { notify('下载未完成，请检查网络后重试。') }
  }
  async function clearData() {
    if (uploading.value) return
    timers.forEach(clearTimeout); timers.clear()
    storageWarning.value = ''
    recoveryRequired = false
    const record = newCreation()
    state.creations = [record]; state.activeId = record.id
    scenario.value = 'empty'; mobileTab.value = 'input'
    Object.values(imageUrls).forEach(URL.revokeObjectURL)
    Object.keys(imageUrls).forEach(key => delete imageUrls[key])
    try { await imageOperation('clear') }
    catch { storageWarning.value = '创作记录已重置，但本地图片清理失败，请重试。' }
    save()
    notify('演示记录已重置，现有业务数据未改动。')
  }
  onMounted(async () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const stored: unknown = JSON.parse(raw)
        if (!validState(stored)) throw new Error('invalid storage')
        Object.assign(state, stored)
        scenario.value = ''
      }
    } catch {
      recoveryRequired = true
      storageWarning.value = '本地记录无法读取，已打开示例。当前内容未保存；旧数据不会自动覆盖，请清空演示数据后重新开始。'
    }
    const ids = new Set<string>()
    state.creations.forEach(c => {
      Object.values(c.drafts).forEach(d => d?.references.forEach(r => ids.add(r.id)))
      c.rounds.forEach(r => r.params.references.forEach(image => ids.add(image.id)))
    })
    await Promise.all([...ids].map(async id => {
      try {
        const blob = await imageOperation('get', id)
        if (blob && !disposed) imageUrls[id] = URL.createObjectURL(blob)
        else if (!disposed) storageWarning.value = '部分参考图已无法读取，请移除后重新上传。'
      } catch { storageWarning.value = '参考图读取失败，请检查浏览器存储权限。' }
    }))
    if (disposed) return
    ready.value = true
    // Interrupted mock jobs resume locally, without network generation requests.
    state.creations.forEach(c => c.rounds.forEach(r => r.tasks.filter(t => t.status === 'running').forEach((t, i) => schedule(c.id, r, t, 2400 + i * 700))))
  })
  onUnmounted(() => {
    disposed = true
    timers.forEach(clearTimeout)
    clearTimeout(noticeTimer)
    Object.values(imageUrls).forEach(URL.revokeObjectURL)
  })
  return { state, active, draft, ready, uploading, notice, storageWarning, mobileTab, scenario, imageUrls, notify, addRecord, selectRecord, selectScenario, setMode, rename, generate, retry, finishDemo, reuse, upload, useAsReference, download, clearData }
}
