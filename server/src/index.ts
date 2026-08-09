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
import { adminActivityRouter } from './routes/admin/activity.js'
import { adminTemplatesRouter } from './routes/admin/templates.js'
import { adminStatsRouter } from './routes/admin/stats.js'
import { featurePromptsRouter, adminFeaturePromptsRouter } from './routes/featurePrompts.js'
import { proxyRouter } from './routes/proxy.js'
import { toapisProxyRouter } from './routes/toapis-proxy.js'
import { adminToapisKeyRouter } from './routes/admin/toapis-key.js'
import { meToapisKeyRouter } from './routes/me-toapis-key.js'
import { pointsRouter } from './routes/points.js'
import { canvasRouter } from './routes/canvas.js'
import { canvasAiRouter } from './routes/canvas-ai.js'
import { photographyRouter } from './routes/photography.js'
import { adminPhotographyRouter } from './routes/admin/photography.js'
import { buyerShowRouter, adminBuyerShowRouter } from './routes/buyerShow.js'
import { buyerShowBatchRouter } from './routes/buyerShowBatch.js'
import { worksRouter } from './routes/works.js'
import { adminWorksRouter } from './routes/admin/works.js'
import { promptCasesRouter } from './routes/promptCases.js'
import { adminPromptCasesRouter } from './routes/admin/promptCases.js'
import { promptCardsRouter } from './routes/promptCards.js'
import { adminPromptModulesRouter } from './routes/admin/promptModules.js'

const app = express()

app.use(cors())
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ limit: '50mb', extended: true }))

// Initialize database
seed()

// Routes
app.use('/api/auth', authRouter)
app.use('/api/me', meRouter)
app.use('/api/me/toapis', meToapisKeyRouter)
app.use('/api/oss', ossRouter)
app.use('/api/templates', templatesRouter)
app.use('/api/tasks', tasksRouter)
app.use('/api/prompts', promptsRouter)
app.use('/api/admin/users', adminUsersRouter)
app.use('/api/admin/tasks', adminTasksRouter)
app.use('/api/admin/activity', adminActivityRouter)
app.use('/api/admin/templates', adminTemplatesRouter)
app.use('/api/admin/stats', adminStatsRouter)
app.use('/api/feature-prompts', featurePromptsRouter)
app.use('/api/admin/feature-prompts', adminFeaturePromptsRouter)
app.use('/api/proxy', proxyRouter)
app.use('/api/toapis', toapisProxyRouter)
app.use('/api/admin/toapis', adminToapisKeyRouter)
app.use('/api/points', pointsRouter)
app.use('/api/canvas', canvasRouter)
app.use('/api/canvas-ai', canvasAiRouter)
app.use('/api/photography', photographyRouter)
app.use('/api/admin/photography', adminPhotographyRouter)
app.use('/api/buyer-show', buyerShowRouter)
app.use('/api/admin/buyer-show', adminBuyerShowRouter)
app.use('/api/buyer-show-batch', buyerShowBatchRouter)
app.use('/api/works', worksRouter)
app.use('/api/admin/works', adminWorksRouter)
app.use('/api/prompt-cases', promptCasesRouter)
app.use('/api/admin/prompt-cases', adminPromptCasesRouter)
app.use('/api/prompt-cards', promptCardsRouter)
app.use('/api/admin/prompt-modules', adminPromptModulesRouter)

app.listen(config.port, () => {
  console.log(`[Server] momoAigc server running on http://localhost:${config.port}`)
})
