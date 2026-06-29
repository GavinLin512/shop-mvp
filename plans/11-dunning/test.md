# 11-dunning — 測試

風格:整合(用簽好的 FAILED/SUCCESS webhook 驅動狀態)。

## 任務 Checklist

- [x] 1. ACTIVE 扣款失敗 → PAST_DUE + retry1 新單 [tracer bullet]
- [x] 2. 重試成功 → 回 ACTIVE 並重置
- [x] 3. 連續 3 次失敗 → CANCELED
- [x] 4. 失敗單不重用(每次新 key)

## 行為清單(RED → GREEN,逐一)

### 1. ACTIVE 扣款失敗 → PAST_DUE + retry1 新單 [tracer bullet]
- **Given** ACTIVE 訂閱
- **When** 送 FAILED webhook(續扣失敗)
- **Then** `Subscription=PAST_DUE`、`retryCount=1`、產生新 Order(key 含 `:retry1`)

### 2. 重試成功 → 回 ACTIVE 並重置
- **Given** PAST_DUE、retryCount=1
- **When** 重試單收到 SUCCESS webhook
- **Then** `Subscription=ACTIVE`、`retryCount=0`

### 3. 連續 3 次失敗 → CANCELED
- **When** 連續三次 FAILED
- **Then** 第 3 次後 `Subscription=CANCELED`,停止再建重試單

### 4. 失敗單不重用(每次新 key)
- **Then** retry1 / retry2 / retry3 各為獨立 Order,舊 FAILED 單不被改用

## 注意
- 狀態機路徑:`ACTIVE→PAST_DUE→(成功)ACTIVE` 與 `PAST_DUE→(3 次)CANCELED`,兩條都要有測試。
- 與 10 的差異:10 管「INCOMPLETE 首扣失敗即 CANCELED」;11 管「ACTIVE 已啟用後的失敗走重試」。別混。
