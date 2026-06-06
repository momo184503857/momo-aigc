import http from './http'

export interface OssUploadToken {
  uploadUrl: string
  objectKey: string
  publicUrl: string
  ossBucket: string
  fields: Record<string, string>
}

export const ossApi = {
  async getUploadToken(file: File, scope: 'inputs' | 'templates' = 'inputs') {
    const res = await http.post('/oss/upload-token', {
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      scope,
    })
    return res.data.data as OssUploadToken
  },

  async upload(file: File, scope: 'inputs' | 'templates' = 'inputs') {
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
    }
  },
}
