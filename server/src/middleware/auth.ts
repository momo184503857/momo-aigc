import { Request, Response, NextFunction } from 'express'
import { verifyToken } from '../utils/jwt.js'

export interface AuthRequest extends Request {
  user?: {
    userId: number
    username: string
    role: string
  }
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: '未登录，请先登录' })
    return
  }

  try {
    const token = header.slice(7)
    const payload = verifyToken(token)
    req.user = payload
    next()
  } catch {
    res.status(401).json({ success: false, error: '登录已过期，请重新登录' })
  }
}
