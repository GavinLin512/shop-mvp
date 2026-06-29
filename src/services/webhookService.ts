import crypto from 'crypto'
import prisma from '../lib/prisma'
import { AppError } from '../lib/errors'

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

  // 長度不同或內容不同皆回 401
  if (
    expectedBuf.length !== actualBuf.length ||
    !crypto.timingSafeEqual(expectedBuf, actualBuf)
  ) {
    throw new AppError(401, 'Invalid signature')
  }
}

export const webhookService = {
  /**
   * 處理 /webhooks/payment 回調
   * 順序固定（ADR-0002）：驗簽 → 冪等 → 三表同 tx 更新
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

    // Step 3: 三表同一 transaction（ADR-0008）— 要嘛全成、要嘛全 rollback
    await prisma.$transaction(async (tx) => {
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

      if (order.subscriptionId) {
        const sub = await tx.subscription.findUnique({ where: { id: order.subscriptionId } })
        if (sub) {
          if (status === 'SUCCESS' && sub.status === 'INCOMPLETE') {
            // 首扣成功：INCOMPLETE → ACTIVE（ADR-0008）
            await tx.subscription.update({ where: { id: sub.id }, data: { status: 'ACTIVE' } })
          } else if (status === 'FAILED' && sub.status === 'INCOMPLETE') {
            // 首扣失敗：直接 CANCELED，不走 dunning（ADR-0008）
            await tx.subscription.update({ where: { id: sub.id }, data: { status: 'CANCELED' } })
          }
          // ACTIVE/PAST_DUE + FAILED → 留給 dunning (task 11)，此處不處理
        }
      }
    })
  },
}
