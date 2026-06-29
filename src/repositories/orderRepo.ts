import { Prisma, type Order } from '../generated/prisma/client'
import prisma from '../lib/prisma'

type CreateIdempotentInput = {
  memberId: string
  subscriptionId?: string
  amount: number
  currency: string
  idempotencyKey: string
}

export const orderRepo = {
  /**
   * 直接 insert；遇 UNIQUE 衝突（P2002）→ 回既有 Order，視為冪等命中。
   * 刻意不做「先 findFirst 再 create」以避免 race condition（DECISION.md #1）。
   */
  async createIdempotent(data: CreateIdempotentInput): Promise<Order> {
    try {
      return await prisma.order.create({ data })
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        // UNIQUE constraint 命中 → 回既有單（非拋錯）
        return prisma.order.findUniqueOrThrow({
          where: { idempotencyKey: data.idempotencyKey },
        })
      }
      throw err
    }
  },
}
