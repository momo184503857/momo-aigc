import http from './http'

export interface CanvasProject {
  id: number
  name: string
  description: string
  notes: string
  thumbnail: string | null
  workflow_data: string
  node_count: number
  created_at: string
  updated_at: string
}

export interface CanvasAsset {
  id: string
  file_name: string
  file_path: string
  preview_url: string
  size: number
  node_id: string
  node_title: string
  project_id: number | null
  created_at: string
}

export const canvasApi = {
  // ─── Projects ───

  listProjects(): Promise<CanvasProject[]> {
    return http.get('/canvas/projects').then((r) => r.data.data)
  },

  getProject(id: number | string): Promise<CanvasProject> {
    return http.get(`/canvas/projects/${id}`).then((r) => r.data.data)
  },

  createProject(data: {
    name?: string
    description?: string
    notes?: string
    thumbnail?: string | null
    workflowData?: string
  }): Promise<CanvasProject> {
    return http.post('/canvas/projects', data).then((r) => r.data.data)
  },

  updateProject(
    id: number | string,
    data: {
      name?: string
      description?: string
      notes?: string
      thumbnail?: string | null
      workflowData?: string
      nodeCount?: number
    }
  ): Promise<CanvasProject> {
    return http.put(`/canvas/projects/${id}`, data).then((r) => r.data.data)
  },

  deleteProject(id: number | string): Promise<void> {
    return http.delete(`/canvas/projects/${id}`).then(() => undefined)
  },

  duplicateProject(id: number | string): Promise<CanvasProject> {
    return http.post(`/canvas/projects/${id}/duplicate`).then((r) => r.data.data)
  },

  importProject(workflowJson: string): Promise<CanvasProject> {
    return http.post('/canvas/projects/import', { workflowJson }).then((r) => r.data.data)
  },

  // ─── Assets ───

  listAssets(params?: { page?: number; pageSize?: number; projectId?: number | string }): Promise<{
    assets: CanvasAsset[]
    total: number
    page: number
    totalPages: number
  }> {
    return http.get('/canvas/assets', { params }).then((r) => r.data.data)
  },

  addAsset(data: {
    id?: string
    fileName: string
    filePath: string
    previewUrl?: string
    size?: number
    nodeId?: string
    nodeTitle?: string
    projectId?: number | string
  }): Promise<{ id: string }> {
    return http.post('/canvas/assets', data).then((r) => r.data.data)
  },

  deleteAsset(id: string): Promise<void> {
    return http.delete(`/canvas/assets/${id}`).then(() => undefined)
  },

  // ─── AI Chat (text model proxy) ───

  chat(request: {
    /** 模型名（旧画布存量节点兜底：服务端按名全局查一次） */
    model: string
    /** 渠道模型 id（按目录解析；优先于 model 名） */
    channelModelId?: number
    messages: Array<{ role: string; content: unknown }>
    temperature?: number
    maxTokens?: number
  }): Promise<{ text: string }> {
    // 文字模型（尤其带参考图的多模态推理）响应较慢，单独放宽超时，避开全局 15s 限制
    return http.post('/canvas-ai/chat', request, { timeout: 900000 }).then((r) => r.data.data)
  },
}
