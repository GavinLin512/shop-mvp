import express, { Router } from 'express'
import prisma from '../lib/prisma'
import { applyPaymentOutcome } from '../services/webhookService'
import type { PaymentProvider } from '../providers/PaymentProvider'

/**
 * 最小化 Stripe webhooks 介面，讓測試可注入 stub。
 * 測試 cast: `stub as unknown as StripeWebhooks`
 */
export interface StripeWebhooks {
  constructEvent(
    payload: string | Buffer,
    header: string | string[],
    secret: string,
  ): { type: string; data: { object: Record<string, unknown> } }
}

/**
 * /webhooks/stripe — 處理 Stripe 非同步 webhook 事件（ADR-0011）。
 *
 * 用 express.raw() 取 raw bytes（constructEvent 要求），掛在 express.json() 前。
 * 順序同 /webhooks/payment：驗簽 → 冪等(查 providerTxnId) → 更新（DECISION.md #2）。
 * 主要用途：補正首期付款結果；off-session 續扣以 charge() 同步結果為準，
 * webhook 只作對帳備援（ADR-0011, DECISION.md #3）。
 */
export function createStripeWebhookRouter(
  stripeWebhooks: StripeWebhooks,
  provider: PaymentProvider,
): Router {
  const router = Router()

  router.post(
    '/webhooks/stripe',
    express.raw({ type: 'application/json' }),
    async (req, res) => {
      const signature = req.headers['stripe-signature']
      if (!signature || typeof signature !== 'string') {
        res.status(401).json({ error: 'Missing Stripe-Signature header' })
        return
      }

      let event: { type: string; data: { object: Record<string, unknown> } }
      try {
        event = stripeWebhooks.constructEvent(
          req.body as Buffer,
          signature,
          process.env.STRIPE_WEBHOOK_SECRET!,
        )
      } catch {
        res.status(401).json({ error: 'Invalid Stripe signature' })
        return
      }

      const pi = event.data.object

      if (event.type === 'payment_intent.succeeded') {
        await handleStripeSuccess(pi, provider)
      } else if (event.type === 'payment_intent.payment_failed') {
        await handleStripeFailure(pi, provider)
      }
      // 其他 event 類型直接忽略，回 200

      res.json({ ok: true })
    },
  )

  return router
}

async function resolveOrderId(piId: string): Promise<string | null> {
  const payment = await prisma.payment.findFirst({
    where: { providerTxnId: piId },
    select: { orderId: true },
  })
  return payment?.orderId ?? null
}

async function handleStripeSuccess(
  pi: Record<string, unknown>,
  provider: PaymentProvider,
): Promise<void> {
  const piId = pi['id'] as string
  const paymentMethodId = pi['payment_method'] as string | null | undefined

  const orderId = await resolveOrderId(piId)
  if (!orderId) return // 不在我們系統中的 PI，忽略

  await applyPaymentOutcome(piId, orderId, 'SUCCESS', provider, {
    providerName: 'stripe',
    providerPaymentMethodId: paymentMethodId ?? undefined,
  })
}

async function handleStripeFailure(
  pi: Record<string, unknown>,
  provider: PaymentProvider,
): Promise<void> {
  const piId = pi['id'] as string

  const orderId = await resolveOrderId(piId)
  if (!orderId) return

  await applyPaymentOutcome(piId, orderId, 'FAILED', provider, { providerName: 'stripe' })
}
