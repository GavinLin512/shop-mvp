import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app'
import prisma from '../src/lib/prisma'
import { resetDb } from './setup'

const app = createApp()

describe('00-foundation', () => {
  beforeEach(async () => {
    await resetDb()
  })

  it('GET /health → 200 { status: "ok" }', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })

  it('Prisma 能連線且 5 張表存在', async () => {
    await expect(prisma.member.count()).resolves.toBe(0)
    await expect(prisma.plan.count()).resolves.toBe(0)
    await expect(prisma.subscription.count()).resolves.toBe(0)
    await expect(prisma.order.count()).resolves.toBe(0)
    await expect(prisma.payment.count()).resolves.toBe(0)
  })

  it('Order.idempotencyKey UNIQUE constraint 存在', async () => {
    const member = await prisma.member.create({
      data: { email: 'test@example.com', passwordHash: 'hash' },
    })

    await prisma.order.create({
      data: {
        memberId: member.id,
        amount: 1000,
        currency: 'TWD',
        idempotencyKey: 'idem-key-1',
      },
    })

    // 相同 idempotencyKey 再 insert 應拋 Prisma P2002（唯一鍵衝突）
    await expect(
      prisma.order.create({
        data: {
          memberId: member.id,
          amount: 1000,
          currency: 'TWD',
          idempotencyKey: 'idem-key-1',
        },
      })
    ).rejects.toMatchObject({ code: 'P2002' })
  })
})
