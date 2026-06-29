# 專案定位

訂閱制電商後端 API：會員訂閱方案 → 系統定期自動建單 → 串接金流自動扣款 → webhook 回調更新狀態。一條龍展示「商模邏輯 + 金流整合 + 排程」。

---

# 技術棧

- Express + Prisma + SQLite（demo 零設定，講得出可換 PostgreSQL）
- Zod 驗證、JWT 認證
- node-cron 扣款排程
- swagger-ui-express 出 API 文件
- mock 金流服務（獨立 route 模擬綠界/Stripe + webhook）

---

# 資料模型（Prisma schema 設計重點）

```
Member        id, email, passwordHash, tier(NORMAL/VIP), createdAt
Plan          id, name, price, intervalDays(扣款週期), active
Subscription  id, memberId, planId, status, nextBillingDate,
              startedAt, canceledAt
Order         id, memberId, subscriptionId(nullable), amount,
              status, idempotencyKey, createdAt
Payment       id, orderId, provider, providerTxnId, status,
              rawPayload(webhook 原始資料)
```

---

# 狀態機

```
Subscription: ACTIVE → PAST_DUE(扣款失敗) → CANCELED
Order:        PENDING → PAID → FAILED
Payment:      PENDING → SUCCESS / FAILED
```

---

# API 設計

## Auth / Member

- `POST /auth/register`
- `POST /auth/login` → JWT

## Plan

- `GET  /plans`
- `POST /plans`（admin）

## Subscription（核心商模）

- `POST /subscriptions` 訂閱方案 → 立即建首筆 Order + 觸發扣款
- `GET  /subscriptions/:id`
- `POST /subscriptions/:id/cancel`

## Payment（核心整合）

- `POST /payments/charge` 內部呼叫金流（走 adapter）
- `POST /webhooks/payment` 金流回調 → 更新 Order/Payment/Subscription
- `POST /mock-gateway/charge` 模擬金流服務，非同步回打 webhook

---

# 架構亮點

## 1. 分層架構

route → controller → service → repository，業務邏輯全在 service。

## 2. 金流 Adapter Pattern（對應 JD「金流串接 + 低耦合」）

```ts
interface PaymentProvider {
  charge(order): Promise<{ txnId, status }>
}
// EcpayProvider / StripeProvider / MockProvider 各自實作
// service 只依賴介面 → 換金流不動業務碼
```

## 3. Webhook 冪等性（最能展示整合工程素養）

- 每筆 Order 帶 `idempotencyKey`
- webhook 進來先查 `providerTxnId` 是否處理過，重複就直接回 200
- 金流 webhook 會重送，沒做冪等會重複扣款/重複出貨

## 4. 排程扣款

- node-cron 每日掃 `nextBillingDate <= today && status=ACTIVE`
- 建 Order → 走 PaymentProvider → 成功則 `nextBillingDate += intervalDays`，失敗轉 `PAST_DUE`

---

# 1.5 天時程

| 時段 | 內容 |
|------|------|
| Day 1 上午 | 骨架 + Prisma schema + migrate + 會員/JWT |
| Day 1 下午 | Plan + Subscription 建立 + Order + PaymentProvider adapter + mock gateway |
| Day 2 上午 | webhook 回調 + 冪等 + node-cron 扣款排程 |
| Day 2 收尾 | Swagger 文件、seed 腳本、README 架構圖 + 資料流圖 |
