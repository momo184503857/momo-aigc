import http from './http'

export const ossApi = {
  getUploadToken(filename: string, mime_type: string, size_bytes: number) {
    return http.post('/oss/upload-token', { filename, mime_type, size_bytes })
  },
}
