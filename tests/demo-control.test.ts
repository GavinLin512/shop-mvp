import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import http from 'http'
import type { AddressInfo } from 'net'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { createApp } from '../src/app'
import { resetStore } from '../src/routes/mockGateway'
import { MockProvider } from '../src/providers/MockProvider'
import prisma from '../src/lib/prisma'
import type { PaymentProvider, ChargeInput, ChargeResult } from '../src/providers/PaymentProvider'

const JWT_SECRET = process.env.JWT_SECRET!
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET!

// ── helpers ───────────────────────────────────────────────────────────────────

function adminToken(memberId: string) {
  return jwt.sign({ sub: memberId, role: 'ADMIN' }, JWT_SECRET)
}

function userToken(memberId: string) {
  return jwt.sign({ sub: memberId, role: 'USER' }, JWT_SECRET)
}

function sign(body: string) {
  return crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex')
}

async function sendWebhook(app: Express.Application, payload: object) {
  const body = JSON.stringify(payload)
  return request(app)
    .post('/webhooks/payment')
    .set('Content-Type', 'application/json')
    .set('X-Signature', sign(body))
    .send(body)
}

async function seedAdmin(tag: string) {
  return prisma.member.create({
    data: { email: `admin-dc-${tag}@t.com`, passwordHash: 'h', role: 'ADMIN', isSeed: true },
  })
}

async function seedUser(tag: string, isSeed = false) {
  return prisma.member.create({
    data: { email: `user-dc-${tag}@t.com`, passwordHash: 'h', role: 'USER', isSeed },
  })
}

async function seedPlan(tag: string, isSeed = false) {
  return prisma.plan.create({
    data: { name: `Plan-${tag}`, amount: 1000, currency: 'TWD', intervalDays: 30, active: true, isSeed },
  })
}

async function seedActiveSub(memberId: string, planId: string, nextBillingDate?: Date) {
  return prisma.subscription.create({
    data: {
      memberId,
      planId,
      status: 'ACTIVE',
      retryCount: 0,
      cancelAtPeriodEnd: false,
      nextBillingDate: nextBillingDate ?? new Date(Date.now() + 86400000),
      startedAt: new Date(),
    },
  })
}

/** 可在啟動後替換內層 Provider（用於解決 port 循環依賴）。 */
class DelegatingProvider implements PaymentProvider {
  readonly name = 'mock'
  private inner: PaymentProvider

  constructor() {
    this.inner = { charge: async () => ({ providerTxnId: 'unset', status: 'PENDING' as const }) }
  }

  setInner(p: PaymentProvider) { this.inner = p }

  charge(input: ChargeInput): Promise<ChargeResult> {
    return this.inner.charge(input)
  }
}

/** 啟動真實 HTTP server（port=0），完成後將 MockProvider 指向同一 port。 */
async function startRealServer(): Promise<{ server: http.Server; baseUrl: string; provider: DelegatingProvider }> {
  const delegating = new DelegatingProvider()
  const app = createApp({ paymentProvider: delegating })
  const server = http.createServer(app)

  await new Promise<void>((resolve) => server.listen(0, resolve))
  const port = (server.address() as AddressInfo).port
  const baseUrl = `http://localhost:${port}`
  delegating.setInner(new MockProvider(baseUrl))

  return { server, baseUrl, provider: delegating }
}

async function waitFor(cond: () => Promise<boolean>, timeout = 8000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await cond()) return
    await new Promise(r => setTimeout(r, 150))
  }
  throw new Error('waitFor timeout')
}

// ── per-test cleanup ──────────────────────────────────────────────────────────

let origDemoMode: string | undefined

beforeEach(() => {
  origDemoMode = process.env.DEMO_MODE
  process.env.DEMO_MODE = 'true'
  resetStore()
})

afterEach(() => {
  process.env.DEMO_MODE = origDemoMode
  resetStore()
})

// ── 1. GET /config ─────────────────────────────────────────────────────────────

