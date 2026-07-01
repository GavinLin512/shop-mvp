import { describe, it, expect, vi } from 'vitest'
import crypto from 'crypto'
import request from 'supertest'
import { createApp } from '../src/app'
import prisma from '../src/lib/prisma'
import { runReconciliation, type GatewayQuery } from '../src/jobs/reconciliationCron'
import type { PaymentProvider } from '../src/providers/PaymentProvider'
import { createCompatRegistry } from '../src/providers/ProviderRegistry'

// ── helpers ───────────────────────────────────────────────────────────────────

function makeFakeProvider(): PaymentProvider & { charge: ReturnType<typeof vi.fn> } {
  return {
    charge: vi.fn().mockResolvedValue({ providerTxnId: 'txn_retry', status: 'PENDING' as const }),
  }
}

/**
 * 建立 PENDING Payment 場景（模擬 charge 後 webhook 未到）。
 * paymentCreatedAt 預設 10 分鐘前，方便超過 5 分鐘門檻。
 */
async function seedScenario(
  suffix: string,
  opts: {
    paymentCreatedAt?: Date
    subStatus?: 'INCOMPLETE' | 'ACTIVE' | 'PAST_DUE'
    retryCount?: number
    paymentStatus?: 'PENDING' | 'SUCCESS' | 'FAILED'
  } = {},
) {
  const now = new Date()
  const paymentCreatedAt =
    opts.paymentCreatedAt ?? new Date(now.getTime() - 10 * 60 * 1000)

  const member = await prisma.member.create({
    data: { email: `rc-${suffix}@example.com`, passwordHash: 'hash' },
  })
  const plan = await prisma.plan.create({
    data: { name: 'Basic', amount: 1000, currency: 'TWD', intervalDays: 30, active: true },
  })
  const sub = await prisma.subscription.create({
    data: {
      memberId: member.id,
      planId: plan.id,
      status: opts.subStatus ?? 'INCOMPLETE',
      retryCount: opts.retryCount ?? 0,
      cancelAtPeriodEnd: false,
      nextBillingDate: new Date(),
    },
  })
  const txnId = `txn_rc_${suffix}`
  const order = await prisma.order.create({
    data: {
      memberId: member.id,
      subscriptionId: sub.id,
      amount: 1000,
      currency: 'TWD',
      status: 'PENDING',
      idempotencyKey: `${sub.id}:cycle0`,
    },
  })
  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      amount: 1000,
      currency: 'TWD',
      provider: 'mock',
      providerTxnId: txnId,
      status: opts.paymentStatus ?? 'PENDING',
      createdAt: paymentCreatedAt,
    },
  })

  return { member, plan, sub, order, payment, txnId }
}

// ── 1. 逾時 PENDING + gateway SUCCESS → PAID/ACTIVE [tracer bullet] ───────────

describe('13-reconciliation 1. 逾時 PENDING + gateway SUCCESS → PAID/ACTIVE', () => {
  it('Order=PAID, Payment=SUCCESS, Subscription=ACTIVE', async () => {
    const now = new Date('2026-06-29T12:00:00Z')
    const { sub, order, txnId } = await seedScenario(`1-${Date.now()}`, {
      paymentCreatedAt: new Date('2026-06-29T11:50:00Z'),
      subStatus: 'INCOMPLETE',
    })

    const queryGateway: GatewayQuery = vi.fn().mockResolvedValue('SUCCESS')
    const provider = makeFakeProvider()

    const result = await runReconciliation(now, createCompatRegistry(provider), queryGateway, 5)

    expect(result.checked).toBe(1)
    expect(result.updated).toBe(1)

    const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } })
    expect(updatedOrder?.status).toBe('PAID')

    const updatedPayment = await prisma.payment.findFirst({ where: { providerTxnId: txnId } })
    expect(updatedPayment?.status).toBe('SUCCESS')

    const updatedSub = await prisma.subscription.findUnique({ where: { id: sub.id } })
    expect(updatedSub?.status).toBe('ACTIVE')
  })
})

// ── 2. gateway 仍 PENDING → 不動 ─────────────────────────────────────────────

describe('13-reconciliation 2. gateway 仍 PENDING → 不動', () => {
  it('狀態維持 PENDING，不更新任何資料', async () => {
    const now = new Date('2026-06-29T12:00:00Z')
    const { sub, order, txnId } = await seedScenario(`2-${Date.now()}`, {
      paymentCreatedAt: new Date('2026-06-29T11:50:00Z'),
      subStatus: 'INCOMPLETE',
    })

    const queryGateway: GatewayQuery = vi.fn().mockResolvedValue('PENDING')
    const provider = makeFakeProvider()

    const result = await runReconciliation(now, createCompatRegistry(provider), queryGateway, 5)

    expect(result.checked).toBe(1)
    expect(result.updated).toBe(0)

    const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } })
    expect(updatedOrder?.status).toBe('PENDING')

    const updatedPayment = await prisma.payment.findFirst({ where: { providerTxnId: txnId } })
    expect(updatedPayment?.status).toBe('PENDING')

    const updatedSub = await prisma.subscription.findUnique({ where: { id: sub.id } })
    expect(updatedSub?.status).toBe('INCOMPLETE')
  })
})

