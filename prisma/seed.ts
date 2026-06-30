/**
 * Seed script — 建立 demo 固定 baseline（isSeed=true）。
 * 可重複執行（upsert on email/name），不會重複建立。
 * 執行：pnpm db:seed
 */
import 'dotenv/config'
import bcrypt from 'bcryptjs'
// 重用專案已設定好的 Prisma client（Prisma 7 driver adapter + 同一條 DATABASE_URL）
import prisma from '../src/lib/prisma'

// 固定密碼 hash，dev/test only
const SEED_PASSWORD = 'demo1234'

async function main() {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10)

  // --- Members ---
  await prisma.member.upsert({
    where: { email: 'admin@demo.com' },
    update: {},
    create: {
      email: 'admin@demo.com',
      passwordHash,
      role: 'ADMIN',
      tier: 'NORMAL',
      isSeed: true,
    },
  })

  await prisma.member.upsert({
    where: { email: 'user@demo.com' },
    update: {},
    create: {
      email: 'user@demo.com',
      passwordHash,
      role: 'USER',
      tier: 'NORMAL',
      isSeed: true,
    },
  })

  await prisma.member.upsert({
    where: { email: 'user2@demo.com' },
    update: {},
    create: {
      email: 'user2@demo.com',
      passwordHash,
      role: 'USER',
      tier: 'NORMAL',
      isSeed: true,
    },
  })

  // --- Plans ---
  await prisma.plan.upsert({
    where: { id: 'seed_plan_basic_usd' },
    update: {},
    create: {
      id: 'seed_plan_basic_usd',
      name: 'Basic (USD)',
      amount: 1000,
      currency: 'USD',
      intervalDays: 30,
      active: true,
      isSeed: true,
    },
  })

  await prisma.plan.upsert({
    where: { id: 'seed_plan_pro_jpy' },
    update: {},
    create: {
      id: 'seed_plan_pro_jpy',
      name: 'Pro (JPY)',
      amount: 1500,
      currency: 'JPY',
      intervalDays: 30,
      active: true,
      isSeed: true,
    },
  })

  console.log('Seed completed.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
