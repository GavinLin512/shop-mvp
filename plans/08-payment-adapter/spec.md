# 08-payment-adapter — PaymentProvider 介面 + Mock

## 目標
金流走 `PaymentProvider` 介面,service 只依賴介面;換 Stripe 只新增實作、service 不動(adapter pattern,面試 #11)。

## 公開介面
- 介面 `PaymentProvider`:
  - `charge({orderId, amount, currency, idempotencyKey}) → {providerTxnId, status}`
- `MockProvider implements PaymentProvider`:呼叫 `POST /mock-gateway/charge`(09),回 `{providerTxnId, status:"PENDING"}`。
- `POST /payments/charge`(走 adapter)→ 建 `Payment(PENDING)` 並回 `providerTxnId`。
- provider 以注入方式取得(DI),測試可換 fake。

## 規則
- service 端不得直接 import 任何金流商實作,只依賴介面型別。
- `charge` 為非同步啟動:回 PENDING,實際成敗由 webhook(10)回來。

## 範圍外
mock-gateway 內部(→ 09)、webhook 處理(→ 10)、真實金流商。

## 完成準則
MockProvider 能取得 providerTxnId;service 透過介面呼叫(可被 fake 取代);`POST /payments/charge` 建 PENDING Payment。

## 依賴
09-mock-gateway。
