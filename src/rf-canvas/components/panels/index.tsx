/**
 * 各节点配置面板（R5）：模型下拉（数字 id 存储）、分辨率↔宽高比联动（R5.3）、
 * 双模式上传（R10）、pauseAfterRun 等。模型目录经 api 拉取（60s 缓存）。
 */
import { useEffect, useRef, useState } from 'react'
import type { RFFlowNode } from '../../types'
import { useRfStore } from '../../store'
import { fetchImageCatalog, fetchTextCatalog, uploadImage } from '../../api'
import { ensureImageCatalog } from '../../catalogSync'
import type { ImageAsset, ImageCatalogModel, TextCatalogGroup } from '../../types'

// ─── 目录 hooks ───

function useImageCatalog(): { models: ImageCatalogModel[]; loading: boolean } {
  const [models, setModels] = useState<ImageCatalogModel[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let cancelled = false
    void fetchImageCatalog()
      .then((list) => {
        if (!cancelled) setModels(list)
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])
  return { models, loading }
}

function useTextCatalog(): { groups: TextCatalogGroup[]; loading: boolean } {
  const [groups, setGroups] = useState<TextCatalogGroup[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let cancelled = false
    void fetchTextCatalog()
      .then((list) => {
        if (!cancelled) setGroups(list)
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])
  return { groups, loading }
}

// ─── text-input ───

function TextInputPanel({ node }: { node: RFFlowNode }) {
  const update = useRfStore((s) => s.updateNodeConfig)
  const text = typeof node.data.config.text === 'string' ? node.data.config.text : ''
  return (
    <div className="rf-form">
      <label className="rf-form__label">正文（多行）</label>
      <textarea
        className="rf-input rf-input--area"
        rows={8}
        value={text}
        placeholder="输入商品信息、卖点、补充说明等"
        onChange={(e) => update(node.id, { text: e.target.value })}
      />
    </div>
  )
}

// ─── image-input ───

const MAX_UPLOAD_IMAGES = 14

function ImageInputPanel({ node }: { node: RFFlowNode }) {
  const update = useRfStore((s) => s.updateNodeConfig)
  const notify = useRfStore((s) => s.notify)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const images: ImageAsset[] = Array.isArray(node.data.config.images) ? (node.data.config.images as ImageAsset[]) : []

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'))
    const room = MAX_UPLOAD_IMAGES - images.length
    if (list.length > room) {
      notify('error', `最多上传 ${MAX_UPLOAD_IMAGES} 张（还可传 ${room} 张）`)
    }
    const accepted = list.slice(0, Math.max(0, room))
    if (!accepted.length) return
    setUploading(true)
    try {
      const uploaded: ImageAsset[] = []
      for (const file of accepted) {
        const { url } = await uploadImage(file)
        uploaded.push({ url, fileName: file.name })
      }
      update(node.id, { images: [...images, ...uploaded] })
    } catch (err) {
      notify('error', `图片上传失败：${err instanceof Error ? err.message : '未知错误'}`)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const removeAt = (index: number) => {
    update(node.id, { images: images.filter((_, i) => i !== index) })
  }

  return (
    <div className="rf-form">
      <label className="rf-form__label">参考图（最多 {MAX_UPLOAD_IMAGES} 张，上传即刻存入站内存储）</label>
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void onFiles(e.target.files)} />
      <button className="rf-btn rf-btn--block" disabled={uploading || images.length >= MAX_UPLOAD_IMAGES} onClick={() => fileRef.current?.click()}>
        {uploading ? '上传中…' : images.length >= MAX_UPLOAD_IMAGES ? '已达上限' : '＋ 上传图片'}
      </button>
      {images.length > 0 && (
        <div className="rf-upload-list">
          {images.map((img, i) => (
            <div key={`${img.url}`} className="rf-upload-item">
              <img src={img.url} alt={img.fileName} className="rf-upload-item__img" />
              <span className="rf-upload-item__name" title={img.fileName}>
                {img.fileName}
              </span>
              <button className="rf-upload-item__remove" onClick={() => removeAt(i)} title="移除">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── text-ai ───

function TextAiPanel({ node }: { node: RFFlowNode }) {
  const update = useRfStore((s) => s.updateNodeConfig)
  const { groups, loading } = useTextCatalog()
  const config = node.data.config
  const channelModelId = typeof config.channelModelId === 'number' ? config.channelModelId : null
  const taskPrompt = typeof config.taskPrompt === 'string' ? config.taskPrompt : ''
  const detailPrompt = typeof config.detailPrompt === 'string' ? config.detailPrompt : ''
  const temperature = typeof config.temperature === 'number' ? config.temperature : ''
  const maxTokens = typeof config.maxTokens === 'number' ? config.maxTokens : ''

  return (
    <div className="rf-form">
      <label className="rf-form__label">模型（渠道分组 · 存储数字 id）</label>
      <select
        className="rf-input rf-select"
        value={channelModelId ?? ''}
        onChange={(e) => update(node.id, { channelModelId: e.target.value ? Number(e.target.value) : null })}
      >
        <option value="">{loading ? '目录加载中…' : '请选择文字模型'}</option>
        {groups.map((group) => (
          <optgroup key={group.providerId} label={group.providerName}>
            {group.models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.displayName}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      <label className="rf-form__label">任务指令</label>
      <textarea
        className="rf-input rf-input--area"
        rows={4}
        value={taskPrompt}
        placeholder="要模型做什么（如：写一句商品文案）"
        onChange={(e) => update(node.id, { taskPrompt: e.target.value })}
      />

      <label className="rf-form__label">补充指令</label>
      <textarea
        className="rf-input rf-input--area"
        rows={3}
        value={detailPrompt}
        placeholder="风格/约束等补充说明（可选）"
        onChange={(e) => update(node.id, { detailPrompt: e.target.value })}
      />

      <div className="rf-form__row">
        <div className="rf-form__col">
          <label className="rf-form__label">temperature（可选）</label>
          <input
            className="rf-input"
            type="number"
            step="0.1"
            min="0"
            max="2"
            value={temperature}
            onChange={(e) => update(node.id, { temperature: e.target.value === '' ? undefined : Number(e.target.value) })}
          />
        </div>
        <div className="rf-form__col">
          <label className="rf-form__label">maxTokens（可选）</label>
          <input
            className="rf-input"
            type="number"
            min="1"
            step="1"
            value={maxTokens}
            onChange={(e) => update(node.id, { maxTokens: e.target.value === '' ? undefined : Number(e.target.value) })}
          />
        </div>
      </div>

      <label className="rf-check">
        <input
          type="checkbox"
          checked={config.pauseAfterRun === true}
          onChange={(e) => update(node.id, { pauseAfterRun: e.target.checked })}
        />
        运行后暂停（层边界暂停，检查器可继续）
      </label>
    </div>
  )
}

// ─── prompt-splitter ───

function PromptSplitterPanel({ node }: { node: RFFlowNode }) {
  const update = useRfStore((s) => s.updateNodeConfig)
  const config = node.data.config
  const delimiter = typeof config.delimiter === 'string' ? config.delimiter : '---'
  return (
    <div className="rf-form">
      <label className="rf-form__label">分隔符</label>
      <input className="rf-input" value={delimiter} placeholder="---" onChange={(e) => update(node.id, { delimiter: e.target.value })} />
      <label className="rf-check">
        <input
          type="checkbox"
          checked={config.stripThinkBlocks !== false}
          onChange={(e) => update(node.id, { stripThinkBlocks: e.target.checked })}
        />
        剥除 &lt;think&gt; 块
      </label>
      <label className="rf-check">
        <input
          type="checkbox"
          checked={config.pauseAfterRun === true}
          onChange={(e) => update(node.id, { pauseAfterRun: e.target.checked })}
        />
        运行后暂停
      </label>
      <div className="rf-form__hint">各段内容可在「结果」页签人工改写；改写后下游节点标为待更新。</div>
    </div>
  )
}

// ─── image-ai ───

function ImageAiPanel({ node }: { node: RFFlowNode }) {
  const update = useRfStore((s) => s.updateNodeConfig)
  const { models, loading } = useImageCatalog()
  const config = node.data.config
  const logicalModelId = typeof config.logicalModelId === 'number' ? config.logicalModelId : null
  const model = models.find((m) => m.id === logicalModelId) ?? null
  const resolution = typeof config.resolution === 'string' ? config.resolution : ''
  const aspectRatio = typeof config.aspectRatio === 'string' ? config.aspectRatio : ''
  const n = typeof config.n === 'number' ? config.n : 1

  useEffect(() => {
    void ensureImageCatalog()
  }, [])

  const price = model && resolution ? model.pricing[resolution] : undefined

  const selectModel = (idStr: string) => {
    if (!idStr) {
      update(node.id, { logicalModelId: null, resolution: '', aspectRatio: '' })
      return
    }
    const nextModel = models.find((m) => m.id === Number(idStr))
    if (!nextModel) return
    const nextResolution = nextModel.capabilities.resolutions.includes(resolution) ? resolution : nextModel.capabilities.resolutions[0] ?? ''
    const ratios = nextResolution ? nextModel.capabilities.aspectRatiosByResolution[nextResolution] ?? [] : []
    const nextRatio = ratios.includes(aspectRatio) ? aspectRatio : ratios[0] ?? ''
    update(node.id, {
      logicalModelId: nextModel.id,
      resolution: nextResolution,
      aspectRatio: nextRatio,
    })
  }

  const selectResolution = (res: string) => {
    const ratios = model?.capabilities.aspectRatiosByResolution[res] ?? []
    const nextRatio = ratios.includes(aspectRatio) ? aspectRatio : ratios[0] ?? ''
    update(node.id, { resolution: res, aspectRatio: nextRatio })
  }

  const ratioOptions = resolution ? model?.capabilities.aspectRatiosByResolution[resolution] ?? [] : []

  return (
    <div className="rf-form">
      <label className="rf-form__label">模型（逻辑模型 · 存储数字 id）</label>
      <select className="rf-input rf-select" value={logicalModelId ?? ''} onChange={(e) => selectModel(e.target.value)}>
        <option value="">{loading ? '目录加载中…' : '请选择生图模型'}</option>
        {models.map((m) => {
          const firstRes = m.capabilities.resolutions[0]
          const p = resolution && m.pricing[resolution] !== undefined ? m.pricing[resolution] : m.pricing[firstRes]
          return (
            <option key={m.id} value={m.id}>
              {m.displayName}
              {p !== undefined ? `（${p} 积分/张${resolution && m.pricing[resolution] === undefined ? ` · ${firstRes} 档` : ''}）` : ''}
            </option>
          )
        })}
      </select>

      <div className="rf-form__row">
        <div className="rf-form__col">
          <label className="rf-form__label">分辨率</label>
          <select className="rf-input rf-select" value={resolution} disabled={!model} onChange={(e) => selectResolution(e.target.value)}>
            <option value="">{model ? '请选择' : '先选模型'}</option>
            {(model?.capabilities.resolutions ?? []).map((res) => (
              <option key={res} value={res}>
                {res}
              </option>
            ))}
          </select>
        </div>
        <div className="rf-form__col">
          <label className="rf-form__label">宽高比</label>
          <select
            className="rf-input rf-select"
            value={aspectRatio}
            disabled={!model || !ratioOptions.length}
            onChange={(e) => update(node.id, { aspectRatio: e.target.value })}
          >
            <option value="">{ratioOptions.length ? '请选择' : '-'}</option>
            {ratioOptions.map((ratio) => (
              <option key={ratio} value={ratio}>
                {ratio}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="rf-form__row">
        <div className="rf-form__col">
          <label className="rf-form__label">张数（1–5）</label>
          <select className="rf-input rf-select" value={n} onChange={(e) => update(node.id, { n: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="rf-form__col rf-form__col--price">
          <label className="rf-form__label">预计积分</label>
          <span className="rf-price">{price !== undefined ? `${(price * n).toFixed(2)}（${price} × ${n}）` : '—'}</span>
        </div>
      </div>

      <div className="rf-form__hint">
        提交即预扣积分、失败/超时自动退款（服务端规则）。参考图上限：{model?.capabilities.maxReferenceImages ?? 14} 张。
      </div>
    </div>
  )
}

// ─── 透传/保存节点的信息面板 ───

function InfoPanel({ node, lines }: { node: RFFlowNode; lines: string[] }) {
  return (
    <div className="rf-form">
      <div className="rf-form__hint">{node.data.title}</div>
      {lines.map((line) => (
        <div key={line} className="rf-form__hint">
          {line}
        </div>
      ))}
    </div>
  )
}

// ─── 分发 ───

export function ConfigPanelFor({ node }: { node: RFFlowNode }) {
  switch (node.type) {
    case 'text-input':
      return <TextInputPanel node={node} />
    case 'image-input':
      return <ImageInputPanel node={node} />
    case 'text-ai':
      return <TextAiPanel node={node} />
    case 'prompt-splitter':
      return <PromptSplitterPanel node={node} />
    case 'image-ai':
      return <ImageAiPanel node={node} />
    case 'text-preview':
      return <InfoPanel node={node} lines={['透传并展示上游文本。']} />
    case 'image-preview':
      return <InfoPanel node={node} lines={['透传并展示上游图片，点击卡片缩略图可放大。']} />
    case 'save':
      return <InfoPanel node={node} lines={['收集上游图片/文本写入本项目「成果面板」。', '可在工具栏打开成果面板查看产出。']} />
    default:
      return <InfoPanel node={node} lines={['该节点无配置项。']} />
  }
}
