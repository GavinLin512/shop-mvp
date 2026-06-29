# 07-subscription — 測試

風格:整合(payment adapter 用可注入的 fake provider 斷言呼叫參數)。

## 任務 Checklist

- [ ] 1. 建立訂閱回 INCOMPLETE + 首單 [tracer bullet]
- [ ] 2. 觸發扣款帶正確參數
- [ ] 3. 授權 / 輸入邊界
- [ ] 4. GET /subscriptions/:id 擁有者檢查
- [ ] 5. tx 一致性(rollback)

## 行為清單(RED → GREEN,逐一)

### 1. 建立訂閱回 INCOMPLETE + 首單 [tracer bullet]
- **Given** 登入 USER、一個 active plan
- **When** `POST /subscriptions {planId}`
- **Then** 201 `status=INCOMPLETE`;DB 有 Subscription(INCOMPLETE, retryCount=0)+ Order(PENDING, key=`sub_<id>:cycle0`, amount/currency 取自 plan)

### 2. 觸發扣款帶正確參數
- **When** 建立訂閱
- **Then** payment adapter `charge` 被呼叫一次,參數含 Order 的 amount/currency/idempotencyKey
- 用 fake provider 斷言(驗證 service 只依賴介面 → 解耦 #11)

### 3. 授權 / 輸入邊界
- 未登入 → 401
- planId 不存在或 inactive → 404 / 400

### 4. GET /subscriptions/:id 擁有者檢查
- 本人 → 200
- 他人(非 admin)→ 403 或 404

### 5. tx 一致性(rollback)
- **Given** 模擬建立 Order 階段失敗
- **Then** Subscription 不殘留(同 tx 全 rollback)

## 注意
- charge 是 commit 後才呼叫;若先呼叫再寫 DB 失敗會產生孤兒扣款——測試要鎖住「先 commit Sub+Order,再 charge」順序。
