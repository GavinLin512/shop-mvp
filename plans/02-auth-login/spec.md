# 02-auth-login — 登入發 JWT

## 目標
`POST /auth/login` 驗證帳密,回傳 JWT。

## 公開介面
- `POST /auth/login` body `{email, password}`
  - 200 → `{token}`
- `authService.login({email, password})`

## 規則
- JWT payload 含 `sub = memberId`、`role`(供 03 RBAC)。
- 用 `JWT_SECRET` 簽,設合理過期。
- 密碼錯或 email 不存在 → **401,同一訊息**(不洩漏帳號是否存在)。
- Zod 缺欄位 → 400。

## 範圍外
RBAC 中介層(→ 03)、refresh token。

## 完成準則
正確帳密回可解碼出 memberId/role 的 token;錯誤一律 401;缺欄位 400。

## 依賴
01-auth-register。
