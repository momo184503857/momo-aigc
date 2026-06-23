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
  n?: number
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

/** 任务历史：批次元数据（含聚合统计） */
export interface BuyerShowBatch {
  id: number
  userId: number
  batchId: string
  name: string
  status: 'active' | 'archived'
  createdAt: string
  archivedAt: string | null
  itemCount: number
  completedCount: number
  failedCount: number
}

export interface UpdateBuyerShowBatch {
  name?: string
  status?: 'archived'
}

export const buyerShowBatchApi = {
  /** 列出条目（默认只返回当前任务 active 批次）；传 batchId 则列出指定批次 */
  listItems(batchId?: string) {
    return http.get('/buyer-show-batch/items', { params: batchId ? { batchId } : {} })
  },
  /** 批量新增（开启新任务；自动归档旧的当前任务）。返回 { batchId, ids } */
  createBatch(items: CreateBatchItem[], name?: string) {
    return http.post('/buyer-show-batch/items', { items, name: name ?? '' })
  },
  /** 更新单条（改提示词 / 回写任务链接与状态） */
  updateItem(id: number, data: UpdateBatchItem) {
    return http.patch(`/buyer-show-batch/items/${id}`, data)
  },
  /** 删除单条 */
  deleteItem(id: number) {
    return http.delete(`/buyer-show-batch/items/${id}`)
  },
  /** 清空当前用户全部条目与批次 */
  deleteAll() {
    return http.delete('/buyer-show-batch/all')
  },

  // ── 任务历史 ──
  /** 列出批次（默认仅 archived 历史；includeActive=true 也返回 active） */
  listBatches(includeActive = false) {
    return http.get('/buyer-show-batch/batches', {
      params: includeActive ? { includeActive: '1' } : {},
    })
  },
  /** 某批次的全部行（任务详情） */
  getBatchItems(batchId: string) {
    return http.get(`/buyer-show-batch/batches/${batchId}/items`)
  },
  /** 改名 / 归档 */
  updateBatch(batchId: string, data: UpdateBuyerShowBatch) {
    return http.patch(`/buyer-show-batch/batches/${batchId}`, data)
  },
  /** 删除整个任务 */
  deleteBatch(batchId: string) {
    return http.delete(`/buyer-show-batch/batches/${batchId}`)
  },
}