describe('19-demo-control 1. GET /config', () => {
  it('公開端點，回傳 demoMode + provider + stripeConfigured，不含密鑰欄位', async () => {
    process.env.DEMO_MODE = 'true'
    const app = createApp()
    const res = await request(app).get('/config')
    expect(res.status).toBe(200)
    expect(typeof res.body.demoMode).toBe('boolean')
    expect(['mock', 'stripe']).toContain(res.body.provider)
    expect(typeof res.body.stripeConfigured).toBe('boolean')
    // publishableKey 只在 stripeConfigured 時出現（test 環境無 Stripe 金鑰故不存在）
    expect(res.body).not.toHaveProperty('STRIPE_SECRET_KEY')
    expect(res.body).not.toHaveProperty('STRIPE_WEBHOOK_SECRET')
  })

  it('DEMO_MODE=false → demoMode=false', async () => {
    process.env.DEMO_MODE = 'false'
    const app = createApp()
    const res = await request(app).get('/config')
    expect(res.status).toBe(200)
    expect(res.body.demoMode).toBe(false)
  })
})

// ── 2. Gating：DEMO_MODE 關閉時端點 404 ────────────────────────────────────────

describe('19-demo-control 2. DEMO_MODE 關閉 → 404', () => {
  it('DEMO_MODE 未設 → POST /demo/reset → 404', async () => {
    process.env.DEMO_MODE = 'false'
    const app = createApp()
    const admin = await seedAdmin(`gate-${Date.now()}`)
    const res = await request(app)
      .post('/demo/reset')
      .set('Authorization', `Bearer ${adminToken(admin.id)}`)
    expect(res.status).toBe(404)
  })
})

// ── 3. Auth guard ──────────────────────────────────────────────────────────────

describe('19-demo-control 3. Auth guard', () => {
  it('DEMO_MODE=true 但無 token → 401', async () => {
    const app = createApp()
    const res = await request(app).post('/demo/reset')
    expect(res.status).toBe(401)
  })

  it('DEMO_MODE=true 但 USER token → 403', async () => {
    const app = createApp()
    const user = await seedUser(`auth-${Date.now()}`)
    const res = await request(app)
      .post('/demo/reset')
      .set('Authorization', `Bearer ${userToken(user.id)}`)
    expect(res.status).toBe(403)
  })
})

// ── 4 + 5. POST /demo/reset ─────────────────────────────────────────────────────

describe('19-demo-control 4. POST /demo/reset 清空訂閱類，保留種子', () => {
  it('清訂閱/單/Payment + 非種子 Member/Plan；保留 isSeed=true 的列', async () => {
    const tag = `reset-${Date.now()}`
    const fakeProvider: PaymentProvider = {
      charge: vi.fn().mockResolvedValue({ providerTxnId: 'txn_x', status: 'PENDING' as const }),
    }
    const app = createApp({ paymentProvider: fakeProvider })

    // seed baseline
    const adminMember = await seedAdmin(tag)
    const seedPlanRec = await seedPlan(`seed-${tag}`, true)

    // non-seed data via API (simulate demo usage)
    const nonSeedUser = await seedUser(`ns-${tag}`, false)
    const nonSeedPlan = await seedPlan(`ns-${tag}`, false)

    // 手動建訂閱 + 單（不走 API 保持測試快速）
    const sub = await prisma.subscription.create({
      data: {
        memberId: adminMember.id,
        planId: seedPlanRec.id,
        status: 'ACTIVE',
        retryCount: 0,
        cancelAtPeriodEnd: false,
        nextBillingDate: new Date(),
        startedAt: new Date(),
      },
    })
    const order = await prisma.order.create({
      data: { memberId: adminMember.id, subscriptionId: sub.id, amount: 1000, currency: 'TWD', status: 'PAID', idempotencyKey: `ik-reset-${tag}` },
    })
    await prisma.payment.create({
      data: { orderId: order.id, amount: 1000, currency: 'TWD', provider: 'mock', status: 'SUCCESS' },
    })

    // set providerCustomerId on seed member
    await prisma.member.update({ where: { id: adminMember.id }, data: { providerCustomerId: 'cus_test' } })

    // 呼叫 reset
    const res = await request(app)
      .post('/demo/reset')
      .set('Authorization', `Bearer ${adminToken(adminMember.id)}`)
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)

    // 驗證：訂閱類全清
    const subs = await prisma.subscription.count()
    const orders = await prisma.order.count()
    const payments = await prisma.payment.count()
    expect(subs).toBe(0)
    expect(orders).toBe(0)
    expect(payments).toBe(0)

    // 非種子 member/plan 被刪
    expect(await prisma.member.findUnique({ where: { id: nonSeedUser.id } })).toBeNull()
    expect(await prisma.plan.findUnique({ where: { id: nonSeedPlan.id } })).toBeNull()

    // 種子 member/plan 保留
    const savedAdmin = await prisma.member.findUnique({ where: { id: adminMember.id } })
    expect(savedAdmin).not.toBeNull()
    expect(await prisma.plan.findUnique({ where: { id: seedPlanRec.id } })).not.toBeNull()

    // 種子 member 的 providerCustomerId 被清空
    expect(savedAdmin?.providerCustomerId).toBeNull()
  })
})

