# 18-subscription-visibility — 訂閱可見性(本人隔離 + 歷史 + 後台清單/取消)

## 目標
讓訂閱資料「只看得到自己的」,並補上會員歷史與管理員總覽:

1. **本人隔離**:會員只看到自己的 Subscription(`GET /subscriptions` 依 `req.member.id` 過濾)。
2. **會員訂閱歷史**:前台「YOUR SUBSCRIPTION」下方新增「SUBSCRIPTION HISTORY」,
   列出本人**所有** Subscription(plan 名、status、started at、cancel at period end)。
3. **後台訂閱清單**:管理員新增一頁,看**全部** Subscription,每列有「取消」鈕主動取消某客戶訂閱。

> 三項同屬「訂閱可見性」一個主題,共用同一個 list 地基,故併為單一任務。

## 決策(grilling 定調)

- **任務 1 範圍 = Subscription,不是 Plan**:Plan 目錄維持公開(所有人看到同一份);
  要隔離的是「訂閱關係」。對應修補的真實漏洞:前台用 `localStorage` 存目前訂閱,
  **同瀏覽器跨使用者共用** → 換帳號會看到上一個人的訂閱。
- **現況 vs 歷史切分**:`YOUR SUBSCRIPTION` 顯示**最新一筆**(依 `startedAt` 最新,
  任一狀態皆可);`SUBSCRIPTION HISTORY` 顯示**全部**(含當前那筆)。
- **兩個端點,不共用**:
  - `GET /subscriptions` → `requireAuth`,只回本人。
  - `GET /admin/subscriptions` → `requireAuth + requireRole('ADMIN')`,回全部 + member/plan 資訊。
- **Admin 取消 = 期末取消,沿用現有**:複用 `POST /subscriptions/:id/cancel`
  (service `cancel()` 已允許 ADMIN,設 `cancelAtPeriodEnd=true`,status 維持 ACTIVE,
  由 `billing-cron` 到期才轉 CANCELED)。**不新增「立即取消」**(仍屬 DECISION TALK-ONLY)。
- **排序**:兩份清單皆 `startedAt` 新→舊,**不分頁、不篩選**(demo 規模)。
- **前台資料來源**:改由後端清單為**唯一來源**,**移除 `localStorage`**(`SUB_KEY` / `PLAN_KEY`)。
- **命名**:統一用 `Member` / `memberId`(對齊 `CONTEXT.md` 詞彙表與 DB);
  **修掉**前端 `types.ts` 既有的 `Subscription.userId` → `memberId`。

## ⚠️ 與既有文件的關係(無衝突)
- 沿用 DECISION #6(authn/authz、401/403)、#9(期末取消冪等)。**不新增 ADR**:
  無新領域名詞、無新狀態轉換、authz 擴張在 `cancel()` 既有 `requesterRole==='ADMIN'` 內。

## 範圍內

### A. 後端

**A1. `GET /subscriptions`(本人清單)**
- `requireAuth`。`service.listByMember(memberId)`:
  `where: { memberId }`,`orderBy: { startedAt: 'desc' }`,join Plan 取名稱。
- 回傳 item DTO:
  ```ts
  { id, status, cancelAtPeriodEnd, planId, planName, startedAt, nextBillingDate }
  ```

**A2. `GET /admin/subscriptions`(全部清單)**
- `requireAuth, requireRole('ADMIN')`。`service.listAll()`:
  `orderBy: { startedAt: 'desc' }`,join Member 取 email、join Plan 取 name/amount/currency。
- 回傳 item DTO:
  ```ts
  { id, memberId, memberEmail, planName, amount, currency,
    status, cancelAtPeriodEnd, startedAt, nextBillingDate }
  ```

**A3. 路由**:兩個 GET 都加進 `createSubscriptionRouter`(讀取不需 provider)。
`admin/subscriptions` 走 `requireRole('ADMIN')`。

**A4. service**:`subscriptionService` 新增 `listByMember` / `listAll`,沿用直接用 `prisma`
(與既有 `findById` / `cancel` 一致,不另立 repo)。重要 join 邏輯加註解。

### B. 前端(`web/`)

**B1. api**:新增 `listSubscriptions()`→`GET /subscriptions`、
`listAllSubscriptions()`→`GET /admin/subscriptions`。

**B2. `MemberView`**:
- 掛載時 `listSubscriptions()`;依 `startedAt` 已排序,取 index 0 為「目前訂閱」驅動
  `SubscriptionPanel`(輪詢/取消不變),全部驅動新 `SubscriptionHistory`。
- 訂閱成功後 refetch 清單(維持 current + history 一致)。
- **移除** `localStorage` 的 `SUB_KEY`/`PLAN_KEY`;`planName` 改由 DTO 帶。

**B3. `SubscriptionHistory`(新元件,前台)**:
- 標題 `SUBSCRIPTION HISTORY`,表格欄:Plan、Status(`StatusBadge`)、Started at、Cancel at period end。
- 空清單顯示 placeholder。

**B4. `AdminSubscriptionList`(新元件,後台)+ `AdminView` 新區塊 `SUBSCRIPTIONS`**:
- 掛載 `listAllSubscriptions()`,表格欄:Member email、Plan、Amount(`formatCurrency`)、
  Status、Cancel at period end、Started at、Next billing、操作。
- 操作:**取消鈕僅在 `status==='ACTIVE' && !cancelAtPeriodEnd` 顯示**;
  點擊 → `POST /subscriptions/:id/cancel` → 成功後 refetch 清單。
- 排序新→舊(後端已排,前端不重排)。

**B5. `types.ts`**:`Subscription.userId` → `memberId`;新增 `MemberSubscription`、
`AdminSubscription` DTO 型別。

## 範圍外
- 分頁、status 篩選、搜尋。
- 立即取消、退款、proration(仍 TALK-ONLY)。
- 後端 repo 層重構(維持 service 直接用 prisma 的既有風格)。