// ── 3. gateway FAILED → 補成 FAILED ──────────────────────────────────────────

describe('13-reconciliation 3. gateway FAILED → 補成 FAILED', () => {
  it('Order=FAILED, Payment=FAILED, Subscription=CANCELED（INCOMPLETE 首扣失敗路徑）', async () => {
    const now = new Date('2026-06-29T12:00:00Z')
    const { sub, order, txnId } = await seedScenario(`3-${Date.now()}`, {
      paymentCreatedAt: new Date('2026-06-29T11:50:00Z'),
      subStatus: 'INCOMPLETE',
    })

    const queryGateway: GatewayQuery = vi.fn().mockResolvedValue('FAILED')
    const provider = makeFakeProvider()

    const result = await runReconciliation(now, createCompatRegistry(provider), queryGateway, 5)

    expect(result.checked).toBe(1)
    expect(result.updated).toBe(1)

    const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } })
    expect(updatedOrder?.status).toBe('FAILED')

    const updatedPayment = await prisma.payment.findFirst({ where: { providerTxnId: txnId } })
    expect(updatedPayment?.status).toBe('FAILED')

    // INCOMPLETE 首扣失敗 → CANCELED，不走 dunning
    const updatedSub = await prisma.subscription.findUnique({ where: { id: sub.id } })
    expect(updatedSub?.status).toBe('CANCELED')
    expect(provider.charge).not.toHaveBeenCalled()
  })
})

// ── 4. 已終態不重撈 ───────────────────────────────────────────────────────────

describe('13-reconciliation 4. 已終態不重撈', () => {
  it('SUCCESS/FAILED Payment 及未逾時 Payment 不在處理集合', async () => {
    const now = new Date('2026-06-29T12:00:00Z')

    // 已 SUCCESS → 不應被撈
    await seedScenario(`4a-${Date.now()}`, {
      paymentCreatedAt: new Date('2026-06-29T11:50:00Z'),
      paymentStatus: 'SUCCESS',
    })

    // 已 FAILED → 不應被撈
    await seedScenario(`4b-${Date.now()}`, {
      paymentCreatedAt: new Date('2026-06-29T11:50:00Z'),
      paymentStatus: 'FAILED',
    })

    // PENDING 但未逾時（createdAt = 2 分鐘前，門檻 5 分鐘）→ 不應被撈
    await seedScenario(`4c-${Date.now()}`, {
      paymentCreatedAt: new Date('2026-06-29T11:58:00Z'),
    })

    const queryGateway: GatewayQuery = vi.fn().mockResolvedValue('SUCCESS')
    const provider = makeFakeProvider()

    const result = await runReconciliation(now, createCompatRegistry(provider), queryGateway, 5)

    expect(result.checked).toBe(0)
    expect(result.updated).toBe(0)
    expect(queryGateway).not.toHaveBeenCalled()
  })
})

// ── 5. 與 webhook 不重複處理 ──────────────────────────────────────────────────

describe('13-reconciliation 5. 與 webhook 不重複處理', () => {
  it('對帳補正後遲到 webhook 重送 → 冪等命中，Payment 仍一筆且狀態不變', async () => {
    const now = new Date('2026-06-29T12:00:00Z')
    const { sub, order, txnId } = await seedScenario(`5-${Date.now()}`, {
      paymentCreatedAt: new Date('2026-06-29T11:50:00Z'),
      subStatus: 'INCOMPLETE',
    })

    const queryGateway: GatewayQuery = vi.fn().mockResolvedValue('SUCCESS')
    const provider = makeFakeProvider()

    // 對帳先跑，補正為 SUCCESS
    await runReconciliation(now, createCompatRegistry(provider), queryGateway, 5)

    const afterRecon = await prisma.payment.findFirst({ where: { providerTxnId: txnId } })
    expect(afterRecon?.status).toBe('SUCCESS')

    // 遲到的 webhook 重送（相同 txnId）
    const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET!
    const payload = {
      txnId,
      orderId: order.id,
      status: 'SUCCESS',
      amount: order.amount,
      currency: order.currency,
    }
    const body = JSON.stringify(payload)
    const sig = crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex')

    const app = createApp()
    const res = await request(app)
      .post('/webhooks/payment')
      .set('Content-Type', 'application/json')
      .set('X-Signature', sig)
      .send(body)

    expect(res.status).toBe(200)

    // Payment 仍只有一筆，狀態不變
    const payments = await prisma.payment.findMany({ where: { providerTxnId: txnId } })
    expect(payments).toHaveLength(1)
    expect(payments[0].status).toBe('SUCCESS')

    // Subscription 不被二次更改
    const updatedSub = await prisma.subscription.findUnique({ where: { id: sub.id } })
    expect(updatedSub?.status).toBe('ACTIVE')
  })
})
