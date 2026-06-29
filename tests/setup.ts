import { beforeEach, afterAll } from 'vitest'
import prisma from '../src/lib/prisma'

// 依 FK 依賴順序 TRUNCATE，CASCADE 確保清乾淨
export async function resetDb(): Promise<void> {
  await prisma.$executeRaw`TRUNCATE "Payment", "Order", "Subscription", "Plan", "Member" CASCADE`
}

beforeEach(async () => {
  await resetDb()
})

afterAll(async () => {
  await prisma.$disconnect()
})
