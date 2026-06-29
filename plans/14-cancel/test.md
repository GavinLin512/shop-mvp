# 14-cancel — 測試(SHOULD)

風格:整合。

## 任務 Checklist

- [ ] 1. 取消設期末旗標、狀態仍 ACTIVE [tracer bullet]
- [ ] 2. 重複取消冪等
- [ ] 3. 到期由 billing-cron 轉 CANCELED(跨 12)
- [ ] 4. 授權邊界

## 行為清單(RED → GREEN,逐一)

### 1. 取消設期末旗標、狀態仍 ACTIVE [tracer bullet]
- **Given** 登入本人、一個 ACTIVE 訂閱
- **When** `POST /subscriptions/:id/cancel`
- **Then** 200,`cancelAtPeriodEnd=true`、`status` 仍 `ACTIVE`

### 2. 重複取消冪等
- **When** 再次 cancel
- **Then** 200,狀態不變(`cancelAtPeriodEnd` 仍 true、仍 ACTIVE)

### 3. 到期由 billing-cron 轉 CANCELED(跨 12)
- **Given** 已標記期末取消、`nextBillingDate <= now`
- **When** `runBillingCycle(now)`
- **Then** `status=CANCELED`,且**不**建週期單、不續扣

### 4. 授權邊界
- 非本人 cancel → 403
- 未登入 → 401

## 注意
- 第 3 項與 12 的測試重疊但視角不同:此處從「使用者取消動線」端到端驗收。
