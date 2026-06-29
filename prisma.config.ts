import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

// Prisma 7: CLI 用的 datasource url、schema 與 migrations 路徑統一在此設定
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
})
