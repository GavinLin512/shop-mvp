# 04-plans — 測試

風格:整合。

## 任務 Checklist

- [x] 1. admin 建立方案回 201 [tracer bullet]
- [x] 2. GET /plans 列出 active 方案
- [x] 3. 授權邊界(USER 403 / 未登入 401)
- [x] 4. 驗證邊界(amount / currency / intervalDays → 400)

## 行為清單(RED → GREEN,逐一)

### 1. admin 建立方案回 201 [tracer bullet]
- **Given** ADMIN token
- **When** `POST /plans {name, amount, currency, intervalDays}`
- **Then** 201,回傳含 `amount`(Int)與 `currency`

### 2. GET /plans 列出 active 方案
- **Given** 已建一個 active、一個 inactive 方案
- **When** `GET /plans`(免登入)
- **Then** 200,只含 active 那筆

### 3. 授權邊界
- USER token `POST /plans` → 403
- 未登入 `POST /plans` → 401

### 4. 驗證邊界
- `amount` 非正整數 / `currency` 非支援 / 缺 `intervalDays` → 400,不建立

## 注意
- 第 4 項的 currency 驗證應走 05-money 的 `isValidCurrency`,避免重複規則。
