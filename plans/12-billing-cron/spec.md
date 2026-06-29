# 12-billing-cron — 續扣排程(<= now、逐筆 tx)

## 目標
掃逾期不綁今天,逐筆 transaction 建週期單並觸發扣款,中斷可續(#7)。

## 公開介面
- `runBillingCycle(now): Promise<{processed, skipped}>`(純函式,**不依賴 cron timer**,便於測試)
- node-cron 只負責定時呼叫 `runBillingCycle(new Date())`。

## 規則
- 選取:`Subscription.status = ACTIVE 且 nextBillingDate <= now`(用 `<=`,非「等於今天」)。
- 逐筆獨立 transaction:
  - 若 `cancelAtPeriodEnd = true` → 轉 `CANCELED`,不建單。
  - 否則建週期 `Order`(key = `buildOrderKey(subId, cycleDate)`,用 06)+ 觸發 adapter charge + 推進 `nextBillingDate += intervalDays`。
- 冪等:同週期重跑因 `Order.idempotencyKey` UNIQUE 不重複建單(中斷可續)。
- 一筆失敗不影響其他筆(逐筆 tx 隔離)。

## 範圍外
失敗後的 dunning 重試決策(→ 11)、分散式鎖(口頭 #10)。

## 完成準則
只處理到期筆;期末取消轉 CANCELED;重跑不重複扣;單筆失敗可續跑。

## 依賴
06-idempotency、07-subscription、08-payment-adapter。
