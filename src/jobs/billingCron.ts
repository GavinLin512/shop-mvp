import prisma from '../lib/prisma'
import { buildOrderKey } from '../lib/idempotency'
import { applyPaymentOutcome } from '../services/webhookService'
import type { PaymentProvider } from '../providers/PaymentProvider'

/** 將 Date 轉為 YYYY-MM-DD 格式，作為冪等鍵的週期識別。 */
function formatCycleDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function isPrismaUniqueError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === 'P2002'
  )
}

/**
 * 掃 nextBillingDate <= now 的 ACTIVE 訂閱，逐筆建週期單並觸發扣款。
 * 純函式，不依賴 cron timer，便於測試與中斷重試（DECISION.md #7）。
 *
 * @returns processed  成功建單或轉 CANCELED 的筆數
 * @returns skipped    冪等重複或失敗跳過的筆數
 */
export async function runBillingCycle(
  now: Date,
  provider: PaymentProvider,
): Promise<{ processed: number; skipped: number }> {
  const subscriptions = await prisma.subscription.findMany({
    where: {
      status: 'ACTIVE',
      nextBillingDate: { lte: now },
    },
    include: { plan: true },
  })

  let processed = 0
  let skipped = 0

  for (const sub of subscriptions) {
    try {
      // 期末取消：轉 CANCELED，不建週期單（DECISION.md #9）
      if (sub.cancelAtPeriodEnd) {
        await prisma.subscription.update({
          where: { id: sub.id },
          data: { status: 'CANCELED', canceledAt: now },
        })
        processed++
        continue
      }

      const cycleDate = formatCycleDate(sub.nextBillingDate)
      const idempotencyKey = buildOrderKey(sub.id, cycleDate)
      const nextBillingDate = new Date(
        sub.nextBillingDate.getTime() + sub.plan.intervalDays * 24 * 60 * 60 * 1000,
      )

      // 同 tx 建 Order + 推進 nextBillingDate，保證原子性（中斷可續）。
      // charge 在 tx commit 後才呼叫，避免孤兒扣款（同 subscriptionService.create）。
      const order = await prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            memberId: sub.memberId,
            subscriptionId: sub.id,
            amount: sub.plan.amount,
            currency: sub.plan.currency,
            status: 'PENDING',
            idempotencyKey,
          },
        })
        await tx.subscription.update({
          where: { id: sub.id },
          data: { nextBillingDate },
        })
        return order
      })

      const result = await provider.charge({
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        idempotencyKey: order.idempotencyKey,
      })

      // off-session 同步出結果（Stripe）→ 立即補正；PENDING（Mock）→ 等 webhook 非同步補
      if (result.status !== 'PENDING') {
        await applyPaymentOutcome(result.providerTxnId, order.id, result.status, provider)
      }

      processed++
    } catch (err: unknown) {
      // P2002：同週期重跑，Order 已存在，冪等跳過
      if (isPrismaUniqueError(err)) {
        skipped++
        continue
      }
      // charge 失敗或其他錯誤：逐筆隔離，記 log，繼續下一筆（DECISION.md #7）
      console.error(`[billing-cron] subscription ${sub.id} failed:`, err)
      skipped++
    }
  }

  return { processed, skipped }
}
