# 10-webhook — 接收回調(驗簽 → 冪等 → 更新)★核心

## 目標
固定處理順序:`express.raw()` 取 raw body → HMAC-SHA256 驗簽 → providerTxnId 冪等 → 同一 tx 更新三表(#2、#8)。

## 公開介面
- `POST /webhooks/payment`(以 `express.raw()` 掛載,拿得到原始 bytes)
  - 簽章錯 → **401**
  - `providerTxnId` 已處理 → **200**(冪等命中,不重複更新)
  - 否則更新後 → 200

## 規則(順序不可調換)
1. **驗簽**:`X-Signature` 對 raw body 重算 HMAC,比對失敗回 401。
2. **冪等**:用 `providerTxnId`(或對應 Payment)判斷是否已處理;已處理直接 200。
3. **更新(同一 transaction)**:
   - 成功:`Order→PAID`、`Payment→SUCCESS`、`Subscription INCOMPLETE→ACTIVE`。
   - 失敗:`Order→FAILED`、`Payment→FAILED`;若訂閱為 INCOMPLETE → `CANCELED`(#8 首扣失敗)。
   - ACTIVE/PAST_DUE 訂閱的失敗交由 dunning(11)處理,不在此直接砍。

## 範圍外
dunning 重試決策細節(→ 11)、對帳補單(→ 13)。

## 完成準則
驗簽/冪等/更新順序固定;重送不重複扣;三表同 tx,中途失敗全 rollback。

## 依賴
07-subscription、09-mock-gateway。
