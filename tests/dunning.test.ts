import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import crypto from 'crypto'
import { createApp } from '../src/app'
import prisma from '../src/lib/prisma'
import type { PaymentProvider } from '../src/providers/PaymentProvider'

// ── helpers ───────────────────────────────────────────────────────────────────

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET!

function sign(body: string): string {
  return crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex')
}

function makeFakeProvider(): PaymentProvider & { charge: ReturnType<typeof vi.fn> } {
  return {
    charge: vi.fn().mockResolvedValue({ providerTxnId: 'txn_fake', status: 'PENDING' as const }),
  }
}

/**
 * 送 FAILED/SUCCESS webhook，回傳 response。
 * txnId 必須每次唯一，否則冪等邏輯會直接跳過。
 */
async function sendWebhook(
  app: Express.Application,
  payload: { txnId: string; orderId: string; status: 'SUCCESS' | 'FAILED'; amount: number; currency: string },
) {
  const body = JSON.stringify(payload)
  const sig = sign(body)
  return request(app)
    .post('/webhooks/payment')
    .set('Content-Type', 'application/json')
    .set('X-Signature', sig)
    .send(body)
}

/** 建立 ACTIVE 訂閱 + PENDING 週期單（模擬 billingCron 已建單但尚未回調）。 */
async function seedActiveSub(suffix: string) {
  const member = await prisma.member.create({
    data: { email: `dn-${suffix}@example.com`, passwordHash: 'hash' },
  })
  const plan = await prisma.plan.create({
    data: { name: 'Basic', amount: 1000, currency: 'TWD', intervalDays: 30, active: true },
  })
  const sub = await prisma.subscription.create({
    data: {
      memberId: member.id,
      planId: plan.id,
      status: 'ACTIVE',
      retryCount: 0,
      cancelAtPeriodEnd: false,
      nextBillingDate: new Date(),
      startedAt: new Date(),
    },
  })
  const order = await prisma.order.create({
    data: {
      memberId: member.id,
      subscriptionId: sub.id,
      amount: plan.amount,
      currency: plan.currency,
      status: 'PENDING',
      idempotencyKey: `${sub.id}:2026-06-29`,
    },
  })
  return { member, plan, sub, order }
}

// ── 1. ACTIVE 扣款失敗 → PAST_DUE + retry1 新單 [tracer bullet] ───────────────

describe('11-dunning 1. ACTIVE + FAILED → PAST_DUE + retry1', () => {
  it('Subscription=PAST_DUE, retryCount=1，產生含 :retry1 的新 Order', async () => {
    const fakeProvider = makeFakeProvider()
    const app = createApp({ paymentProvider: fakeProvider })
    const { sub, order } = await seedActiveSub(`1-${Date.now()}`)

    const res = await sendWebhook(app, {
      txnId: `txn_dn1_${Date.now()}`,
      orderId: order.id,
      status: 'FAILED',
      amount: order.amount,
      currency: order.currency,
    })

    expect(res.status).toBe(200)

    const updatedSub = await prisma.subscription.findUnique({ where: { id: sub.id } })
    expect(updatedSub?.status).toBe('PAST_DUE')
    expect(updatedSub?.retryCount).toBe(1)

    // 應存在一筆含 :retry1 的新 Order
    const retryOrder = await prisma.order.findFirst({
      where: { subscriptionId: sub.id, idempotencyKey: { contains: ':retry1' } },
    })
    expect(retryOrder).not.toBeNull()
    expect(retryOrder?.status).toBe('PENDING')

    // provider.charge 被呼叫一次（觸發重試扣款）
    expect(fakeProvider.charge).toHaveBeenCalledTimes(1)
    expect(fakeProvider.charge.mock.calls[0][0].orderId).toBe(retryOrder!.id)
  })
})

// ── 2. 重試成功 → 回 ACTIVE 並重置 retryCount ────────────────────────────────

describe('11-dunning 2. 重試成功 → ACTIVE，retryCount=0', () => {
  it('PAST_DUE retryCount=1 收到 SUCCESS → Subscription=ACTIVE, retryCount=0', async () => {
    const fakeProvider = makeFakeProvider()
    const app = createApp({ paymentProvider: fakeProvider })

    // 直接 seed PAST_DUE sub + retry1 order（略過第一次失敗流程）
    const { sub: baseSub, order: baseOrder } = await seedActiveSub(`2-${Date.now()}`)
    await prisma.subscription.update({
      where: { id: baseSub.id },
      data: { status: 'PAST_DUE', retryCount: 1 },
    })
    const retryOrder = await prisma.order.create({
      data: {
        memberId: baseOrder.memberId,
        subscriptionId: baseSub.id,
        amount: baseOrder.amount,
        currency: baseOrder.currency,
        status: 'PENDING',
        idempotencyKey: `${baseSub.id}:2026-06-29:retry1`,
      },
    })

    const res = await sendWebhook(app, {
      txnId: `txn_dn2_${Date.now()}`,
      orderId: retryOrder.id,
      status: 'SUCCESS',
      amount: retryOrder.amount,
      currency: retryOrder.currency,
    })

    expect(res.status).toBe(200)

    const updatedSub = await prisma.subscription.findUnique({ where: { id: baseSub.id } })
    expect(updatedSub?.status).toBe('ACTIVE')
    expect(updatedSub?.retryCount).toBe(0)
  })
})

