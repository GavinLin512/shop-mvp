# 05-money — 測試

風格:**單元**(純函式,不碰 DB / HTTP)。

## 任務 Checklist

- [x] 1. USD 兩位小數格式化 [tracer bullet]
- [x] 2. JPY exponent 0(無小數)
- [x] 3. currency 驗證
- [x] 4. 非法 amount 被擋

## 行為清單(RED → GREEN,逐一)

### 1. USD 兩位小數格式化 [tracer bullet]
- `formatMoney(999, 'USD')` → `"$9.99"`

### 2. JPY exponent 0(無小數)
- `formatMoney(980, 'JPY')` → `"¥980"`
- `getExponent('JPY')` → `0`

### 3. currency 驗證
- `isValidCurrency('USD')` → true
- `isValidCurrency('us')` / `isValidCurrency('XXX')` → false
- 小寫 `'usd'` 視為合法(內部正規化大寫)

### 4. 非法 amount 被擋
- `formatMoney(9.99, 'USD')`(float)→ throw
- `formatMoney(-100, 'USD')`(負)→ throw

## 注意
- 不測 locale 千分位等超出範圍的細節;只鎖 #4 的核心承諾。
