import express from 'express'
import cors from 'cors'
import { config } from './config.js'
import { seed } from './db/seed.js'
import { authRouter } from './routes/auth.js'
import { meRouter } from './routes/me.js'
import { tasksRouter } from './routes/tasks.js'
import { templatesRouter } from './routes/templates.js'
import { ossRouter } from './routes/oss.js'
import { promptsRouter } from './routes/prompts.js'
import { adminUsersRouter } from './routes/admin/users.js'
import { adminTasksRouter } from './routes/admin/tasks.js'
import { adminTemplatesRouter } from './routes/admin/templates.js'
import { adminStatsRouter } from './routes/admin/stats.js'
import { featurePromptsRouter, adminFeaturePromptsRouter } from './routes/featurePrompts.js'
import { proxyRouter } from './routes/proxy.js'
import { toapisProxyRouter } from './routes/toapis-proxy.js'
import { adminToapisKeyRouter } from './routes/admin/toapis-key.js'
import { pointsRouter, adminPointsRouter } from './routes/points.js'
import { canvasRouter } from './routes/canvas.js'
import { canvasAiRouter } from './routes/canvas-ai.js'
import { photographyRouter } from './routes/photography.js'
import { adminPhotographyRouter } from './routes/admin/photography.js'

const app = express()

app.use(cors())
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ limit: '50mb', extended: true }))

// Initialize database
seed()

// Routes
app.use('/api/auth', authRouter)
app.use('/api/me', meRouter)
app.use('/api/oss', ossRouter)
app.use('/api/templates', templatesRouter)
app.use('/api/tasks', tasksRouter)
app.use('/api/prompts', promptsRouter)
app.use('/api/admin/users', adminUsersRouter)
app.use('/api/admin/tasks', adminTasksRouter)
app.use('/api/admin/templates', adminTemplatesRouter)
app.use('/api/admin/stats', adminStatsRouter)
app.use('/api/feature-prompts', featurePromptsRouter)
app.use('/api/admin/feature-prompts', adminFeaturePromptsRouter)
app.use('/api/proxy', proxyRouter)
app.use('/api/toapis', toapisProxyRouter)
app.use('/api/admin/toapis', adminToapisKeyRouter)
app.use('/api/points', pointsRouter)
app.use('/api/admin/points', adminPointsRouter)
app.use('/api/canvas', canvasRouter)
app.use('/api/canvas-ai', canvasAiRouter)
app.use('/api/photography', photographyRouter)
app.use('/api/admin/photography', adminPhotographyRouter)

app.listen(config.port, () => {
  console.log(`[Server] momoAigc server running on http://localhost:${config.port}`)
})
