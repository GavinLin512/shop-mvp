# 0012 — Demo Control 面板(DEMO_MODE 後的展示工具,刻意繞過常規安全範圍)

- 狀態:Accepted
- 日期:2026-06-30
- 相關:`SECURITY.md`(全清/危險指令禁令)、DECISION.md #5(dunning)、#7(續扣 cron)、#9(期末取消)、#1/#2(冪等/HMAC);ADR-0005、ADR-0007、ADR-0008、ADR-0011;`CONTEXT.md`(種子資料 / demo reset / demo control)

## Context(背景)

本專案是「可展示的面試作品」:`NOTE.md` 列出面試官最可能追問的邊界條件(冪等、HMAC、
dunning、對帳、期末取消…)。許多情境在 DECISION.md 被刻意定為 **TALK-ONLY**(只口頭、不實作),
`SECURITY.md` 更把「全數據刪除」「無 WHERE 的 DELETE」列為高風險禁令。

需求是把這些「口頭才講得到」的流程,變成現場**點得出來、看得見**的 demo,以證明對問題與解法的理解。
這直接製造張力:要展示就得有「清空資料回乾淨起點」「讓某筆扣款失敗」這類**本質上危險或非業務**的操作,
與既有安全/範圍守則牴觸。

## Decision(決策)

新增一組 **Demo Control(展示控制台)** 操作,定位為 **ADMIN-only、受 `DEMO_MODE` 開關保護的
觀測/觸發工具,非正式業務功能**。以「明確圈起來、production 關得掉」換取展示清晰度。

1. **Gating 雙層,後端為真實來源**:所有 demo-control 端點在 `process.env.DEMO_MODE !== 'true'`
   時一律回 **404**(連端點存在都不洩漏,優於 403)。前端透過 `GET /config` 取
   `{ demoMode, provider }`,`demoMode=false` 時整個面板不渲染。`.env.example` 補 `DEMO_MODE=false`。

2. **四個操作**(對應要展示的問題):
   - **Reset demo 資料**:清除所有 Subscription/Order/Payment + 非種子的 Member/Plan,
     並清空種子 Member 的 `providerCustomerId`/`providerPaymentMethodId`,回到種子 baseline。
     破壞性,需 **type-to-confirm**(輸入 `RESET`)。
   - **立即跑 billing**:包裝既有 `runBillingCycle`;搭配後台清單每列「讓訂閱到期」
     (撥 `nextBillingDate <= now`),直接演示 #7 的 `<= now` 逐筆 tx。
   - **force-fail 全域開關**:mock-gateway 模組層級旗標,ON 時所有扣款回 `FAILED`,直到 OFF。
     能同時演 dunning 的 **3 次轉 CANCELED** 與 **中途關掉 → 重試成功回 ACTIVE**(#5 兩條路徑)。
   - **重送上一筆 webhook**:mock-gateway 存 last sent webhook,原 bytes 重打 `/webhooks/payment`,
     撞冪等早退。為讓「被忽略」可見,`applyPaymentOutcome` 回傳值由 `void` 改為 `{ applied: boolean }`,
     webhook 路由回應加 `duplicate` 欄位(向後相容,僅加欄位)。

3. **種子資料機制(reset 的「乾淨起點」定義)**:`Member`/`Plan` 加 `isSeed Boolean @default(false)`;
   新增 seed script 建立固定 baseline(1 ADMIN + 2 USER 演本人隔離 #6;USD+JPY 兩方案演多幣別 #4)。
   reset = 刪 `isSeed=false` 的列並 cascade。**保留種子列**(Model 1):種子會員的列不動 → JWT 不失效 →
   ADMIN reset 後仍登入著,demo 不斷。

4. **Provider-aware,Mock 主演邊界、Stripe 第二段**:force-fail 開關與 mock-webhook replay 是
   **Mock 專屬機制**(扣款不經 mock-gateway、Stripe webhook 走 `/webhooks/stripe`+`constructEvent`),
   在 `provider==='stripe'` 時**前端隱藏**並附說明(Stripe 下失敗改用 `4000002500003155` 測試卡)。
   Reset / 立即跑 billing / 讓訂閱到期**兩種 provider 通用**。

## Consequences(後果)

**好處**
- 把「口頭取捨」變成可現場重現的證據,且結構上清楚標示它**只該存在於 demo**——
  賣點從「我知道邊界」升級為「我能重現邊界,且清楚它的安全邊界」。
- `DEMO_MODE` 預設關 + 端點 404,production 等同沒有這些端點;與 `SECURITY.md` 對齊而非違反。
- 多數操作複用既有 export 的函式(`runBillingCycle`),核心改動只有 `applyPaymentOutcome` 加回傳值。

**代價 / 風險**
- 多一個 `isSeed` schema 欄位與一支 seed script。
- 核心 webhook 路徑(皇冠路徑)被動到一處(加回傳旗標);以加欄位、不改控制流降風險。
- Stripe 模式下 reset 只清本地,**Stripe 端 Customer/PaymentMethod/PaymentIntent 殘留**(test mode 可接受)。
- **絕對前提**:`DEMO_MODE=true` 不得進 production 環境設定;一旦誤開,reset/force-fail 即成真實武器。

## Alternatives(被否決的替代方案)

- **全清 + 重跑 seed(Model 2)**:reset 直接 truncate 後重建。較簡單、無需 `isSeed`,但會重建會員列 →
  JWT 全失效 → reset 後被迫重新登入,demo 體感差。否決。
- **Stripe-only demo**:省掉 Mock。但 force-fail 開關失效 → dunning **恢復路徑(#5)演不出來**;
  webhook replay 需 Stripe 自簽、且續扣同步根本不靠 webhook → 冪等故事弱化;每次訂閱要手動刷卡、
  首扣依賴 Stripe webhook 送回 localhost(live demo 單點故障)。與「完整展示邊界」的目的衝突,否決。
- **不做面板、改用 Swagger/curl**:零新端點、零安全張力。但邊界條件無法一鍵重現、敘事零散。
  折衷:reconciliation(#3)、偽造壞簽 webhook(#2)**確實留 Swagger**(UI 價值低),
  其餘四個值得做成面板。
