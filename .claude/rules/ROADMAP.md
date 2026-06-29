# ROADMAP — plans 完成狀態

紀錄 `plans/` 各任務的實作進度。**實作前先讀此表確認當前進度;任務完成(`spec.md` + `test.md` 全綠)後,將該列 checkbox 打勾。**

狀態欄:`- [ ]` 未完成 / `- [x]` 已完成(`spec` 實作 + `test.md` checklist 全綠)。

## 進度表

| 狀態 | 順序 | 任務 | 依賴 | 對應決策 |
|------|------|------|------|----------|
| - [x] | 00 | `00-foundation` 骨架 + Prisma schema + migrate | — | 地基 |
| - [x] | 01 | `01-auth-register` POST /auth/register | 00 | — |
| - [x] | 02 | `02-auth-login` POST /auth/login → JWT | 01 | — |
| - [x] | 03 | `03-rbac` requireAuth / requireRole | 02 | #6 |
| - [x] | 04 | `05-money` 最小單位整數 + ISO4217 格式化 | — | #4 |
| - [x] | 05 | `04-plans` GET/POST /plans | 03, 05-money | #6 |
| - [x] | 06 | `06-idempotency` 決定性冪等鍵 + UNIQUE | — | #1 |
| - [ ] | 07 | `08-payment-adapter` PaymentProvider 介面 + Mock | 09 | — |
| - [ ] | 08 | `09-mock-gateway` /mock-gateway/* + HMAC + webhook 回打 | — | — |
| - [ ] | 09 | `07-subscription` POST /subscriptions → INCOMPLETE | 04-plans, 06, 08 | #8 |
| - [ ] | 10 | `10-webhook` /webhooks/payment 驗簽→冪等→更新 ★核心 | 07, 09 | #2, #8 |
| - [ ] | 11 | `12-billing-cron` nextBillingDate <= now 逐筆 tx | 06, 07, 08 | #7 |
| - [ ] | 12 | `11-dunning` 失敗重試 + retryCount + 3 次轉 CANCELED | 10, 12-billing | #5 |
| - [ ] | 13 | `13-reconciliation` 對帳 cron + 查詢 API [SHOULD] | 09, 10 | #3 |
| - [ ] | 14 | `14-cancel` 期末取消 + 冪等 [SHOULD] | 07, 12-billing | #9 |

> 任務編號(00–14)沿用 `plans/` 資料夾名稱;「順序」欄為依賴拓樸後的建議實作順序。
