import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import Stripe from 'stripe'
import { createApp } from '../src/app'
import { StripeProvider } from '../src/providers/StripeProvider'
import type { StripeClient } from '../src/providers/StripeProvider'
import type { StripeWebhooks } from '../src/routes/stripeWebhooks'
import type { PaymentProvider } from '../src/providers/PaymentProvider'
import { runBillingCycle } from '../src/jobs/billingCron'
import prisma from '../src/lib/prisma'

// ── helpers ───────────────────────────────────────────────────────────────────

async function seedMember(email: string, providerCustomerId?: string) {
  return prisma.member.create({
    data: { email, passwordHash: 'hash', providerCustomerId },
  })
}

async function seedPlan() {
  return prisma.plan.create({
    data: { name: 'Pro', amount: 1000, currency: 'TWD', intervalDays: 30, active: true },
  })
}

async function seedOrder(memberId: string, subscriptionId: string | null, providerPaymentMethodId?: string) {
  const plan = await seedPlan()
  const sub = subscriptionId
    ? await prisma.subscription.findUnique({ where: { id: subscriptionId } })
    : await prisma.subscription.create({
        data: {
          memberId,
          planId: plan.id,
          status: 'ACTIVE',
          retryCount: 0,
          cancelAtPeriodEnd: false,
          nextBillingDate: new Date(Date.now() + 30 * 864e5),
          startedAt: new Date(),
          providerPaymentMethodId,
        },
      })

  const order = await prisma.order.create({
    data: {
      memberId,
      subscriptionId: sub!.id,
      amount: plan.amount,
      currency: plan.currency,
      status: 'PENDING',
      idempotencyKey: `${sub!.id}:cycle0`,
    },
  })

  return { order, subscription: sub! }
}

/** 建立已有存卡的 Order (off-session 續扣用)。 */
async function seedOrderWithStoredCard(email: string) {
  const member = await seedMember(email, 'cus_existing')
  const plan = await seedPlan()
  const sub = await prisma.subscription.create({
    data: {
      memberId: member.id,
      planId: plan.id,
      status: 'ACTIVE',
      retryCount: 0,
      cancelAtPeriodEnd: false,
      nextBillingDate: new Date(Date.now() + 30 * 864e5),
      startedAt: new Date(),
      providerPaymentMethodId: 'pm_stored',
    },
  })
  const order = await prisma.order.create({
    data: {
      memberId: member.id,
      subscriptionId: sub.id,
      amount: plan.amount,
      currency: plan.currency,
      status: 'PENDING',
      idempotencyKey: `${sub.id}:cycle1`,
    },
  })
  return { member, sub, order }
}

// ── 1. StripeProvider.charge 首期回 clientSecret + PENDING [tracer bullet] ───

describe('15-stripe 1. StripeProvider.charge 首期回 clientSecret + PENDING', () => {
  it('建 Customer + PaymentIntent(setup_future_usage:off_session)，回 PENDING + clientSecret', async () => {
    const member = await seedMember(`stripe1-${Date.now()}@example.com`)
    const { order } = await seedOrder(member.id, null)

    const stubCreate = vi.fn().mockResolvedValue({
      id: 'pi_first',
      client_secret: 'cs_test_xxx',
      status: 'requires_payment_method',
    })
    const stubCustomer = vi.fn().mockResolvedValue({ id: 'cus_new' })
    const stub = {
      customers: { create: stubCustomer },
      paymentIntents: { create: stubCreate },
    } as unknown as StripeClient

    const provider = new StripeProvider(stub)
    const result = await provider.charge({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      idempotencyKey: order.idempotencyKey,
    })

    expect(result.providerTxnId).toBe('pi_first')
    expect(result.status).toBe('PENDING')
    expect(result.clientSecret).toBe('cs_test_xxx')

    // Customer 已存入 DB
    const updatedMember = await prisma.member.findUnique({ where: { id: member.id } })
    expect(updatedMember?.providerCustomerId).toBe('cus_new')
  })
})

// ── 2. 續扣 off-session 成功 → 同步回 SUCCESS ─────────────────────────────────

