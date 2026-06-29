# 02-auth-login — 測試

風格:整合。

## 任務 Checklist

- [x] 1. 正確帳密回 token [tracer bullet]
- [x] 2. 密碼錯回 401
- [x] 3. email 不存在回 401(訊息與密碼錯相同)
- [x] 4. 缺欄位回 400

## 行為清單(RED → GREEN,逐一)

### 1. 正確帳密回 token [tracer bullet]
- **Given** 已註冊的 member
- **When** `POST /auth/login` 正確帳密
- **Then** 200 `{token}`;decode token 後 `sub === memberId`、含 `role`

### 2. 密碼錯回 401
- **When** 正確 email、錯誤密碼
- **Then** 401

### 3. email 不存在回 401(訊息與密碼錯相同)
- **When** 未註冊 email
- **Then** 401,且 body 訊息與第 2 項一致(不洩漏帳號存在性)

### 4. 缺欄位回 400
- **When** 缺 email 或 password
- **Then** 400

## 注意
- 第 1 項只驗「能解碼出正確 claims」,不綁特定 JWT 函式庫實作。
