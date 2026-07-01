import prisma from '../lib/prisma'
import { buildOrderKey } from '../lib/idempotency'
import { AppError } from '../lib/errors'
import type { ProviderRegistry } from '../providers/ProviderRegistry'

type CreateInput = {
  memberId: string
  planId: string
}

type FindByIdInput = {
  id: string
  requesterId: string
  requesterRole: string
}

type CancelInput = {
  id: string
  requesterId: string
  requesterRole: string
}

// DTO 型別：隱藏 Prisma 實作細節，只暴露 API 需要的欄位。
export type MemberSubscriptionItem = {
  id: string
  status: string
  cancelAtPeriodEnd: boolean
  planId: string
  planName: string
  startedAt: string
  nextBillingDate: string
  // 續扣可觀測性：已成功扣款次數（PAID 訂單數）與最後扣款時間，讓 run-billing 的續扣看得出來。
  billedCount: number
  lastBilledAt: string | null
}

export type AdminSubscriptionItem = {
  id: string
  memberId: string
  memberEmail: string
  planName: string
  amount: number
  currency: string
  status: string
  cancelAtPeriodEnd: boolean
  startedAt: string
  nextBillingDate: string
  // 續扣可觀測性：同 MemberSubscriptionItem，供後台清單顯示續扣次數。
  billedCount: number
  lastBilledAt: string | null
}

/**
 * 工廠函式 — 注入 ProviderRegistry，讓測試可替換 fake registry（ARCHITECTURE.md adapter pattern）。
 */
