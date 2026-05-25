import http from './http'

export const ossApi = {
  async upload(file: File) {
    const formData = new FormData()
    formData.append('file', file)
    // Don't set Content-Type — axios sets it with proper boundary for FormData
    const res = await http.post('/oss/upload', formData, { timeout: 60000 })
    return res.data.data as { objectKey: string; publicUrl: string }
  },
}
