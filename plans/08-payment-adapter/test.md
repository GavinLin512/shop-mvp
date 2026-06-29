# 08-payment-adapter — 測試

風格:整合(MockProvider 打 mock-gateway)+ 解耦驗證(fake provider)。

## 任務 Checklist

- [x] 1. MockProvider.charge 回 providerTxnId [tracer bullet]
- [x] 2. service 只依賴介面(可注入 fake)
- [x] 3. POST /payments/charge 建 PENDING Payment

## 行為清單(RED → GREEN,逐一)

### 1. MockProvider.charge 回 providerTxnId [tracer bullet]
- **When** `MockProvider.charge({orderId, amount, currency, idempotencyKey})`
- **Then** 回 `{providerTxnId, status:"PENDING"}`(整合:實際打 mock-gateway)

### 2. service 只依賴介面(可注入 fake)
- **Given** 注入 fake provider
- **When** 走扣款流程
- **Then** fake 的 `charge` 被以正確參數呼叫;service 程式無任何金流商實作 import

### 3. POST /payments/charge 建 PENDING Payment
- **When** `POST /payments/charge`(對某 Order)
- **Then** 建 `Payment(status=PENDING, providerTxnId)` 並回 providerTxnId

## 注意
- 第 2 項是 #11「換 Stripe 不動 service」的回歸護欄:斷言依賴方向,而非實作細節。
