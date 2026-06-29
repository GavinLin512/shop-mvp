# 10-webhook — 測試 ★核心

風格:整合(自行用 GATEWAY_SECRET 簽 raw body 送入)。

## 任務 Checklist

- [x] 1. 有效簽章 + 成功 → INCOMPLETE 轉 ACTIVE [tracer bullet]
- [x] 2. 簽章錯誤 → 401,狀態不變
- [x] 3. 重送相同 providerTxnId → 冪等
- [x] 4. 失敗 webhook 對 INCOMPLETE → CANCELED
- [x] 5. 三表同 tx(rollback)
- [x] 6. raw body 驗簽

## 行為清單(RED → GREEN,逐一)

### 1. 有效簽章 + 成功 → INCOMPLETE 轉 ACTIVE [tracer bullet]
- **Given** 一個 INCOMPLETE 訂閱 + PENDING Order/Payment
- **When** 送有效簽章的 SUCCESS webhook
- **Then** `Order=PAID`、`Payment=SUCCESS`、`Subscription=ACTIVE`

### 2. 簽章錯誤 → 401,狀態不變
- **When** 竄改 body 或用錯 secret 簽
- **Then** 401,DB 三表狀態維持原樣

### 3. 重送相同 providerTxnId → 冪等
- **Given** 已處理過一次(已 ACTIVE)
- **When** 再送相同有效 webhook
- **Then** 200,Payment 仍一筆、Subscription 不被二次改、Order 不重複

### 4. 失敗 webhook 對 INCOMPLETE → CANCELED
- **Given** INCOMPLETE 訂閱
- **When** 送有效簽章的 FAILED webhook
- **Then** `Order=FAILED`、`Payment=FAILED`、`Subscription=CANCELED`

### 5. 三表同 tx(rollback)
- **Given** 模擬更新 Subscription 階段失敗
- **Then** Order/Payment 也不被改(整筆 rollback,無半套狀態)

### 6. raw body 驗簽
- **When** 送的 body 與簽章用同一串 raw bytes
- **Then** 通過;證明路由用 `express.raw()` 而非已 parse 的 JSON 重算

## 注意
- 順序是金句 #2:驗簽 → 冪等 → 更新。測試把三者拆開,確保任一前置失敗就不進下一步。
