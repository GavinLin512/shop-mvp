# 0013 — Runtime 後台切換 PaymentProvider + 前端 Stripe.js 收卡

- 狀態:Accepted
- 日期:2026-06-30
- 相關:**部分取代 ADR-0011**(#6「無前端切換鈕、純 env 選 provider」與其 rejected alternative「前端切換 provider」);沿用 ADR-0011 的 adapter / 自管續扣 / webhook 形狀;ADR-0012(demo control gating);DECISION.md #7 #8 #1;`CONTEXT.md`

## Context(背景)

ADR-0011 定的 provider 選擇是「純環境變數 `PAYMENT_PROVIDER`,demo Stripe 靠改 env 重啟」,
且明文**否決前端切換 provider**(理由:讓上層感知金流商,違背 adapter pattern)。

實際 demo 時這很卡:每次要展示 Mock→Stripe 都得改 `.env` 重啟後端。需求改為
**ADMIN 在後台即時切換**金流商,並**補上 ADR-0011 規劃但未實作的前端收卡**(Stripe.js / Elements),
讓 Stripe 首扣能在 app 內刷卡,不再只靠 CLI `stripe listen` + 測試卡 confirm。

兩個現況事實構成阻力:

1. **provider 是 boot 時單例**:`src/index.ts` 依 env 建好一個 `provider`,注入
   `createApp` 的所有 router **與兩個 cron**;每個 router 在建構時就凍結了該 instance。
2. **`subscriptionService.create` 丟棄 `charge()` 回傳**(service.ts:96),Stripe 首扣的
   `clientSecret` 從未送到前端 → 前端無從掛 Elements。

## Decision(決策)

### 1. ProviderRegistry 取代單例注入(runtime 可切)

引入 `ProviderRegistry`,boot 時**兩個 provider 都常駐**(Stripe lazy 建,見 #3),
注入 router / cron **取代**原本的單一 `PaymentProvider`。介面:

- `current(): PaymentProvider` — 給**新訂閱**用(`subscriptionService.create`)。
- `get(name): PaymentProvider` — 給 **cron** 用,依 `Subscription.provider` 取對應實作。
- `setCurrent(name)` / `currentName()` — 切換與查詢當下選擇。
- `isConfigured(name): boolean` — Stripe 金鑰是否齊全。

`current` 為 **in-memory 全域**,boot 時以 `PAYMENT_PROVIDER ?? 'mock'` 為初值;
**重啟回到 env 預設**(符合 demo「可重置」調性)。adapter pattern 不被破壞 —
service / cron 仍只依賴介面,只是改成「每次向 registry 取」而非「持有定值」。

### 2. provider 綁在 Subscription(切換不影響在途訂閱)

`Subscription` 加 `provider String @default("mock")`,建立時寫入 `registry.currentName()`。
續扣 cron 改 `registry.get(sub.provider).charge(...)`,**依訂閱建立時的 provider** 扣款,
與「當下 registry 選誰」脫鉤 → 中途切回 mock 不會用 mock 去扣一筆 Stripe 存卡的訂閱。
存卡本就綁 subscription(`providerPaymentMethodId`),語意一致;`Payment.provider` 既有,記每筆扣款。

### 3. Stripe lazy 建 + `stripeConfigured` 旗標擋切換

`StripeProvider` 改 lazy 建真實 client(第一次用才 `new Stripe`),避免缺金鑰時 boot crash。
`isConfigured('stripe')` 依 `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` 是否存在判定。
切到 stripe 但未 configured → 端點回 **409**;前端對應選項 disable 並提示。

### 4. create 回 `{ subscription, clientSecret? }`

`subscriptionService.create` **保留** `charge()` 回傳;有 `clientSecret`(Stripe 首扣)才帶,
Mock 不帶。`POST /subscriptions` 回應由「裸 subscription」改為 `{ subscription, clientSecret? }`。
前端**依有無 `clientSecret` 分流**(有→掛 Elements 收卡;無→沿用輪詢)——
這條保留了 ADR-0011 #6「會員流程不感知 provider 名稱」的精神,**只有 ADMIN 切換鈕顯式感知**。

### 5. 前端 Stripe.js 收卡(react-stripe-js + PaymentElement)

新增 `@stripe/stripe-js` + `@stripe/react-stripe-js`。會員按訂閱後,若回應含 `clientSecret`,
以 `<Elements options={{clientSecret}}>` + `<PaymentElement>` 收卡,
`stripe.confirmPayment({ elements, redirect: 'if_required' })` confirm(對應 ADR-0011 PI 設的
`automatic_payment_methods + allow_redirects:'never'`,免 `return_url`)。confirm 後沿用既有輪詢等 webhook 轉 ACTIVE。
publishable key 經 `/config` 下發(非機密,可公開),前端不寫死、不重 build。

### 6. `/config` 改讀 registry + 補欄

`/config` 的 `provider` 改讀 `registry.currentName()`(不再讀 env,否則切換後不同步);
加 `stripeConfigured: boolean` 與 `publishableKey?: string`(僅 configured 時帶)。

### 7. 切換端點收進 demo control(DEMO_MODE 閘)

`GET /demo/provider`(回 `{ current, configured }`)、`POST /demo/provider`(body `{ provider }`),
沿用 `requireDemoMode → requireAuth → requireRole('ADMIN')`。UI 放 `DemoControlPanel`。
production(`DEMO_MODE=false`)端點一律 404,不會讓人在正式環境誤改金流商。
`force-fail` / `replay-webhook` 的 mock 限定檢查改用 `registry.current().name`;
`POST /demo/reset` **不**動 provider 選擇(清資料與切金流商各自獨立)。

### 8. Stripe webhook 改「configured 即永遠掛載」

`/webhooks/stripe` 不再依「啟動時 env=stripe」條件掛載,改為**只要 stripeConfigured 就掛**
(因可能 mock 起手、中途切 stripe,webhook 必須一直在)。`createApp` 依金鑰齊全與否掛載,
而非依當下 selector。

## Consequences(後果)

**好處**
- demo 不再需要改 env 重啟;Mock↔Stripe 後台一鍵切。
- 補齊 app 內收卡,Stripe 首扣不再只靠 CLI。
- adapter pattern 維持:service/cron 仍只認介面;registry 只是把「定值」換成「可查」。
- 會員流程仍 provider-agnostic(靠 clientSecret 分流),只有 ADMIN 工具顯式感知。

**代價 / 約束**
- 多一張欄(`Subscription.provider`)+ 一次 migration;in-memory 切換重啟即失(刻意,demo 調性)。
- `POST /subscriptions` 回應形狀變更 → 前端 api/types + 既有測試需同步改。
- 前端多 `@stripe/*` 兩個依賴(注意 pnpm `minimumReleaseAge` / build-script 白名單)。
- 3DS/SCA off-session `authentication_required` 仍當一般續扣失敗走 dunning(沿用 ADR-0011,TALK-ONLY)。
- 跨 provider 的「在途訂閱」靠 `Subscription.provider` 綁定解決;不另做 per-member/per-plan provider。

## Alternatives considered

- **重建 app / 重新注入 provider**:切換時 teardown + rebuild router 與 cron,改動大、狀態難搬遷,否決;改用 registry 動態取。
- **provider 選擇存 DB 持久化**:重啟保留上次選擇,但對純 demo 是 over-engineering,否決;用 in-memory + env 預設。
- **per-session / per-request 選 provider**:cron 無 session、且單一訂閱跨多請求會 provider 不一致,否決;用全域。
- **provider 綁在 Order(非 Subscription)**:cron 選 provider 時 Order 尚未建,得回查上一筆,易錯,否決。
- **publishable key 走前端 env**:改 key 要重 build,且與「後台即時切」理念衝突,否決;走 `/config`。
- **切換端點當一般 admin 功能(不綁 DEMO_MODE)**:runtime 換金流商本質是 demo 行為,production 不該開,否決;沿用 demo 閘。