describe('15-stripe 2. 續扣 off-session 成功 → 同步回 SUCCESS', () => {
  it('off_session+confirm 扣已存卡，同步回 SUCCESS，無 clientSecret', async () => {
    const { order } = await seedOrderWithStoredCard(`stripe2-${Date.now()}@example.com`)

    const stubCreate = vi.fn().mockResolvedValue({
      id: 'pi_offses',
      client_secret: null,
      status: 'succeeded',
    })
    const stub = {
      customers: { create: vi.fn() },
      paymentIntents: { create: stubCreate },
    } as unknown as StripeClient

    const provider = new StripeProvider(stub)
    const result = await provider.charge({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      idempotencyKey: order.idempotencyKey,
    })

    expect(result.status).toBe('SUCCESS')
    expect(result.providerTxnId).toBe('pi_offses')
    expect(result.clientSecret).toBeUndefined()
  })
})

// ── 3. 續扣 off-session 失敗(StripeCardError) → 同步回 FAILED ─────────────────

describe('15-stripe 3. 續扣 off-session 失敗 → 同步回 FAILED', () => {
  it('StripeCardError 映成 FAILED，不擲出未捕捉例外', async () => {
    const { order } = await seedOrderWithStoredCard(`stripe3-${Date.now()}@example.com`)

    // payment_intent 放頂層：err.raw = 整個 constructor 參數，err.raw.payment_intent = {...}
    const cardError = new Stripe.errors.StripeCardError({
      type: 'card_error',
      message: 'Your card was declined.',
      code: 'authentication_required',
      payment_intent: { id: 'pi_failed_err' },
    } as unknown as Stripe.RawStripeEvent)
    const stubCreate = vi.fn().mockRejectedValue(cardError)
    const stub = {
      customers: { create: vi.fn() },
      paymentIntents: { create: stubCreate },
    } as unknown as StripeClient

    const provider = new StripeProvider(stub)
    const result = await provider.charge({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      idempotencyKey: order.idempotencyKey,
    })

    expect(result.status).toBe('FAILED')
    expect(result.providerTxnId).toBe('pi_failed_err')
  })
})

// ── 4. 續扣同時帶 customer + payment_method ──────────────────────────────────

describe('15-stripe 4. 續扣同時帶 customer + payment_method', () => {
  it('off-session create 帶 customer=cus_existing + payment_method=pm_stored', async () => {
    const { order } = await seedOrderWithStoredCard(`stripe4-${Date.now()}@example.com`)

    const stubCreate = vi.fn().mockResolvedValue({ id: 'pi_c4', client_secret: null, status: 'succeeded' })
    const stub = {
      customers: { create: vi.fn() },
      paymentIntents: { create: stubCreate },
    } as unknown as StripeClient

    await new StripeProvider(stub).charge({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      idempotencyKey: order.idempotencyKey,
    })

    const call = stubCreate.mock.calls[0][0]
    expect(call.customer).toBe('cus_existing')
    expect(call.payment_method).toBe('pm_stored')
    expect(call.off_session).toBe(true)
    expect(call.confirm).toBe(true)
  })
})

// ── 5. ChargeResult 形狀：Mock 不受影響 ──────────────────────────────────────

describe('15-stripe 5. ChargeResult 形狀：Mock 不受影響', () => {
  it('MockProvider.charge 回 {status:PENDING}，不含 clientSecret', async () => {
    const fakeProvider: PaymentProvider = {
      charge: vi.fn().mockResolvedValue({ providerTxnId: 'txn_mock', status: 'PENDING' }),
    }
    const result = await fakeProvider.charge({
      orderId: 'ord_x',
      amount: 1000,
      currency: 'TWD',
      idempotencyKey: 'key_x',
    })
    expect(result.status).toBe('PENDING')
    expect(result.clientSecret).toBeUndefined()
  })
})

// ── 6. /webhooks/stripe 驗簽失敗回 401 ───────────────────────────────────────

describe('15-stripe 6. /webhooks/stripe 驗簽失敗回 401', () => {
  it('constructEvent 擲錯 → 401', async () => {
    const stubWebhooks: StripeWebhooks = {
      constructEvent: vi.fn().mockImplementation(() => { throw new Error('Invalid signature') }),
    }
    const fakeProvider: PaymentProvider = {
      charge: vi.fn().mockResolvedValue({ providerTxnId: 'txn', status: 'PENDING' }),
    }
    const app = createApp({ paymentProvider: fakeProvider, stripeWebhooks: stubWebhooks })

    const res = await request(app)
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', 'bad_sig')
      .send(Buffer.from(JSON.stringify({ id: 'evt_x' })))

    expect(res.status).toBe(401)
  })
})

