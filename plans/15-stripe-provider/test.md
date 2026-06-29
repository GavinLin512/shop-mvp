# 15-stripe-provider — 測試

風格:完全離線。Stripe SDK client 注入 stub(程式化讓它回 succeeded 或 throw StripeCardError);
webhook 用 `stripe.webhooks.generateTestHeaderString` 自簽後 POST。零網路、零密鑰進 CI。
真實測試卡(`pm_card_visa` / `pm_card_chargeDeclined`)只在手動 `stripe listen` 開發驗證時用,
**CI 不依賴**——CI 一律靠 stub 的回傳/拋錯驅動兩條路徑。

## 任務 Checklist

- [x] 1. StripeProvider.charge 首期回 clientSecret + PENDING [tracer bullet]
- [x] 2. StripeProvider.charge 續扣 off-session 成功 → 同步回 SUCCESS(無 clientSecret)
- [x] 3. StripeProvider.charge 續扣 off-session 失敗(StripeCardError)→ 同步回 FAILED
- [x] 4. 續扣同時帶 customer + payment_method 呼叫 Stripe
- [x] 5. ChargeResult:clientSecret optional、status 可為 PENDING|SUCCESS|FAILED(Mock 仍 PENDING)
- [x] 6. /webhooks/stripe 驗簽失敗回 401
- [x] 7. /webhooks/stripe succeeded → 三表同 tx 更新 + 存 providerPaymentMethodId
- [x] 8. /webhooks/stripe 重送(同 providerTxnId)冪等回 200,不重複更新
- [x] 9. 續扣 FAILED → 走 dunning(沿用 #5,同步路徑,不等 webhook)
- [x] 10. env PAYMENT_PROVIDER 切換不動 service(回歸護欄)

## 行為清單(RED → GREEN,逐一)

### 1. StripeProvider.charge 首期回 clientSecret + PENDING [tracer bullet]
- **Given** 注入 stub Stripe client,該 Member 尚無 providerCustomerId
- **When** `charge({orderId, amount, currency, idempotencyKey})`
- **Then** 建 Customer + PaymentIntent(`setup_future_usage:'off_session'`),
  回 `{providerTxnId, status:"PENDING", clientSecret}`(等前端 confirm + webhook)

### 2. 續扣 off-session 成功 → 同步回 SUCCESS
- **Given** Subscription 已有 providerPaymentMethodId;stub client confirm 回 `status:'succeeded'`
- **When** `charge(...)`
- **Then** 用 `off_session:true, confirm:true` 扣已存卡,**同步**回 `{providerTxnId, status:"SUCCESS"}`,
  **無 clientSecret**

### 3. 續扣 off-session 失敗(StripeCardError)→ 同步回 FAILED
- **Given** stub client confirm throw `StripeCardError`(`code='authentication_required'`,
  `raw.payment_intent` 帶 PI)
- **When** `charge(...)`
- **Then** catch 例外,同步回 `{providerTxnId, status:"FAILED"}`,不擲出未捕捉錯誤

### 4. 續扣同時帶 customer + payment_method
- **When** off-session `charge(...)`
- **Then** 呼叫 Stripe 的 params 同時含 `customer`(providerCustomerId)與
  `payment_method`(providerPaymentMethodId);缺一不可(Stripe 規定)

### 5. ChargeResult 形狀(Mock 不受影響)
- **When** `MockProvider.charge(...)`
- **Then** 回 `{status:"PENDING"}`、不含 clientSecret;介面擴充(clientSecret optional、
  status 放寬)不改變 Mock 路徑行為

### 6. /webhooks/stripe 驗簽失敗回 401
- **When** POST 帶錯誤 / 缺漏的 `Stripe-Signature`(端點走 express.raw)
- **Then** `constructEvent` 擲錯 → 回 401,不更新任何狀態

### 7. /webhooks/stripe succeeded → 三表同 tx 更新 + 存 providerPaymentMethodId
- **Given** 用 `generateTestHeaderString` 簽好的 `payment_intent.succeeded`
- **When** POST /webhooks/stripe
- **Then** Order=PAID / Payment=SUCCESS / Subscription=ACTIVE 同一 tx;
  `data.object.payment_method` 寫入 `Subscription.providerPaymentMethodId`

### 8. /webhooks/stripe 重送冪等回 200,不重複更新
- **Given** 同一 providerTxnId(pi_xxx)的 event 再送一次
- **When** POST /webhooks/stripe
- **Then** 查 providerTxnId 命中已處理 → 回 200,狀態與金額不二次變動

### 9. 續扣 FAILED → 走 dunning(同步路徑)
- **Given** 第 3 項的 off-session FAILED 結果
- **When** billing/dunning 處理該續扣
- **Then** 沿用 #5:retryCount++、PAST_DUE、3 次轉 CANCELED;**當場判定不等 webhook**

### 10. env PAYMENT_PROVIDER 切換不動 service(回歸護欄)
- **Given** PAYMENT_PROVIDER=stripe vs =mock
- **When** 組裝點注入對應 provider
- **Then** service 程式無任何金流商實作 import;切換僅發生在組裝點

## 注意
- 第 10 項同 08 的回歸護欄:斷言依賴方向(service 不知道底層是誰),非實作細節。
- 第 2/3 項是本任務關鍵:off-session 同步出結果(succeeded / throw),不靠 webhook;
  webhook(第 7/8 項)只當對帳備援(#3)。
- 全程不得實際呼叫 api.stripe.com;webhook 簽章一律用 generateTestHeaderString 離線產生。
