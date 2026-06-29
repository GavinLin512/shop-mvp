# 15-stripe-provider — StripeProvider 並存 + off-session 續扣

## 目標
新增 `StripeProvider` 與 Mock **並存**,展示 adapter pattern:換金流商只新增 provider + 一個
webhook 端點,service 不動。續扣仍走自管 cron(#7)/dunning(#5),不用 Stripe 原生 Subscription。
決策見 [`docs/adr/0011-stripe-provider-coexist.md`](../../docs/adr/0011-stripe-provider-coexist.md)。

## 公開介面
- `StripeProvider implements PaymentProvider`:
  - `charge()` 首期建 PaymentIntent(帶 Customer + `setup_future_usage:'off_session'`),
    非同步:回 `{providerTxnId: pi_xxx, status:"PENDING", clientSecret}`,成敗由前端 confirm + webhook。
  - `charge()` 續扣(已有存卡)用 `off_session:true, confirm:true`,並**同時帶
    `customer`(providerCustomerId)+ `payment_method`(providerPaymentMethodId)**
    (Stripe 規定卡綁 Customer 就得一起給)。**同步為準**:成功回 `{status:"SUCCESS"}`,
    失敗 catch `StripeCardError`(`err.code='authentication_required'`/decline_code)回 `{status:"FAILED"}`。
  - `idempotencyKey` 以請求 options 傳入:`create(params, { idempotencyKey })`,非 body 欄位。
  - Stripe SDK client 以 DI 注入(同 MockProvider 注入 gatewayUrl),測試可換 stub。
- `ChargeResult` 擴充:加 optional `clientSecret?: string`(Mock 回 undefined);
  `status` 由 `'PENDING'` 放寬為 `'PENDING' | 'SUCCESS' | 'FAILED'`(off-session 同步出結果)。
- 新端點 `POST /webhooks/stripe`:用 `express.raw()` 取 raw bytes(`constructEvent` 需 raw,
  不可用 parsed JSON),`stripe.webhooks.constructEvent` 驗 `Stripe-Signature`(Node 預設 crypto
  用同步版即可),處理 `payment_intent.succeeded` / `payment_intent.payment_failed`,順序仍為
  **驗簽 → 冪等(查 providerTxnId)→ 更新**;成功時讀 `data.object.payment_method`
  寫入 `Subscription.providerPaymentMethodId`。webhook 對 off-session 只當對帳備援(#3),
  續扣狀態以 charge() 同步結果為準。
- Schema:Member 加 `providerCustomerId String?`、Subscription 加 `providerPaymentMethodId String?`。
- Provider 選擇:`src/app.ts` 組裝點讀 env `PAYMENT_PROVIDER=mock|stripe` 注入對應 provider。
- 最小前端收卡頁(Stripe.js / Elements):依建立訂閱回應**有無 clientSecret** 分流,
  不出現 provider 名稱、無切換鈕。

## 規則
- service 端不得直接 import StripeProvider,只依賴 `PaymentProvider` 介面型別。
- 金額仍為最小單位整數 + currency(#4),與 Stripe 一致,不換匯。
- `idempotencyKey` 以請求 options 傳給 Stripe(沿用 #1 決定性鍵),非 body 欄位。
- `Payment.provider` 依實際 provider 帶入('stripe' / 'mock'),不再寫死。
- off-session 回 `authentication_required`(3DS/SCA)為**同步 throw**,catch 後當一般續扣
  失敗走 dunning,不另開分支。

## 範圍外
- Stripe 原生 Subscription / Invoice(刻意不用,見 ADR-0011)。
- 3DS/SCA 完整挑戰流程、退款、proration(TALK-ONLY)。
- 真實網路測試(測試完全離線:注入 stub + `generateTestHeaderString`)。

## 完成準則
StripeProvider 首期回 clientSecret(PENDING);續扣 off-session 同步回 SUCCESS/FAILED 並驅動
dunning;`/webhooks/stripe`(express.raw)驗簽→冪等→更新三表;env 可切 mock/stripe 且 service
不動;測試完全離線(stub client + generateTestHeaderString)通過。

## 依賴
10-webhook、12-billing-cron、11-dunning(本任務疊在這些機制上)。
