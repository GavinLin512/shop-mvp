# 0009 — 期末取消 + 冪等

- 狀態:Accepted
- 日期:2026-06-29
- 相關:DECISION.md #9;ADR-0007(billing cron 落實轉 CANCELED);`CONTEXT.md` 狀態機

## Context(背景)

使用者取消訂閱時,通常已付到本期末。立即停權並退款牽涉 proration,複雜且超出 MVP 範圍。
取消動作也可能被重複點擊或重送,需冪等。

## Decision(決策)

`POST /subscriptions/:id/cancel` **預設只標記 `cancelAtPeriodEnd=true`,狀態仍 `ACTIVE`**,
讓使用者用到本期末。實際轉 `CANCELED` 由續扣 cron 在到期(`nextBillingDate <= now`)時執行,
且**不建週期單、不續扣**(見 ADR-0007)。

重複取消**冪等**:再次呼叫回 200,狀態不變(`cancelAtPeriodEnd` 仍 true、仍 ACTIVE)。
授權邊界:非本人 → 403、未登入 → 401(承 ADR-0006)。

## Consequences(後果)

**好處**
- 使用者用好用滿到期末,無需 proration。
- 取消與真正停權解耦,落地點集中在 billing cron。
- 重複取消安全(冪等)。

**代價 / 約束**
- 需 `cancelAtPeriodEnd` 欄位;cron 須處理「已標記取消且到期」的分支(跨 ADR-0007)。
- 立即取消 / proration 退款為範圍外(TALK-ONLY)。

## Alternatives considered

- **立即取消 + proration 退款**:複雜,超出 MVP,否決。
- **取消即刪訂閱**:破壞稽核與冪等,否決。