// ── 7. /webhooks/stripe succeeded → 三表同 tx 更新 + 存 providerPaymentMethodId

describe('15-stripe 7. /webhooks/stripe succeeded → 三表更新 + providerPaymentMethodId', () => {
  it('payment_intent.succeeded → Order=PAID, Payment=SUCCESS, Sub=ACTIVE, pmId 寫入', async () => {
    // 種 INCOMPLETE 訂閱 + PENDING Order + PENDING Payment
    const member = await seedMember(`stripe7-${Date.now()}@example.com`)
    const plan = await seedPlan()
    const sub = await prisma.subscription.create({
      data: {
        memberId: member.id,
        planId: plan.id,
        status: 'INCOMPLETE',
        retryCount: 0,
        cancelAtPeriodEnd: false,
        nextBillingDate: new Date(Date.now() + 30 * 864e5),
        startedAt: new Date(),
      },
    })
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
    await prisma.payment.create({
      data: {
        orderId: order.id,
        amount: 1000,
        currency: 'TWD',
        provider: 'stripe',
        providerTxnId: 'pi_webhook7',
        status: 'PENDING',
      },
    })

    // generateTestHeaderString 離線產生合法簽章
    const payload = JSON.stringify({
      id: 'evt_7',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_webhook7', payment_method: 'pm_saved7' } },
    })
    const secret = 'whsec_test_secret'
    const timestamp = Math.floor(Date.now() / 1000)
    const signed = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret,
      timestamp,
    })

    // 讓真實 constructEvent 驗簽（離線，不需網路）
    const stripeWebhooks: StripeWebhooks = {
      constructEvent: (body, header, _secret) =>
        Stripe.webhooks.constructEvent(body, header, secret) as unknown as ReturnType<StripeWebhooks['constructEvent']>,
    }

    const fakeProvider: PaymentProvider = {
      charge: vi.fn().mockResolvedValue({ providerTxnId: 'txn', status: 'PENDING' }),
    }
    const app = createApp({ paymentProvider: fakeProvider, stripeWebhooks })

    const res = await request(app)
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', signed)
      .send(payload)

    expect(res.status).toBe(200)

    const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } })
    const updatedPayment = await prisma.payment.findFirst({ where: { providerTxnId: 'pi_webhook7' } })
    const updatedSub = await prisma.subscription.findUnique({ where: { id: sub.id } })

    expect(updatedOrder?.status).toBe('PAID')
    expect(updatedPayment?.status).toBe('SUCCESS')
    expect(updatedSub?.status).toBe('ACTIVE')
    expect(updatedSub?.providerPaymentMethodId).toBe('pm_saved7')
  })
})

// ── 8. /webhooks/stripe 重送冪等回 200 ───────────────────────────────────────

