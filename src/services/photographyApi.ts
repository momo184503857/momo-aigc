import http from './http'

export interface PhotographyElement {
  id: number
  name: string
  label: string
  max_images: number
  sort_order: number
  status: string
  created_at: string
  updated_at: string
  prompts: Record<string, string>  // model_id → system_prompt
}

export interface PhotographyElementPrompt {
  id: number
  element_id: number
  element_name: string
  element_label: string
  model_id: string
  system_prompt: string
  created_at: string
  updated_at: string
}

export const photographyApi = {
  /** 获取所有活跃元素（含每模型的 prompt） */
  getElements() {
    return http.get<{ success: boolean; data: PhotographyElement[] }>('/photography/elements')
  },

  // ── Admin ──

  /** 列出所有元素（含已禁用的） */
  listElements() {
    return http.get<{ success: boolean; data: PhotographyElement[] }>('/admin/photography/elements')
  },

  /** 创建元素 */
  createElement(data: { name: string; label: string; max_images?: number; sort_order?: number }) {
    return http.post<{ success: boolean; data: PhotographyElement }>('/admin/photography/elements', data)
  },

  /** 更新元素 */
  updateElement(id: number, data: {
    name?: string; label?: string; max_images?: number; sort_order?: number; status?: string
  }) {
    return http.put<{ success: boolean; data: PhotographyElement }>(`/admin/photography/elements/${id}`, data)
  },

  /** 删除元素 */
  deleteElement(id: number) {
    return http.delete<{ success: boolean }>(`/admin/photography/elements/${id}`)
  },

  /** 列出所有元素的 prompt */
  listElementPrompts() {
    return http.get<{ success: boolean; data: PhotographyElementPrompt[] }>('/admin/photography/element-prompts')
  },

  /** 更新单条 prompt */
  updateElementPrompt(id: number, data: { system_prompt: string }) {
    return http.patch<{ success: boolean; data: PhotographyElementPrompt }>(`/admin/photography/element-prompts/${id}`, data)
  },
}
