import { Router } from 'express'
import { authMiddleware } from '../middleware/auth.js'

/**
 * 旧生图代理端点（ai-provider 重构后退役，迁移手册 §5「本次上线」阶段）。
 *
 * /upload、/create-task、/task-status 已由编排层（POST /api/generations、
 * GET /api/generations/:id/status）取代，返回 410 提示新端点；保留一个版本后删除。
 * /health 精简为目录状态摘要（旧缓存页防报错）。
 */

export const toapisProxyRouter = Router()

toapisProxyRouter.use(authMiddleware)

function gone(res: any, hint: string): void {
  res.status(410).json({
    success: false,
    error: `该接口已升级退役（AI 接入体系重构），${hint}。请刷新页面使用新版本。`,
  })
}

toapisProxyRouter.get('/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      deprecated: true,
      message: '生图已迁移到多渠道体系，请使用 GET /api/models/catalog',
    },
  })
})

toapisProxyRouter.post('/upload', (_req, res) => gone(res, '参考图请直传 OSS（/api/oss/upload-token）'))
toapisProxyRouter.post('/create-task', (_req, res) => gone(res, '请使用 POST /api/generations'))
toapisProxyRouter.get('/task-status/:id', (_req, res) => gone(res, '请使用 GET /api/generations/:id/status'))
