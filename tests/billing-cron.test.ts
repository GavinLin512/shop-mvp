import { describe, it, expect, vi } from 'vitest'
import prisma from '../src/lib/prisma'
import { runBillingCycle } from '../src/jobs/billingCron'
import type { PaymentProvider } from '../src/providers/PaymentProvider'

// ── helpers ───────────────────────────────────────────────────────────────────

async function seedMember(email: string) {
  return prisma.member.create({ data: { email, passwordHash: 'hash' } })
}

async function seedPlan(intervalDays = 30) {
  return prisma.plan.create({
    data: { name: 'Basic', amount: 1000, currency: 'TWD', intervalDays, active: true },
  })
}

async function seedActiveSubscription(
  memberId: string,
  planId: string,
  nextBillingDate: Date,
  overrides?: { cancelAtPeriodEnd?: boolean },
) {
  return prisma.subscription.create({
    data: {
      memberId,
      planId,
      status: 'ACTIVE',
      retryCount: 0,
      cancelAtPeriodEnd: overrides?.cancelAtPeriodEnd ?? false,
      nextBillingDate,
      startedAt: new Date(),
    },
  })
}

function makeFakeProvider(): PaymentProvider & { charge: ReturnType<typeof vi.fn> } {
  return {
    charge: vi.fn().mockResolvedValue({ providerTxnId: 'txn_fake', status: 'PENDING' as const }),
  }
}

// ── 1. 到期 ACTIVE 訂閱被續扣 [tracer bullet] ─────────────────────────────────

describe('12-billing-cron 1. 到期 ACTIVE 訂閱被續扣', () => {
  it('建週期 Order + charge 被呼叫 + nextBillingDate 前進一個 interval', async () => {
    const now = new Date('2026-06-29T00:00:00Z')
    const billingDate = new Date('2026-06-28T00:00:00Z')

    const member = await seedMember(`bc1-${Date.now()}@example.com`)
    const plan = await seedPlan(30)
    const sub = await seedActiveSubscription(member.id, plan.id, billingDate)

    const provider = makeFakeProvider()
    const result = await runBillingCycle(now, provider)

    expect(result.processed).toBe(1)
    expect(result.skipped).toBe(0)

    // charge 被呼叫，冪等鍵帶正確週期日期
    expect(provider.charge).toHaveBeenCalledTimes(1)
    const callArg = provider.charge.mock.calls[0][0]
    expect(callArg.idempotencyKey).toBe(`${sub.id}:2026-06-28`)

    // DB 有週期 Order
    const order = await prisma.order.findFirst({ where: { subscriptionId: sub.id } })
    expect(order).not.toBeNull()
    expect(order?.idempotencyKey).toBe(`${sub.id}:2026-06-28`)
    expect(order?.status).toBe('PENDING')
    expect(order?.amount).toBe(plan.amount)

    // nextBillingDate 前進一個 interval
    const updated = await prisma.subscription.findUnique({ where: { id: sub.id } })
    const expectedNext = new Date(billingDate.getTime() + 30 * 24 * 60 * 60 * 1000)
    expect(updated?.nextBillingDate.getTime()).toBe(expectedNext.getTime())
  })
})

// ── 2. 未到期不處理 ────────────────────────────────────────────────────────────

describe('12-billing-cron 2. 未到期不處理', () => {
  it('nextBillingDate > now → 不建單、不扣款', async () => {
    const now = new Date('2026-06-29T00:00:00Z')
    const billingDate = new Date('2026-06-30T00:00:00Z') // 明天，未到期

    const member = await seedMember(`bc2-${Date.now()}@example.com`)
    const plan = await seedPlan()
    await seedActiveSubscription(member.id, plan.id, billingDate)

    const provider = makeFakeProvider()
    const result = await runBillingCycle(now, provider)

    expect(result.processed).toBe(0)
    expect(result.skipped).toBe(0)
    expect(provider.charge).not.toHaveBeenCalled()

    const orders = await prisma.order.findMany()
    expect(orders).toHaveLength(0)
  })
})

// ── 3. 同週期重跑冪等 ──────────────────────────────────────────────────────────

