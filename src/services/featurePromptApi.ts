import http from './http'

export interface FeaturePromptItem {
  id: number
  feature_id: string
  model_id: string
  system_prompt: string
  user_prompt_label: string
  user_prompt_placeholder: string
  created_at: string
  updated_at: string
}

export const featurePromptApi = {
  get(featureId: string) {
    return http.get(`/feature-prompts/${featureId}`)
  },
  listAll() {
    return http.get('/admin/feature-prompts')
  },
  update(id: number, data: {
    system_prompt?: string
    user_prompt_label?: string
    user_prompt_placeholder?: string
  }) {
    return http.patch(`/admin/feature-prompts/${id}`, data)
  },
}
