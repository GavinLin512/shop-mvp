# 04-plans — 方案 CRUD

## 目標
公開列出方案;僅 admin 可建立方案(#6 授權落地)。

## 公開介面
- `GET /plans` — 公開,回 active 方案陣列 `[{id,name,amount,currency,intervalDays}]`。
- `POST /plans`(admin)body `{name, amount(Int 最小單位), currency, intervalDays}` → 201。
- `planService` / `planRepo`。

## 規則
- `POST` 套 `requireAuth` + `requireRole('ADMIN')`:未登入 401、非 admin 403。
- Zod:`amount` 正整數、`currency` 須 `isValidCurrency`(用 05-money)、`intervalDays` 正整數;失敗 400。
- `GET /plans` 只回 `active=true`。

## 範圍外
方案編輯 / 停用 API(demo 用 seed 切 active 即可)。

## 完成準則
admin 能建、公開能列;權限與驗證邊界正確。

## 依賴
03-rbac、05-money。
