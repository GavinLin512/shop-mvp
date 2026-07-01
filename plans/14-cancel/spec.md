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
- **期末取消後不可立即再訂(防重疊重複扣款)**:標記 `cancelAtPeriodEnd` 後訂閱仍 `ACTIVE`、付費週期尚未結束,此時 `POST /subscriptions` 回 **409**(守衛在 07-subscription 的 `create`:本人有 `INCOMPLETE/ACTIVE/PAST_DUE` 訂閱即擋)。須等 billing-cron(或 Demo Control 的 **RUN BILLING**)在期末把舊訂閱翻成 `CANCELED` 後才放行。屆時新訂閱 `startedAt = now` 自然接在舊期之後,時間軸連續、不與舊期重疊。

## 範圍外
立即取消、按比例退款、匯率(TALK-ONLY)。

## 完成準則
cancel 後 `cancelAtPeriodEnd=true` 且仍 ACTIVE;重複呼叫冪等;到期由 12 轉 CANCELED;授權邊界正確;期末取消後在轉 CANCELED 前再訂回 409、轉 CANCELED 後可再訂。

## 依賴
07-subscription、12-billing-cron。
