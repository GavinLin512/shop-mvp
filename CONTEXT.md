# CONTEXT

訂閱制金流 MVP 的**領域語言**。命名以本表為準;新增程式碼的名詞應對應這裡的術語,
不漂移到「不要用的同義詞」欄列出的字眼。

設計細節不在此重複,各有單一真實來源:

- **為什麼這樣做**(決策與取捨)→ [`.claude/rules/DECISION.md`](.claude/rules/DECISION.md)
- **怎麼組起來**(分層與資料流)→ [`.claude/rules/ARCHITECTURE.md`](.claude/rules/ARCHITECTURE.md)

## 領域簡述

會員訂閱方案 → 建立訂閱與首筆請款 → 透過金流商扣款 → webhook 回打驗簽後啟用訂閱。
定期扣款與對帳由 cron 驅動;扣款失敗走 dunning 重試。

## Glossary(詞彙表)

| 術語 | 定義 | 不要用的同義詞 |
|------|------|---------------|
| Member | 系統會員,帶 `role`(authz)與 `tier`(業務分級) | user account |
| Plan | 可訂閱的方案,帶 `amount`/`currency`/`intervalDays` | product、package |
| Subscription | 會員與某 Plan 的訂閱關係,有狀態機 | membership |
| Order | 單次計費的請款單,帶決定性 `idempotencyKey` | invoice、bill |
| Payment | 對某 Order 的一次扣款嘗試,帶 `providerTxnId` | transaction、charge |
| PaymentProvider | 金流商介面;service 只依賴它,換金流商只實作新 Provider | gateway client |
| mock-gateway | 預設/測試用的假金流商,可控成敗並回打 webhook(Mock provider 的後端) | — |
| StripeProvider | 真實金流的 PaymentProvider 實作,與 Mock 並存(ADR-0011);ADR-0013 起改由 ProviderRegistry 後台即時選用 | stripe gateway |
| ProviderRegistry | 持有各 PaymentProvider 實作的登錄器:`current()` 給新訂閱、`get(name)` 給 cron 依 `Subscription.provider` 取用、`setCurrent()` 後台切換(ADR-0013) | provider factory、selector |
| off-session 續扣 | 用已存的 PaymentMethod、免使用者在場的自動扣款,cron 驅動 | auto-charge、recurring charge |
| webhook | 金流商非同步回打的狀態通知,需 HMAC 驗簽 | callback(僅指 gateway 內部觸發) |
| idempotencyKey | 伺服器端決定且具決定性的冪等鍵,DB UNIQUE | request id、nonce |
| dunning | 扣款失敗後建新單重試的流程 | retry flow |
| reconciliation | 對帳:掃 PENDING Payment 主動查 gateway 補狀態 | sync |
| 種子資料 (seed data) | seed script 建立的固定 demo baseline(會員 + Plan),`isSeed` 標記,demo reset 時保留 | fixture、test data |
| demo reset | ADMIN 操作:清除所有訂閱類資料與非種子的會員/Plan,回到種子 baseline 的乾淨起點 | factory reset、wipe |
| demo control(展示控制台) | ADMIN-only、受 demo 開關保護的觀測/觸發工具,用來現場重現既有流程的邊界條件,非正式業務功能 | admin tools |

## 角色與權限(authn vs authz)

- `role`:`USER` / `ADMIN`,RBAC 授權用,經 `requireRole` 檢查。
- `tier`:業務分級(如 `NORMAL`),與權限無關。
- `401` = 未登入(authn 失敗);`403` = 已登入但沒權限(authz 失敗)。兩者不混用。

## 狀態機

- **Subscription**:`INCOMPLETE → ACTIVE → PAST_DUE → CANCELED`
  - 起手 `INCOMPLETE`(未付款不該 ACTIVE);webhook 成功才轉 `ACTIVE`。
  - ACTIVE 續扣失敗 → `PAST_DUE`;重試成功回 `ACTIVE`;連續 3 次失敗 → `CANCELED`。
- **Order**:`PENDING → PAID` / `FAILED`
- **Payment**:`PENDING → SUCCESS` / `FAILED`

> 啟用時三表同 tx、冪等鍵規則、webhook 處理順序、金額單位、dunning/cron 等細節,
> 見 [`DECISION.md`](.claude/rules/DECISION.md) 與 [`ARCHITECTURE.md`](.claude/rules/ARCHITECTURE.md)。