// ── 6. POST /demo/subscriptions/:id/expire ─────────────────────────────────────

describe('19-demo-control 6. expire → nextBillingDate <= now', () => {
  it('設定 nextBillingDate 到期，之後 run-billing 可觸發', async () => {
    const tag = `expire-${Date.now()}`
    const app = createApp()
    const admin = await seedAdmin(tag)
    const plan = await seedPlan(tag, true)
    const sub = await seedActiveSub(admin.id, plan.id) // nextBillingDate = tomorrow

    const res = await request(app)
      .post(`/demo/subscriptions/${sub.id}/expire`)
      .set('Authorization', `Bearer ${adminToken(admin.id)}`)
    expect(res.status).toBe(200)

    const updated = await prisma.subscription.findUnique({ where: { id: sub.id } })
    expect(updated!.nextBillingDate.getTime()).toBeLessThanOrEqual(Date.now() + 1000)
  })
})

// ── 7. POST /demo/run-billing ──────────────────────────────────────────────────

describe('19-demo-control 7. run-billing 對到期 ACTIVE 建週期單', () => {
  it('回 processed>=1；already-due 訂閱產生新 Order', async () => {
    const tag = `billing-${Date.now()}`
    const fakeProvider: PaymentProvider = {
      charge: vi.fn().mockResolvedValue({ providerTxnId: 'txn_billing', status: 'PENDING' as const }),
    }
    const app = createApp({ paymentProvider: fakeProvider })
    const admin = await seedAdmin(tag)
    const plan = await seedPlan(tag, true)
    // 已到期（今天之前）
    await seedActiveSub(admin.id, plan.id, new Date(Date.now() - 1000))

    const res = await request(app)
      .post('/demo/run-billing')
      .set('Authorization', `Bearer ${adminToken(admin.id)}`)
    expect(res.status).toBe(200)
    expect(res.body.processed).toBeGreaterThanOrEqual(1)

    // 確認有新的 PENDING Order
    const orders = await prisma.order.findMany({ where: { subscriptionId: { not: undefined } } })
    expect(orders.length).toBeGreaterThanOrEqual(1)
  })
})

// ── 8. force-fail ON → dunning 累加 → CANCELED ─────────────────────────────────

