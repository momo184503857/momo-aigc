import { Router } from 'express'
import { db } from '../db/index.js'

interface PhotographyElementRow {
  id: number
  name: string
  label: string
  max_images: number
  sort_order: number
  status: string
  created_at: string
  updated_at: string
}

interface ElementPromptRow {
  id: number
  element_id: number
  model_id: string
  system_prompt: string
  created_at: string
  updated_at: string
}

export const photographyRouter = Router()

// GET /api/photography/elements
// Returns all active elements with their prompts grouped by model
photographyRouter.get('/elements', (_req, res) => {
  const elements = db.prepare(
    'SELECT * FROM photography_elements WHERE status = ? ORDER BY sort_order ASC'
  ).all('active') as PhotographyElementRow[]

  const prompts = db.prepare(
    `SELECT pep.* FROM photography_element_prompts pep
     JOIN photography_elements e ON e.id = pep.element_id
     WHERE e.status = ?`
  ).all('active') as ElementPromptRow[]

  // Nest prompts under each element, keyed by model_id
  const elementsWithPrompts = elements.map(el => {
    const elPrompts = prompts.filter(p => p.element_id === el.id)
    const promptMap: Record<string, string> = {}
    elPrompts.forEach(p => { promptMap[p.model_id] = p.system_prompt })
    return { ...el, prompts: promptMap }
  })

  res.json({ success: true, data: elementsWithPrompts })
})
