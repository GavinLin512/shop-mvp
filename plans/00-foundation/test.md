# 00-foundation — 測試

風格:整合(supertest)+ 一個 schema 健全性測試。

## 任務 Checklist

- [ ] 1. app 可啟動,健康檢查回 200 [tracer bullet]
- [ ] 2. Prisma 能連線且 5 張表存在
- [ ] 3. Order.idempotencyKey UNIQUE constraint 存在

## 行為清單(RED → GREEN,逐一)

### 1. app 可啟動,健康檢查回 200 [tracer bullet]
- **When** `GET /health`
- **Then** 200,body `{status:"ok"}`
- 證明 supertest + `createApp()` 通路與測試基建可用。

### 2. Prisma 能連線且 5 張表存在
- **When** 對每張表 `prisma.<table>.count()`
- **Then** 不丟錯,回 0(空庫)
- 證明 migrate 成功。

### 3. Order.idempotencyKey UNIQUE constraint 存在
- **Given** 已建一筆 Order(某 idempotencyKey)
- **When** 用相同 idempotencyKey 再 insert
- **Then** DB 丟唯一鍵衝突(Prisma `P2002`)
- 這是 06 冪等的地基保證,在此先驗 constraint 真的有上。

## 注意
- `resetDb()` 在 `beforeEach` truncate,確保測試獨立。
- 不在此測任何業務邏輯。
