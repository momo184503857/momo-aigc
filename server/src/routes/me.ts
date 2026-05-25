import { Router } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'

export const meRouter = Router()

meRouter.get('/', authMiddleware, (req: AuthRequest, res) => {
  res.json({
    success: true,
    data: {
      id: req.user!.userId,
      username: req.user!.username,
      role: req.user!.role,
    },
  })
})
