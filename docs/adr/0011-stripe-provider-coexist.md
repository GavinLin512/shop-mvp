# 0011 — StripeProvider 與 Mock 並存(自管續扣,不用 Stripe 原生 Subscription)

- 狀態:Accepted(#6「無前端切換鈕、純 env 選 provider」於 2026-06-30 被 **ADR-0013** 取代;其餘仍有效)
- 日期:2026-06-29
- 相關:DECISION.md #8(adapter)、#7(續扣 cron)、#5(dunning)、#2(webhook)、#1(冪等);ADR-0002、ADR-0005、ADR-0007、ADR-0008;`CONTEXT.md`

## Context(背景)

現有金流走自建 `mock-gateway`(確定性、離線、同步測試鉤子)。想引入 Stripe 測試,
驗證 `PaymentProvider` adapter 的價值,並讓 demo 更貼近真實串接。Stripe 的金流模型
與現有「server-to-server charge → PENDING → webhook」不同:沒有直接 charge API,
要走 PaymentIntents;且本 MVP 無前端收卡。

## Decision(決策)

**並存,不替換**:保留 `MockProvider` 當預設與測試 provider,**新增 `StripeProvider`**,
兩者皆實作同一 `PaymentProvider` 介面。具體形狀:

1. **卡來源**:加最小前端收卡頁(Stripe.js / Elements)。後端建 PaymentIntent
   (`setup_future_usage:'off_session'`)回 `clientSecret` 給前端 confirm。
2. **續扣自管**:收卡時建 Stripe Customer 並存 PaymentMethod;續扣 cron 沿用現有
   `nextBillingDate <= now` 逐筆 tx(#7),用 `off_session:true, confirm:true` 扣已存卡。
   **不改用 Stripe 原生 Subscription**(理由見 Alternatives)。
3. **介面擴充**:`ChargeResult` 加 optional `clientSecret`;`status` 由 `'PENDING'` 放寬為
   `'PENDING' | 'SUCCESS' | 'FAILED'`。單一 `charge()` 不拆方法。
   Mock 回 `{status:'PENDING'}`;Stripe 首期回 `{status:'PENDING', clientSecret}`(等前端 confirm);
   Stripe 續扣**同步**回 `SUCCESS` 或 `FAILED`(見下 8)。首期 vs 續扣由 provider 內部依
   「是否已有存卡」自行分流;續扣須同時帶 `customer`(providerCustomerId)+ `payment_method`
   (providerPaymentMethodId),Stripe 規定卡綁 Customer 就得一起給。
8. **off-session 續扣同步為準,webhook 當對帳備援**:server-side `confirm:true` 扣款,Stripe
   **當下就回結果**——成功同步回 `status:'succeeded'`,失敗**同步 throw `StripeCardError`**
   (`err.code='authentication_required'` / decline_code,`err.raw.payment_intent` 帶 PI)。
   故 StripeProvider 續扣 catch 例外映成 `FAILED`、成功映成 `SUCCESS`,**billing/dunning 當場判定
   不等 webhook**;webhook + 對帳 cron(#3)只當補漏。首期(前端 confirm)仍是非同步 PENDING→webhook。
   `idempotencyKey` 以**請求 options**傳入(`create(params,{idempotencyKey})`),非 body 欄位。
4. **Webhook 另開端點**:`/webhooks/stripe` 用 `express.raw()` 取 raw bytes(`constructEvent`
   要 raw,不能用 parsed JSON),`stripe.webhooks.constructEvent`(含時間戳防 replay)驗
   `Stripe-Signature`,event 為 `payment_intent.succeeded` / `payment_intent.payment_failed`。
   Node 預設 crypto 用同步 `constructEvent` 即可;非同步 crypto 環境改 `constructEventAsync`。
   Mock 的 `/webhooks/payment`(X-Signature)不動。
   兩端點各自守住「驗簽 → 冪等(查 `providerTxnId` / `pi_xxx`)→ 更新」順序(#2)。
5. **Schema 通用命名**:Member 加 `providerCustomerId`、Subscription 加
   `providerPaymentMethodId`(皆 nullable,Mock 留空)。核心 model 不洩漏「stripe」字眼。
   存卡時機:在 `payment_intent.succeeded` 讀 `data.object.payment_method` 寫入 Subscription。
6. **Provider 選擇**:純環境變數 `PAYMENT_PROVIDER=mock|stripe`,在 `src/app.ts` 組裝點注入。
   dev/test 預設 mock,demo Stripe 靠改 env 重啟。**無前端切換鈕**——前端依建立訂閱回應
   **有無 `clientSecret`** 分流(有→掛 Elements 收卡;無→Mock 流程等 webhook),
   永不出現 provider 名稱。
7. **測試完全離線**:Stripe SDK client 以 DI 注入(同 `MockProvider` 注入 `gatewayUrl`),
   測試給 stub(可程式化讓它回 succeeded 或 throw StripeCardError 驅動兩條路徑);
   webhook 用 `stripe.webhooks.generateTestHeaderString` 自簽後 POST。
   零網路、零密鑰進 CI,維持與 Mock 一致的確定性。真實測試卡(`pm_card_visa` /
   `pm_card_chargeDeclined`)只在手動 `stripe listen` 開發驗證時用,CI 不依賴。

## Consequences(後果)

**好處**
- adapter pattern 名實相符:換金流商只新增 provider + 一個 webhook 端點,service 不動。
- 測試離線確定性不變;`generateTestHeaderString` 正是 Mock 同步鉤子的對應物。
- 通用命名讓核心 model 保持 provider-agnostic。
- 既有冪等(#1)/續扣(#7)/dunning(#5)機制全部保留,仍是 demo 主秀。

**代價 / 約束**
- 多一條前端收卡路徑與 Stripe.js 依賴。
- 多 `providerCustomerId` / `providerPaymentMethodId` 兩欄與一次 migration。
- off-session 可能回 `authentication_required`(3DS/SCA);測試卡不觸發,
  正式情境**當一般續扣失敗走 dunning**,不另開分支(TALK-ONLY)。
- charge 仍須在 Sub+Order commit 之後呼叫(沿用 ADR-0008 約束)。

## Alternatives considered

- **完全替換掉 Mock**:測試會依賴 Stripe 網路 + 密鑰、失去確定性,否決。保留 Mock 當測試主力。
- **改用 Stripe 原生 Subscription(便捷做法)**:Stripe 可代管整個訂閱生命週期——
  自動排期扣款、`invoice.payment_succeeded` / `invoice.payment_failed` webhook、
  內建 Smart Retries(dunning)與 `customer.subscription.*` 狀態機,幾乎不用自己寫
  續扣/重試/狀態流轉。**但這正好會換掉本專案要展示的核心**(決定性冪等鍵、逐筆 tx 續扣、
  自管 dunning、對帳 cron)。本案目標是展示這些機制,故**刻意自管**;若是真實產線、
  且接受 Stripe 鎖定,原生 Subscription 才是省事正解。
- **介面拆成 initiateFirstCharge() / chargeOffSession() 兩方法**:語意更清楚但 Mock 也要實作兩個,
  介面變胖,否決;改用單一 charge() + optional clientSecret。
- **單一 webhook 端點依 header 分流**:一個 handler 混兩種驗簽與 event 解析,耦合高,否決。
- **前端切換 provider**:讓上層感知金流商,與 adapter pattern 初衷相悖,否決;改用 env + 回應形狀分流。
