import http from './http'

/** AI画布 Pro（Node-RED 版）项目 */
export interface FlowProject {
  id: number
  name: string
  node_count: number
  created_at: string
  updated_at: string
}

export interface FlowEditorSession {
  editorUrl: string
  /** 实例 token（用户自己的应用 JWT），iframe ?access_token= 桥接用 */
  accessToken: string
}

export const flowCanvasApi = {
  listProjects(): Promise<FlowProject[]> {
    return http.get('/flow-canvas/projects').then((r) => r.data.data)
  },

  getProject(id: number | string): Promise<FlowProject> {
    return http.get(`/flow-canvas/projects/${id}`).then((r) => r.data.data)
  },

  createProject(name?: string): Promise<FlowProject> {
    return http.post('/flow-canvas/projects', { name }).then((r) => r.data.data)
  },

  renameProject(id: number | string, name: string): Promise<FlowProject> {
    return http.put(`/flow-canvas/projects/${id}`, { name }).then((r) => r.data.data)
  },

  duplicateProject(id: number | string): Promise<FlowProject> {
    return http.post(`/flow-canvas/projects/${id}/duplicate`).then((r) => r.data.data)
  },

  deleteProject(id: number | string): Promise<void> {
    return http.delete(`/flow-canvas/projects/${id}`).then(() => undefined)
  },

  /** 打开编辑器会话：确保 (用户,项目) 的 Node-RED 子进程实例在运行 */
  openSession(id: number | string): Promise<FlowEditorSession> {
    return http
      .post(`/flow-canvas/projects/${id}/session`, {}, { timeout: 60000 })
      .then((r) => r.data.data)
  },
}
