# 14-cancel — 測試(SHOULD)

風格:整合。

## 任務 Checklist

- [x] 1. 取消設期末旗標、狀態仍 ACTIVE [tracer bullet]
- [x] 2. 重複取消冪等
- [x] 3. 到期由 billing-cron 轉 CANCELED(跨 12)
- [x] 4. 授權邊界
- [x] 5. 期末取消後、轉 CANCELED 前再訂 → 409;轉 CANCELED 後可再訂(跨 07,防重疊重複扣款)

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

### 5. 期末取消後不可立即再訂(跨 07,防重疊重複扣款)
- **Given** 一個 ACTIVE 訂閱已 `cancelAtPeriodEnd=true`(付費週期未結束)
- **When** 同一會員 `POST /subscriptions`
- **Then** 409,不建第二張(避免與舊期重疊雙重扣款)
- **When** `runBillingCycle(now)` 於期末把舊訂閱轉 `CANCELED` 後,再 `POST /subscriptions`
- **Then** 201,新訂閱 `startedAt = now`,自然接在舊期之後(時間軸連續)

## 注意
- 第 3 項與 12 的測試重疊但視角不同:此處從「使用者取消動線」端到端驗收。
- 第 5 項守衛實作在 07-subscription 的 `create`,測試落在 `tests/subscription.test.ts`(`07-subscription 6. 防重疊`);此處從「取消後再訂」動線交叉引用,避免重複測試同一守衛。
