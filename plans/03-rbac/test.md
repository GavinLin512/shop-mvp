# 03-rbac — 測試

風格:整合(掛一條 `requireAuth` + `requireRole('ADMIN')` 的測試 route)。

## 任務 Checklist

- [x] 1. 帶有效 token 通過 requireAuth [tracer bullet]
- [x] 2. 不帶 token → 401
- [x] 3. 無效 / 竄改 / 過期 token → 401
- [x] 4. USER 存取 admin-only → 403
- [x] 5. ADMIN 存取 admin-only → 200

## 行為清單(RED → GREEN,逐一)

### 1. 帶有效 token 通過 requireAuth [tracer bullet]
- **When** 帶有效 USER token 存取 `requireAuth` route
- **Then** 通過,handler 能讀到 `req.member`(回 200 含 memberId)

### 2. 不帶 token → 401
- **When** 無 `Authorization` header
- **Then** 401

### 3. 無效 / 竄改 / 過期 token → 401
- **When** 帶壞掉的 token
- **Then** 401

### 4. USER 存取 admin-only → 403
- **When** USER token 存取 `requireRole('ADMIN')` route
- **Then** 403

### 5. ADMIN 存取 admin-only → 200
- **When** ADMIN token
- **Then** 200

## 注意
- 重點是「401 vs 403 不混用」,這是面試金句 #6,測試要把兩者分開斷言。
