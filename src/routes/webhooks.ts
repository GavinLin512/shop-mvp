import express, { Router } from 'express'
import { createWebhookService } from '../services/webhookService'
import { AppError } from '../lib/errors'
import type { PaymentProvider } from '../providers/PaymentProvider'

export function createWebhookRouter(provider: PaymentProvider): Router {
  const service = createWebhookService(provider)
  const router: Router = Router()

  // POST /webhooks/payment
  // 此路由必須用 express.raw() 取 raw bytes 才能驗簽（ADR-0002）
  // 必須在 app.use(express.json()) 之前掛載，避免 body 被預先 parse
  router.post(
    '/webhooks/payment',
    express.raw({ type: 'application/json' }),
    async (req, res) => {
      const signature = req.headers['x-signature']
      if (!signature || typeof signature !== 'string') {
        throw new AppError(401, 'Missing X-Signature header')
      }
      if (!Buffer.isBuffer(req.body)) {
        throw new AppError(400, 'Invalid content type')
      }
      const { applied } = await service.processPaymentWebhook(req.body, signature)
      res.json({ ok: true, duplicate: !applied })
    },
  )

  return router
}
