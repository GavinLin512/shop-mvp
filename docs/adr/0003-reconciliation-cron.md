# 0003 — 對帳 cron + gateway 查詢 API

- 狀態:Accepted
- 日期:2026-06-29
- 相關:DECISION.md #3;ADR-0002(webhook);`CONTEXT.md` Glossary `reconciliation`

## Context(背景)

webhook 是 at-least-once,但也可能 at-most-once 失靈:gateway 回打掉包、我方暫時當機、
網路中斷,都會讓某筆 Payment 永遠停在 `PENDING`,訂閱卡住無法啟用。只靠 webhook 推送
等於把正確性押在「對方一定送達」上。

## Decision(決策)

採 **webhook(push)+ 對帳 cron(poll)雙保險**。對帳 cron 定期掃描逾時仍 `PENDING` 的
Payment,主動呼叫 gateway 的**查詢 API** 取回實際狀態,補成 PAID/FAILED 並推進訂閱。

對帳與 webhook **共用同一套冪等**(以 `providerTxnId` / Order 冪等鍵判定),確保同一筆不論
由哪條路徑先到,都只更新一次。已是終態或未逾時的 Payment 不納入處理集合。

## Consequences(後果)

**好處**
- 漏送的 callback 由對帳兜底,無單點依賴。
- 共用冪等 → push 與 poll 同時到也不重複記帳。

**代價 / 約束**
- gateway 必須提供查詢 API(mock-gateway 需實作)。
- 需定義「逾時門檻」與掃描頻率;cron 須注入可控 `now` 以利測試。

## Alternatives considered

- **只靠 webhook**:漏送即永久卡 PENDING,否決。
- **對帳獨立一套更新邏輯**:與 webhook 各更新一次造成重複,否決(改共用冪等)。
