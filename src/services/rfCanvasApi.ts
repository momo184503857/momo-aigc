import http from './http'

/** AI画布 Pro+（React Flow 版）项目（列表项，不含 graph） */
export interface RfProject {
  id: number
  name: string
  nodeCount: number
  createdAt: string
  updatedAt: string
}

/** AI画布 Pro+ 项目详情（含 graph 对象，服务端已 parse） */
export interface RfProjectDetail extends RfProject {
  graph: Record<string, unknown>
}

export const rfCanvasApi = {
  listProjects(): Promise<RfProject[]> {
    return http.get('/rf-canvas/projects').then((r) => r.data.data)
  },

  getProject(id: number | string): Promise<RfProjectDetail> {
    return http.get(`/rf-canvas/projects/${id}`).then((r) => r.data.data)
  },

  createProject(name: string): Promise<RfProject> {
    return http.post('/rf-canvas/projects', { name }).then((r) => r.data.data)
  },

  renameProject(id: number | string, name: string): Promise<void> {
    return http.patch(`/rf-canvas/projects/${id}`, { name }).then(() => undefined)
  },

  duplicateProject(id: number | string): Promise<RfProject> {
    return http.post(`/rf-canvas/projects/${id}/duplicate`).then((r) => r.data.data)
  },

  deleteProject(id: number | string): Promise<void> {
    return http.delete(`/rf-canvas/projects/${id}`).then(() => undefined)
  },
}
