# FAILURES — 實測踩過的坑

實作中真實踩到的問題與解法。**新坑往上加。**

---

## 冪等鍵日期粒度 → 同一天重複續扣被 skip

| 症狀 | 原因 | 解法 |
|------|------|------|
| 後台對同筆 ACTIVE 反覆 MAKE DUE + RUN BILLING,第二次起 run-billing 直接 skip、`billedCount` 不增、`nextBillingDate` 變回原本 | 續扣冪等鍵的週期識別是**日期粒度**(`YYYY-MM-DD`);MAKE DUE 每次把 `nextBillingDate` 撥成「當下」,同一天多次算出同一鍵 → P2002 → skip,且 tx rollback 使 `nextBillingDate` 沒推進 | `billingCron.ts` 的 `formatCycleDate` 改回傳 `nextBillingDate` 的**完整 ISO 時間戳**(`toISOString()`) |

心法:
- 冪等靠「鍵相等」,與格式無關。生產每週期相隔 ≥ 1 interval,時間戳必不同 → 行為與日期粒度一致;同一週期 `nextBillingDate` 穩定 → 同鍵 dedupe 不變(DECISION.md #1)。
- 只有 demo 壓縮時間(同一天多次續扣)會踩到日期粒度撞號;時間戳粒度即解。

---

## Stripe demo 首扣

切 `PAYMENT_PROVIDER=stripe` 演示首扣時,依序會撞到下列問題:

| 症狀 | 原因 | 解法 |
|------|------|------|
| 後端啟動即崩、vite proxy `ECONNREFUSED` | `PAYMENT_PROVIDER=stripe` 但缺 `STRIPE_SECRET_KEY`,`new Stripe(undefined)` 擲錯 | `.env` 補 `STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`(缺後者 webhook 驗簽 401) |
| 按訂閱沒有刷卡畫面 | 前端**未實作 Stripe Elements**(ADR-0011 規劃但沒做) | 首扣靠 CLI confirm 測試卡,非 app 內收卡 |
| confirm 後訂閱不轉 ACTIVE、查無 `payment_intent.succeeded` | 本機 `localhost` Stripe 打不到,沒開 `stripe listen` 轉發 | 先開 `stripe listen --forward-to localhost:3000/webhooks/stripe`,secret 對上 `.env` |
| confirm 報錯要求 `return_url` | 建 PI 未設 `automatic_payment_methods`,預設啟用 Dashboard 全部方式(含跳轉) | 建 PI 時 `automatic_payment_methods: { enabled: true, allow_redirects: 'never' }` |
| PI `succeeded` 了但訂閱仍 INCOMPLETE | Stripe PI 事件**不帶內部 orderId**;`subscriptionService.create` 丟棄 charge 回傳、首扣未建 Payment,webhook 反查不到 Order | 建 PI 帶 `metadata: { orderId }`;webhook `resolveOrderId` 先讀 `metadata.orderId`,再 fallback `providerTxnId` |

通用心法:
- **本機 Stripe webhook 一定要 `stripe listen`**,且其印出的 `whsec_` 必須等於 `.env` 的 `STRIPE_WEBHOOK_SECRET`(部署到公開 URL 才改用 Dashboard endpoint 的 secret)。
- 改碼後**已建立的舊 PI 不會套用新設定**(如 metadata / allow_redirects),驗證一律開**新訂閱**。
- 驗證刷卡成功用 `pm_card_visa`(4242,不觸發 3DS);盯 `stripe listen` 視窗應見 `<-- [200] POST .../webhooks/stripe`,`[401]` 即 secret 不符。
