import express from 'express'
import cors from 'cors'
import { config } from './config.js'
import { seed } from './db/seed.js'
import { authRouter } from './routes/auth.js'
import { meRouter } from './routes/me.js'
import { tasksRouter } from './routes/tasks.js'
import { templatesRouter } from './routes/templates.js'
import { ossRouter } from './routes/oss.js'
import { adminUsersRouter } from './routes/admin/users.js'
import { adminTasksRouter } from './routes/admin/tasks.js'
import { adminTemplatesRouter } from './routes/admin/templates.js'
import { adminStatsRouter } from './routes/admin/stats.js'

const app = express()

app.use(cors())
app.use(express.json())

// Initialize database
seed()

// Routes
app.use('/api/auth', authRouter)
app.use('/api/me', meRouter)
app.use('/api/oss', ossRouter)
app.use('/api/templates', templatesRouter)
app.use('/api/tasks', tasksRouter)
app.use('/api/admin/users', adminUsersRouter)
app.use('/api/admin/tasks', adminTasksRouter)
app.use('/api/admin/templates', adminTemplatesRouter)
app.use('/api/admin/stats', adminStatsRouter)

app.listen(config.port, () => {
  console.log(`[Server] momoAigc server running on http://localhost:${config.port}`)
})
