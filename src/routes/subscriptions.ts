import { Router } from 'express'
import { requireAuth, requireRole } from '../middlewares/auth'
import { createSubscriptionService } from '../services/subscriptionService'
import { AppError } from '../lib/errors'
import type { ProviderRegistry } from '../providers/ProviderRegistry'
import { CreateSubscriptionSchema } from '../schemas/subscription'

/**
 * Router 工廠 — registry 由外部注入，測試可傳入 fake registry 驗證解耦。
 */
export function createSubscriptionRouter(registry: ProviderRegistry): Router {
  const router = Router()
  const service = createSubscriptionService(registry)

  // GET /subscriptions — 本人訂閱清單（本人隔離，DECISION.md #6）
  router.get('/subscriptions', requireAuth, async (req, res) => {
    const list = await service.listByMember(req.member!.id)
    res.json(list)
  })

  // GET /admin/subscriptions — 全部訂閱清單（ADMIN 專用）
  router.get('/admin/subscriptions', requireAuth, requireRole('ADMIN'), async (req, res) => {
    const list = await service.listAll()
    res.json(list)
  })

  // POST /subscriptions — 建訂閱(INCOMPLETE) + 首單(PENDING)
  // 回 { subscription, clientSecret? }：Stripe 首扣有 clientSecret，Mock 無（ADR-0013）
  router.post('/subscriptions', requireAuth, async (req, res) => {
    const parsed = CreateSubscriptionSchema.safeParse(req.body)
    if (!parsed.success) throw new AppError(400, 'planId is required')

    const result = await service.create({
      memberId: req.member!.id,
      planId: parsed.data.planId,
    })

    res.status(201).json(result)
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

  // POST /subscriptions/:id/cancel — 期末取消（冪等，DECISION.md #9）
  router.post('/subscriptions/:id/cancel', requireAuth, async (req, res) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
    const sub = await service.cancel({
      id,
      requesterId: req.member!.id,
      requesterRole: req.member!.role,
    })

    res.json(sub)
  })

  return router
}
