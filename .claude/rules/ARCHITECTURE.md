# 專案架構

## 分層

```
route → controller → service → repository
```

- 業務邏輯全部集中在 **service**。
- 金流走 `PaymentProvider` 介面(Ecpay / Stripe / Mock 各自實作),service 只依賴介面 → 換金流商只實作新 Provider,service 不動。

## 資料流

```
會員訂閱
   │  POST /subscriptions
   ▼
建立 Subscription(INCOMPLETE)+ 首筆 Order(PENDING)
   │  走 PaymentProvider adapter
   ▼
POST /mock-gateway/charge ──(非同步)────┐
   │                                   │
   │                            HMAC 簽章回打
   ▼                                   ▼
回 API:INCOMPLETE              POST /webhooks/payment
                                       │ 驗簽 → 冪等 → 更新
                                       ▼
                        Order=PAID / Payment=SUCCESS
                        Subscription=ACTIVE(三表同 tx)

[排程]
  續扣 cron:nextBillingDate <= now → 逐筆 tx 建單扣款
  對帳 cron:掃 PENDING Payment → 查 gateway 補狀態
```
