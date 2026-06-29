# 訂閱制電商後端 API — 修正後計畫(grilling 結論)

> 由 grilling 逐題逼問後彙整。原始構想見 `init.md`,本檔為定案版本。

## 專案定位

訂閱制電商後端 API:會員訂閱方案 → 系統定期自動建單 → 串接金流自動扣款 → webhook 回調更新狀態。一條龍展示「商模邏輯 + 金流整合 + 排程 + 冪等正確性」。

## 技術棧

- Express + Prisma + **Neon Postgres**(本地與線上 demo 同一套 DB,不維護雙軌)
- Zod 驗證、JWT 認證、RBAC 授權
- node-cron(續扣 + 對帳排程)
- swagger-ui-express 出 API 文件
- mock 金流服務(獨立 route,HMAC 簽章 + 非同步回打 webhook + 查詢 API)
- Vite + React 簡易 demo 前端

### 部署 / DB 決策

- **本地與線上 demo 都直接用 Neon Postgres**,只切 connection string,不維護 SQLite/Postgres 雙軌(避開 enum、`@db.`、`SKIP LOCKED` 行為差異與重複測 migrate 的成本)。
- **部署平台 Render**:不用 SQLite,因 Render 預設檔案系統 ephemeral,deploy/重啟/休眠會清空,SQLite 檔案連同資料消失;持久化需付費 Persistent Disk 且只能掛單一實例、擋 zero-downtime。改用外部 Neon Postgres 即無此問題。
- 副作用:全程 Postgres,Q7/Q10 的 `SKIP LOCKED` 分散式鎖從「口頭」變「可 demo」——但仍照原決定保持口頭,時程不夠不寫。

---

## 一、資料模型(相對原計畫的修正)

```
Member        id, email, passwordHash,
              tier(NORMAL/VIP),           // 商業權益
              role(USER/ADMIN),           // ★新增:系統權限,與 tier 分開
              createdAt

Plan          id, name,
              amount(Int 最小單位),        // ★改:整數,非 price
              currency(ISO 4217),         // ★新增:USD/JPY/TWD
              intervalDays, active

Subscription  id, memberId, planId,
              status,                     // ★新增 INCOMPLETE、PAST_DUE 恢復
              retryCount(Int),            // ★新增:dunning 計數
              cancelAtPeriodEnd(Bool),    // ★新增:期末取消
              nextBillingDate, startedAt, canceledAt

Order         id, memberId, subscriptionId?,
              amount(Int), currency,      // ★改/新增
              status, idempotencyKey(UNIQUE), // ★加 UNIQUE constraint
              createdAt

Payment       id, orderId,
              amount(Int), currency,      // ★新增
              provider, providerTxnId,
              status, rawPayload,
              createdAt                   // ★新增:對帳掃 PENDING 用
```

---

## 二、狀態機(修正後)

```
Subscription: INCOMPLETE ──(webhook 扣款成功)──→ ACTIVE
              INCOMPLETE ──(失敗)──────────────→ CANCELED
              ACTIVE ──(扣款失敗)──→ PAST_DUE ──(重試成功)──→ ACTIVE
              PAST_DUE ──(連續 3 次失敗)────────→ CANCELED
              ACTIVE ──(cancelAtPeriodEnd 且到期)→ CANCELED

Order:        PENDING → PAID / FAILED   (失敗不重用,重試建新 Order)
Payment:      PENDING → SUCCESS / FAILED
```

---

## 三、核心設計決策(10 條,面試講得出就贏)

| # | 決策 | 一句話面試金句 |
|---|------|----------------|
| 1 | 決定性冪等鍵 + UNIQUE | 「冪等靠 DB unique 保證,不靠應用層先查再寫,避開 race」 |
| 2 | Webhook HMAC + raw body | 「驗簽要對 raw bytes,順序:驗簽 → 冪等 → 更新狀態」 |
| 3 | 對帳 cron + 查詢 API | 「webhook + polling 雙保險,漏掉的 callback 主動補」 |
| 4 | 金額整數最小單位 + currency | 「存最小單位整數 + ISO 4217,顯示才依 exponent,系統內不換匯」 |
| 5 | dunning 重試 + retryCount | 「失敗建新單重試,3 次才取消,成功回 ACTIVE」 |
| 6 | role 與 tier 分開 + requireRole | 「authn 用 JWT,authz 用 RBAC,401 未登入 vs 403 沒權限」 |
| 7 | cron `<= now` + 逐筆 tx | 「掃逾期不綁今天,逐筆 transaction,中斷可續」 |
| 8 | INCOMPLETE 起手,webhook 才啟用 | 「沒付錢的訂閱不該 ACTIVE,對照 Stripe incomplete」 |
| 9 | 期末取消 + 冪等 | 「預設用到期末不續扣,重複取消回 200」 |
| 10 | 分散式鎖(口頭) | 「多實例靠 unique key 防重複,正解是外部觸發 + SKIP LOCKED」 |

### 冪等鍵設計細節

