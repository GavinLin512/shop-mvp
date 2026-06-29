import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import crypto from 'crypto'
import { createApp } from '../src/app'
import prisma from '../src/lib/prisma'

const app = createApp()
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET!

// ── helpers ───────────────────────────────────────────────────────────────────

function sign(body: string): string {
  return crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex')
}

async function sendWebhook(payload: object, sigOverride?: string) {
  const body = JSON.stringify(payload)
  const sig = sigOverride ?? sign(body)
  return request(app)
    .post('/webhooks/payment')
    .set('Content-Type', 'application/json')
    .set('X-Signature', sig)
    .send(body)
}

async function seedScenario(suffix: string, amount = 1000, currency = 'TWD') {
  const member = await prisma.member.create({
    data: { email: `wh-${suffix}@example.com`, passwordHash: 'hash' },
  })
  const plan = await prisma.plan.create({
    data: { name: 'Test', amount, currency, intervalDays: 30, active: true },
  })
  const sub = await prisma.subscription.create({
    data: {
      memberId: member.id,
      planId: plan.id,
      status: 'INCOMPLETE',
      retryCount: 0,
      cancelAtPeriodEnd: false,
      nextBillingDate: new Date(),
    },
  })
  const order = await prisma.order.create({
    data: {
      memberId: member.id,
      subscriptionId: sub.id,
      amount,
      currency,
      status: 'PENDING',
      idempotencyKey: `${sub.id}:cycle0`,
    },
  })
  return { member, plan, sub, order }
}

// ── 1. 有效簽章 + 成功 → INCOMPLETE 轉 ACTIVE [tracer bullet] ─────────────────

describe('10-webhook 1. 有效簽章 + SUCCESS → INCOMPLETE 轉 ACTIVE', () => {
  it('Order=PAID, Payment=SUCCESS, Subscription=ACTIVE', async () => {
    const txnId = `txn_wh1_${Date.now()}`
    const { sub, order } = await seedScenario(`1-${Date.now()}`)

    const res = await sendWebhook({
      txnId,
      orderId: order.id,
      status: 'SUCCESS',
      amount: order.amount,
      currency: order.currency,
    })

    expect(res.status).toBe(200)

    const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } })
    expect(updatedOrder?.status).toBe('PAID')

    const payment = await prisma.payment.findFirst({ where: { providerTxnId: txnId } })
    expect(payment?.status).toBe('SUCCESS')
    expect(payment?.orderId).toBe(order.id)

    const updatedSub = await prisma.subscription.findUnique({ where: { id: sub.id } })
    expect(updatedSub?.status).toBe('ACTIVE')
  })
})

// ── 2. 簽章錯誤 → 401，狀態不變 ───────────────────────────────────────────────

describe('10-webhook 2. 簽章錯誤 → 401，DB 狀態不變', () => {
  it('用錯誤 secret 簽 → 401', async () => {
    const txnId = `txn_wh2_${Date.now()}`
    const { sub, order } = await seedScenario(`2-${Date.now()}`)

    const payload = { txnId, orderId: order.id, status: 'SUCCESS', amount: order.amount, currency: order.currency }
    const body = JSON.stringify(payload)
    const badSig = crypto.createHmac('sha256', 'wrong-secret').update(body).digest('hex')

    const res = await request(app)
      .post('/webhooks/payment')
      .set('Content-Type', 'application/json')
      .set('X-Signature', badSig)
      .send(body)

    expect(res.status).toBe(401)

    const updatedSub = await prisma.subscription.findUnique({ where: { id: sub.id } })
    expect(updatedSub?.status).toBe('INCOMPLETE')

    const payment = await prisma.payment.findFirst({ where: { providerTxnId: txnId } })
    expect(payment).toBeNull()
  })

  it('竄改 body 後原 sig → 401', async () => {
    const txnId = `txn_wh2b_${Date.now()}`
    const { order } = await seedScenario(`2b-${Date.now()}`)

    const originalPayload = { txnId, orderId: order.id, status: 'SUCCESS', amount: order.amount, currency: order.currency }
    const originalBody = JSON.stringify(originalPayload)
    const sig = sign(originalBody)

    // 竄改 body（status 改為 FAILED）
    const tamperedBody = JSON.stringify({ ...originalPayload, status: 'FAILED' })

    const res = await request(app)
      .post('/webhooks/payment')
      .set('Content-Type', 'application/json')
      .set('X-Signature', sig) // 原本的 sig，但 body 已竄改
      .send(tamperedBody)

    expect(res.status).toBe(401)
  })
})

// ── 3. 重送相同 providerTxnId → 冪等 ─────────────────────────────────────────

