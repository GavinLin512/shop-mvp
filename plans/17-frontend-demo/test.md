# 17-frontend-demo — 測試

風格:前端用 **Vitest(root 已有)+ @testing-library/react + jsdom**,fetch 全程 mock,
不打真後端(demo 前端測試聚焦 UI 邏輯,非後端整合)。E2E(Playwright)列範圍外以控依賴。

測試環境:`web/vitest.config.ts` 用 `environment: 'jsdom'`;新增
`@testing-library/react`、`@testing-library/jest-dom`、`jsdom`(devDeps,遵守冷卻期)。

## 任務 Checklist

- [x] 1. `formatCurrency` 依幣別 exponent 正確
- [x] 2. `StatusBadge` 狀態 → 顏色對應正確
- [x] 3. 登入成功存 token,依 role 切視圖(USER→前台 / ADMIN→後台)
- [x] 4. 訂閱後輪詢:INCOMPLETE → ACTIVE 會自動更新 Badge
- [x] 5. 取消後維持 ACTIVE + 顯示「期末取消」(不變 CANCELED)
- [x] 6. 未登入打受保護動作不送出(導回登入)
- [x] 7. 後台建立 Plan:表單送出呼叫 `POST /plans`
- [x] 8. 後台篩選方案:掛載呼叫 `GET /plans` 列出方案;輸入關鍵字即時過濾

## 行為清單(RED → GREEN,逐一)

### 1. formatCurrency
- **When** `formatCurrency(999,'USD')` / `formatCurrency(980,'JPY')`
- **Then** 回 `$9.99` / `¥980`(JPY 無小數)
- 守住 DECISION #4 多幣別顯示。

### 2. StatusBadge 顏色對應
- **When** 餵 `INCOMPLETE` / `ACTIVE` / `CANCELED`
- **Then** 套對應 status token class(pending / active / failed)
- 對照 DESIGN.md 元件規範。

### 3. 登入 + 依 role 切視圖
- **Given** mock `POST /api/auth/login` 回 `{ token }`(token payload 含 `role`)
- **When** 用 `role:'USER'` 的 token 登入 → 顯示前台(PlanGrid)
- **And** 用 `role:'ADMIN'` 的 token 登入 → 顯示後台(CreatePlanForm)
- **Then** token 進 context + sessionStorage;role 由 `auth/jwt.ts` base64 解出(不驗簽)。

### 4. 訂閱輪詢轉 ACTIVE(demo 核心)
- **Given** mock `POST /api/subscriptions` 回 `INCOMPLETE`;
  `GET /api/subscriptions/:id` 第一次回 `INCOMPLETE`、之後回 `ACTIVE`
- **When** 點 plan 訂閱、輪詢觸發
- **Then** Badge 先 `INCOMPLETE`(pending 色)→ 自動更新為 `ACTIVE`(active 色)
- 證明「看得到非同步狀態變化」。用 fake timer 推進輪詢,避免 flaky。

### 5. 期末取消 UX(防 DESIGN 表格誤導)
- **Given** 訂閱為 ACTIVE;mock `POST /api/subscriptions/:id/cancel`
  回 `{ status:'ACTIVE', cancelAtPeriodEnd:true }`
- **When** 點取消
- **Then** Badge **仍是 ACTIVE**(綠),且出現「期末取消 / cancels at period end」標記
- **And** 不出現 CANCELED 紅
- 守住 spec 的衝突決議(以後端期末取消為準)。

### 6. 未登入保護
- **Given** 無 token
- **When** 嘗試訂閱
- **Then** 不發 `POST /subscriptions`,導回登入表單。

### 7. 後台建立 Plan
- **Given** ADMIN 登入;mock `POST /api/plans` 回 201 + 新 plan
- **When** 填 name/amount/currency/intervalDays 送出
- **Then** 以 Bearer 呼叫 `POST /api/plans`,送出 body 欄位正確,成功後顯示新方案。

### 8. 後台篩選方案
- **Given** ADMIN 登入;mock `GET /api/plans` 回方案清單
- **When** 元件掛載、並在篩選框輸入關鍵字
- **Then** 先列出全部方案(以 Bearer 呼叫 `GET /plans`),輸入關鍵字後只顯示名稱符合的方案。

## 注意
- 全程 mock `fetch`(或 `api/client` 模組),不依賴真後端、零網路進 CI。
- 輪詢測試用 `vi.useFakeTimers()` 控制 interval,斷言狀態翻轉。
- 不測 mock-gateway / webhook(範圍外)。
