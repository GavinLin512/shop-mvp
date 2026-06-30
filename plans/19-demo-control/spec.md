# 19-demo-control — Demo Control 展示控制台(邊界條件 + demo reset)

> 設計脈絡與取捨見 [`docs/adr/0012-demo-control-panel.md`](../../docs/adr/0012-demo-control-panel.md);
> 詞彙見 `CONTEXT.md`(種子資料 / demo reset / demo control)。

## 目標

把「口頭才講得到」的邊界條件變成現場點得出來、看得見的 demo,證明對問題與解法的理解。
四個 ADMIN 操作,全部受 `DEMO_MODE` 開關保護;Mock 主演邊界、Stripe 第二段真實整合,
面板 **provider-aware**。

| 操作 | 演示的問題 | Mock | Stripe |
|------|-----------|------|--------|
| Reset demo 資料 | 乾淨起點 / 種子隔離 | ✅ | ✅(Stripe 端殘留可接受) |
| 立即跑 billing(+ 每列「讓訂閱到期」) | #7 `<= now` 逐筆 tx、#9 期末取消生效 | ✅ | ✅(off-session 同步) |
| force-fail 全域開關 | #5 dunning 兩條路徑 | ✅ | **隱藏** |
| 重送 webhook | #1/#2 冪等(重送不重複扣) | ✅ | **隱藏** |

## 決策(grilling 定調)

- **定位**:demo-only 觀測/觸發工具,非業務功能。`DEMO_MODE !== 'true'` 時端點一律 **404**。
- **reset = Model 1(保留種子列)**:清訂閱類資料 + 非種子 Member/Plan,種子會員列**不動**
  → JWT 不失效 → ADMIN reset 後仍登入。用 `isSeed` 標記區分。
- **失敗機制單一化**:Mock 失敗一律靠 **force-fail 全域開關**(不再用 `amount % 100` 舊技巧);
  Stripe 失敗靠測試卡(`4000002500003155`)。
- **force-fail 用全域開關非一次性**:能演 dunning 的 3 次轉 CANCELED **與**中途關掉回 ACTIVE。
- **「讓訂閱到期」獨立按鈕**:撥 `nextBillingDate <= now`,直接演示 #7 的 `<= now`;放後台清單每列。
- **冪等可觀測(P2)**:`applyPaymentOutcome` 回傳 `{ applied }`,webhook 路由回應加 `duplicate`。
- **provider-aware**:Mock 專屬鈕(force-fail / replay)在 `provider==='stripe'` 隱藏;
  reset / run-billing / make-due 兩種通用。

## ⚠️ 與既有文件的關係
- **刻意牴觸** `SECURITY.md`(全清高風險)與 DECISION TALK-ONLY,僅以 `DEMO_MODE` 圈起;已立 **ADR-0012**。
- 沿用 ADR-0007(`runBillingCycle`)、ADR-0008/0005(三表 tx + dunning)、ADR-0011(provider 並存)。

## 範圍內

### S. Schema + Seed

**S1. schema**:`Member.isSeed Boolean @default(false)`、`Plan.isSeed Boolean @default(false)` + migration。

**S2. seed script**(`prisma/seed.ts`,`pnpm db:seed`;以 email/unique upsert,可重跑):
- Members(`isSeed=true`,密碼固定 hash,tier `NORMAL`):
  `admin@demo.test`(ADMIN)、`member-a@demo.test`(USER)、`member-b@demo.test`(USER)。
- Plans(`isSeed=true`):`Basic (USD)` amount `1000` currency `USD` intervalDays `30`;
  `Pro (JPY)` amount `1500` currency `JPY` intervalDays `30`。

### A. 後端

**A1. `GET /config`(公開,無 auth)**:回 `{ demoMode: boolean, provider: 'mock' | 'stripe' }`。
**只回布林/provider 名,不洩漏任何密鑰**。`demoMode = process.env.DEMO_MODE === 'true'`。

**A2. `requireDemoMode` middleware**:`DEMO_MODE !== 'true'` → `next(new AppError(404, 'Not found'))`。
掛在所有 demo-control 端點最前面,其後再 `requireAuth, requireRole('ADMIN')`。

**A3. demo-control router**(`src/routes/demoControl.ts`,工廠注入 `provider`):
- `POST /demo/reset` — 單一 tx 依 FK 順序刪除:`Payment → Order → Subscription`,
  再刪 `Member where isSeed=false`、`Plan where isSeed=false`,
  最後 `Member.providerCustomerId = null where isSeed=true`(種子會員清掉 Stripe 殘留綁定)。
