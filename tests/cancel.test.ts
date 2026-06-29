import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createApp } from '../src/app'
import prisma from '../src/lib/prisma'
import { runBillingCycle } from '../src/jobs/billingCron'
import type { PaymentProvider } from '../src/providers/PaymentProvider'

const JWT_SECRET = process.env.JWT_SECRET!

// ── helpers ───────────────────────────────────────────────────────────────────

async function seedMember(email: string) {
  return prisma.member.create({ data: { email, passwordHash: 'hash' } })
}

async function seedPlan() {
  return prisma.plan.create({
    data: { name: 'Basic', amount: 1000, currency: 'TWD', intervalDays: 30, active: true },
  })
}

function makeToken(memberId: string, role = 'USER') {
  return jwt.sign({ sub: memberId, role }, JWT_SECRET)
}

function makeFakeProvider(): PaymentProvider {
  return {
    charge: vi.fn().mockResolvedValue({ providerTxnId: 'txn_fake', status: 'PENDING' as const }),
  }
}

/** 建立已 ACTIVE 的訂閱（跳過 webhook 流程直接寫 DB）。 */
async function seedActiveSubscription(
  memberId: string,
  planId: string,
  nextBillingDate: Date,
  cancelAtPeriodEnd = false,
) {
  return prisma.subscription.create({
    data: {
      memberId,
      planId,
      status: 'ACTIVE',
      retryCount: 0,
      cancelAtPeriodEnd,
      nextBillingDate,
      startedAt: new Date(),
    },
  })
}

// ── 1. 取消設期末旗標、狀態仍 ACTIVE [tracer bullet] ─────────────────────────

describe('14-cancel 1. 取消設期末旗標、狀態仍 ACTIVE', () => {
  const app = createApp({ paymentProvider: makeFakeProvider() })

  it('POST /subscriptions/:id/cancel → 200, cancelAtPeriodEnd=true, status=ACTIVE', async () => {
    const member = await seedMember(`cancel1-${Date.now()}@example.com`)
    const plan = await seedPlan()
    const token = makeToken(member.id)
    const sub = await seedActiveSubscription(member.id, plan.id, new Date(Date.now() + 30 * 864e5))

    const res = await request(app)
      .post(`/subscriptions/${sub.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.cancelAtPeriodEnd).toBe(true)
    expect(res.body.status).toBe('ACTIVE')
  })

  it('DB 確認 cancelAtPeriodEnd=true 且 status 仍 ACTIVE', async () => {
    const member = await seedMember(`cancel2-${Date.now()}@example.com`)
    const plan = await seedPlan()
    const token = makeToken(member.id)
    const sub = await seedActiveSubscription(member.id, plan.id, new Date(Date.now() + 30 * 864e5))

    await request(app)
      .post(`/subscriptions/${sub.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)

    const updated = await prisma.subscription.findUnique({ where: { id: sub.id } })
    expect(updated?.cancelAtPeriodEnd).toBe(true)
    expect(updated?.status).toBe('ACTIVE')
  })
})

// ── 2. 重複取消冪等 ────────────────────────────────────────────────────────────

describe('14-cancel 2. 重複取消冪等', () => {
  const app = createApp({ paymentProvider: makeFakeProvider() })

  it('再次 cancel → 200，cancelAtPeriodEnd 仍 true，status 仍 ACTIVE', async () => {
    const member = await seedMember(`cancel3-${Date.now()}@example.com`)
    const plan = await seedPlan()
    const token = makeToken(member.id)
    const sub = await seedActiveSubscription(member.id, plan.id, new Date(Date.now() + 30 * 864e5))

    // 第一次取消
    await request(app)
      .post(`/subscriptions/${sub.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)

    // 第二次取消（冪等）
    const res = await request(app)
      .post(`/subscriptions/${sub.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.cancelAtPeriodEnd).toBe(true)
    expect(res.body.status).toBe('ACTIVE')
  })
})

// ── 3. 到期由 billing-cron 轉 CANCELED ──────────────────────────────────────

describe('14-cancel 3. 到期由 billing-cron 轉 CANCELED', () => {
  it('已標記期末取消、到期後 runBillingCycle → CANCELED，不建週期單', async () => {
    const now = new Date('2026-07-01T00:00:00Z')
    const pastDate = new Date('2026-06-30T00:00:00Z') // nextBillingDate <= now

    const member = await seedMember(`cancel4-${Date.now()}@example.com`)
    const plan = await seedPlan()
    const fakeProvider = makeFakeProvider()
    const sub = await seedActiveSubscription(member.id, plan.id, pastDate, true)

    const ordersBefore = await prisma.order.count({ where: { subscriptionId: sub.id } })

    const { processed } = await runBillingCycle(now, fakeProvider)

    const updated = await prisma.subscription.findUnique({ where: { id: sub.id } })
    const ordersAfter = await prisma.order.count({ where: { subscriptionId: sub.id } })

    expect(updated?.status).toBe('CANCELED')
    expect(ordersAfter).toBe(ordersBefore) // 不建週期單
    expect((fakeProvider.charge as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0) // 不續扣
    expect(processed).toBeGreaterThanOrEqual(1)
  })
})

// ── 4. 授權邊界 ───────────────────────────────────────────────────────────────

describe('14-cancel 4. 授權邊界', () => {
  const app = createApp({ paymentProvider: makeFakeProvider() })

  it('未登入 → 401', async () => {
    const member = await seedMember(`cancel5-${Date.now()}@example.com`)
    const plan = await seedPlan()
    const sub = await seedActiveSubscription(member.id, plan.id, new Date(Date.now() + 30 * 864e5))

    const res = await request(app).post(`/subscriptions/${sub.id}/cancel`)
    expect(res.status).toBe(401)
  })

  it('非本人（他人帳號）→ 403', async () => {
    const owner = await seedMember(`cancel6a-${Date.now()}@example.com`)
    const other = await seedMember(`cancel6b-${Date.now()}@example.com`)
    const plan = await seedPlan()
    const sub = await seedActiveSubscription(owner.id, plan.id, new Date(Date.now() + 30 * 864e5))
    const otherToken = makeToken(other.id)

    const res = await request(app)
      .post(`/subscriptions/${sub.id}/cancel`)
      .set('Authorization', `Bearer ${otherToken}`)

    expect(res.status).toBe(403)
  })
})
