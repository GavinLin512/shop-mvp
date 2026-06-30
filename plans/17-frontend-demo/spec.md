# 17-frontend-demo — Vite + React demo 前端(前台/後台兩區)

## 目標
做一個功能性 demo 前端,**依登入者 `role` 分前台(USER)/後台(ADMIN)兩區**:
- **前台(會員)**:登入 → Plans 列表 → 訂閱(INCOMPLETE)→ 輪詢轉 ACTIVE → 期末取消。
- **後台(管理員)**:登入 → 建立 Plan(`POST /plans`)→ 列出/依名稱篩選已建立方案(`GET /plans`)。

重點是「**看得到非同步狀態變化**」(INCOMPLETE 橘 → 輪詢 → ACTIVE 綠)與「**RBAC 分流**」
(role≠tier,401/403,DECISION #6),套用 `DESIGN.md` 深色工業風。

## 決策(本任務定調)
- **前端 = Vite + React + TS**,獨立 `web/` 子專案(不污染後端 `src/`)。
- 視覺**完全依 `DESIGN.md`** 的色彩/字體/元件 tokens。
- **依 role 切視圖**:登入後解析 JWT payload 的 `role`(`{ sub, role }`,base64 解碼即可,
  **不在前端驗簽**,授權仍由後端把關)→ `USER` 進前台、`ADMIN` 進後台。
  後台動作仍帶 Bearer,真正權限由後端 `requireRole('ADMIN')` 決定(前端切換只是 UX)。

## ⚠️ 與既有文件的衝突(必須照實作、不照 DESIGN 表格)
`DESIGN.md` 五、表格寫「取消 → 狀態轉 CANCELED 紅」,但後端 `subscriptionService.cancel`
是**期末取消(DECISION #9)**:只設 `cancelAtPeriodEnd=true`,**status 維持 ACTIVE**,
實際轉 CANCELED 由 `billing-cron` 在 `nextBillingDate` 到期才做。
→ **前端 UX 以後端為準**:取消後 Badge 仍顯示 `ACTIVE`(綠),另加一個
「將於期末取消 / cancels at period end」標記;**不可**取消後立刻畫成 CANCELED 紅。

## 關鍵動線事實(影響實作)
- `POST /subscriptions` **內部已自動觸發扣款**(service 直接呼叫 `provider.charge`)→
  mock gateway 非同步回打 webhook → 訂閱轉 ACTIVE。
  **前端不呼叫 `/payments/charge`**,訂閱後直接**輪詢 `GET /subscriptions/:id`**。
- 成敗由金額控制:`amount % 100 === 1` → FAILED(走 dunning),其餘 → SUCCESS。
  可選:seed 一個「會失敗」的 plan(如 amount 末兩碼 01)展示 dunning。
- 認證:`POST /auth/login` 回 `{ token }`;`register` 回 member 不含 token。
  動線以 **login 取 JWT** 為主,token 存記憶體 + sessionStorage。

## 範圍內

### 1. 子專案結構(`web/`)
```
web/
  index.html
  vite.config.ts        # dev proxy /api → http://localhost:3000
  src/
    main.tsx, App.tsx
    api/client.ts        # fetch wrapper,自動掛 Bearer token
    auth/AuthContext.tsx # token + role 狀態(useContext,輕量,不引入 Redux)
    auth/jwt.ts          # 解析 JWT payload 取 role(base64,不驗簽)
    components/
      Header.tsx         # logo + 幣別顯示 + Sign In/out + 角色標示
      LoginForm.tsx
      StatusBadge.tsx
      money/*            # 共用顯示元件
    views/
      MemberView.tsx     # 前台:PlanGrid + SubscriptionPanel
      AdminView.tsx      # 後台:CreatePlanForm + PlanLookup
    components/member/
      PlanCard.tsx / PlanGrid.tsx
      SubscriptionPanel.tsx  # 狀態 Badge + 輪詢 + 取消鈕
    components/admin/
      CreatePlanForm.tsx     # name/amount/currency/intervalDays → POST /plans
      PlanLookup.tsx         # 名稱篩選輸入框 + PlanList(GET /plans,client 端依名稱過濾)
    lib/money.ts         # formatCurrency(amount, currency) 依 ISO4217 exponent
    styles/tokens.css    # 直接複製 DESIGN.md 色彩/字體 tokens
```

### 2. 串接後端(僅對外端點,對齊任務 16 範圍)
| 區 | 動作 | 端點 |
|----|------|------|
| 共用 | 登入取 token | `POST /auth/login` |
| 前台 | 列 plans | `GET /plans` |
| 前台 | 建訂閱 | `POST /subscriptions`(帶 Bearer) |
| 前台 | 輪詢狀態 | `GET /subscriptions/:id`(帶 Bearer) |
| 前台 | 期末取消 | `POST /subscriptions/:id/cancel`(帶 Bearer) |
| 後台 | 建立 Plan | `POST /plans`(帶 Bearer + ADMIN) |
| 後台 | 列/篩選方案 | `GET /plans`(帶 Bearer;client 端依名稱過濾) |

> 後台對外端點僅 `POST /plans` 與 `GET /plans`(列會員/查他人訂閱/退款等為 TALK-ONLY,範圍外)。
> 後台價值在展示 RBAC #6:USER 打 `POST /plans` 應得 **403**,可在後台順手 demo。

### 3. 跨來源處理
- **Dev**:Vite proxy `/api/*` → `http://localhost:3000`,**避免動後端 CORS**(零後端新依賴)。
  前端 API base 統一用 `/api`。
- **Prod(SHOULD,有時間才做)**:`pnpm --filter web build` → `web/dist`;
  後端可選 `express.static('web/dist')` + SPA fallback 提供。預設 demo 用 dev 雙跑即可。

### 4. 狀態 Badge 顏色(對應 DESIGN tokens)
`INCOMPLETE`/`PENDING` → `--status-pending`;`ACTIVE` → `--status-active`;
`PAST_DUE` → `--status-warn`;`FAILED`/`CANCELED` → `--status-failed`。
取消後:`ACTIVE` 綠 + 「期末取消」小標記(見上方衝突說明)。

### 5. 金額顯示
`formatCurrency(amount, currency)` 用 `Intl.NumberFormat` 依 ISO 4217 minor unit:
`amount=999, USD → $9.99`;`amount=980, JPY → ¥980`(JPY exponent 0)。

## 依賴與供應鏈(SECURITY.md)
- 新增(於 `web/`):`vite`、`react`、`react-dom`、`@vitejs/plugin-react`、`@types/react*`。
- 遵守 `minimumReleaseAge: 1440`(只裝發布滿 1 天版本);CI `--frozen-lockfile`。
- `web` 納入 `pnpm-workspace.yaml` workspace。
- **build script 白名單**:Vite 依賴 `esbuild`(已在 `allowBuilds`);若 `pnpm install`
  出現新的 `ERR_PNPM_IGNORED_BUILDS`,**逐一審核**,不確定者維持封鎖並先問。

## 公開介面
- `web/` 子專案:`pnpm --filter web dev`(Vite dev server)。
- 後端維持不變(本任務不改 `src/`,prod 靜態服務為 SHOULD 才動 `app.ts`)。

## 範圍外
- 不做 mock-gateway / webhook 的前端(機器對機器)。
- 不做註冊以外的會員管理、不做付款卡片頁(那是 15-stripe)。
- 後台**不做**列所有會員/所有訂閱、改狀態、退款(後端無對應端點,TALK-ONLY)。
- 不做路由庫(react-router)/狀態庫(Redux);依 role 條件渲染兩個 View 即可。
- proration / 立即取消 / 匯率換算(TALK-ONLY)。

## 完成準則
**共用**
- `pnpm --filter web dev` 起得來,能登入。
- 登入後依 `role` 進對應區:`USER` → 前台、`ADMIN` → 後台。

**前台(USER)**
- 列出 plans;點訂閱 → Badge 先 `INCOMPLETE`(橘)→ 輪詢數秒後自動翻 `ACTIVE`(綠)。
- 取消 → Badge 維持 `ACTIVE` + 顯示「期末取消」標記(不變 CANCELED)。
- 金額依幣別正確格式化(USD 兩位、JPY 零位)。

**後台(ADMIN)**
- 建立 Plan 表單送出 → `POST /plans` 成功(201),新方案可在前台 `GET /plans` 看到。
- 列出已建立方案;輸入關鍵字 → 即時篩選名稱符合的方案。

**視覺**
- 套用 DESIGN.md tokens(深色 + 橘金 + display 大寫標題)。

## 依賴
16-swagger 非必要;後端 01/02-auth、04-plans、07-subscription、10-webhook、14-cancel(皆已完成)。
```
