/**
 * 20-runtime-provider-switch 整合測試
 * 涵蓋 test.md 的 checklist 1–18（後端）。
 * Stripe client 以 stub 注入，零網路。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import prisma from '../src/lib/prisma'
import { createProviderRegistry, createCompatRegistry } from '../src/providers/ProviderRegistry'
import { MockProvider } from '../src/providers/MockProvider'
import { StripeProvider, type StripeClient } from '../src/providers/StripeProvider'
import { createApp } from '../src/app'
import type { StripeWebhooks } from '../src/routes/stripeWebhooks'
import type { PaymentProvider } from '../src/providers/PaymentProvider'
import { runBillingCycle } from '../src/jobs/billingCron'

const JWT_SECRET = process.env.JWT_SECRET!

// ── helpers ───────────────────────────────────────────────────────────────────

function adminToken(id: string) {
  return jwt.sign({ sub: id, role: 'ADMIN' }, JWT_SECRET)
}

function userToken(id: string) {
  return jwt.sign({ sub: id, role: 'USER' }, JWT_SECRET)
}

async function seedAdmin(tag: string) {
  return prisma.member.create({
    data: { email: `admin-rps-${tag}@t.com`, passwordHash: 'h', role: 'ADMIN', isSeed: true },
  })
}

async function seedUser(tag: string) {
  return prisma.member.create({
    data: { email: `user-rps-${tag}@t.com`, passwordHash: 'h' },
  })
}

async function seedPlan(tag: string) {
  return prisma.plan.create({
    data: { name: `Plan-rps-${tag}`, amount: 1000, currency: 'TWD', intervalDays: 30, active: true },
  })
}

/** Stripe client stub：charge 回 PI */
function makeStripeStub(clientSecretSuffix = 'secret'): StripeClient {
  return {
    customers: {
      create: vi.fn().mockResolvedValue({ id: 'cus_stub' }),
    },
    paymentIntents: {
      create: vi.fn().mockResolvedValue({
        id: `pi_stub_${clientSecretSuffix}`,
        client_secret: `pi_stub_${clientSecretSuffix}_secret`,
        status: 'requires_payment_method',
      }),
    },
  }
}

/** MockProvider stub：charge 回 PENDING */
function makeMockStub(): PaymentProvider & { charge: ReturnType<typeof vi.fn> } {
  return {
    name: 'mock',
    charge: vi.fn().mockResolvedValue({ providerTxnId: 'txn_mock', status: 'PENDING' as const }),
  }
}

// Stripe webhook stub 用於掛載路由測試
const stripeWebhooksStub: StripeWebhooks = {
  constructEvent: vi.fn().mockReturnValue({
    type: 'payment_intent.succeeded',
    data: { object: { id: 'pi_stub', metadata: {}, payment_method: 'pm_stub' } },
  }),
}

// ── env guards ────────────────────────────────────────────────────────────────

let savedEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  savedEnv = {
    DEMO_MODE: process.env.DEMO_MODE,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY,
    PAYMENT_PROVIDER: process.env.PAYMENT_PROVIDER,
  }
  process.env.DEMO_MODE = 'true'
})

afterEach(() => {
  Object.assign(process.env, savedEnv)
})

// ── 1–4. ProviderRegistry 單元 ────────────────────────────────────────────────

describe('20-runtime 1. ProviderRegistry 初值', () => {
  it('未設 PAYMENT_PROVIDER → currentName===mock', () => {
    delete process.env.PAYMENT_PROVIDER
    const r = createProviderRegistry({ mockProvider: makeMockStub() })
    expect(r.currentName()).toBe('mock')
  })

  it('PAYMENT_PROVIDER=stripe → currentName===stripe（覆寫 env）', () => {
    process.env.PAYMENT_PROVIDER = 'stripe'
    const r = createProviderRegistry({ mockProvider: makeMockStub() })
    expect(r.currentName()).toBe('stripe')
  })
})

describe('20-runtime 2. setCurrent', () => {
  it('setCurrent(stripe) → currentName===stripe', () => {
    const mock = makeMockStub()
    const stripe = new StripeProvider(makeStripeStub())
    const r = createProviderRegistry({ mockProvider: mock, stripeProvider: stripe })
    r.setCurrent('stripe')
    expect(r.currentName()).toBe('stripe')
    expect(r.current()).toBe(stripe)
  })
})

