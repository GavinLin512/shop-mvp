# 0004 — 金額存最小單位整數 + currency

- 狀態:Accepted
- 日期:2026-06-29
- 相關:DECISION.md #4;`CONTEXT.md` Glossary `Plan`、`Order`、`Payment`

## Context(背景)

金額用浮點數(float)會有精度誤差(`0.1 + 0.2 !== 0.3`),記帳系統不可接受。各幣別小數位數
也不同(USD 兩位、JPY 零位),若用單一假設會錯算。

## Decision(決策)

金額一律存**該幣別最小單位的整數**(USD 存 cents、JPY 存 yen),每筆 Plan / Order / Payment
都帶 `currency`(ISO 4217 三碼)。顯示時才依該幣別的 exponent 格式化(`formatMoney`)。

系統內**不跨幣別運算、不做匯率換算**(FX 純口頭,不實作)。currency 驗證集中在 05-money 的
`isValidCurrency`,內部正規化為大寫。

## Consequences(後果)

**好處**
- 整數運算無精度誤差;金額計算可靠。
- `currency` 隨資料走 → 顯示與驗證有單一依據,JPY/USD 各自正確。

**代價 / 約束**
- 所有金額欄位型別為整數;寫入前須擋掉 float 與負值(`formatMoney` throw)。
- 不支援多幣別加總/換匯 —— 這是刻意的範圍取捨。

## Alternatives considered

- **float / Decimal 字串存金額**:精度或複雜度代價高,MVP 否決。
- **全系統單一幣別**:無法支援 JPY/USD 並存,否決。