export function createSubscriptionService(registry: ProviderRegistry) {
  return {
    /**
     * 同一 tx 建 Subscription(INCOMPLETE) + Order(PENDING)，
     * tx commit 後才觸發扣款（DECISION.md #8：沒付錢不該 ACTIVE）。
     * 建立時將 registry.currentName() 寫入 Subscription.provider（ADR-0013）。
     * 回 { subscription, clientSecret? }：Stripe 首扣有 clientSecret，Mock 無。
     */
    async create({ memberId, planId }: CreateInput) {
      const plan = await prisma.plan.findUnique({ where: { id: planId } })
      if (!plan) throw new AppError(404, 'Plan not found')
      if (!plan.active) throw new AppError(400, 'Plan is inactive')

      // 防重疊重複扣款：付費週期尚未結束就不可再開新訂閱（含已標期末取消的 ACTIVE）。
      // 只有訂閱真正進入終態 CANCELED（cron 在期末翻轉）後才放行，使新訂閱自然接在舊期之後，
      // 時間軸連續、不雙重佔用同一段期間。此守衛在 API 層強制，前端守衛只是體驗優化。
      const inFlight = await prisma.subscription.findFirst({
        where: {
          memberId,
          status: { in: ['INCOMPLETE', 'ACTIVE', 'PAST_DUE'] },
        },
      })
      if (inFlight) {
        throw new AppError(409, 'You already have an active subscription. Cancel and wait for the current period to end before subscribing again.')
      }

      const now = new Date()
      const nextBillingDate = new Date(
        now.getTime() + plan.intervalDays * 24 * 60 * 60 * 1000,
      )
      const providerName = registry.currentName()

      // 同 tx 確保 Subscription + Order 同時存在或同時不存在
      const { subscription, order } = await prisma.$transaction(async (tx) => {
        const subscription = await tx.subscription.create({
          data: {
            memberId,
            planId,
            status: 'INCOMPLETE',
            retryCount: 0,
            cancelAtPeriodEnd: false,
            nextBillingDate,
            startedAt: now,
            provider: providerName,
          },
        })

        const idempotencyKey = buildOrderKey(subscription.id, 'cycle0')
        const order = await tx.order.create({
          data: {
            memberId,
            subscriptionId: subscription.id,
            amount: plan.amount,
            currency: plan.currency,
            status: 'PENDING',
            idempotencyKey,
          },
        })

        return { subscription, order }
      })

      // tx commit 後才 charge；若先 charge 再寫 DB 失敗會產生孤兒扣款（spec 注意事項）
      const chargeResult = await registry.current().charge({
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        idempotencyKey: order.idempotencyKey,
      })

      return { subscription, clientSecret: chargeResult.clientSecret }
    },

    /**
     * 本人或 ADMIN 可讀；其他人回 403（DECISION.md #6：authn vs authz）。
     */
    async findById({ id, requesterId, requesterRole }: FindByIdInput) {
      const sub = await prisma.subscription.findUnique({ where: { id } })
      if (!sub) throw new AppError(404, 'Subscription not found')
      if (sub.memberId !== requesterId && requesterRole !== 'ADMIN') {
        throw new AppError(403, 'Forbidden')
      }
      return sub
    },

    /**
     * 本人訂閱清單 — 只回自己的，依 startedAt 新→舊（DECISION.md #6 本人隔離）。
     * Join Plan 取 name，組成前端 DTO。
     */
    async listByMember(memberId: string): Promise<MemberSubscriptionItem[]> {
      const subs = await prisma.subscription.findMany({
        where: { memberId },
        orderBy: { startedAt: 'desc' },
        include: {
          plan: { select: { name: true } },
          // 只取成功扣款的訂單（PAID），最新在前，用來算續扣次數與最後扣款時間
          orders: { where: { status: 'PAID' }, select: { createdAt: true }, orderBy: { createdAt: 'desc' } },
        },
      })
      return subs.map(s => ({
        id: s.id,
        status: s.status,
        cancelAtPeriodEnd: s.cancelAtPeriodEnd,
        planId: s.planId,
        planName: s.plan.name,
        startedAt: s.startedAt.toISOString(),
        nextBillingDate: s.nextBillingDate.toISOString(),
        billedCount: s.orders.length,
        lastBilledAt: s.orders[0]?.createdAt.toISOString() ?? null,
      }))
    },

    /**
     * 全部訂閱清單（ADMIN 專用）— Join Member 取 email、Join Plan 取 name/amount/currency。
     * 依 startedAt 新→舊。
     */
    async listAll(): Promise<AdminSubscriptionItem[]> {
      const subs = await prisma.subscription.findMany({
        orderBy: { startedAt: 'desc' },
        include: {
          member: { select: { email: true } },
          plan: { select: { name: true, amount: true, currency: true } },
          // 只取成功扣款的訂單（PAID），最新在前，用來算續扣次數與最後扣款時間
          orders: { where: { status: 'PAID' }, select: { createdAt: true }, orderBy: { createdAt: 'desc' } },
        },
      })
      return subs.map(s => ({
        id: s.id,
        memberId: s.memberId,
        memberEmail: s.member.email,
        planName: s.plan.name,
        amount: s.plan.amount,
        currency: s.plan.currency,
        status: s.status,
        cancelAtPeriodEnd: s.cancelAtPeriodEnd,
        startedAt: s.startedAt.toISOString(),
        nextBillingDate: s.nextBillingDate.toISOString(),
        billedCount: s.orders.length,
        lastBilledAt: s.orders[0]?.createdAt.toISOString() ?? null,
      }))
    },

    /**
     * 期末取消（DECISION.md #9）：設 cancelAtPeriodEnd=true，status 維持 ACTIVE。
     * 重複呼叫冪等：已標記則直接回傳，不重複寫入。
     * 實際轉 CANCELED 由 billing-cron 在 nextBillingDate 到期時執行。
     */
    async cancel({ id, requesterId, requesterRole }: CancelInput) {
      const sub = await prisma.subscription.findUnique({ where: { id } })
      if (!sub) throw new AppError(404, 'Subscription not found')

      // 只有本人或 ADMIN 可取消（DECISION.md #6）
      if (sub.memberId !== requesterId && requesterRole !== 'ADMIN') {
        throw new AppError(403, 'Forbidden')
      }

      // 冪等：已標記 cancelAtPeriodEnd 直接回傳現狀
      if (sub.cancelAtPeriodEnd) {
        return sub
      }

      return prisma.subscription.update({
        where: { id },
        data: { cancelAtPeriodEnd: true },
      })
    },
  }
}
