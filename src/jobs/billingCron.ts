import prisma from '../lib/prisma'
import { buildOrderKey } from '../lib/idempotency'
import { applyPaymentOutcome } from '../services/webhookService'
import type { ProviderRegistry, ProviderName } from '../providers/ProviderRegistry'

/**
 * 將 nextBillingDate 轉為冪等鍵的週期識別（完整 ISO 時間戳）。
 *
 * 用完整時間戳而非僅日期（YYYY-MM-DD）的原因：
 * - 生產：每個週期相隔至少一個 interval（≥ 1 天），時間戳必然不同 → 行為與日期粒度完全一致。
 * - 冪等保證不變：同一 nextBillingDate 產生同一鍵，重跑仍 dedupe（見測試 3）。
 * - Demo：Demo Control 的 MAKE DUE 會把 nextBillingDate 反覆撥成「當下」，
 *   同一天多次續扣若用日期粒度會撞同鍵 → P2002 skip；改用時間戳後每次 now 不同 → 鍵唯一，續扣可重複。
 */
function formatCycleDate(date: Date): string {
  return date.toISOString()
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
 * 每筆依 Subscription.provider 向 registry 取對應實作（ADR-0013）。
 *
 * @returns processed  成功建單或轉 CANCELED 的筆數
 * @returns skipped    冪等重複或失敗跳過的筆數
 */
export async function runBillingCycle(
  now: Date,
  registry: ProviderRegistry,
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

      // 依訂閱建立時綁定的 provider 扣款，與當下 registry 選誰無關（ADR-0013）
      const subProvider = registry.get(sub.provider as ProviderName)
      const result = await subProvider.charge({
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        idempotencyKey: order.idempotencyKey,
      })

      // off-session 同步出結果（Stripe）→ 立即補正；PENDING（Mock）→ 等 webhook 非同步補
      if (result.status !== 'PENDING') {
        await applyPaymentOutcome(result.providerTxnId, order.id, result.status, subProvider)
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