describe('20-runtime 3. get(name)', () => {
  it('get(mock) 和 get(stripe) 各回對應實作', () => {
    const mock = makeMockStub()
    const stripe = new StripeProvider(makeStripeStub())
    const r = createProviderRegistry({ mockProvider: mock, stripeProvider: stripe })
    expect(r.get('mock')).toBe(mock)
    expect(r.get('stripe')).toBe(stripe)
  })
})

describe('20-runtime 4. isConfigured(stripe) — lazy，boot 不 crash', () => {
  it('缺 STRIPE_SECRET_KEY → isConfigured(stripe)===false，且 boot 不擲錯', () => {
    delete process.env.STRIPE_SECRET_KEY
    delete process.env.STRIPE_WEBHOOK_SECRET
    // createProviderRegistry 以 new StripeProvider() 建 lazy stripe，不應在此擲錯
    expect(() => createProviderRegistry()).not.toThrow()
    const r = createProviderRegistry()
    expect(r.isConfigured('stripe')).toBe(false)
    expect(r.isConfigured('mock')).toBe(true)
  })
})

// ── 5–10. 切換端點（DEMO_MODE） ──────────────────────────────────────────────

describe('20-runtime 5. DEMO_MODE 關 → 404', () => {
  it('GET /demo/provider 回 404', async () => {
    process.env.DEMO_MODE = 'false'
    const app = createApp()
    const admin = await seedAdmin(`5g-${Date.now()}`)
    const res = await request(app).get('/demo/provider').set('Authorization', `Bearer ${adminToken(admin.id)}`)
    expect(res.status).toBe(404)
  })

  it('POST /demo/provider 回 404', async () => {
    process.env.DEMO_MODE = 'false'
    const app = createApp()
    const admin = await seedAdmin(`5gp-${Date.now()}`)
    const res = await request(app).post('/demo/provider').set('Authorization', `Bearer ${adminToken(admin.id)}`).send({ provider: 'mock' })
    expect(res.status).toBe(404)
  })
})

describe('20-runtime 6. Auth guard', () => {
  it('未登入 → 401', async () => {
    const app = createApp()
    const res = await request(app).post('/demo/provider').send({ provider: 'mock' })
    expect(res.status).toBe(401)
  })

  it('USER token → 403', async () => {
    const user = await seedUser(`6u-${Date.now()}`)
    const app = createApp()
    const res = await request(app).post('/demo/provider').set('Authorization', `Bearer ${userToken(user.id)}`).send({ provider: 'mock' })
    expect(res.status).toBe(403)
  })
})

describe('20-runtime 7. GET /demo/provider 反映當下狀態', () => {
  it('初始 mock → { current:mock, stripeConfigured:false }（test 無金鑰）', async () => {
    delete process.env.STRIPE_SECRET_KEY
    delete process.env.STRIPE_WEBHOOK_SECRET
    const app = createApp()
    const admin = await seedAdmin(`7-${Date.now()}`)
    const res = await request(app).get('/demo/provider').set('Authorization', `Bearer ${adminToken(admin.id)}`)
    expect(res.status).toBe(200)
    expect(res.body.current).toBe('mock')
    expect(res.body.stripeConfigured).toBe(false)
  })
})

describe('20-runtime 8. POST /demo/provider stripe 未 configured → 409', () => {
  it('stripe 未設金鑰 → 409, current 仍 mock', async () => {
    delete process.env.STRIPE_SECRET_KEY
    delete process.env.STRIPE_WEBHOOK_SECRET
    const app = createApp()
    const admin = await seedAdmin(`8-${Date.now()}`)
    const auth = `Bearer ${adminToken(admin.id)}`

    const res = await request(app).post('/demo/provider').set('Authorization', auth).send({ provider: 'stripe' })
    expect(res.status).toBe(409)

    // current 不變
    const get = await request(app).get('/demo/provider').set('Authorization', auth)
    expect(get.body.current).toBe('mock')
  })
})

describe('20-runtime 9. 切 stripe configured → /config 反映', () => {
  it('stub configured → POST /demo/provider stripe 200, GET /config.provider=stripe', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_stub'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_stub'
    process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_stub'

    const stripeStub = new StripeProvider(makeStripeStub())
    const mockStub = makeMockStub()
    const registry = createProviderRegistry({ mockProvider: mockStub, stripeProvider: stripeStub })
    const app = createApp({ registry })

    const admin = await seedAdmin(`9-${Date.now()}`)
    const auth = `Bearer ${adminToken(admin.id)}`

    const switchRes = await request(app).post('/demo/provider').set('Authorization', auth).send({ provider: 'stripe' })
    expect(switchRes.status).toBe(200)
    expect(switchRes.body.current).toBe('stripe')

    const cfg = await request(app).get('/config')
    expect(cfg.body.provider).toBe('stripe')
    expect(cfg.body.stripeConfigured).toBe(true)
    expect(cfg.body.publishableKey).toBe('pk_test_stub')
  })
})