- `idempotencyKey` 由伺服器端決定且具決定性,非隨機。
- 續扣 key = `subscriptionId + 計費週期識別`(如 `sub_123:2026-07-01`)。
- 重試 key 加重試序(如 `sub_123:2026-07-01:retry1`),失敗不重用 Order,建新單。
- 首筆訂閱單同規則(如 `sub_123:cycle0`)。
- `Order.idempotencyKey` 加 DB UNIQUE,由資料庫保證唯一,而非應用層先查再寫。

### Webhook 處理順序

`express.raw()` 拿 raw body → HMAC-SHA256 驗簽(錯回 401)→ 查 `providerTxnId` 冪等(已處理回 200)→ 更新 Order/Payment/Subscription。

### 多幣別

- 金額一律存該幣別最小單位整數(USD 存 cents、JPY 存 yen)。
- 每筆 Plan/Order/Payment 帶 `currency`(ISO 4217 三碼)。
- 顯示時依該幣別小數位數(exponent)格式化。
- 不跨幣別運算、不做匯率換算(FX 純口頭)。

---

## 四、優先級分層

**MUST(地基,務必寫):**
- 決定性 `idempotencyKey` + UNIQUE(#1)
- Webhook HMAC 驗簽 + raw body(#2)
- 金額整數最小單位 + currency(#4)
- dunning 重試 + `retryCount` + 3 次轉 CANCELED(#5)
- `INCOMPLETE → ACTIVE`(webhook 啟用)+ 三表同 tx(#8)
- cron `nextBillingDate <= now` + 逐筆 transaction(#7)

**SHOULD(CP 值高,有時間就做):**
- 對帳 cron + mock gateway 查詢 API(#3)
- `role(USER/ADMIN)` + `requireRole`(#6)
- 期末取消 `cancelAtPeriodEnd`(#9)

**TALK-ONLY(只在 README + 口頭,別寫):**
- Neon / SKIP LOCKED 分散式鎖(#10)
- 指數退避、寬限期、proration 退款、立即取消、匯率換算

---

## 五、1.5 天時程(已含 React 前端取捨)

| 時段 | 內容 |
|------|------|
| **D1 上午** | 骨架 + Prisma schema(含新欄位)+ migrate + 會員/JWT + `role`/`requireRole` |
| **D1 下午** | Plan + Subscription(INCOMPLETE 三表同 tx)+ Order + PaymentProvider adapter + mock gateway(含 HMAC + 查詢 API) |
| **D2 上午** | webhook(驗簽 → 冪等 → 更新)+ dunning 重試 cron + 對帳 cron(`<= now`、逐筆 tx) |
| **D2 下午** | Vite+React demo 頁(登入→訂閱→輪詢 INCOMPLETE→ACTIVE→取消)+ Swagger + seed + README 資料流圖 |

> ⚠️ 取捨警告:React 約半天,D2 下午很滿。時間不夠優先保:seed 一鍵資料 + README 資料流圖 + Swagger;React 做不完可退回純 HTML 頁面。別讓前端拖垮 MUST。

---

## 六、面試官最可能追問清單

1. 「webhook 重送你怎麼防重複扣款?」→ 決定性 key + UNIQUE(#1)
2. 「我直接 POST 你的 webhook 說付款成功,會怎樣?」→ HMAC 驗簽(#2)
3. 「webhook 一直沒回來訂單怎麼辦?」→ 對帳 cron + 查詢 API(#3)
4. 「金額為什麼不用 float?多幣別怎麼存?」→ #4
5. 「扣款失敗訂閱就直接砍嗎?」→ dunning 3 次(#5)
6. 「誰能建 Plan?VIP 算 admin 嗎?」→ role≠tier(#6)
7. 「這個 cron 上 production、開兩台機器會怎樣?」→ #7 + #10
8. 「訂閱當下扣款還沒結果,你 API 回什麼?」→ INCOMPLETE(#8)
9. 「取消後這個月的錢退嗎?還能用嗎?」→ 期末取消(#9)
10. 「為什麼分 route/controller/service/repository?service 放什麼?」→ 業務邏輯集中、adapter 低耦合
11. 「換 Stripe 要改哪些檔?」→ 只實作新 Provider,service 不動(adapter pattern)
12. 「transaction 邊界在哪?跨三張表怎麼保證一致?」→ #8 同 tx

---

## API 設計(不變)

```
POST /auth/register
POST /auth/login                    → JWT
GET  /plans
POST /plans                         (admin)
POST /subscriptions                 訂閱 → 建首筆 Order + 觸發扣款,回 INCOMPLETE
GET  /subscriptions/:id
POST /subscriptions/:id/cancel      期末取消
POST /payments/charge               走 adapter
POST /webhooks/payment              驗簽 → 冪等 → 更新
POST /mock-gateway/charge           模擬金流,非同步回打 webhook
GET  /mock-gateway/charge/:txnId    查詢交易(對帳用)
```

## 架構

route → controller → service → repository,業務邏輯全在 service。
金流走 `PaymentProvider` 介面(Ecpay/Stripe/Mock 各自實作),service 只依賴介面。
