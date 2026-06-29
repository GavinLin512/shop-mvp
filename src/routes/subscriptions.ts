import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middlewares/auth'
import { createSubscriptionService } from '../services/subscriptionService'
import { AppError } from '../lib/errors'
import type { PaymentProvider } from '../providers/PaymentProvider'

const createSchema = z.object({
  planId: z.string(),
})

/**
 * Router 工廠 — provider 由外部注入，測試可傳入 fake provider 驗證解耦。
 */
export function createSubscriptionRouter(provider: PaymentProvider): Router {
  const router = Router()
  const service = createSubscriptionService(provider)

  // POST /subscriptions — 建訂閱(INCOMPLETE) + 首單(PENDING)
  router.post('/subscriptions', requireAuth, async (req, res) => {
    const parsed = createSchema.safeParse(req.body)
    if (!parsed.success) throw new AppError(400, 'planId is required')

    const sub = await service.create({
      memberId: req.member!.id,
      planId: parsed.data.planId,
    })

    res.status(201).json(sub)
  })

  // GET /subscriptions/:id — 本人或 admin 可讀
  router.get('/subscriptions/:id', requireAuth, async (req, res) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const sub = await service.findById({
      id,
      requesterId: req.member!.id,
      requesterRole: req.member!.role,
    })

    res.json(sub)
  })

  return router
}
