import { Response, NextFunction } from 'express'
import { AuthRequest } from './auth.js'

export function adminMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ success: false, error: '无权限，仅管理员可操作' })
    return
  }
  next()
}
