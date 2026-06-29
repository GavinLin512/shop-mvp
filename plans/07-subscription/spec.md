# 07-subscription — 建立訂閱(INCOMPLETE 起手)

## 目標
訂閱當下扣款尚無結果,API 回 INCOMPLETE;沒付錢不該 ACTIVE(#8)。建立 Subscription + 首筆 Order 於同一 transaction,再觸發扣款。

## 公開介面
- `POST /subscriptions`(需登入)body `{planId}` → 201
  - 回 `{id, status:"INCOMPLETE", ...}`
- `GET /subscriptions/:id`(本人或 admin)→ 回訂閱狀態
- `subscriptionService.create({memberId, planId})`

## 規則
- 在同一 tx 建:
  - `Subscription`:`status=INCOMPLETE`、`retryCount=0`、`cancelAtPeriodEnd=false`、`nextBillingDate = now + plan.intervalDays`、`startedAt=now`。
  - `Order`:`status=PENDING`、`amount/currency` 取自 plan、`idempotencyKey = buildOrderKey(subId,'cycle0')`(用 06)。
- tx commit 後呼叫 payment adapter `charge`(用 08)觸發扣款;扣款結果由 webhook(10)回來才轉 ACTIVE。
- plan 不存在 / inactive → 400/404。未登入 → 401。
- `GET`:非本人且非 admin → 403/404。

## 範圍外
扣款成功/失敗的狀態轉移(→ 10)、續扣(→ 12)。

## 完成準則
建立後 DB 有 INCOMPLETE 訂閱 + PENDING 首單(正確 key/amount/currency),adapter.charge 被以正確參數呼叫;tx 失敗整體 rollback。

## 依賴
04-plans、06-idempotency、08-payment-adapter。
