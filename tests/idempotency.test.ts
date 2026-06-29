import { describe, it, expect } from 'vitest'
import prisma from '../src/lib/prisma'
import { buildOrderKey } from '../src/lib/idempotency'
import { orderRepo } from '../src/repositories/orderRepo'

// ── 測試用 seed helper ───────────────────────────────────────────────────────

async function seedMember() {
  return prisma.member.create({
    data: {
      email: `test-${Date.now()}@example.com`,
      passwordHash: 'hash',
    },
  })
}

// ── 單元測試：key 生成 ───────────────────────────────────────────────────────

describe('06-idempotency - key 生成', () => {
  describe('1. key 生成具決定性 [tracer bullet]', () => {
    it('首單 key 格式：sub_<id>:cycle0', () => {
      const key = buildOrderKey('sub_1', 'cycle0')
      expect(key).toBe('sub_1:cycle0')
    })

    it('多次呼叫結果相同（決定性）', () => {
      expect(buildOrderKey('sub_1', 'cycle0')).toBe(buildOrderKey('sub_1', 'cycle0'))
    })

    it('週期 key 格式：sub_<id>:<YYYY-MM-DD>', () => {
      const key = buildOrderKey('sub_1', '2026-07-01')
      expect(key).toBe('sub_1:2026-07-01')
    })
  })

  describe('2. 重試 key 與原 key 不同', () => {
    it('retry1 後綴使 key 不同於原週期 key', () => {
      const base = buildOrderKey('sub_1', '2026-07-01')
      const retry = buildOrderKey('sub_1', '2026-07-01:retry1')
      expect(retry).not.toBe(base)
      expect(retry).toBe('sub_1:2026-07-01:retry1')
    })
  })
})

// ── 整合測試：DB UNIQUE 行為（需真實 DB）────────────────────────────────────

describe('06-idempotency - DB UNIQUE 行為', () => {
  describe('3. 相同 idempotencyKey 插入只留一筆', () => {
    it('第二次 createIdempotent 不新增，回既有 Order', async () => {
      const member = await seedMember()
      const key = buildOrderKey('sub_test', 'cycle0')
      const input = {
        memberId: member.id,
        amount: 1000,
        currency: 'TWD',
        idempotencyKey: key,
      }

      const first = await orderRepo.createIdempotent(input)
      const second = await orderRepo.createIdempotent(input)

      // 回傳相同筆（id 相同）
      expect(second.id).toBe(first.id)

      // DB 確實只有一筆
      const count = await prisma.order.count({ where: { idempotencyKey: key } })
      expect(count).toBe(1)
    })
  })

  describe('4. 不同 key 各自建立', () => {
    it('原 key 與 retry1 key 各建一筆，DB 共兩筆', async () => {
      const member = await seedMember()
      const baseKey = buildOrderKey('sub_test', '2026-07-01')
      const retryKey = buildOrderKey('sub_test', '2026-07-01:retry1')
      const base = { memberId: member.id, amount: 1000, currency: 'TWD' }

      await orderRepo.createIdempotent({ ...base, idempotencyKey: baseKey })
      await orderRepo.createIdempotent({ ...base, idempotencyKey: retryKey })

      const count = await prisma.order.count({
        where: { idempotencyKey: { in: [baseKey, retryKey] } },
      })
      expect(count).toBe(2)
    })
  })
})
