# 09-mock-gateway — 模擬金流(HMAC + 非同步回打)

## 目標
獨立 route 模擬第三方金流:收單回 PENDING,**非同步**用 HMAC 簽章回打 webhook;另提供查詢 API 供對帳(#3)。

## 公開介面
- `POST /mock-gateway/charge` body `{orderId, amount, currency, idempotencyKey}`
  - 回 `{txnId, status:"PENDING"}`
  - 之後非同步 `POST /webhooks/payment`,body 為交易結果,帶 header `X-Signature: HMAC-SHA256(rawBody, GATEWAY_SECRET)`。
- `GET /mock-gateway/charge/:txnId` → `{txnId, status, amount, currency}`(對帳查詢)。

## 規則
- 成敗可控:依約定(如特定 amount 尾數 / 測試旗標)決定回 SUCCESS 或 FAILED,讓測試能驅動兩條路徑。
- 簽章對 **raw body bytes** 計算(與 10 驗簽一致)。
- 提供測試鉤子:可「立即同步觸發 callback」,避免非同步 flaky。

## 範圍外
webhook 接收端驗簽與更新(→ 10)、真實外部呼叫。

## 完成準則
收單回 txnId/PENDING;callback 會帶有效 HMAC 打 webhook;查詢 API 回交易狀態;成敗可被測試驅動。

## 依賴
00-foundation;與 10 共用 `GATEWAY_SECRET` 與簽章演算法。
