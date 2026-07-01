# 20-runtime-provider-switch — 測試

後端用 **Vitest 整合測試**(打真路由 + 測試 DB,沿用 `src/__tests__` 慣例;Stripe client 以 stub 注入,零網路);
前端用 **Vitest + @testing-library/react + jsdom**,`fetch` 與 `@stripe/*` 全程 mock。
切換 / demo 端點測試需設 `DEMO_MODE=true`(關閉路徑另測 404)。

## 任務 Checklist

### ProviderRegistry(後端)
- [x] 1. `current()` 初值依 `PAYMENT_PROVIDER`(未設 → mock)
- [x] 2. `setCurrent('stripe')` 後 `currentName()==='stripe'`、`current()` 為 StripeProvider
- [x] 3. `get('mock')` / `get('stripe')` 各回對應實作(與 `current` 無關)
- [x] 4. 缺 Stripe 金鑰時 `isConfigured('stripe')===false`,且 **boot 不擲錯**(lazy)

### 切換端點(後端,DEMO_MODE)
- [x] 5. `DEMO_MODE` 關 → `GET/POST /demo/provider` 回 **404**
- [x] 6. `DEMO_MODE` 開但非 ADMIN → 403;未登入 → 401
- [x] 7. `GET /demo/provider` 回 `{ current, stripeConfigured }` 反映當下
- [x] 8. `POST /demo/provider { stripe }` 在 **未 configured** → 409,`current` 不變
- [x] 9. `POST /demo/provider { stripe }` 在 configured → 200,後續 `GET /config.provider==='stripe'`
- [x] 10. `POST /demo/provider { mock }` 切回後 `current==='mock'`

### provider 綁訂閱 + cron(後端)
- [x] 11. `current='stripe'` 時建訂閱 → `Subscription.provider==='stripe'`
- [x] 12. 建後切回 `mock`,run-billing 對該訂閱仍用 **stripe** 實作扣(依 `sub.provider`,非當下 current)
- [x] 13. `current='mock'` 建的訂閱續扣走 mock,互不干擾

### create 回應 + /config(後端)
- [x] 14. Mock 建訂閱回 `{ subscription }`(**無** clientSecret)
- [x] 15. Stripe 首扣建訂閱回 `{ subscription, clientSecret }`(stub 回 PI client_secret)
- [x] 16. `GET /config` configured 時帶 `stripeConfigured:true` 與 `publishableKey`;未 configured 不帶 key

### Stripe webhook 掛載(後端)
- [x] 17. stripeConfigured 時 `/webhooks/stripe` 即使當下 current=mock 也存在(非 404)

### mock 限定端點(後端)
- [x] 18. `current='stripe'` 時 `force-fail` / `replay-webhook` 回 409(改用 `registry.current().name`)

### 前端
- [x] 19. 建訂閱回應含 `clientSecret` → 渲染 `<PaymentElement>` 收卡區;confirm 後進輪詢
- [x] 20. 回應無 `clientSecret`(Mock)→ 不渲染收卡區,直接輪詢(現狀不破)
- [x] 21. `DemoControlPanel` 掛載讀 `GET /demo/provider` 還原當下選擇
- [x] 22. `stripeConfigured=false` → Stripe 切換選項 disable 並提示
- [x] 23. 切換成功後 refetch `/config`,UI 反映新 provider
- [x] 24. demo-autofill:`demoMode=true` 時收卡區出現 `USE TEST CARD (4242)` 按鈕,點擊以 `pm_card_visa` confirm 後進輪詢;`demoMode=false` 不渲染該按鈕

## 行為清單(RED → GREEN,逐一)

### Registry 與切換(1–10)
- **Given** registry 以 env=mock 起。**When** `POST /demo/provider {stripe}` 且 stripe 未 configured。**Then** 409、`current` 仍 mock。
- **Given** stub 注入使 stripe configured。**When** 切 stripe。**Then** `GET /config.provider==='stripe'`、`stripeConfigured:true`、帶 `publishableKey`。
- **When** `DEMO_MODE` 未設打 `POST /demo/provider`。**Then** 404(不洩漏存在,沿用 ADR-0012)。

### provider 綁訂閱不受切換影響(11–13)★核心
- **Given** `current=stripe`(stub configured)建訂閱 S(`S.provider='stripe'`)。
- **When** ADMIN 切回 `mock`,再 `POST /demo/run-billing`(S 已到期)。
- **Then** S 的續扣走 **StripeProvider**(stub 收到 charge),**不**走 mock;Payment.provider 對應 stripe。

### create 回應分流(14–15、19–20)
- **Mock**:`POST /subscriptions` → `{ subscription }`,前端不掛 Elements,直接輪詢。
- **Stripe**:stub 回 `{ status:'PENDING', clientSecret:'pi_..._secret' }` → `{ subscription, clientSecret }`,
  前端掛 `<PaymentElement>`,mock `stripe.confirmPayment` resolve 後進輪詢。

### demo-autofill 一鍵測試卡(24)
- **Given** `demoMode=true`、收卡區已渲染(有 `clientSecret` + `publishableKey`)。
- **When** 點 `USE TEST CARD (4242)`。**Then** 呼叫 `stripe.confirmCardPayment(clientSecret, { payment_method:'pm_card_visa' })`,resolve 後 `onSuccess` 觸發輪詢。
- **Given** `demoMode=false`。**Then** 不渲染 `USE TEST CARD` 按鈕(正式環境隔離);手動 `<PaymentElement>` + `CONFIRM PAYMENT` 不受影響。
- PaymentElement 為跨來源 iframe,外部 JS 無法填值,故 demo 捷徑改用測試 PaymentMethod 直接 confirm(見 `StripePaymentForm.tsx`)。

### Stripe webhook 永遠掛載(17)
- **Given** stripeConfigured 但 `current=mock`。**When** POST `/webhooks/stripe`(自簽 header)。**Then** 路由存在(非 404),走既有驗簽流程。

## 手動驗證(Stripe 真實首扣,非 CI)

> 沿用 AGENTS.md「Stripe demo 注意事項」。

1. `.env` 補 `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PUBLISHABLE_KEY`,`DEMO_MODE=true`。
2. `stripe listen --forward-to localhost:3000/webhooks/stripe`,確認印出的 `whsec_` 等於 `.env`。
3. 後台 DemoControlPanel 切到 **Stripe**。
4. 會員開**新訂閱** → 出現 `<PaymentElement>` → 填 `4242 4242 4242 4242` → confirm。
5. 盯 `stripe listen` 視窗應見 `<-- [200] POST .../webhooks/stripe`;訂閱輪詢轉 **ACTIVE**。
6. 切回 **Mock**,再開訂閱 → 無收卡畫面,直接輪詢 ACTIVE(分流正確)。
