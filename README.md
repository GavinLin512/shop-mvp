# 訂閱制電商後端 API

會員訂閱方案 → 系統定期自動建單 → 串接金流自動扣款 → webhook 回調更新狀態。
一條龍展示「商模邏輯 + 金流整合 + 排程 + 冪等正確性」。

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
- Swagger UI：`http://localhost:3000/api-docs`（實作後可用）

### 其他指令

| 指令 | 說明 |
|------|------|
| `pnpm build` | 編譯 TypeScript → `dist/` |
| `pnpm start` | 生產模式（需先 build） |
| `pnpm test` | 執行整合測試 |
| `pnpm test:watch` | 監看模式執行測試 |
| `pnpm db:generate` | 重新產生 Prisma client |
| `pnpm db:studio` | 開啟 Prisma Studio |

### 測試環境

測試讀取 `.env.test`，需另外設定：

```bash
cp .env.example .env.test
# 填入測試用 DATABASE_URL（建議獨立 Neon branch）
```
