# 20-runtime-provider-switch — 後台即時切換金流商 + 前端 Stripe.js 收卡

> 設計脈絡與取捨見 [`docs/adr/0013-runtime-provider-switch-and-frontend-card.md`](../../docs/adr/0013-runtime-provider-switch-and-frontend-card.md);
> 詞彙見 `CONTEXT.md`(ProviderRegistry / current provider)。
> **本任務部分取代 ADR-0011 #6**(原「無前端切換鈕、純 env 選 provider」)。

## 目標

1. ADMIN 在後台(DemoControlPanel)**即時切換** Mock↔Stripe,免改 env 重啟。
2. 補上 ADR-0011 規劃但未實作的**前端 Stripe.js 收卡**,讓 Stripe 首扣在 app 內刷卡。

## 決策(grilling 定調)

- **切換機制 = 兩個 provider 常駐 + ProviderRegistry**:取代 boot 時單例注入;router/cron 每次向 registry 取。
- **狀態 = in-memory 全域 + env 預設**:`PAYMENT_PROVIDER ?? 'mock'` 為初值,重啟回預設。
- **provider 綁 `Subscription.provider`**:建立時寫 `registry.currentName()`;cron 依此選對應實作扣款,切換不影響在途訂閱。
- **Stripe lazy 建 + `stripeConfigured` 旗標**:缺金鑰不 boot crash;切 stripe 但未 configured → 409。
- **create 回 `{ subscription, clientSecret? }`**:前端依有無 `clientSecret` 分流(會員流程維持 provider-agnostic)。
- **前端用 `@stripe/react-stripe-js` + `PaymentElement`**:`confirmPayment({ redirect:'if_required' })`;publishable key 走 `/config`。
- **切換端點收進 demo control**:`requireDemoMode → requireAuth → requireRole('ADMIN')`;production 404。
- **Stripe webhook configured 即永遠掛載**:不再依當下 selector。

---

## 後端實作

### A. `ProviderRegistry`(新檔 `src/providers/ProviderRegistry.ts`)

```ts
export type ProviderName = 'mock' | 'stripe'

export interface ProviderRegistry {
  current(): PaymentProvider          // 新訂閱用
  get(name: ProviderName): PaymentProvider  // cron 依 Subscription.provider 用
  currentName(): ProviderName
  setCurrent(name: ProviderName): void      // 未 configured 的 stripe 應由呼叫端先擋
  isConfigured(name: ProviderName): boolean
}
```

- boot 時建好 `mock`(`MockProvider`)與 `stripe`(`StripeProvider`,**lazy** 建真實 Stripe client)。
- `current` 初值 = `process.env.PAYMENT_PROVIDER === 'stripe' ? 'stripe' : 'mock'`。
- `isConfigured('stripe')` = `!!STRIPE_SECRET_KEY && !!STRIPE_WEBHOOK_SECRET`;`isConfigured('mock')` 恆 true。
- 在 `src/index.ts` 組裝,注入 `createApp` 與兩個 cron,**取代**原本的單一 `provider`。

### B. `StripeProvider` lazy 化

- 建構不立即 `new Stripe`;第一次 `charge()` 才建(或 registry 在首次 `get('stripe')` 時才實例化真實 client)。
- 缺 `STRIPE_SECRET_KEY` 時不在 boot 擲錯;只有真的被選用才需要金鑰。

### C. Schema:`Subscription.provider`

- `prisma/schema.prisma` 的 `Subscription` 加 `provider String @default("mock")`。
- 跑 `pnpm db:migrate` 產 migration(既有列預設 `mock`)。

### D. `subscriptionService.create`

- 建 Subscription 時寫入 `provider: registry.currentName()`。
- **保留** `charge()` 回傳,回 `{ subscription, clientSecret }`(`clientSecret` 來自 charge 結果,可為 undefined)。
- charge 改走 `registry.current()`(與寫入的 provider 一致)。

### E. cron(`billingCron` / `reconciliationCron`)

- 簽名由收單一 `provider` 改收 `registry`。
- 逐筆續扣:`registry.get(sub.provider).charge(...)`,依訂閱當初的 provider。

### F. 路由

- `POST /subscriptions` 回 `{ subscription, clientSecret? }`(原本 `res.status(201).json(sub)`)。
- `GET /config`:`provider` 改讀 `registry.currentName()`;加 `stripeConfigured`、`publishableKey?`(僅 configured 時帶 `STRIPE_PUBLISHABLE_KEY`)。
- `GET /demo/provider` → `{ current, mockConfigured:true, stripeConfigured }`。
- `POST /demo/provider`(body `{ provider }`):切 stripe 但未 configured → **409**;否則 `registry.setCurrent(provider)` 回 `{ ok, current }`。
- `force-fail` / `replay-webhook` 的 mock 限定檢查改 `registry.current().name !== 'mock'`。
- `createApp`:Stripe webhook 改「stripeConfigured(或 stripeWebhooks 提供)即掛載」,不再依 env=stripe。

---

## 前端實作(`web/`)

### G. 依賴與設定

- 新增 `@stripe/stripe-js`、`@stripe/react-stripe-js`(注意 pnpm `minimumReleaseAge` / build-script 白名單)。
- `types.ts`:`Config` 加 `stripeConfigured: boolean`、`publishableKey?: string`;
  新增 `CreateSubscriptionResult { subscription: Subscription; clientSecret?: string }`。

### H. 收卡流程

- `api/client.ts` 的建立訂閱改回 `CreateSubscriptionResult`。
- 會員按訂閱 → 若回應有 `clientSecret`:用 `loadStripe(config.publishableKey)` + `<Elements options={{clientSecret}}>` +
  `<PaymentElement>`,`stripe.confirmPayment({ elements, redirect:'if_required' })`;成功後沿用 `SubscriptionPanel` 輪詢等 webhook → ACTIVE。
- 無 `clientSecret`(Mock):維持現狀直接輪詢。

### I. DemoControlPanel 切換鈕

- 掛載時 `GET /demo/provider` 還原當下選擇與 `stripeConfigured`。
- 提供 Mock / Stripe 切換;`stripeConfigured=false` 時 Stripe 選項 disable 並提示「需設定 Stripe 金鑰」。
- 切換後 refetch `/config`(讓 publishable key / provider 即時生效)。

---

## 不做(避免 over-engineering)

- 不做 per-member / per-plan provider;切換為全域。
- provider 選擇不持久化到 DB(in-memory + env 預設)。
- 3DS/SCA off-session `authentication_required` 不另開分支,當一般續扣失敗走 dunning(沿用 ADR-0011)。
- 不改用 Stripe 原生 Subscription(沿用 ADR-0011 自管續扣)。

## 風險 / 注意

- `POST /subscriptions` 回應形狀變更會打破既有前端與測試 → 必須一起改(見 test.md)。
- 本機 Stripe 仍需 `stripe listen --forward-to localhost:3000/webhooks/stripe`,其 `whsec_` 要等於 `.env`(見 AGENTS.md Stripe demo 注意事項)。