- `POST /demo/run-billing` — `runBillingCycle(new Date(), provider)`,回 `{ processed, skipped }`。
- `POST /demo/subscriptions/:id/expire` — 設該訂閱 `nextBillingDate = new Date()`(讓它到期),回更新後訂閱。
- `GET /demo/mock/force-fail` — 回 `{ enabled }`,讓前端 reload 後還原開關狀態(避免 UI 顯示 OFF 但後端仍 ON)。
  `provider !== 'mock'` → `409`。
- `POST /demo/mock/force-fail`(body `{ enabled: boolean }`)— 設 mock-gateway 旗標。
  `provider !== 'mock'` → `409`(Stripe 不適用)。
- `POST /demo/mock/replay-webhook` — 重打 mock-gateway 存的 last webhook,回 webhook 回應 `{ ok, duplicate }`。
  `provider !== 'mock'` 或無 last webhook → `409`。

**A4. mock-gateway 改動**(`src/routes/mockGateway.ts`):
- 模組層級 `let forceFail = false` + `setForceFail(b)` / `getForceFail()` 匯出;`resolveOutcome` 在 `forceFail` 為真時回 `FAILED`。
- 每次回打 webhook 時把 `{ body, signature }` 存進模組層級 `lastWebhook` + 匯出 getter。
- `resetStore()` 一併清 `forceFail` 與 `lastWebhook`(測試隔離)。

**A5. webhook 冪等可觀測(P2)**(`src/services/webhookService.ts` + `src/routes/webhooks.ts`):
- `applyPaymentOutcome` 回傳由 `void` 改為 `Promise<{ applied: boolean }>`;
  冪等早退(`existing.status !== 'PENDING'`)時回 `{ applied: false }`,有實際處理回 `{ applied: true }`。
- `processPaymentWebhook` 透傳該值;路由回應 `res.json({ ok: true, duplicate: !applied })`(加欄位,向後相容)。
- billing/對帳 cron 對回傳值忽略即可(不破壞既有呼叫)。

### B. 前端(`web/`)

**B1. config context**:App 掛載時 `GET /api/config` 一次,透過 context 提供 `{ demoMode, provider }`。
**B2. api client**:`getConfig()`、`demoReset()`、`demoRunBilling()`、`demoExpire(id)`、
`demoGetForceFail()`、`demoSetForceFail(enabled)`、`demoReplayWebhook()`。
**B3. `AdminView` 新增「DEMO CONTROL」danger-zone 區塊**(`demoMode` 為真才渲染):
- Reset(**type-to-confirm**:輸入 `RESET` 才啟用按鈕)、Run billing now、force-fail 開關(toggle)、Replay last webhook。
- **provider-aware**:`provider==='stripe'` 時隱藏 force-fail 與 replay,並顯示一句說明(改用測試卡)。
- **force-fail 狀態還原**:`DemoControlPanel` 掛載時(provider=mock)呼叫 `demoGetForceFail()` 初始化開關,
  避免 reload 後顯示 OFF 但後端仍 ON 的狀態不同步。
**B4. `AdminSubscriptionList` 每列加「MAKE DUE」鈕**(`demoMode` 為真才顯示)→ `demoExpire(id)` 後 refetch。
**B5. `.env.example`** 補 `DEMO_MODE=false`;`types.ts` 加 `Config` 型別。

**B6. 即時更新(免手動重整)**:demo 過程中 admin 觸發的狀態變化要即時反映,沿用專案既有輪詢模式
(非 WebSocket/SSE,對 demo 規模最划算,代價是最多延遲輪詢間隔):
- `MemberView`:掛載後每 3 秒輪詢 `GET /subscriptions`,驅動 `SubscriptionHistory` 即時更新。
- `SubscriptionPanel`:新增同步 effect,讓「YOUR SUBSCRIPTION」面板在自身輪詢已停(ACTIVE 後)時,
  仍能反映父層帶下來的最新狀態,不與 history 不一致。
- `AdminSubscriptionList`:掛載後每 3 秒輪詢 `GET /admin/subscriptions`,狀態 / next billing 即時更新。

## 範圍外
- Stripe-native 的 force-fail / webhook replay;刪除 Stripe 端 Customer/PM/PI(test mode 殘留可接受)。
- reconciliation(#3)、偽造壞簽 webhook(#2)前端按鈕——**留 Swagger / curl**(ADR-0012 折衷)。
- 分頁、篩選、立即取消、退款、proration(仍 TALK-ONLY)。
