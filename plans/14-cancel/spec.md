# 14-cancel — 期末取消(冪等,SHOULD)

## 目標
預設用到期末不續扣;重複取消回 200(#9)。

## 公開介面
- `POST /subscriptions/:id/cancel`(本人)→ 200
  - 設 `cancelAtPeriodEnd = true`,`status` 維持 `ACTIVE`(用到期末)。

## 規則
- 不立即砍、不退款(立即取消/proration 為 TALK-ONLY)。
- 真正轉 `CANCELED` 由 billing-cron(12)在 `nextBillingDate` 到期時執行,不續扣。
- **冪等**:重複呼叫 cancel 一律回 200,狀態不變。
- 非本人 → 403;未登入 → 401。

## 範圍外
立即取消、按比例退款、匯率(TALK-ONLY)。

## 完成準則
cancel 後 `cancelAtPeriodEnd=true` 且仍 ACTIVE;重複呼叫冪等;到期由 12 轉 CANCELED;授權邊界正確。

## 依賴
07-subscription、12-billing-cron。
