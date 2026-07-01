import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createApp } from '../src/app'
import type { PaymentProvider } from '../src/providers/PaymentProvider'
import prisma from '../src/lib/prisma'

const JWT_SECRET = process.env.JWT_SECRET!

// ── helpers ───────────────────────────────────────────────────────────────────

const fakeProvider: PaymentProvider = {
  charge: vi.fn().mockResolvedValue({ providerTxnId: 'txn_vis', status: 'PENDING' as const }),
}
const app = createApp({ paymentProvider: fakeProvider })

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

// ── 1. 本人隔離（核心）────────────────────────────────────────────────────────

describe('18-visibility 1. GET /subscriptions 本人隔離', () => {
  it('只回本人的訂閱；他人資料不外洩', async () => {
    const ts = Date.now()
    const memberA = await seedMember(`vis1a-${ts}@example.com`)
    const memberB = await seedMember(`vis1b-${ts}@example.com`)
    const plan = await seedPlan()

    // A 訂閱
    const aRes = await request(app)
      .post('/subscriptions')
      .set('Authorization', `Bearer ${makeToken(memberA.id)}`)
      .send({ planId: plan.id })
    const aSubId = aRes.body.subscription.id

    // B 訂閱
    const bRes = await request(app)
      .post('/subscriptions')
      .set('Authorization', `Bearer ${makeToken(memberB.id)}`)
      .send({ planId: plan.id })
    const bSubId = bRes.body.subscription.id

    const res = await request(app)
      .get('/subscriptions')
      .set('Authorization', `Bearer ${makeToken(memberA.id)}`)

    expect(res.status).toBe(200)
    const ids = res.body.map((s: { id: string }) => s.id)
    // A 的訂閱出現
    expect(ids).toContain(aSubId)
    // B 的訂閱不出現（本人隔離核心驗證）
    expect(ids).not.toContain(bSubId)
  })
})

// ── 2. 排序 + planName ────────────────────────────────────────────────────────

describe('18-visibility 2. GET /subscriptions 排序 + planName', () => {
  it('依 startedAt 新→舊，item 帶 planName', async () => {
    const ts = Date.now()
    const member = await seedMember(`vis2-${ts}@example.com`)
    const plan = await seedPlan()
    const token = makeToken(member.id)

    // 建兩筆訂閱（startedAt 不同）。直接寫 DB 跳過「未結束不可再訂」守衛——
    // 本案測的是清單排序與 planName，歷史本就可能有舊 CANCELED + 新訂閱並存。
    await prisma.subscription.create({
      data: {
        memberId: member.id, planId: plan.id, status: 'CANCELED',
        retryCount: 0, cancelAtPeriodEnd: true,
        nextBillingDate: new Date(ts), startedAt: new Date(ts),
      },
    })
    await prisma.subscription.create({
      data: {
        memberId: member.id, planId: plan.id, status: 'INCOMPLETE',
        retryCount: 0, cancelAtPeriodEnd: false,
        nextBillingDate: new Date(ts + 1000), startedAt: new Date(ts + 1000),
      },
    })

    const res = await request(app)
      .get('/subscriptions')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.length).toBe(2)
    // index 0 為較新的（startedAt 新→舊）
    expect(new Date(res.body[0].startedAt) >= new Date(res.body[1].startedAt)).toBe(true)
    // 每筆帶 planName
    expect(res.body[0].planName).toBe('Basic')
    expect(res.body[1].planName).toBe('Basic')
  })
})

// ── 3. 未認證 ─────────────────────────────────────────────────────────────────

describe('18-visibility 3. GET /subscriptions 未認證 → 401', () => {
  it('不帶 token 回 401', async () => {
    const res = await request(app).get('/subscriptions')
    expect(res.status).toBe(401)
  })
})

// ── 4. Admin 全部清單 ──────────────────────────────────────────────────────────

describe('18-visibility 4. GET /admin/subscriptions Admin 全部清單', () => {
  it('回全部，item 含 memberEmail / amount / planName，依 startedAt 新→舊', async () => {
    const ts = Date.now()
    const memberC = await seedMember(`vis4c-${ts}@example.com`)
    const memberD = await seedMember(`vis4d-${ts}@example.com`)
    const admin = await seedMember(`vis4admin-${ts}@example.com`)
    const plan = await seedPlan()

    await request(app)
      .post('/subscriptions')
      .set('Authorization', `Bearer ${makeToken(memberC.id)}`)
      .send({ planId: plan.id })
    await request(app)
      .post('/subscriptions')
      .set('Authorization', `Bearer ${makeToken(memberD.id)}`)
      .send({ planId: plan.id })

    const res = await request(app)
      .get('/admin/subscriptions')
      .set('Authorization', `Bearer ${makeToken(admin.id, 'ADMIN')}`)

    expect(res.status).toBe(200)
    expect(res.body.length).toBeGreaterThanOrEqual(2)

    // 確認 DTO 欄位
    const item = res.body[0]
    expect(item).toHaveProperty('memberEmail')
    expect(item).toHaveProperty('planName')
    expect(item).toHaveProperty('amount')
    expect(item).toHaveProperty('currency')
    expect(item).toHaveProperty('startedAt')

    // 排序新→舊
    for (let i = 0; i < res.body.length - 1; i++) {
      expect(new Date(res.body[i].startedAt) >= new Date(res.body[i + 1].startedAt)).toBe(true)
    }
  })
})

