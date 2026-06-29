# 01-auth-register — 會員註冊

## 目標
`POST /auth/register` 建立會員,密碼雜湊,套用預設權限。

## 公開介面
- `POST /auth/register` body `{email, password}`
  - 201 → `{id, email, role, tier, createdAt}`(**不含 passwordHash**)
- `authService.register({email, password})`
- `memberRepo.create()` / `memberRepo.findByEmail()`

## 規則
- 密碼用 bcrypt 雜湊後存 `passwordHash`。
- 預設 `role = USER`、`tier = NORMAL`(role≠tier,見 #6)。
- email 唯一;重複 → 409。
- Zod 驗證:email 格式、password 最小長度;失敗 → 400。

## 範圍外
登入、JWT(→ 02)。

## 完成準則
合法註冊回 201 且 DB 有雜湊密碼;重複 email 409;非法輸入 400;回應不外洩 passwordHash。

## 依賴
00-foundation。
