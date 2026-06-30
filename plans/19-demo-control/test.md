# 19-demo-control — 測試

後端用 **Vitest 整合測試**(打真路由 + 測試 DB,沿用 `src/__tests__` 慣例);
前端用 **Vitest + @testing-library/react + jsdom**,fetch 全程 mock。
demo 端點測試需設 `DEMO_MODE=true`(關閉路徑另測 404)。

## 任務 Checklist

- [ ] 1. `GET /config` 回 `{ demoMode, provider }`,不含任何密鑰欄位
- [ ] 2. `DEMO_MODE` 關閉時,任一 demo 端點回 **404**(連存在都不洩漏)
- [ ] 3. demo 端點開啟但非 ADMIN → 403;未登入 → 401
- [ ] 4. `POST /demo/reset` 清空訂閱類資料 + 非種子 Member/Plan,**保留種子列**
- [ ] 5. `POST /demo/reset` 清空種子會員的 `providerCustomerId`
- [ ] 6. `POST /demo/subscriptions/:id/expire` 後 `nextBillingDate <= now`
- [ ] 7. `POST /demo/run-billing` 對「已到期 ACTIVE」訂閱建週期單(回 `processed>=1`)
- [ ] 8. force-fail ON → 扣款走 FAILED;dunning 累加,連 3 次 → CANCELED
- [ ] 9. force-fail 中途 OFF → 重試成功 → 回 ACTIVE(#5 恢復路徑)
- [ ] 10. 重送 webhook:第一次 `duplicate:false`,重送 `duplicate:true` 且不重複扣款
- [ ] 11. `provider!=='mock'` 時 force-fail / replay 端點回 409
- [ ] 12. 前端:`demoMode=false` 時不渲染 DEMO CONTROL 區塊
- [ ] 13. 前端:`provider==='stripe'` 時隱藏 force-fail / replay 鈕
- [ ] 14. 前端:Reset 需輸入 `RESET` 才能按;每列 MAKE DUE 呼叫 expire 後 refetch

## 行為清單(RED → GREEN,逐一)

### Gating(2、3)
- **When** `DEMO_MODE` 未設,打 `POST /demo/reset` → **404**(非 403,不洩漏存在)。
- **When** `DEMO_MODE=true` 但帶一般 USER token → 403;不帶 token → 401。

### Reset(4、5)
- **Given** 種子 baseline + demo 中經 API 註冊的會員 X + ADMIN 新建的 Plan Z + 若干訂閱/單。
- **When** ADMIN 打 `POST /demo/reset`。
- **Then** Subscription/Order/Payment 全空;會員 X、Plan Z 被刪;**種子會員/方案仍在**;
  種子會員 `providerCustomerId === null`;ADMIN 自己的 token 仍有效(列未被重建)。

### 讓訂閱到期 + 立即跑 billing(6、7)
- **Given** 一筆 ACTIVE 訂閱,`nextBillingDate` 在未來。
- **When** `POST /demo/subscriptions/:id/expire` → `nextBillingDate <= now`。
- **When** `POST /demo/run-billing` → 回 `{ processed >= 1 }`,該訂閱產生新週期 Order。

### dunning 兩條路徑(8、9)— force-fail 全域開關
- **Given** 一筆 ACTIVE 訂閱(經正常 webhook 啟用)。
- **When** force-fail ON → expire → run-billing,重複三輪。
- **Then** retryCount 累加,PAST_DUE → … → **第 3 次 CANCELED**。
- **變體(恢復)**:跑到 PAST_DUE 後 force-fail **OFF**,再 expire + run-billing → 該次成功 → **回 ACTIVE**,retryCount 歸零。

### webhook 冪等可觀測(10)
- **Given** 一筆訂閱首扣成功(webhook 已處理,Payment=SUCCESS)。
- **When** `POST /demo/mock/replay-webhook`。
- **Then** 回應 `duplicate: true`;Payment 筆數不變、Order 仍 PAID、Subscription 未被重複啟用。
- **對照**:首次處理該 webhook 時回應 `duplicate: false`。

### provider 守門(11)
- **Given** `PAYMENT_PROVIDER=stripe`。
- **When** 打 `POST /demo/mock/force-fail` 或 `/demo/mock/replay-webhook` → **409**。

### 前端(12、13、14)
- **Given** mock `GET /api/config`。
- `{ demoMode:false }` → AdminView **無** DEMO CONTROL 區塊。
- `{ demoMode:true, provider:'stripe' }` → 區塊在,但**無** force-fail / replay 鈕。
- `{ demoMode:true, provider:'mock' }` → Reset 鈕在輸入框打 `RESET` 前 disabled;
  清單每列 MAKE DUE 點擊 → 呼叫 `POST /api/demo/subscriptions/:id/expire` → 成功後 refetch 清單。