// ── 3. 連續 3 次失敗 → CANCELED ───────────────────────────────────────────────

describe('11-dunning 3. 連續 3 次失敗 → CANCELED', () => {
  it('第 3 次 FAILED 後 Subscription=CANCELED，不再建新 retry Order', async () => {
    const fakeProvider = makeFakeProvider()
    const app = createApp({ paymentProvider: fakeProvider })
    const { sub, order: order0 } = await seedActiveSub(`3-${Date.now()}`)
    const baseKey = order0.idempotencyKey

    // --- 第 1 次失敗 ---
    await sendWebhook(app, {
      txnId: `txn_dn3a_${Date.now()}`,
      orderId: order0.id,
      status: 'FAILED',
      amount: order0.amount,
      currency: order0.currency,
    })
    const subAfter1 = await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } })
    expect(subAfter1.status).toBe('PAST_DUE')
    expect(subAfter1.retryCount).toBe(1)

    // 找 retry1 order
    const order1 = await prisma.order.findFirstOrThrow({
      where: { subscriptionId: sub.id, idempotencyKey: `${baseKey}:retry1` },
    })

    // --- 第 2 次失敗 ---
    await sendWebhook(app, {
      txnId: `txn_dn3b_${Date.now()}`,
      orderId: order1.id,
      status: 'FAILED',
      amount: order1.amount,
      currency: order1.currency,
    })
    const subAfter2 = await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } })
    expect(subAfter2.status).toBe('PAST_DUE')
    expect(subAfter2.retryCount).toBe(2)

    // 找 retry2 order
    const order2 = await prisma.order.findFirstOrThrow({
      where: { subscriptionId: sub.id, idempotencyKey: `${baseKey}:retry2` },
    })

    // --- 第 3 次失敗 ---
    await sendWebhook(app, {
      txnId: `txn_dn3c_${Date.now()}`,
      orderId: order2.id,
      status: 'FAILED',
      amount: order2.amount,
      currency: order2.currency,
    })
    const subAfter3 = await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } })
    expect(subAfter3.status).toBe('CANCELED')
    expect(subAfter3.retryCount).toBe(3)

    // 不應存在 retry3 order
    const order3 = await prisma.order.findFirst({
      where: { subscriptionId: sub.id, idempotencyKey: `${baseKey}:retry3` },
    })
    expect(order3).toBeNull()

    // charge 呼叫 2 次（retry1 + retry2；第 3 次失敗直接 CANCELED，不 charge）
    expect(fakeProvider.charge).toHaveBeenCalledTimes(2)
  })
})

// ── 4. 失敗單不重用（每次新 key）────────────────────────────────────────────────

describe('11-dunning 4. 失敗單不重用（每次新 key）', () => {
  it('retry1, retry2 各為獨立 Order，idempotencyKey 唯一且不重複', async () => {
    const fakeProvider = makeFakeProvider()
    const app = createApp({ paymentProvider: fakeProvider })
    const { sub, order: order0 } = await seedActiveSub(`4-${Date.now()}`)
    const baseKey = order0.idempotencyKey

    // 失敗 1
    await sendWebhook(app, {
      txnId: `txn_dn4a_${Date.now()}`,
      orderId: order0.id,
      status: 'FAILED',
      amount: order0.amount,
      currency: order0.currency,
    })
    const order1 = await prisma.order.findFirstOrThrow({
      where: { subscriptionId: sub.id, idempotencyKey: `${baseKey}:retry1` },
    })

    // 失敗 2
    await sendWebhook(app, {
      txnId: `txn_dn4b_${Date.now()}`,
      orderId: order1.id,
      status: 'FAILED',
      amount: order1.amount,
      currency: order1.currency,
    })
    const order2 = await prisma.order.findFirstOrThrow({
      where: { subscriptionId: sub.id, idempotencyKey: `${baseKey}:retry2` },
    })

    // 三筆 Order（原始 + retry1 + retry2）各不相同
    expect(order0.id).not.toBe(order1.id)
    expect(order1.id).not.toBe(order2.id)
    expect(order0.idempotencyKey).not.toBe(order1.idempotencyKey)
    expect(order1.idempotencyKey).not.toBe(order2.idempotencyKey)

    // 舊失敗單狀態為 FAILED（不被改用）
    const failedOrder0 = await prisma.order.findUnique({ where: { id: order0.id } })
    const failedOrder1 = await prisma.order.findUnique({ where: { id: order1.id } })
    expect(failedOrder0?.status).toBe('FAILED')
    expect(failedOrder1?.status).toBe('FAILED')
  })
})
