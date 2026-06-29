# 13-reconciliation — 對帳排程(SHOULD)

## 目標
webhook + polling 雙保險:漏掉的 callback 主動補(#3)。

## 公開介面
- `runReconciliation(now): Promise<{checked, updated}>`(純函式,可注入 now)
- node-cron 定時呼叫。

## 規則
- 選取:`Payment.status = PENDING` 且 `createdAt` 超過門檻(如 N 分鐘)。
- 對每筆呼叫 `GET /mock-gateway/charge/:txnId`(09 查詢 API)取實際狀態:
  - gateway SUCCESS → 比照 webhook 成功路徑補更新(Order=PAID、Payment=SUCCESS、訂閱啟用/恢復)。
  - gateway FAILED → 比照失敗路徑。
  - 仍 PENDING → 不動。
- 補更新走與 10 相同的冪等更新邏輯,避免與遲到的 webhook 重複處理。

## 範圍外
首次扣款流程(→ 07/10)。

## 完成準則
逾時 PENDING 能依 gateway 實況補正;仍 PENDING 不動;已終態不重撈;與 webhook 不重複更新。

## 依賴
09-mock-gateway、10-webhook(共用更新/冪等邏輯)。
