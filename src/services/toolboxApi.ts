import http from './http'
export const toolboxApi = {
  async images(): Promise<Record<string, string>> {
    const res = await http.get('/toolbox/images')
    return res.data.data
  },
  async saveImage(id: string, imageUrl: string): Promise<void> {
    await http.put(`/admin/toolbox/images/${id}`, { imageUrl })
  },
}
