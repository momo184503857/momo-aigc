import http from './http'

/** 制作买家秀：单个条目（与后端 buyer_show_batch_items 左联 generation_tasks 的返回对齐） */
export interface BatchItemRow {
  id: number
  batchId: string
  productId: string
  mainImageUrl: string
  prompt: string
  taskId: number | null
  toapisTaskId: string | null
  status: string // pending|submitted|in_progress|completed|failed（有 task 时取 task 状态）
  progress: number
  errorMessage: string | null
  sortOrder: number
  createdAt: string
  model?: string
  resolution?: string
  aspectRatio?: string
  resultImageUrls?: string[]
  inputImageUrls?: string[]
  completedAt?: string | null
}

export interface CreateBatchItem {
  productId: string
  mainImageUrl: string
  prompt: string
}

export interface UpdateBatchItem {
  prompt?: string
  taskId?: number | null
  toapisTaskId?: string | null
  status?: string
  progress?: number
  errorMessage?: string | null
}

export const buyerShowBatchApi = {
  /** 列出当前用户的全部条目（带最新任务状态/结果） */
  listItems() {
    return http.get('/buyer-show-batch/items')
  },
  /** 批量新增（一次上传一组） */
  createBatch(items: CreateBatchItem[]) {
    return http.post('/buyer-show-batch/items', { items })
  },
  /** 更新单条（改提示词 / 回写任务链接与状态） */
  updateItem(id: number, data: UpdateBatchItem) {
    return http.patch(`/buyer-show-batch/items/${id}`, data)
  },
  /** 删除单条 */
  deleteItem(id: number) {
    return http.delete(`/buyer-show-batch/items/${id}`)
  },
  /** 清空当前用户全部条目 */
  deleteAll() {
    return http.delete('/buyer-show-batch/all')
  },
}
