# 12-billing-cron — 測試

風格:整合(直接呼叫 `runBillingCycle(now)`,注入可控 now 與 fake provider)。

## 任務 Checklist

- [ ] 1. 到期 ACTIVE 訂閱被續扣 [tracer bullet]
- [ ] 2. 未到期不處理
- [ ] 3. 同週期重跑冪等
- [ ] 4. 期末取消到期 → CANCELED 不建單
- [ ] 5. 逐筆隔離(中斷可續)

## 行為清單(RED → GREEN,逐一)

### 1. 到期 ACTIVE 訂閱被續扣 [tracer bullet]
- **Given** 一筆 ACTIVE、`nextBillingDate <= now`
- **When** `runBillingCycle(now)`
- **Then** 建週期 Order(key=`sub_<id>:<cycleDate>`)+ adapter.charge 被呼叫 + `nextBillingDate` 前進一個 interval

### 2. 未到期不處理
- **Given** `nextBillingDate > now`
- **Then** 不建單、不扣款

### 3. 同週期重跑冪等
- **When** 同一 `now` 連跑兩次
- **Then** 該週期 Order 只有一筆(UNIQUE 擋住),不重複扣

### 4. 期末取消到期 → CANCELED 不建單
- **Given** ACTIVE 且 `cancelAtPeriodEnd=true`、已到期
- **Then** 轉 `CANCELED`,不建週期單

### 5. 逐筆隔離(中斷可續)
- **Given** 多筆到期,其中一筆 charge 階段丟錯
- **Then** 其他筆仍正常處理;失敗筆不殘留半套狀態;重跑可補上

## 注意
- 用注入的 `now` 驅動,**不要**用真實系統時間或真 cron timer(否則 flaky 且不可重現)。
