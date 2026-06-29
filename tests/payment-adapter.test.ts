import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import http from 'http'
import type { AddressInfo } from 'net'
import { createApp } from '../src/app'
import { MockProvider } from '../src/providers/MockProvider'
import type { PaymentProvider } from '../src/providers/PaymentProvider'
import prisma from '../src/lib/prisma'
import { resetStore } from '../src/routes/mockGateway'

const JWT_SECRET = process.env.JWT_SECRET!
const userToken = jwt.sign({ sub: 'test-user', role: 'USER' }, JWT_SECRET)

// ── test helpers ─────────────────────────────────────────────────────────────

async function seedOrderWithMember(overrides?: { amount?: number; currency?: string }) {
  const member = await prisma.member.create({
    data: { email: `pa-${Date.now()}@example.com`, passwordHash: 'hash' },
  })
  const order = await prisma.order.create({
    data: {
      memberId: member.id,
      amount: overrides?.amount ?? 1000,
      currency: overrides?.currency ?? 'TWD',
      idempotencyKey: `sub_test:cycle0-${Date.now()}`,
    },
  })
  return { member, order }
}

// ── 1. MockProvider.charge 回 providerTxnId（整合：實際打 mock-gateway）──────

describe('08-payment-adapter 1. MockProvider.charge 回 providerTxnId [tracer bullet]', () => {
  let server: http.Server
  let provider: MockProvider

  beforeAll(async () => {
    const app = createApp()
    server = await new Promise<http.Server>(resolve => {
      const s = app.listen(0, () => resolve(s))
    })
    const port = (server.address() as AddressInfo).port
    provider = new MockProvider(`http://localhost:${port}`)
  })

  afterAll(() => {
    server.close()
    resetStore()
  })

  it('charge 回傳 {providerTxnId, status:"PENDING"}', async () => {
    const result = await provider.charge({
      orderId: 'ord_1',
      amount: 1000,
      currency: 'TWD',
      idempotencyKey: 'key_adapter_1',
    })

    expect(result.providerTxnId).toMatch(/^txn_/)
    expect(result.status).toBe('PENDING')
  })
})

// ── 2. service 只依賴介面（可注入 fake）────────────────────────────────────

describe('08-payment-adapter 2. service 只依賴介面（可注入 fake）', () => {
  const fakeCharge = vi.fn().mockResolvedValue({
    providerTxnId: 'txn_fake',
    status: 'PENDING' as const,
  })
  const fakeProvider: PaymentProvider = { charge: fakeCharge }
  const testApp = createApp({ paymentProvider: fakeProvider })

  let orderId: string
  let idempotencyKey: string

  // setup.ts 的 beforeEach 先 TRUNCATE，再由此 beforeEach 補建資料
  beforeEach(async () => {
    const { order } = await seedOrderWithMember()
    orderId = order.id
    idempotencyKey = order.idempotencyKey
  })

  it('fake.charge 被以正確參數呼叫', async () => {
    await request(testApp)
      .post('/payments/charge')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ orderId })

    expect(fakeCharge).toHaveBeenCalledWith({
      orderId,
      amount: 1000,
      currency: 'TWD',
      idempotencyKey,
    })
  })
})

// ── 3. POST /payments/charge 建 PENDING Payment ────────────────────────────

describe('08-payment-adapter 3. POST /payments/charge 建 PENDING Payment', () => {
  const fakeCharge = vi.fn().mockResolvedValue({
    providerTxnId: 'txn_stub',
    status: 'PENDING' as const,
  })
  const fakeProvider: PaymentProvider = { charge: fakeCharge }
  const testApp = createApp({ paymentProvider: fakeProvider })

  it('建 Payment(status=PENDING) 並回 providerTxnId', async () => {
    const { order } = await seedOrderWithMember({ amount: 2000, currency: 'USD' })

    const res = await request(testApp)
      .post('/payments/charge')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ orderId: order.id })

    expect(res.status).toBe(200)
    expect(res.body.providerTxnId).toBe('txn_stub')

    const payment = await prisma.payment.findFirst({ where: { orderId: order.id } })
    expect(payment).toBeTruthy()
    expect(payment!.status).toBe('PENDING')
    expect(payment!.providerTxnId).toBe('txn_stub')
    expect(payment!.amount).toBe(2000)
    expect(payment!.currency).toBe('USD')
  })
})
