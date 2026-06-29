# 09-mock-gateway — 測試

風格:整合 + HMAC 單元。

## 任務 Checklist

- [ ] 1. 收單回 txnId + PENDING [tracer bullet]
- [ ] 2. callback 帶有效 HMAC 打 webhook
- [ ] 3. 查詢 API 回交易狀態
- [ ] 4. 成敗可控

## 行為清單(RED → GREEN,逐一)

### 1. 收單回 txnId + PENDING [tracer bullet]
- **When** `POST /mock-gateway/charge {orderId, amount, currency, idempotencyKey}`
- **Then** 200/202 `{txnId, status:"PENDING"}`

### 2. callback 帶有效 HMAC 打 webhook
- **When** 觸發 callback(用測試鉤子同步觸發)
- **Then** webhook 端收到請求,`X-Signature` == `HMAC-SHA256(rawBody, GATEWAY_SECRET)`(用相同演算法重算比對)

### 3. 查詢 API 回交易狀態
- **Given** 已收單
- **When** `GET /mock-gateway/charge/:txnId`
- **Then** 回該 txn 的 status/amount/currency

### 4. 成敗可控
- **When** 用「成功旗標」與「失敗旗標」各收一單
- **Then** callback 分別送 SUCCESS / FAILED

## 注意
- 簽章一律對 raw bytes;測試重算簽章時不可先 `JSON.parse` 再 `stringify`(順序/空白會變,簽章對不上)。
