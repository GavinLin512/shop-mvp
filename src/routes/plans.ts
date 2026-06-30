import { Router } from 'express'
import * as z from 'zod'
import { requireAuth, requireRole } from '../middlewares/auth'
import { planService } from '../services/planService'
import { CreatePlanSchema } from '../schemas/plan'

const router: Router = Router()

router.get('/plans', async (_req, res) => {
  const plans = await planService.listActive()
  res.json(plans)
})

router.post('/plans', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const parsed = CreatePlanSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: z.flattenError(parsed.error) })
    return
  }

  const plan = await planService.create(parsed.data)
  res.status(201).json(plan)
})

export default router