describe('20-runtime 10. 切回 mock', () => {
  it('切 mock → current===mock', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_stub'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_stub'

    const registry = createProviderRegistry({
      mockProvider: makeMockStub(),
      stripeProvider: new StripeProvider(makeStripeStub()),
    })
    registry.setCurrent('stripe')
    const app = createApp({ registry })

    const admin = await seedAdmin(`10-${Date.now()}`)
    const auth = `Bearer ${adminToken(admin.id)}`

    const res = await request(app).post('/demo/provider').set('Authorization', auth).send({ provider: 'mock' })
    expect(res.status).toBe(200)
    expect(res.body.current).toBe('mock')
  })
})

// ── 11–13. provider 綁訂閱 + cron ────────────────────────────────────────────

describe('20-runtime 11. current=stripe 建訂閱 → Subscription.provider===stripe', () => {
  it('stripe stub 建訂閱後 DB 的 provider 欄位為 stripe', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_stub'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_stub'

    const stripeStub = new StripeProvider(makeStripeStub())
    const registry = createProviderRegistry({ mockProvider: makeMockStub(), stripeProvider: stripeStub })
    registry.setCurrent('stripe')
    const app = createApp({ registry })

    const member = await seedUser(`11m-${Date.now()}`)
    const plan = await seedPlan(`11-${Date.now()}`)

    const res = await request(app)
      .post('/subscriptions')
      .set('Authorization', `Bearer ${userToken(member.id)}`)
      .send({ planId: plan.id })

    expect(res.status).toBe(201)
    const subId = res.body.subscription.id
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subId } })
    expect(sub.provider).toBe('stripe')
  })
})

