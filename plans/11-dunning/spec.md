# 11-dunning — 失敗重試(retryCount、3 次轉 CANCELED)

## 目標
扣款失敗不直接砍訂閱:失敗建新單重試,3 次才取消,成功回 ACTIVE(#5)。

## 公開介面
- webhook(10)收到 FAILED 對 ACTIVE/PAST_DUE 訂閱 → 進 dunning:
  - `Subscription → PAST_DUE`、`retryCount += 1`
  - 建**新 Order**(key 加 `:retry<N>`,用 06)+ 觸發 charge
- 連續第 3 次失敗 → `Subscription → CANCELED`
- 重試成功(下一個 SUCCESS webhook)→ `ACTIVE` 且 `retryCount = 0`
- 可由 dunning cron `runDunning(now)` 掃 PAST_DUE 觸發重試(或在 webhook 失敗時即建新重試單,二擇一;測試鎖行為不鎖觸發位置)。

## 規則
- 失敗的 Order 不重用(每次重試是新 Order、新 key)。
- `retryCount` 達 3 → CANCELED,停止重試。

## 範圍外
指數退避 / 寬限期(TALK-ONLY,只口頭)。

## 完成準則
首次失敗轉 PAST_DUE 並建 retry1 新單;成功回 ACTIVE 並重置;連 3 次失敗轉 CANCELED;舊失敗單不重用。

## 依賴
10-webhook、12-billing-cron。
