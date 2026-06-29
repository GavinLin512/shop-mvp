# 實作計畫 — 最小單位(TDD vertical slices)

由 `final-plan.md` 拆解。每個資料夾是一個**最小垂直切片**(tracer bullet):先寫一個整合測試(RED)→ 寫最小程式碼通過(GREEN)→ 下一個。**不要橫向一次寫完所有測試。**

## 建置順序與依賴

```
00-foundation        骨架 + Prisma schema + migrate + DB           (地基)
 ├─ 01-auth-register   POST /auth/register
 ├─ 02-auth-login      POST /auth/login → JWT          (依 01)
 ├─ 03-rbac            requireAuth / requireRole       (依 02)
 ├─ 05-money           最小單位整數 + ISO4217 格式化     (純單元)
 ├─ 04-plans           GET/POST /plans                 (依 03,05)
 ├─ 06-idempotency     決定性冪等鍵 + UNIQUE            (純單元 + DB)
 ├─ 08-payment-adapter PaymentProvider 介面 + Mock      (依 09)
 ├─ 09-mock-gateway    /mock-gateway/* + HMAC + webhook 回打
 ├─ 07-subscription    POST /subscriptions → INCOMPLETE (依 04,06,08)
 ├─ 10-webhook         /webhooks/payment 驗簽→冪等→更新  (依 07,09)★核心
 ├─ 12-billing-cron    nextBillingDate <= now 逐筆 tx   (依 06,07,08)
 ├─ 11-dunning         失敗重試 + retryCount + 3 次轉    (依 10,12)
 ├─ 13-reconciliation  對帳 cron + 查詢 API   [SHOULD]  (依 09,10)
 └─ 14-cancel          期末取消 + 冪等        [SHOULD]  (依 07,12)
```

## 對應 final-plan 決策(#)

| 單元 | 決策 |
|------|------|
| 06-idempotency | #1 決定性冪等鍵 + UNIQUE |
| 10-webhook | #2 HMAC + raw body、#8 INCOMPLETE→ACTIVE 三表同 tx |
| 13-reconciliation | #3 對帳雙保險 |
| 05-money | #4 整數最小單位 + currency |
| 11-dunning | #5 dunning 重試 |
| 03-rbac / 04-plans | #6 role≠tier、401 vs 403 |
| 12-billing-cron | #7 `<= now` + 逐筆 tx |
| 07-subscription | #8 INCOMPLETE 起手 |
| 14-cancel | #9 期末取消 + 冪等 |

TALK-ONLY(#10 SKIP LOCKED、指數退避、退款、匯率)不寫測試,只在 README 口頭。

## 測試基建約定

- 整合測試:`supertest` 打 `createApp()`,真 Neon **測試分支**;每個測試 `beforeEach` truncate 全表。
- 單元測試:`05-money`、`06-idempotency`(key 生成)、HMAC 驗簽純函式。
- 非同步 webhook:mock-gateway 提供「立即觸發 callback」測試鉤子,避免 flaky。