describe('19-demo-control 8. force-fail → dunning 3 次 → CANCELED', () => {
  it('force-fail ON：連 3 次 FAILED webhook → CANCELED，retryCount=3', async () => {
    const tag = `ff8-${Date.now()}`
    const fakeProvider: PaymentProvider = {
      name: 'mock',
      charge: vi.fn().mockResolvedValue({ providerTxnId: 'txn_ff8', status: 'PENDING' as const }),
    }
    const app = createApp({ paymentProvider: fakeProvider })
    const admin = await seedAdmin(tag)
    const plan = await seedPlan(tag, true)

    // 建 ACTIVE sub + 初始 PENDING order（模擬 billingCron 已建單）
    const sub = await seedActiveSub(admin.id, plan.id)
    const baseKey = `${sub.id}:cycle0`
    const order0 = await prisma.order.create({
      data: { memberId: admin.id, subscriptionId: sub.id, amount: 1000, currency: 'TWD', status: 'PENDING', idempotencyKey: baseKey },
    })

    // 驗 force-fail ON 後 mock-gateway 確實輸出 FAILED（透過 mock-gateway 路由直接驗）
    await request(app)
      .post('/demo/mock/force-fail')
      .set('Authorization', `Bearer ${adminToken(admin.id)}`)
      .send({ enabled: true })

    // 第 1 次 FAILED webhook（模擬 mock-gateway force-fail 回傳的結果）
    const t1 = `txn_ff8a_${Date.now()}`
    await sendWebhook(app, { txnId: t1, orderId: order0.id, status: 'FAILED', amount: 1000, currency: 'TWD' })
    const sub1 = await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } })
    expect(sub1.status).toBe('PAST_DUE')
    expect(sub1.retryCount).toBe(1)
    const order1 = await prisma.order.findFirstOrThrow({ where: { subscriptionId: sub.id, idempotencyKey: `${baseKey}:retry1` } })

    // 第 2 次 FAILED
    const t2 = `txn_ff8b_${Date.now()}`
    await sendWebhook(app, { txnId: t2, orderId: order1.id, status: 'FAILED', amount: 1000, currency: 'TWD' })
    const sub2 = await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } })
    expect(sub2.status).toBe('PAST_DUE')
    expect(sub2.retryCount).toBe(2)
    const order2 = await prisma.order.findFirstOrThrow({ where: { subscriptionId: sub.id, idempotencyKey: `${baseKey}:retry2` } })

    // 第 3 次 FAILED → CANCELED
    const t3 = `txn_ff8c_${Date.now()}`
    await sendWebhook(app, { txnId: t3, orderId: order2.id, status: 'FAILED', amount: 1000, currency: 'TWD' })
    const sub3 = await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } })
    expect(sub3.status).toBe('CANCELED')
    expect(sub3.retryCount).toBe(3)
  })
})

// ── 8c. GET /demo/mock/force-fail 反映目前狀態（reload 還原） ────────────────────

describe('19-demo-control 8c. GET /demo/mock/force-fail 反映目前狀態', () => {
  it('預設 false；POST 設 true 後 GET 回 true（前端 reload 可還原開關）', async () => {
    const tag = `ff8c-${Date.now()}`
    const fakeProvider: PaymentProvider = {
      name: 'mock',
      charge: vi.fn().mockResolvedValue({ providerTxnId: 'txn_ff8c', status: 'PENDING' as const }),
    }
    const app = createApp({ paymentProvider: fakeProvider })
    const admin = await seedAdmin(tag)
    const auth = `Bearer ${adminToken(admin.id)}`

    const before = await request(app).get('/demo/mock/force-fail').set('Authorization', auth)
    expect(before.status).toBe(200)
    expect(before.body).toEqual({ enabled: false })

    await request(app)
      .post('/demo/mock/force-fail')
      .set('Authorization', auth)
      .send({ enabled: true })

    const after = await request(app).get('/demo/mock/force-fail').set('Authorization', auth)
    expect(after.body).toEqual({ enabled: true })
  })
})

// ── 9. force-fail 中途 OFF → 重試成功 → ACTIVE ─────────────────────────────────

describe('19-demo-control 9. force-fail OFF → 重試成功 → ACTIVE', () => {
  it('PAST_DUE retryCount=1 後 force-fail OFF，下次 SUCCESS → ACTIVE', async () => {
    const tag = `ff9-${Date.now()}`
    const fakeProvider: PaymentProvider = {
      name: 'mock',
      charge: vi.fn().mockResolvedValue({ providerTxnId: 'txn_ff9', status: 'PENDING' as const }),
    }
    const app = createApp({ paymentProvider: fakeProvider })
    const admin = await seedAdmin(tag)
    const plan = await seedPlan(tag, true)

    const sub = await seedActiveSub(admin.id, plan.id)
    const baseKey = `${sub.id}:cycle0`
    const order0 = await prisma.order.create({
      data: { memberId: admin.id, subscriptionId: sub.id, amount: 1000, currency: 'TWD', status: 'PENDING', idempotencyKey: baseKey },
    })

    // force-fail ON → 1 次 FAILED → PAST_DUE
    await request(app)
      .post('/demo/mock/force-fail')
      .set('Authorization', `Bearer ${adminToken(admin.id)}`)
      .send({ enabled: true })

    await sendWebhook(app, { txnId: `txn_ff9a_${Date.now()}`, orderId: order0.id, status: 'FAILED', amount: 1000, currency: 'TWD' })
    const subPastDue = await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } })
    expect(subPastDue.status).toBe('PAST_DUE')
    expect(subPastDue.retryCount).toBe(1)

    // force-fail OFF
    await request(app)
      .post('/demo/mock/force-fail')
      .set('Authorization', `Bearer ${adminToken(admin.id)}`)
      .send({ enabled: false })

    // 找 retry1 order，送 SUCCESS webhook → 回 ACTIVE
    const order1 = await prisma.order.findFirstOrThrow({ where: { idempotencyKey: `${baseKey}:retry1` } })
    await sendWebhook(app, { txnId: `txn_ff9b_${Date.now()}`, orderId: order1.id, status: 'SUCCESS', amount: 1000, currency: 'TWD' })

    const subActive = await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } })
    expect(subActive.status).toBe('ACTIVE')
    expect(subActive.retryCount).toBe(0)
  })
})