describe('10-webhook 3. 重送 → 冪等', () => {
  it('相同 txnId 重送 → 200，Payment 仍一筆', async () => {
    const txnId = `txn_wh3_${Date.now()}`
    const { sub, order } = await seedScenario(`3-${Date.now()}`)

    const payload = { txnId, orderId: order.id, status: 'SUCCESS', amount: order.amount, currency: order.currency }

    const res1 = await sendWebhook(payload)
    expect(res1.status).toBe(200)

    const res2 = await sendWebhook(payload)
    expect(res2.status).toBe(200)

    // Payment 仍一筆
    const payments = await prisma.payment.findMany({ where: { providerTxnId: txnId } })
    expect(payments).toHaveLength(1)

    // Subscription 不被二次改
    const updatedSub = await prisma.subscription.findUnique({ where: { id: sub.id } })
    expect(updatedSub?.status).toBe('ACTIVE')
  })
})

// ── 4. 失敗 webhook + INCOMPLETE → CANCELED ──────────────────────────────────

describe('10-webhook 4. FAILED webhook + INCOMPLETE → CANCELED', () => {
  it('Order=FAILED, Payment=FAILED, Subscription=CANCELED', async () => {
    const txnId = `txn_wh4_${Date.now()}`
    const { sub, order } = await seedScenario(`4-${Date.now()}`)

    const res = await sendWebhook({
      txnId,
      orderId: order.id,
      status: 'FAILED',
      amount: order.amount,
      currency: order.currency,
    })

    expect(res.status).toBe(200)

    const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } })
    expect(updatedOrder?.status).toBe('FAILED')

    const payment = await prisma.payment.findFirst({ where: { providerTxnId: txnId } })
    expect(payment?.status).toBe('FAILED')

    const updatedSub = await prisma.subscription.findUnique({ where: { id: sub.id } })
    expect(updatedSub?.status).toBe('CANCELED')
  })
})

// ── 5. 三表同 tx(rollback) ────────────────────────────────────────────────────

describe('10-webhook 5. 三表同 tx(rollback)', () => {
  it('subscription 階段失敗 → Order/Payment 全 rollback', async () => {
    const txnId = `txn_wh5_${Date.now()}`
    const { order } = await seedScenario(`5-${Date.now()}`)

    const payload = { txnId, orderId: order.id, status: 'SUCCESS' as const, amount: order.amount, currency: order.currency }
    const body = JSON.stringify(payload)
    const sig = sign(body)

    // 攔截 prisma.$transaction，在 subscription.update 階段注入錯誤
    // originalTx 在 spy 建立前捕捉，確保可呼叫真實實作
    const originalTx = prisma.$transaction.bind(prisma)
    const spy = vi.spyOn(prisma, '$transaction').mockImplementationOnce(async (fn: any) => {
      return originalTx((realTx: any) => {
        // 建立 Proxy：只攔截 subscription.update，其他操作走真實 tx
        const subDelegate = realTx.subscription
        const patchedTx = new Proxy(realTx, {
          get(target: any, prop: string | symbol) {
            if (prop === 'subscription') {
              return {
                findUnique: (...args: any[]) => subDelegate.findUnique(...args),
                update: async () => {
                  throw new Error('forced subscription update failure')
                },
              }
            }
            return target[prop as string]
          },
        })
        return fn(patchedTx)
      })
    })

    const res = await request(app)
      .post('/webhooks/payment')
      .set('Content-Type', 'application/json')
      .set('X-Signature', sig)
      .send(body)

    // tx 失敗 → 500
    expect(res.status).toBe(500)

    // Order 未被更改（已 rollback）
    const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } })
    expect(updatedOrder?.status).toBe('PENDING')

    // Payment 未被建立（已 rollback）
    const payments = await prisma.payment.findMany({ where: { providerTxnId: txnId } })
    expect(payments).toHaveLength(0)

    spy.mockRestore()
  })
})

// ── 6. raw body 驗簽（非規範化 JSON）────────────────────────────────────────────

describe('10-webhook 6. raw body 驗簽', () => {
  it('含多餘空白的 raw body 簽對原始 bytes → 通過', async () => {
    const txnId = `txn_wh6_${Date.now()}`
    const { sub, order } = await seedScenario(`6-${Date.now()}`)

    // 故意在 JSON 中加空白（若改用 JSON.parse → JSON.stringify 會移除空白，簽章就對不上）
    const body = `{ "txnId": "${txnId}", "orderId": "${order.id}", "status": "SUCCESS", "amount": ${order.amount}, "currency": "${order.currency}" }`
    const sig = sign(body)

    const res = await request(app)
      .post('/webhooks/payment')
      .set('Content-Type', 'application/json')
      .set('X-Signature', sig)
      .send(body)

    expect(res.status).toBe(200)

    const updatedSub = await prisma.subscription.findUnique({ where: { id: sub.id } })
    expect(updatedSub?.status).toBe('ACTIVE')
  })
})
