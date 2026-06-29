# 0008 — INCOMPLETE 起手,webhook 才啟用 + 三表同 tx

- 狀態:Accepted
- 日期:2026-06-29
- 相關:DECISION.md #8;ADR-0002(webhook)、ADR-0005(dunning);`CONTEXT.md` 狀態機

## Context(背景)

建立訂閱時錢還沒收到(扣款是非同步的)。若此時就把訂閱設為 `ACTIVE`,等於「沒付錢也享有
服務」;若扣款最終失敗,還要回頭撤銷,狀態容易不一致。

## Decision(決策)

`POST /subscriptions` 起手建 **`INCOMPLETE`** 訂閱 + `PENDING` 首單(key=`sub_<id>:cycle0`),
API 先回 INCOMPLETE。**只有 webhook 帶有效簽章的 SUCCESS 進來,才轉 `ACTIVE`**。
此啟用動作把 Order=PAID / Payment=SUCCESS / Subscription=ACTIVE **三表放同一個 transaction**
更新,要嘛全成、要嘛全回滾,不留半套狀態。

首扣失敗(INCOMPLETE 收到 FAILED webhook)→ 直接 `CANCELED`(對照 ADR-0005:ACTIVE 後的
失敗才走 dunning 重試,首扣不重試)。對照 Stripe 的 incomplete 設計。

## Consequences(後果)

**好處**
- 沒付錢的訂閱不會 ACTIVE,語意正確。
- 三表同 tx → 啟用是原子操作,無半套狀態。
- 與 dunning(ADR-0005)職責切乾淨:首扣失敗 vs 續扣失敗路徑不同。

**代價 / 約束**
- charge 須在 Sub+Order commit **之後**才呼叫;先 charge 再寫 DB 失敗會產生孤兒扣款。
- 啟用須真的在單一 tx,測試需驗 rollback(某表失敗則三表都不動)。

## Alternatives considered

- **建立即 ACTIVE,失敗再撤**:撤銷路徑複雜易不一致,否決。
- **首扣失敗也走 dunning**:沒啟用過的訂閱不該無限重試,否決(直接 CANCELED)。
