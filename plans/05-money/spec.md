# 05-money — 多幣別金額(純函式)

## 目標
金額一律存「該幣別最小單位整數」,顯示時依 ISO 4217 exponent 格式化;系統內不換匯、不跨幣別運算(#4)。

## 公開介面(純函式,`src/lib/money`)
- `isValidCurrency(code: string): boolean` — 限定支援清單(USD/JPY/TWD)。
- `getExponent(code): number` — USD=2、JPY=0、TWD=2。
- `formatMoney(amount: int, code): string` — 依 exponent 還原小數並加符號。
  - `formatMoney(999,'USD') → "$9.99"`
  - `formatMoney(980,'JPY') → "¥980"`

## 規則
- `amount` 必為非負整數,否則 throw(防 float 混入)。
- currency 比對大寫;非支援清單回 false / throw。
- 不提供任何跨幣別加總或匯率 API(FX 純口頭)。

## 範圍外
匯率換算、千分位以外的 locale 細節。

## 完成準則
USD/JPY/TWD 格式化正確;非法 amount/currency 被擋。

## 依賴
無(純單元,可與 00 並行)。
