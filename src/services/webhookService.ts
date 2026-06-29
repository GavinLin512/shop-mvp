import crypto from 'crypto'
import prisma from '../lib/prisma'
import { AppError } from '../lib/errors'
import { buildRetryKey } from '../lib/idempotency'
import type { PaymentProvider } from '../providers/PaymentProvider'

type WebhookPayload = {
  txnId: string
  orderId: string
  status: 'SUCCESS' | 'FAILED'
  amount: number
  currency: string
}

/**
 * HMAC-SHA256 constant-time 驗簽（SECURITY.md, ADR-0002）
 * 用 timingSafeEqual 防時序攻擊
 */
function verifySignature(rawBody: Buffer, signature: string): void {
  const expected = crypto
    .createHmac('sha256', process.env.WEBHOOK_SECRET!)
    .update(rawBody)
    .digest('hex')

  const expectedBuf = Buffer.from(expected, 'hex')
  const actualBuf = Buffer.from(signature, 'hex')

  if (
    expectedBuf.length !== actualBuf.length ||
    !crypto.timingSafeEqual(expectedBuf, actualBuf)
  ) {
    throw new AppError(401, 'Invalid signature')
  }
}

/**
 * 工廠函式 — 注入 PaymentProvider，讓 dunning 重試可觸發 charge，
 * 測試可替換 fake provider（ARCHITECTURE.md adapter pattern）。
 */
export function createWebhookService(provider: PaymentProvider) {
  return {
    /**
     * 處理 /webhooks/payment 回調
     * 順序固定（ADR-0002）：驗簽 → 冪等 → 三表同 tx 更新 → (dunning) 觸發重試扣款
     */
    async processPaymentWebhook(rawBody: Buffer, signature: string): Promise<void> {
      // Step 1: HMAC 驗簽（必須對 raw bytes，不可用已 parse 的 JSON）
      verifySignature(rawBody, signature)

      const payload = JSON.parse(rawBody.toString('utf8')) as WebhookPayload
      const { txnId, orderId, status } = payload

      // Step 2: 冪等 — providerTxnId 已非 PENDING 表示已處理過
      const existing = await prisma.payment.findFirst({
        where: { providerTxnId: txnId },
        select: { status: true },
      })
      if (existing && existing.status !== 'PENDING') return

      // Step 3: 三表同一 transaction（ADR-0008）；若需 dunning 則回傳新 retry Order
      const retryOrder = await prisma.$transaction(async (tx) => {
        const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } })

        const orderStatus = status === 'SUCCESS' ? ('PAID' as const) : ('FAILED' as const)
        const paymentStatus = status === 'SUCCESS' ? ('SUCCESS' as const) : ('FAILED' as const)

        await tx.order.update({ where: { id: orderId }, data: { status: orderStatus } })

        if (existing) {
          // 已有 PENDING Payment（例如先 /payments/charge 建過）→ 更新狀態
          await tx.payment.updateMany({
            where: { providerTxnId: txnId },
            data: { status: paymentStatus },
          })
        } else {
          // 首次 webhook → 建立 Payment 記錄
          await tx.payment.create({
            data: {
              orderId,
              amount: order.amount,
              currency: order.currency,
              provider: 'mock',
              providerTxnId: txnId,
              status: paymentStatus,
            },
          })
        }

        if (!order.subscriptionId) return null

        const sub = await tx.subscription.findUnique({ where: { id: order.subscriptionId } })
        if (!sub) return null

        if (status === 'SUCCESS') {
          if (sub.status === 'INCOMPLETE') {
            // 首扣成功：INCOMPLETE → ACTIVE（ADR-0008）
            await tx.subscription.update({ where: { id: sub.id }, data: { status: 'ACTIVE' } })
          } else if (sub.status === 'PAST_DUE') {
            // dunning 重試成功：PAST_DUE → ACTIVE，重置 retryCount（DECISION.md #5）
            await tx.subscription.update({
              where: { id: sub.id },
              data: { status: 'ACTIVE', retryCount: 0 },
            })
          }
          return null
        }

        // status === 'FAILED'
        if (sub.status === 'INCOMPLETE') {
          // 首扣失敗：直接 CANCELED，不走 dunning（ADR-0008）
          await tx.subscription.update({ where: { id: sub.id }, data: { status: 'CANCELED' } })
          return null
        }

        if (sub.status === 'ACTIVE' || sub.status === 'PAST_DUE') {
          // dunning：累加重試次數（DECISION.md #5）
          const newRetryCount = sub.retryCount + 1

          if (newRetryCount >= 3) {
            // 第 3 次仍失敗 → CANCELED，停止重試
            await tx.subscription.update({
              where: { id: sub.id },
              data: { status: 'CANCELED', retryCount: newRetryCount },
            })
            return null
          }

          // 建新 retry Order，key 加重試序（DECISION.md #1）
          const retryKey = buildRetryKey(order.idempotencyKey, newRetryCount)
          const retryOrder = await tx.order.create({
            data: {
              memberId: order.memberId,
              subscriptionId: sub.id,
              amount: order.amount,
              currency: order.currency,
              status: 'PENDING',
              idempotencyKey: retryKey,
            },
          })

          await tx.subscription.update({
            where: { id: sub.id },
            data: { status: 'PAST_DUE', retryCount: newRetryCount },
          })

          return retryOrder
        }

        return null
      })

      // Step 4: tx commit 後才 charge，避免孤兒扣款（同 subscriptionService / billingCron）
      if (retryOrder) {
        await provider.charge({
          orderId: retryOrder.id,
          amount: retryOrder.amount,
          currency: retryOrder.currency,
          idempotencyKey: retryOrder.idempotencyKey,
        })
      }
    },
  }
}
