# 0005 — dunning 重試 + retryCount

- 狀態:Accepted
- 日期:2026-06-29
- 相關:DECISION.md #5;ADR-0001(失敗不重用 Order);`CONTEXT.md` Glossary `dunning`、狀態機

## Context(背景)

ACTIVE 訂閱續扣可能因餘額不足、卡片過期等暫時性原因失敗。直接取消對使用者太苛刻;
無限重試又會卡死。需要一個有界的重試策略,並保留每次嘗試的獨立紀錄。

注意:這條只管「ACTIVE 已啟用後的續扣失敗」走重試;首扣(INCOMPLETE)失敗即 CANCELED,
見 ADR-0008,兩者別混。

## Decision(決策)

ACTIVE 續扣失敗 → 訂閱轉 `PAST_DUE`、`retryCount += 1`,並**建新 Order**(key 加 `:retryN`)
重試。重試成功 → 回 `ACTIVE`、`retryCount` 重置為 0。連續 **3 次**失敗 → 轉 `CANCELED`,
停止再建重試單。

失敗單**不重用**(承 ADR-0001):retry1 / retry2 / retry3 各為獨立 Order,舊 FAILED 單不改用。

## Consequences(後果)

**好處**
- 有界重試,不卡死;暫時性失敗有恢復機會。
- 每次嘗試獨立成單 → 完整可稽核。

**代價 / 約束**
- `Subscription.retryCount` 欄位 + 狀態機兩條路徑都需測試:
  `ACTIVE→PAST_DUE→(成功)ACTIVE` 與 `PAST_DUE→(3 次)CANCELED`。

## Alternatives considered

- **失敗立即取消**:對暫時性失敗太苛,否決。
- **重用同一 Order 重試**:破壞冪等與稽核,違反 ADR-0001,否決。
- **指數退避 / 寬限期**:範圍外(TALK-ONLY),本版不實作。
