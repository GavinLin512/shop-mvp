# 訂閱制電商後端 API

[![Frontend - Cloudflare Pages](https://img.shields.io/badge/Frontend-Cloudflare%20Pages-F38020?logo=cloudflare&logoColor=white)](https://shop-mvp.pages.dev)
[![Backend - Render](https://img.shields.io/badge/Backend-Render-46E3B7?logo=render&logoColor=white)](https://shop-mvp.pages.dev/api/api-docs)
[![Database - Neon](https://img.shields.io/badge/Database-Neon%20Postgres-00E599?logo=neon&logoColor=white)](https://neon.tech)
[![API Docs - Swagger](https://img.shields.io/badge/API%20Docs-Swagger%20UI-85EA2D?logo=swagger&logoColor=black)](https://shop-mvp.pages.dev/api/api-docs)

會員訂閱方案 → 系統定期自動建單 → 串接金流自動扣款 → webhook 回調更新狀態。
一條龍展示「商模邏輯 + 金流整合 + 排程 + 冪等正確性」。

## 線上 Demo

| | 連結 |
|------|------|
| 前端(Cloudflare Pages) | https://shop-mvp.pages.dev |
| 後端 Swagger UI(Render) | https://shop-mvp.pages.dev/api/api-docs |

## 技術棧

- **Express + Prisma + Neon Postgres**(本地與線上 demo 同一套 DB,只切 connection string)
- **Zod** 驗證、**JWT** 認證、**RBAC** 授權
- **node-cron**(續扣 + 對帳排程)
- **swagger-ui-express** API 文件
- Mock 金流服務(獨立 route,HMAC 簽章 + 非同步回打 webhook + 查詢 API)
- **Vite + React** 簡易 demo 前端

### 部署 / DB 決策

- 本地與線上 demo 都直接用 **Neon Postgres**,不維護 SQLite/Postgres 雙軌——避開 enum、`@db.`、`SKIP LOCKED` 行為差異與重複測 migrate 的成本。
- 部署平台 **Render**:不用 SQLite,因 Render 預設檔案系統 ephemeral,deploy/重啟/休眠會清空資料;改用外部 Neon Postgres 即無此問題。

> 專案架構與資料流見 [`.claude/rules/ARCHITECTURE.md`](.claude/rules/ARCHITECTURE.md)。

---

## 資料模型

```
Member        id, email, passwordHash,
              tier(NORMAL/VIP)        商業權益
              role(USER/ADMIN)        系統權限,與 tier 分開
              createdAt

Plan          id, name,
              amount(Int 最小單位), currency(ISO 4217),
              intervalDays, active

Subscription  id, memberId, planId,
              status, retryCount(Int),    dunning 計數
              cancelAtPeriodEnd(Bool),    期末取消
              nextBillingDate, startedAt, canceledAt

Order         id, memberId, subscriptionId?,
              amount(Int), currency,
              status, idempotencyKey(UNIQUE),
              createdAt

Payment       id, orderId,
              amount(Int), currency,
              provider, providerTxnId,
              status, rawPayload,
              createdAt                    對帳掃 PENDING 用
```

---

## 狀態機

```
Subscription: INCOMPLETE ──(webhook 扣款成功)──→ ACTIVE
              INCOMPLETE ──(失敗)──────────────→ CANCELED
              ACTIVE ──(扣款失敗)──→ PAST_DUE ──(重試成功)──→ ACTIVE
              PAST_DUE ──(連續 3 次失敗)────────→ CANCELED
              ACTIVE ──(cancelAtPeriodEnd 且到期)→ CANCELED

Order:        PENDING → PAID / FAILED   (失敗不重用,重試建新 Order)
Payment:      PENDING → SUCCESS / FAILED
```

---

## API

| Method | Path | 說明 |
|--------|------|------|
| POST | `/auth/register` | 註冊 |
| POST | `/auth/login` | 登入 → JWT |
| GET  | `/plans` | 方案列表 |
| POST | `/plans` | 建立方案(admin) |
| POST | `/subscriptions` | 訂閱 → 建首筆 Order + 觸發扣款,回 INCOMPLETE |
| GET  | `/subscriptions/:id` | 查詢訂閱 |
| POST | `/subscriptions/:id/cancel` | 期末取消 |
| POST | `/payments/charge` | 走 adapter 扣款 |
| POST | `/webhooks/payment` | 驗簽 → 冪等 → 更新 |
| POST | `/mock-gateway/charge` | 模擬金流,非同步回打 webhook |
| GET  | `/mock-gateway/charge/:txnId` | 查詢交易(對帳用) |

API 文件:啟動後見 Swagger UI。

---

## 本地開發

### 前置需求

- Node.js 20+
- pnpm 11+
- Neon Postgres(或任何 PostgreSQL)

### 1. 安裝依賴

```bash
pnpm install
```

### 2. 設定環境變數

```bash
cp .env.example .env
```

編輯 `.env`，填入以下欄位：

| 變數 | 說明 |
|------|------|
| `DATABASE_URL` | Neon Postgres connection string |
| `JWT_SECRET` | JWT 簽章密鑰（隨機長字串） |
| `WEBHOOK_SECRET` | HMAC 驗簽密鑰（隨機長字串） |
| `PORT` | 監聽 port，預設 `3000` |

### 3. 建立資料庫 schema

```bash
pnpm db:migrate
```

### 4. 啟動開發伺服器

```bash
pnpm dev
```

伺服器啟動後：
- API：`http://localhost:3000`
- Swagger UI：`http://localhost:3000/api-docs`

### 5. 啟動前端 Demo（選用）

需另開終端機，後端保持執行中：

```bash
pnpm --filter web dev
```

前端啟動後：
- Demo UI：`http://localhost:5173`
- Vite 自動代理 `/api/*` → `http://localhost:3000`（不需額外設定 CORS）

登入帳號需先透過 `POST /auth/register` 建立，或直接用整合測試的 seed 資料。

### 其他指令

| 指令 | 說明 |
|------|------|
| `pnpm build` | 編譯 TypeScript → `dist/` |
| `pnpm start` | 生產模式（需先 build） |
| `pnpm test` | 執行後端整合測試 |
| `pnpm test:watch` | 監看模式執行測試 |
| `pnpm --filter web test` | 執行前端單元測試 |
| `pnpm --filter web build` | 編譯前端 → `web/dist/` |
| `pnpm db:generate` | 重新產生 Prisma client |
| `pnpm db:studio` | 開啟 Prisma Studio |

### 測試環境

測試讀取 `.env.test`，需另外設定：

```bash
cp .env.example .env.test
# 填入測試用 DATABASE_URL（建議獨立 Neon branch）
```

---

## Demo 操作

完整 demo 動線：會員訂閱 → 輪詢轉 ACTIVE → 期末取消；後台建方案 + Demo Control 面板演示邊界條件（冪等、dunning、期末取消、金流商切換）。

### 0. 啟用 demo 資料與控制台

```bash
# .env 設定（Demo Control 面板與 /demo/* 端點才會啟用）
DEMO_MODE=true
PAYMENT_PROVIDER=mock

pnpm db:seed          # 建立種子帳號與方案（可重跑，以 email upsert）
pnpm dev              # 後端
pnpm --filter web dev # 前端（另開終端機）→ http://localhost:5173
```

> `DEMO_MODE=false`（production 預設）時，所有 `/demo/*` 端點一律回 **404**，前端不顯示 Demo Control 面板。

### 種子帳號（`pnpm db:seed`）

| 帳號 | 密碼 | role | 進入 |
|------|------|------|------|
| `admin@demo.com` | `demo1234` | ADMIN | 後台（建方案 + Demo Control） |
| `user@demo.com` | `demo1234` | USER | 前台（訂閱動線） |
| `user2@demo.com` | `demo1234` | USER | 前台（本人隔離示範） |

種子方案：`Basic (USD)` $10.00、`Pro (JPY)` ¥1500（demo reset 不會清掉種子列）。

### 1. 前台（會員）動線

1. 以 `user@demo.com` 登入 → 依 role 自動進**前台**。
2. 點方案 **Subscribe** → 建立 Subscription（`INCOMPLETE` 橘）+ 首筆 Order，內部自動觸發扣款。
3. 前端**輪詢** `GET /subscriptions/:id`，mock gateway 非同步回打 webhook 後，Badge 數秒內翻 `ACTIVE`（綠）。
4. 點 **Cancel** → 期末取消（`cancelAtPeriodEnd=true`）：Badge 維持 `ACTIVE` + 「期末取消」標記，**不會**立刻變 CANCELED（DECISION #9）。

### 2. 後台（ADMIN）動線

以 `admin@demo.com` 登入 → 進**後台**：

- **建立方案**：填 name / amount / currency / intervalDays → `POST /plans`，新方案即可在前台看到。
- **訂閱清單**：即時輪詢狀態與 next billing；每列可 **MAKE DUE**（把 `nextBillingDate` 撥成當下）。
- RBAC 示範：USER 打 `POST /plans` 會得 **403**（authz≠authn，DECISION #6）。

### 3. Demo Control 面板（後台 danger-zone，`DEMO_MODE=true` 才顯示）

| 操作 | 演示 | provider |
|------|------|----------|
| **Reset**（輸入 `RESET` 確認） | 清訂閱類資料 + 非種子 Member/Plan，保留種子列 | Mock / Stripe |
| **Run billing now** | `runBillingCycle(now)` 逐筆 tx 續扣（配合 MAKE DUE 演 #7 `<= now`、#9 期末取消生效） | Mock / Stripe |
| **Force-fail 開關** | 全域強制扣款失敗 → 演 dunning 重試 3 次轉 CANCELED（#5）；中途關掉回 ACTIVE | Mock 專屬 |
| **Replay last webhook** | 重送上一筆 webhook，回應 `duplicate:true` → 演冪等不重複扣款（#1/#2） | Mock 專屬 |

> 典型 dunning 演示：開 Force-fail → MAKE DUE → Run billing（失敗，`PAST_DUE`）重複 3 次 → 訂閱轉 `CANCELED`；中途關掉 Force-fail 再 Run billing 則回 `ACTIVE`。

### 4. 金流商即時切換（Mock ↔ Stripe）

Demo Control 面板可**免重啟**切換 provider（in-memory，`Subscription.provider` 綁定建立當下的商家，切換不影響在途訂閱）：

- 切 **Stripe** 需先在 `.env` 設好 `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PUBLISHABLE_KEY`（未設定則選項 disable）。
- Stripe 首扣走**前端 Stripe.js（PaymentElement）**在 app 內刷卡；本機需另開 `stripe listen --forward-to localhost:3000/webhooks/stripe`，其 `whsec_` 要等於 `.env`。
- 詳細踩坑見 [`.claude/rules/FAILURES.md`](.claude/rules/FAILURES.md)。