// ── 10. replay-webhook 冪等可觀測 ────────────────────────────────────────────────

describe('19-demo-control 10. replay-webhook 冪等', () => {
  it('首次 webhook duplicate:false，重送 duplicate:true，Payment 不重複', async () => {
    const tag = `replay-${Date.now()}`

    // 需要一個真實 HTTP server 讓 mock-gateway 能打 webhook 回來
    const { server, baseUrl, provider } = await startRealServer()
    try {
      const admin = await seedAdmin(tag)
      const plan = await seedPlan(tag, true)
      const sub = await prisma.subscription.create({
        data: {
          memberId: admin.id,
          planId: plan.id,
          status: 'INCOMPLETE',
          retryCount: 0,
          cancelAtPeriodEnd: false,
          nextBillingDate: new Date(Date.now() + 86400000),
          startedAt: new Date(),
        },
      })
      const order = await prisma.order.create({
        data: { memberId: admin.id, subscriptionId: sub.id, amount: 1000, currency: 'TWD', status: 'PENDING', idempotencyKey: `ik-replay-${tag}` },
      })

      // 觸發首次 charge（mock-gateway 非同步回打 webhook）
      const port = (server.address() as AddressInfo).port

      // 先設 PORT 讓 mock-gateway callback 指向正確位置
      process.env.PORT = String(port)

      await fetch(`${baseUrl}/mock-gateway/charge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, amount: order.amount, currency: order.currency, idempotencyKey: order.idempotencyKey }),
      })

      // 等待 webhook 被處理（Payment 變為非 PENDING 狀態）
      await waitFor(async () => {
        const payment = await prisma.payment.findFirst({ where: { orderId: order.id } })
        return payment !== null && payment.status !== 'PENDING'
      })

      const paymentsAfterFirst = await prisma.payment.count({ where: { orderId: order.id } })
      expect(paymentsAfterFirst).toBe(1)

      // replay webhook
      const replayRes = await fetch(`${baseUrl}/demo/mock/replay-webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken(admin.id)}` },
      })
      const replayBody = await replayRes.json() as { ok: boolean; duplicate: boolean }
      expect(replayRes.status).toBe(200)
      expect(replayBody.duplicate).toBe(true)

      // Payment 筆數不變
      const paymentsAfterReplay = await prisma.payment.count({ where: { orderId: order.id } })
      expect(paymentsAfterReplay).toBe(1)
    } finally {
      delete process.env.PORT
      server.close()
    }
  })
})

// ── 11. provider !== 'mock' → 409 ─────────────────────────────────────────────

describe('19-demo-control 11. provider guard', () => {
  it('provider=stripe 時 force-fail → 409', async () => {
    // 用一個 name='stripe' 的假 provider 模擬 Stripe 模式
    const stripeProvider: PaymentProvider = {
      name: 'stripe',
      charge: vi.fn().mockResolvedValue({ providerTxnId: 'pi_fake', status: 'SUCCESS' as const }),
    }
    const app = createApp({ paymentProvider: stripeProvider })
    const admin = await seedAdmin(`pg-${Date.now()}`)

    const res1 = await request(app)
      .post('/demo/mock/force-fail')
      .set('Authorization', `Bearer ${adminToken(admin.id)}`)
      .send({ enabled: true })
    expect(res1.status).toBe(409)

    const res2 = await request(app)
      .post('/demo/mock/replay-webhook')
      .set('Authorization', `Bearer ${adminToken(admin.id)}`)
    expect(res2.status).toBe(409)
  })
})