describe('20-runtime 12. 切回 mock，billing 仍用 stripe provider 扣 stripe 訂閱', () => {
  it('stripe 訂閱已到期，切回 mock 後 run-billing 仍調用 stripe stub', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_stub'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_stub'

    const stripeStub = makeStripeStub()
    const stripeProvider = new StripeProvider(stripeStub)
    const mockProvider = makeMockStub()
    const registry = createProviderRegistry({ mockProvider, stripeProvider })
    registry.setCurrent('stripe')

    // 直接在 DB 建一筆 ACTIVE stripe 訂閱（已到期），模擬首扣後 ACTIVE
    const member = await seedUser(`12m-${Date.now()}`)
    const plan = await seedPlan(`12-${Date.now()}`)
    // 建一個假 Stripe Customer 讓 off-session charge 走得通
    await prisma.member.update({ where: { id: member.id }, data: { providerCustomerId: 'cus_stub' } })

    const sub = await prisma.subscription.create({
      data: {
        memberId: member.id,
        planId: plan.id,
        status: 'ACTIVE',
        retryCount: 0,
        cancelAtPeriodEnd: false,
        nextBillingDate: new Date(Date.now() - 1000),
        startedAt: new Date(),
        provider: 'stripe',
        providerPaymentMethodId: 'pm_stub',
      },
    })

    // 切回 mock，run-billing 應依 sub.provider='stripe' 用 stripe stub
    registry.setCurrent('mock')
    await runBillingCycle(new Date(), registry)

    // StripeProvider 的 paymentIntents.create 應被呼叫（off-session 路徑）
    expect((stripeStub.paymentIntents.create as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0)
    // mock provider 的 charge 不應被呼叫（provider 不同）
    expect((mockProvider.charge as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0)

    // 清理
    await prisma.subscription.delete({ where: { id: sub.id } })
  })
})

describe('20-runtime 13. mock 訂閱用 mock 扣，互不干擾', () => {
  it('current=mock 建的訂閱，billing 用 mock provider', async () => {
    const mockProvider = makeMockStub()
    const registry = createProviderRegistry({ mockProvider, stripeProvider: new StripeProvider(makeStripeStub()) })
    // current 預設 mock

    const member = await seedUser(`13m-${Date.now()}`)
    const plan = await seedPlan(`13-${Date.now()}`)

    const sub = await prisma.subscription.create({
      data: {
        memberId: member.id,
        planId: plan.id,
        status: 'ACTIVE',
        retryCount: 0,
        cancelAtPeriodEnd: false,
        nextBillingDate: new Date(Date.now() - 1000),
        startedAt: new Date(),
        provider: 'mock',
      },
    })

    await runBillingCycle(new Date(), registry)
    expect((mockProvider.charge as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)

    await prisma.subscription.delete({ where: { id: sub.id } })
  })
})

// ── 14–16. create 回應 + /config ─────────────────────────────────────────────

describe('20-runtime 14. Mock 建訂閱 — 無 clientSecret', () => {
  it('POST /subscriptions mock → { subscription } 無 clientSecret', async () => {
    const registry = createProviderRegistry({ mockProvider: makeMockStub() })
    const app = createApp({ registry })

    const member = await seedUser(`14m-${Date.now()}`)
    const plan = await seedPlan(`14-${Date.now()}`)

    const res = await request(app)
      .post('/subscriptions')
      .set('Authorization', `Bearer ${userToken(member.id)}`)
      .send({ planId: plan.id })

    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('subscription')
    expect(res.body.clientSecret).toBeUndefined()
  })
})

describe('20-runtime 15. Stripe 首扣建訂閱 — 有 clientSecret', () => {
  it('POST /subscriptions stripe stub → { subscription, clientSecret }', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_stub'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_stub'

    const stripeStub = new StripeProvider(makeStripeStub('cs1'))
    const registry = createProviderRegistry({ mockProvider: makeMockStub(), stripeProvider: stripeStub })
    registry.setCurrent('stripe')
    const app = createApp({ registry })

    const member = await seedUser(`15m-${Date.now()}`)
    const plan = await seedPlan(`15-${Date.now()}`)

    const res = await request(app)
      .post('/subscriptions')
      .set('Authorization', `Bearer ${userToken(member.id)}`)
      .send({ planId: plan.id })

    expect(res.status).toBe(201)
    expect(res.body.subscription).toBeDefined()
    expect(typeof res.body.clientSecret).toBe('string')
    expect(res.body.clientSecret).toContain('pi_stub_cs1_secret')
  })
})

describe('20-runtime 16. GET /config stripeConfigured 與 publishableKey', () => {
  it('configured 時帶 stripeConfigured:true 與 publishableKey', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_stub'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_stub'
    process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_stub'

    const registry = createProviderRegistry({
      mockProvider: makeMockStub(),
      stripeProvider: new StripeProvider(makeStripeStub()),
    })
    const app = createApp({ registry })
    const res = await request(app).get('/config')
    expect(res.body.stripeConfigured).toBe(true)
    expect(res.body.publishableKey).toBe('pk_test_stub')
  })

  it('未 configured 時 stripeConfigured:false，不帶 publishableKey', async () => {
    delete process.env.STRIPE_SECRET_KEY
    delete process.env.STRIPE_WEBHOOK_SECRET
    const app = createApp()
    const res = await request(app).get('/config')
    expect(res.body.stripeConfigured).toBe(false)
    expect(res.body).not.toHaveProperty('publishableKey')
  })
})

// ── 17. Stripe webhook 永遠掛載（configured 即存在） ──────────────────────────

describe('20-runtime 17. Stripe webhook configured 即掛載，無論 current', () => {
  it('stripeWebhooks 提供 → /webhooks/stripe 存在（非 404），即使 current=mock', async () => {
    const registry = createProviderRegistry({
      mockProvider: makeMockStub(),
      stripeProvider: new StripeProvider(makeStripeStub()),
    })
    // current 維持 mock
    const app = createApp({ registry, stripeWebhooks: stripeWebhooksStub })

    // 送任意請求；缺 stripe-signature header → 401（路由存在），不是 404
    const res = await request(app)
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .send('{}')
    expect(res.status).not.toBe(404)
  })
})

// ── 18. mock 限定端點（force-fail / replay-webhook） ─────────────────────────

describe('20-runtime 18. current=stripe → force-fail/replay 回 409', () => {
  it('registry.current().name===stripe → force-fail 409', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_stub'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_stub'

    const registry = createProviderRegistry({
      mockProvider: makeMockStub(),
      stripeProvider: new StripeProvider(makeStripeStub()),
    })
    registry.setCurrent('stripe')
    const app = createApp({ registry })

    const admin = await seedAdmin(`18a-${Date.now()}`)
    const auth = `Bearer ${adminToken(admin.id)}`

    const r1 = await request(app).post('/demo/mock/force-fail').set('Authorization', auth).send({ enabled: true })
    expect(r1.status).toBe(409)

    const r2 = await request(app).post('/demo/mock/replay-webhook').set('Authorization', auth)
    expect(r2.status).toBe(409)
  })
})
