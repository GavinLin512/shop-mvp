# 0001 — 決定性冪等鍵 + DB UNIQUE

- 狀態:Accepted
- 日期:2026-06-29
- 相關:DECISION.md #1、#2、#5、#7;`CONTEXT.md` Glossary `idempotencyKey`

## Context(背景)

金流是 at-least-once 的世界:同一筆扣款可能因 client 重送、webhook 重打、cron 重跑、
網路重試而被觸發多次。若沒有去重機制,會產生**重複請款 / 重複扣款 / 重複啟用訂閱**。

常見作法是「先查再寫」(先 `findFirst` 確認沒有,再 `create`),但在併發下兩個請求可能
同時查到「不存在」而各寫一筆 —— 這是典型 race condition,應用層查詢擋不住。

本系統有四個會重複觸發的進入點:首筆訂閱、續扣 cron、dunning 重試、對帳補單,
全都需要同一套去重保證。

## Decision(決策)

以**伺服器端決定且具決定性的 `idempotencyKey`** 作為 Order 的去重依據,並由 **DB UNIQUE
constraint** 保證唯一,而非依賴應用層先查再寫。

鍵的組成具決定性(相同業務事件必然算出相同字串):

- 首筆訂閱單:`sub_<id>:cycle0`
- 續扣單:`sub_<id>:<計費週期>`,如 `sub_123:2026-07-01`
- 重試單:在週期 key 後加重試序,如 `sub_123:2026-07-01:retry1`

寫入流程靠 DB 唯一鍵衝突(Prisma `P2002`)判定重複,由 repository 吞掉衝突並回傳既有
Order,**不**在應用層先 `findFirst`。

失敗的扣款**不重用** Order:重試一律以新 key 建新單,保留每次嘗試的獨立紀錄。

## Consequences(後果)

**好處**
- 去重的正確性下推到資料庫,天然免疫併發 race,不靠應用層時序。
- 任何進入點重送/重跑都安全:同一事件第二次寫入直接撞 UNIQUE,自然冪等。
- 鍵可由業務事件重算 → 對帳與排程「補單」時不需額外狀態即可定位同一筆。

**代價 / 約束**
- `Order.idempotencyKey` 必須有 DB UNIQUE constraint(地基,migration 即須上)。
- 呼叫端必須能拿到/算出決定性 key,不可用隨機值(否則去重失效)。
- repository 寫入需正確攔截 `P2002` 並轉為「回傳既有 Order」,而非把錯往上拋。
- webhook 端另有自己的冪等(查 `providerTxnId`),與本鍵互補,見 DECISION.md #2。

## Alternatives considered(被否決的替代方案)

- **應用層先查再寫**:無法擋併發 race,否決。
- **client 傳隨機 idempotency token**:非決定性,cron/對帳無法重算定位同一筆,否決。
