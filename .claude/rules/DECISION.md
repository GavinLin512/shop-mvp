# 核心設計決策

| # | 決策 | 一句話說明 |
|---|------|-----------|
| 1 | 決定性冪等鍵 + UNIQUE | 冪等靠 DB unique 保證,不靠應用層先查再寫,避開 race |
| 2 | Webhook HMAC + raw body | 驗簽對 raw bytes,順序:驗簽 → 冪等 → 更新狀態 |
| 3 | 對帳 cron + 查詢 API | webhook + polling 雙保險,漏掉的 callback 主動補 |
| 4 | 金額整數最小單位 + currency | 存最小單位整數 + ISO 4217,顯示才依 exponent,系統內不換匯 |
| 5 | dunning 重試 + retryCount | 失敗建新單重試,3 次才取消,成功回 ACTIVE |
| 6 | role 與 tier 分開 + requireRole | authn 用 JWT,authz 用 RBAC,401 未登入 vs 403 沒權限 |
| 7 | cron `<= now` + 逐筆 tx | 掃逾期不綁今天,逐筆 transaction,中斷可續 |
| 8 | INCOMPLETE 起手,webhook 才啟用 | 沒付錢的訂閱不該 ACTIVE,對照 Stripe incomplete |
| 9 | 期末取消 + 冪等 | 預設用到期末不續扣,重複取消回 200 |
| 10 | 分散式鎖(口頭) | 多實例靠 unique key 防重複,正解是外部觸發 + SKIP LOCKED |

## 冪等鍵設計

- `idempotencyKey` 由伺服器端決定且具決定性,非隨機。
- 續扣 key = `subscriptionId + 計費週期識別`,如 `sub_123:2026-07-01`。
- 重試 key 加重試序,如 `sub_123:2026-07-01:retry1`,失敗不重用 Order,建新單。
- 首筆訂閱單同規則,如 `sub_123:cycle0`。
- `Order.idempotencyKey` 加 DB UNIQUE,由資料庫保證唯一,而非應用層先查再寫。

## Webhook 處理順序

`express.raw()` 拿 raw body → HMAC-SHA256 驗簽(錯回 401)→ 查 `providerTxnId` 冪等(已處理回 200)→ 更新 Order / Payment / Subscription。

## 多幣別

- 金額一律存該幣別最小單位整數(USD 存 cents、JPY 存 yen)。
- 每筆 Plan / Order / Payment 帶 `currency`(ISO 4217 三碼)。
- 顯示時依該幣別小數位數(exponent)格式化。
- 不跨幣別運算、不做匯率換算(FX 純口頭)。

## 範圍取捨

**MUST(地基)**
- 決定性 `idempotencyKey` + UNIQUE(#1)
- Webhook HMAC 驗簽 + raw body(#2)
- 金額整數最小單位 + currency(#4)
- dunning 重試 + `retryCount` + 3 次轉 CANCELED(#5)
- `INCOMPLETE → ACTIVE`(webhook 啟用)+ 三表同 tx(#8)
- 續扣 cron `nextBillingDate <= now` + 逐筆 transaction(#7)

**SHOULD(有時間就做)**
- 對帳 cron + mock gateway 查詢 API(#3)
- `role(USER/ADMIN)` + `requireRole`(#6)
- 期末取消 `cancelAtPeriodEnd`(#9)

**TALK-ONLY(只在 README + 口頭,不實作)**
- Neon / SKIP LOCKED 分散式鎖(#10)
- 指數退避、寬限期、proration 退款、立即取消、匯率換算
