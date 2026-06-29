import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

// Prisma 7: 透過 driver adapter 連線；DATABASE_URL 由呼叫環境的 env 決定
// 開發/測試分別讀 .env / .env.test，由 dotenv 或 vitest 注入
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

export default prisma
