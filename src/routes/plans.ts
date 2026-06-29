import { Router } from 'express'
import * as z from 'zod'
import { requireAuth, requireRole } from '../middlewares/auth'
import { planService } from '../services/planService'
import { isValidCurrency } from '../lib/money'

const router: Router = Router()

const createPlanSchema = z.object({
  name: z.string().min(1),
  // 最小單位整數，必須為正整數（DECISION #4）
  amount: z.number().int().positive(),
  currency: z.string().refine(isValidCurrency, 'Unsupported currency'),
  intervalDays: z.number().int().positive(),
})

router.get('/plans', async (_req, res) => {
  const plans = await planService.listActive()
  res.json(plans)
})

router.post('/plans', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const parsed = createPlanSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: z.flattenError(parsed.error) })
    return
  }

  const plan = await planService.create(parsed.data)
  res.status(201).json(plan)
})

export default router
