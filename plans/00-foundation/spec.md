# 00-foundation — 骨架 + Prisma + DB

## 目標
建立可啟動的 Express app 與 Prisma/Neon 連線,完成資料模型 migrate 與測試基建,讓後續切片能用 supertest 打真 DB。

## 範圍內
- `package.json`、目錄結構:`src/{routes,controllers,services,repositories,middlewares,lib}`。
- `prisma/schema.prisma`:5 張表 + enum,依 `final-plan.md` 一、資料模型。
  - `Order.idempotencyKey` 加 `@unique`。
  - 金額欄位用 `Int`(最小單位),`currency` 字串(ISO 4217)。
  - `Subscription`:`status`、`retryCount Int @default(0)`、`cancelAtPeriodEnd Boolean @default(false)`。
- `prisma migrate` 套到 Neon。
- `createApp()` factory(供 supertest,不自動 listen)。
- `GET /health` → `200 {status:"ok"}`。
- 測試基建:`.env.test` 指向 Neon 測試分支;helper `resetDb()` truncate 全表。

## 公開介面
- `createApp(): Express`
- `prisma`(PrismaClient 單例,從 `src/lib/prisma`)
- `GET /health`

## 範圍外
任何業務 route、auth、金流。

## 完成準則
- `prisma migrate` 成功,5 張表存在。
- `GET /health` 回 200。
- 測試能連 Neon 測試分支並 truncate。
- `Order.idempotencyKey` 的 UNIQUE constraint 實際存在(後續 06 會依賴)。

## 依賴
無(地基)。
