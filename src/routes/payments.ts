import { Router } from 'express'
import { z } from 'zod'
import type { PaymentProvider } from '../providers/PaymentProvider'
import { createPaymentService } from '../services/paymentService'
import { requireAuth } from '../middlewares/auth'
import { AppError } from '../lib/errors'
import prisma from '../lib/prisma'

const chargeSchema = z.object({
  orderId: z.string(),
})

/**
 * Router 工廠 — provider 由外部注入，測試可傳入 fake provider 驗證解耦。
 */
export function createPaymentRouter(provider: PaymentProvider): Router {
  const router = Router()
  const service = createPaymentService(provider)

  // POST /payments/charge
  // 對 Order 發起扣款，建立 Payment(PENDING) 並回 providerTxnId
  router.post('/payments/charge', requireAuth, async (req, res) => {
    const parsed = chargeSchema.safeParse(req.body)
    if (!parsed.success) {
      throw new AppError(400, 'orderId is required')
    }

    const { orderId } = parsed.data
    const order = await prisma.order.findUnique({ where: { id: orderId } })
    if (!order) throw new AppError(404, 'Order not found')

    const result = await service.chargeOrder({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      idempotencyKey: order.idempotencyKey,
    })

    res.json({ providerTxnId: result.providerTxnId })
  })

  return router
}