describe('12-billing-cron 3. 同週期重跑冪等', () => {
  it('同一 now 連跑兩次 → Order 只有一筆，charge 只呼叫一次', async () => {
    const now = new Date('2026-06-29T00:00:00Z')
    const billingDate = new Date('2026-06-28T00:00:00Z')

    const member = await seedMember(`bc3-${Date.now()}@example.com`)
    const plan = await seedPlan(30)
    await seedActiveSubscription(member.id, plan.id, billingDate)

    const provider = makeFakeProvider()

    // 第一次執行
    const result1 = await runBillingCycle(now, provider)
    expect(result1.processed).toBe(1)

    // 第二次以相同 now 執行：nextBillingDate 已前進，訂閱不再符合 <= now
    const result2 = await runBillingCycle(now, provider)
    expect(result2.processed).toBe(0)
    expect(result2.skipped).toBe(0)

    // DB 只有一筆 Order，charge 只呼叫一次
    const orders = await prisma.order.findMany()
    expect(orders).toHaveLength(1)
    expect(provider.charge).toHaveBeenCalledTimes(1)
  })
})

// ── 4. 期末取消到期 → CANCELED 不建單 ─────────────────────────────────────────

describe('12-billing-cron 4. 期末取消到期 → CANCELED 不建單', () => {
  it('cancelAtPeriodEnd=true，ACTIVE 到期 → status=CANCELED，無 Order', async () => {
    const now = new Date('2026-06-29T00:00:00Z')
    const billingDate = new Date('2026-06-28T00:00:00Z')

    const member = await seedMember(`bc4-${Date.now()}@example.com`)
    const plan = await seedPlan()
    const sub = await seedActiveSubscription(member.id, plan.id, billingDate, {
      cancelAtPeriodEnd: true,
    })

    const provider = makeFakeProvider()
    const result = await runBillingCycle(now, provider)

    expect(result.processed).toBe(1)
    expect(provider.charge).not.toHaveBeenCalled()

    const updated = await prisma.subscription.findUnique({ where: { id: sub.id } })
    expect(updated?.status).toBe('CANCELED')
    expect(updated?.canceledAt).not.toBeNull()

    const orders = await prisma.order.findMany({ where: { subscriptionId: sub.id } })
    expect(orders).toHaveLength(0)
  })
})

// ── 5. 逐筆隔離（中斷可續）────────────────────────────────────────────────────

describe('12-billing-cron 5. 逐筆隔離（中斷可續）', () => {
  it('一筆 charge 失敗 → 其他筆仍正常，失敗筆 tx 已 commit（Order + nextBillingDate 一致）', async () => {
    const now = new Date('2026-06-29T00:00:00Z')
    const billingDate = new Date('2026-06-28T00:00:00Z')

    const member1 = await seedMember(`bc5a-${Date.now()}@example.com`)
    const member2 = await seedMember(`bc5b-${Date.now()}@example.com`)
    const plan = await seedPlan()

    const sub1 = await seedActiveSubscription(member1.id, plan.id, billingDate)
    const sub2 = await seedActiveSubscription(member2.id, plan.id, billingDate)

    // 第一次 charge 失敗，第二次成功（不管哪個訂閱先被處理）
    let firstCallFailed = false
    const chargeImpl = vi.fn().mockImplementation(async () => {
      if (!firstCallFailed) {
        firstCallFailed = true
        throw new Error('gateway timeout')
      }
      return { providerTxnId: 'txn_ok', status: 'PENDING' as const }
    })

    const provider: PaymentProvider = { charge: chargeImpl }
    const result = await runBillingCycle(now, provider)

    // 兩筆都嘗試了，一個 processed 一個 skipped
    expect(result.processed + result.skipped).toBe(2)
    expect(chargeImpl).toHaveBeenCalledTimes(2)

    // 兩筆訂閱的 nextBillingDate 都前進（tx 在 charge 前 commit，確保原子性）
    const updatedSub1 = await prisma.subscription.findUnique({ where: { id: sub1.id } })
    const updatedSub2 = await prisma.subscription.findUnique({ where: { id: sub2.id } })
    expect(updatedSub1?.nextBillingDate.getTime()).toBeGreaterThan(billingDate.getTime())
    expect(updatedSub2?.nextBillingDate.getTime()).toBeGreaterThan(billingDate.getTime())

    // 兩筆都有 Order（tx 已 commit）；charge 失敗的 Order 留 PENDING 給 dunning 處理
    const orders = await prisma.order.findMany({
      where: { subscriptionId: { in: [sub1.id, sub2.id] } },
    })
    expect(orders).toHaveLength(2)
    expect(orders.every((o) => o.status === 'PENDING')).toBe(true)
  })
})
