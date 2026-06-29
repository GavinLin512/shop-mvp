# 13-reconciliation — 測試(SHOULD)

風格:整合(注入 now;mock-gateway 查詢回可控狀態)。

## 任務 Checklist

- [x] 1. 逾時 PENDING 且 gateway SUCCESS → 補成 PAID/ACTIVE [tracer bullet]
- [x] 2. gateway 仍 PENDING → 不動
- [x] 3. gateway FAILED → 補成 FAILED
- [x] 4. 已終態不重撈
- [x] 5. 與 webhook 不重複處理

## 行為清單(RED → GREEN,逐一)

### 1. 逾時 PENDING 且 gateway SUCCESS → 補成 PAID/ACTIVE [tracer bullet]
- **Given** 一筆超過門檻的 PENDING Payment,gateway 查詢回 SUCCESS
- **When** `runReconciliation(now)`
- **Then** Order=PAID、Payment=SUCCESS、訂閱啟用/恢復

### 2. gateway 仍 PENDING → 不動
- **Then** 狀態維持,不誤更新

### 3. gateway FAILED → 補成 FAILED
- **Then** Order/Payment=FAILED(並依訂閱狀態走對應路徑)

### 4. 已終態不重撈
- **Given** 已 SUCCESS / 未逾時的 Payment
- **Then** 不在處理集合內

### 5. 與 webhook 不重複處理
- **Given** 同筆稍後又收到 webhook
- **Then** 冪等命中,不二次更新

## 注意
- 重點是「主動補」與 webhook 路徑共用冪等,避免兩邊各更新一次造成重複扣記。
