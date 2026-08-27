import http from './http'

export interface OssUploadToken {
  uploadUrl: string
  objectKey: string
  publicUrl: string
  ossBucket: string
  fields: Record<string, string>
}

export interface StorageModeInfo {
  /** direct=直接传（POST /api/oss/upload 经后端存本机磁盘）；oss=浏览器 PostObject 直传 bucket */
  mode: 'direct' | 'oss'
  /** 当前 OSS bucket 域名（oss 模式下用于识别已存图片 URL；direct 模式可能为空串） */
  ossHost: string
}

export interface UploadedFile {
  objectKey: string
  /** direct: /api/files/...（站内相对路径）；oss: bucket 公网 URL */
  publicUrl: string
  /** direct 恒为 'local' */
  ossBucket: string
}

/** 上传统一入口：按后端存储模式分流，调用方无感知（两种模式返回形状一致） */
export const ossApi = {
  async getMode(): Promise<StorageModeInfo> {
    // 不缓存：模式切换后立即生效；该接口仅读一次 DB，开销可忽略
    const res = await http.get('/oss/mode')
    return res.data.data as StorageModeInfo
  },

  async getUploadToken(file: File, scope: 'inputs' | 'templates' | 'materials' = 'inputs') {
    const res = await http.post('/oss/upload-token', {
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      scope,
    })
    return res.data.data as OssUploadToken
  },

  async upload(file: File, scope: 'inputs' | 'templates' | 'materials' = 'inputs'): Promise<UploadedFile> {
    const { mode } = await this.getMode()
    if (mode === 'direct') {
      // 直接传：文件交给后端落盘（server/data/uploads/），返回 /api/files/... 站内 URL
      const fd = new FormData()
      fd.append('file', file)
      fd.append('scope', scope)
      const res = await http.post('/oss/upload', fd, { timeout: 120_000 })
      const d = res.data.data as { objectKey: string; publicUrl: string; ossBucket?: string }
      return { objectKey: d.objectKey, publicUrl: d.publicUrl, ossBucket: d.ossBucket || 'local' }
    }

    const token = await this.getUploadToken(file, scope)
    const formData = new FormData()
    for (const [key, value] of Object.entries(token.fields)) {
      formData.append(key, value)
    }
    formData.append('file', file)

    const resp = await fetch(token.uploadUrl, {
      method: 'POST',
      body: formData,
    })

    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      throw new Error(`OSS upload failed (${resp.status})${text ? `: ${text}` : ''}`)
    }

    return { objectKey: token.objectKey, publicUrl: token.publicUrl, ossBucket: token.ossBucket }
  },

  async importResult(taskId: string, sourceUrl: string) {
    const res = await http.post(
      '/oss/import-result',
      { taskId, sourceUrl },
      { timeout: 130000 },
    )
    return res.data.data as {
      objectKey: string
      publicUrl: string
      contentType?: string
      sizeBytes?: number
      sourceConnectedMs?: number
      totalMs?: number
    }
  },
}