// ── 5. Admin 端點 RBAC ────────────────────────────────────────────────────────

describe('18-visibility 5. GET /admin/subscriptions USER → 403', () => {
  it('一般 USER 打 admin 端點回 403', async () => {
    const ts = Date.now()
    const user = await seedMember(`vis5-${ts}@example.com`)

    const res = await request(app)
      .get('/admin/subscriptions')
      .set('Authorization', `Bearer ${makeToken(user.id, 'USER')}`)

    expect(res.status).toBe(403)
  })
})

// ── 6. Admin 期末取消他人訂閱（冪等）─────────────────────────────────────────

describe('18-visibility 6. Admin 期末取消他人訂閱', () => {
  it('cancelAtPeriodEnd=true, status 仍 ACTIVE；再打一次冪等回 200', async () => {
    const ts = Date.now()
    const member = await seedMember(`vis6m-${ts}@example.com`)
    const admin = await seedMember(`vis6a-${ts}@example.com`)
    const plan = await seedPlan()

    const subRes = await request(app)
      .post('/subscriptions')
      .set('Authorization', `Bearer ${makeToken(member.id)}`)
      .send({ planId: plan.id })
    const subId = subRes.body.subscription.id

    // admin 取消他人訂閱
    const cancelRes = await request(app)
      .post(`/subscriptions/${subId}/cancel`)
      .set('Authorization', `Bearer ${makeToken(admin.id, 'ADMIN')}`)

    expect(cancelRes.status).toBe(200)
    expect(cancelRes.body.cancelAtPeriodEnd).toBe(true)
    expect(cancelRes.body.status).toBe('INCOMPLETE') // 此時還沒 webhook，狀態仍 INCOMPLETE

    // 冪等：再打一次回 200，cancelAtPeriodEnd 仍 true（DECISION.md #9）
    const cancelRes2 = await request(app)
      .post(`/subscriptions/${subId}/cancel`)
      .set('Authorization', `Bearer ${makeToken(admin.id, 'ADMIN')}`)

    expect(cancelRes2.status).toBe(200)
    expect(cancelRes2.body.cancelAtPeriodEnd).toBe(true)
  })
})

// ── 7. 續扣可觀測性：billedCount / lastBilledAt ────────────────────────────────

describe('18-visibility 7. billedCount 反映成功扣款次數', () => {
  // 直接寫 DB 種一筆 ACTIVE 訂閱 + N 張 PAID 訂單，模擬續扣歷史
  async function seedSubWithPaidOrders(memberId: string, planId: string, paidCount: number) {
    const sub = await prisma.subscription.create({
      data: {
        memberId, planId, status: 'ACTIVE',
        retryCount: 0, cancelAtPeriodEnd: false,
        nextBillingDate: new Date(Date.now() + 30 * 864e5), startedAt: new Date(),
      },
    })
    for (let i = 0; i < paidCount; i++) {
      await prisma.order.create({
        data: {
          memberId, subscriptionId: sub.id, amount: 1000, currency: 'TWD',
          status: 'PAID', idempotencyKey: `${sub.id}:paid${i}`,
          createdAt: new Date(Date.now() + i * 1000),
        },
      })
    }
    return sub
  }

  it('GET /subscriptions 帶 billedCount（PAID 訂單數）與 lastBilledAt（最新 PAID 時間）', async () => {
    const ts = Date.now()
    const member = await seedMember(`vis7-${ts}@example.com`)
    const plan = await seedPlan()
    await seedSubWithPaidOrders(member.id, plan.id, 3)

    const res = await request(app)
      .get('/subscriptions')
      .set('Authorization', `Bearer ${makeToken(member.id)}`)

    expect(res.status).toBe(200)
    expect(res.body[0].billedCount).toBe(3)
    expect(res.body[0].lastBilledAt).toBeTruthy()
  })

  it('未成功扣款（僅 PENDING 首單）→ billedCount=0、lastBilledAt=null', async () => {
    const ts = Date.now()
    const member = await seedMember(`vis7b-${ts}@example.com`)
    const plan = await seedPlan()
    // 走 API 建訂閱：Mock charge 回 PENDING，首單 PENDING，尚無 PAID
    await request(app)
      .post('/subscriptions')
      .set('Authorization', `Bearer ${makeToken(member.id)}`)
      .send({ planId: plan.id })

    const res = await request(app)
      .get('/subscriptions')
      .set('Authorization', `Bearer ${makeToken(member.id)}`)

    expect(res.status).toBe(200)
    expect(res.body[0].billedCount).toBe(0)
    expect(res.body[0].lastBilledAt).toBeNull()
  })
})