describe('15-stripe 8. /webhooks/stripe 重送冪等回 200', () => {
  it('同一 providerTxnId 二次 POST → 200，狀態不重複更新', async () => {
    const member = await seedMember(`stripe8-${Date.now()}@example.com`)
    const plan = await seedPlan()
    const sub = await prisma.subscription.create({
      data: {
        memberId: member.id,
        planId: plan.id,
        status: 'INCOMPLETE',
        retryCount: 0,
        cancelAtPeriodEnd: false,
        nextBillingDate: new Date(Date.now() + 30 * 864e5),
        startedAt: new Date(),
      },
    })
    const order = await prisma.order.create({
      data: {
        memberId: member.id,
        subscriptionId: sub.id,
        amount: 1000,
        currency: 'TWD',
        status: 'PENDING',
        idempotencyKey: `${sub.id}:c8`,
      },
    })
    await prisma.payment.create({
      data: {
        orderId: order.id,
        amount: 1000,
        currency: 'TWD',
        provider: 'stripe',
        providerTxnId: 'pi_idem8',
        status: 'PENDING',
      },
    })

    const payload = JSON.stringify({
      id: 'evt_8',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_idem8', payment_method: 'pm_8' } },
    })
    const secret = 'whsec_idem8'
    const timestamp = Math.floor(Date.now() / 1000)
    const signed = Stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp })

    const stripeWebhooks: StripeWebhooks = {
      constructEvent: (body, header) =>
        Stripe.webhooks.constructEvent(body, header, secret) as unknown as ReturnType<StripeWebhooks['constructEvent']>,
    }
    const fakeProvider: PaymentProvider = {
      charge: vi.fn().mockResolvedValue({ providerTxnId: 'txn', status: 'PENDING' }),
    }
    const app = createApp({ paymentProvider: fakeProvider, stripeWebhooks })

    // 第一次
    await request(app)
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', signed)
      .send(payload)

    // 第二次（冪等）
    const res2 = await request(app)
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', signed)
      .send(payload)

    expect(res2.status).toBe(200)
    // Payment 只有一筆，且狀態是 SUCCESS
    const payments = await prisma.payment.findMany({ where: { providerTxnId: 'pi_idem8' } })
    expect(payments.length).toBe(1)
    expect(payments[0].status).toBe('SUCCESS')
  })
})

// ── 9. 續扣 FAILED → 走 dunning（同步路徑）────────────────────────────────────

describe('15-stripe 9. 續扣 FAILED → 走 dunning（同步路徑）', () => {
  it('off-session FAILED → billing cron 當場 applyPaymentOutcome → PAST_DUE, retryCount+1', async () => {
    const now = new Date('2026-07-01T00:00:00Z')
    const pastDate = new Date('2026-06-30T00:00:00Z')

    const member = await seedMember(`stripe9-${Date.now()}@example.com`, 'cus_dun')
    const plan = await prisma.plan.create({
      data: { name: 'Pro', amount: 1000, currency: 'TWD', intervalDays: 30, active: true },
    })
    const sub = await prisma.subscription.create({
      data: {
        memberId: member.id,
        planId: plan.id,
        status: 'ACTIVE',
        retryCount: 0,
        cancelAtPeriodEnd: false,
        nextBillingDate: pastDate,
        startedAt: new Date(),
        providerPaymentMethodId: 'pm_dun',
      },
    })

    // StripeCardError stub → FAILED 同步回傳
    const cardError = new Stripe.errors.StripeCardError({
      type: 'card_error',
      message: 'Card declined.',
      code: 'authentication_required',
      payment_intent: { id: 'pi_dun9' },
    } as unknown as Stripe.RawStripeEvent)
    const stubCreate = vi.fn().mockRejectedValue(cardError)
    const fakeStripeClient = {
      customers: { create: vi.fn() },
      paymentIntents: { create: stubCreate },
    } as unknown as StripeClient

    const stripeProvider = new StripeProvider(fakeStripeClient)

    // dunning 重試時也會 charge()，第二次也讓它 FAILED（為了不讓遞迴失控，限制一次）
    let callCount = 0
    stubCreate.mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.reject(cardError)
      return Promise.resolve({ id: `pi_retry${callCount}`, client_secret: null, status: 'succeeded' })
    })

    await runBillingCycle(now, stripeProvider)

    const updatedSub = await prisma.subscription.findUnique({ where: { id: sub.id } })
    expect(updatedSub?.status).toBe('PAST_DUE')
    expect(updatedSub?.retryCount).toBe(1)
  })
})

// ── 10. env PAYMENT_PROVIDER 切換不動 service（回歸護欄）─────────────────────

describe('15-stripe 10. env PAYMENT_PROVIDER 切換不動 service', () => {
  it('subscriptionService 不 import StripeProvider', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const serviceContent = fs.readFileSync(
      path.resolve(__dirname, '../src/services/subscriptionService.ts'),
      'utf-8',
    )
    expect(serviceContent).not.toContain('StripeProvider')
    expect(serviceContent).not.toContain('MockProvider')
  })

  it('paymentService 不 import StripeProvider', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const serviceContent = fs.readFileSync(
      path.resolve(__dirname, '../src/services/paymentService.ts'),
      'utf-8',
    )
    expect(serviceContent).not.toContain('StripeProvider')
  })
})
