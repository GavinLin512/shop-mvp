# 01-auth-register — 測試

風格:整合(supertest 打 route + 真 DB)。

## 任務 Checklist

- [x] 1. 合法註冊回 201 [tracer bullet]
- [x] 2. 密碼有被雜湊
- [x] 3. 重複 email 回 409
- [x] 4. 非法輸入回 400

## 行為清單(RED → GREEN,逐一)

### 1. 合法註冊回 201 [tracer bullet]
- **When** `POST /auth/register {email, password}`
- **Then** 201,body 含 `id/email/role=USER/tier=NORMAL`,**不含 passwordHash**

### 2. 密碼有被雜湊
- **Given** 已註冊
- **When** 從 DB 取該 member 的 `passwordHash`
- **Then** ≠ 明碼,且 `bcrypt.compare(明碼, passwordHash)` 為 true

### 3. 重複 email 回 409
- **Given** email 已註冊
- **When** 用相同 email 再註冊
- **Then** 409,DB 只有一筆

### 4. 非法輸入回 400
- **When** email 格式錯 / password 太短
- **Then** 400(Zod),不建立任何 member

## 注意
- 回應 schema 斷言要明確排除 `passwordHash`(防外洩回歸)。
