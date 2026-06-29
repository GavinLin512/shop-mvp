# 06-idempotency — 決定性冪等鍵 + UNIQUE

## 目標
冪等靠 DB unique 保證,不靠應用層「先查再寫」,避開 race(#1)。

## 公開介面
- `buildOrderKey(subscriptionId, cycle): string`(純函式)
  - 首單:`sub_<id>:cycle0`
  - 週期:`sub_<id>:<YYYY-MM-DD>`(計費週期識別)
  - 重試:`sub_<id>:<cycle>:retry<N>`(失敗不重用,建新單)
- `orderRepo.createIdempotent({memberId, subscriptionId, amount, currency, idempotencyKey})`
  - 直接 insert;遇 UNIQUE 衝突(`P2002`)→ 回既有 Order(視為已處理),**不新增**。

## 規則
- key 由伺服器端決定且**決定性**,非隨機。
- `Order.idempotencyKey` 的唯一性由 DB UNIQUE 保證(00 已建 constraint)。
- 上層拿到「既有 Order」時等同冪等命中,回 200 / 既有結果。

## 範圍外
webhook 端的 `providerTxnId` 冪等(→ 10)。

## 完成準則
相同輸入產生相同 key;重複 key 插入 DB 只留一筆且回既有單;重試 key 與原 key 不同。

## 依賴
00-foundation(UNIQUE constraint)。
