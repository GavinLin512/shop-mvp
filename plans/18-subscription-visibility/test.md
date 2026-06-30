# 18-subscription-visibility — 測試

後端用 **Vitest 整合測試**(打真路由 + 測試 DB,沿用既有 `src/__tests__` 慣例);
前端用 **Vitest + @testing-library/react + jsdom**,fetch 全程 mock。

## 任務 Checklist

- [ ] 1. `GET /subscriptions` 只回本人的 Subscription(他人資料不外洩)
- [ ] 2. `GET /subscriptions` 依 `startedAt` 新→舊排序,item 帶 `planName`
- [ ] 3. `GET /subscriptions` 未帶 token → 401
- [ ] 4. `GET /admin/subscriptions` ADMIN 回全部,item 帶 `memberEmail` / `amount`
- [ ] 5. `GET /admin/subscriptions` 一般 USER → 403
- [ ] 6. Admin 對他人訂閱 `POST /subscriptions/:id/cancel` → 設 `cancelAtPeriodEnd=true`、status 仍 ACTIVE
- [ ] 7. 前台 `SubscriptionHistory` 列出本人全部訂閱(plan / status / started / cancelAtPeriodEnd)
- [ ] 8. 前台 `MemberView` 改由 `GET /subscriptions` 取數,不再讀 localStorage
- [ ] 9. 後台 `AdminSubscriptionList` 列出全部,取消鈕只在可取消列出現,點擊呼叫 cancel 後 refetch

## 行為清單(RED → GREEN,逐一)

### 1. 本人隔離(核心)
- **Given** member A、member B 各有訂閱
- **When** 以 A 的 token 打 `GET /subscriptions`
- **Then** 只回 A 的訂閱;清單不含任何 `memberId === B` 的列。

### 2. 排序 + planName
- **Given** A 先後訂閱 plan X、plan Y(Y 較新)
- **When** `GET /subscriptions`
- **Then** index 0 為 Y;每個 item 有對應 `planName`(來自 Plan join)。

### 3. 未認證
- **When** 不帶 Bearer 打 `GET /subscriptions`
- **Then** 401(對齊 DECISION #6 authn)。

### 4. Admin 全部清單
- **Given** 多位 member 有訂閱
- **When** ADMIN token 打 `GET /admin/subscriptions`
- **Then** 回全部;item 含 `memberEmail`、`amount`、`planName`,依 `startedAt` 新→舊。

### 5. Admin 端點 RBAC
- **When** 一般 USER token 打 `GET /admin/subscriptions`
- **Then** 403(已登入、無權限,DECISION #6)。

### 6. Admin 期末取消他人訂閱(沿用既有冪等)
- **Given** member C 有 ACTIVE 訂閱
- **When** ADMIN 打 `POST /subscriptions/{C 的 sub}/cancel`
- **Then** `cancelAtPeriodEnd=true`、status 仍 `ACTIVE`;再打一次回 200 同狀態(冪等,DECISION #9)。

### 7. 前台 SubscriptionHistory
- **Given** mock `GET /api/subscriptions` 回兩筆(一筆 ACTIVE、一筆 CANCELED)
- **When** 渲染 `MemberView`
- **Then** HISTORY 區出現兩列,顯示 plan 名、`StatusBadge`、started at、cancel-at-period-end 標記。

### 8. 前台改用後端、移除 localStorage
- **Given** `localStorage` 預先塞入舊的 `shop_mvp_subscription`
- **When** 以新使用者渲染 `MemberView`,mock `GET /api/subscriptions` 回空
- **Then** 不顯示舊訂閱(不讀 localStorage);畫面依後端清單為準。

### 9. 後台清單 + 取消鈕
- **Given** mock `GET /api/admin/subscriptions` 回三筆
  (ACTIVE 未取消 / ACTIVE 已 cancelAtPeriodEnd / CANCELED)
- **When** 渲染後台訂閱頁
- **Then** 三列都出現;**取消鈕只在第一列(ACTIVE 且未取消)出現**。
- **When** 點第一列取消鈕
- **Then** 呼叫 `POST /api/subscriptions/:id/cancel`,成功後 refetch `GET /api/admin/subscriptions`。
