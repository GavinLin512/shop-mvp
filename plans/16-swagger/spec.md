# 16-swagger — Swagger UI + OpenAPI(Zod 衍生)

## 目標
以現有 Zod schema 為單一真相來源,自動產生 OpenAPI 文件,並用 `swagger-ui-express`
在 `/docs` 提供可互動 UI。受保護端點透過 Bearer Authorize 可在 UI 內直接打通。

## 決策(本任務定調)
- **spec 產生方式 = Zod 衍生**:用 `@asteasolutions/zod-to-openapi` 從 Zod schema 生 spec,
  與驗證共用同一份 schema → 不漂移(對照 PREFERENCES「可抽象就抽象、低耦合」)。
- **端點範圍 = 僅對外業務端點**:排除 `mock-gateway/*` 與 `webhooks/payment`
  (內部/機器對機器;webhook 需 raw body + HMAC,在 UI 內無法成功 Execute,放入反而誤導)。
- **JWT 授權 = 要**:加 `bearerAuth` securityScheme,受保護端點掛 security。

## 範圍內

### 1. 依賴
- 新增 `@asteasolutions/zod-to-openapi`(純 JS,無安裝期 lifecycle script → 不需動 `allowBuilds`)。
- **供應鏈守則(SECURITY.md)**:遵守 `minimumReleaseAge: 1440`,只裝發布滿 1 天的版本;
  以 `pnpm add` 後確認 lockfile,CI 用 `--frozen-lockfile`。
- **Zod 4 相容性**:本專案為 Zod 4.4。安裝後須確認所選版本支援 Zod 4
  (需 `extendZodWithOpenApi`);若不相容則停下回報,不靜默降級 Zod。

### 2. Schema 集中(重構,低耦合)
現況:request schema 內嵌在各 route 檔。為了讓驗證與文件共用同一份:
- 新增 `src/schemas/` 匯出各 request schema,並掛 `.openapi()` metadata:
  - `auth.ts` → `RegisterSchema`、`LoginSchema`
  - `plan.ts` → `CreatePlanSchema`
  - `subscription.ts` → `CreateSubscriptionSchema`
  - `payment.ts` → `ChargeSchema`
- 對應 route 改為 **import 共用 schema**(驗證行為不變,只搬家),移除內嵌定義。
- **不更動**驗證邏輯、錯誤碼、回應結構;只把 schema 來源集中。

### 3. Response schema
- 新增 response schema(以 Prisma model 形狀手寫 Zod,掛 `.openapi()`):
  `MemberSchema`、`AuthResponseSchema`(token + member)、`PlanSchema`、
  `SubscriptionSchema`、`ChargeResponseSchema`(`{ providerTxnId }`)、
  `ErrorSchema`(`{ error }`)。
- 金額欄位註明:整數最小單位 + `currency`(ISO 4217),對照 DECISION #4。

### 4. OpenAPI 組裝
- 新增 `src/openapi/registry.ts`:`extendZodWithOpenApi(z)` + `OpenAPIRegistry`,
  註冊上述 request/response schema 與各路徑(path/method/security/responses)。
- 註冊 `bearerAuth`(`type: http, scheme: bearer, bearerFormat: JWT`)。
- 新增 `src/openapi/document.ts`:`OpenApiGeneratorV31` 產生 OpenAPI 3.1 document,
  含 `info`(title/version 取自 package.json)、`servers`、`security`。

### 5. 掛載(src/app.ts)
- 在 `express.json()` **之後**新增:
  - `GET /docs` → `swaggerUi.serve` + `swaggerUi.setup(document)`(互動 UI)。
  - `GET /docs/openapi.json` → 回原始 spec(供測試與外部工具)。
- `/docs` 為公開路由,不掛 `requireAuth`。
- 不影響既有 webhook(json 之前掛載)與錯誤中介。

## 文件化的端點(僅對外)
| Method | Path | Auth |
|--------|------|------|
| POST | /auth/register | — |
| POST | /auth/login | — |
| GET | /plans | — |
| POST | /plans | bearer + ADMIN |
| POST | /subscriptions | bearer |
| GET | /subscriptions/:id | bearer |
| POST | /subscriptions/:id/cancel | bearer |
| POST | /payments/charge | bearer |
| GET | /health | — |

## 公開介面
- `GET /docs`(Swagger UI HTML)
- `GET /docs/openapi.json`(OpenAPI 3.1 JSON)
- `src/openapi/document.ts` 匯出 `openapiDocument`

## 範圍外
- `mock-gateway/*`、`webhooks/payment`、`webhooks/stripe`(15 任務)。
- 不改任何業務邏輯、不改驗證規則與錯誤碼。
- 不做 spec 版本管理 / 多語系 / 自動 client 產生。

## 完成準則
- `GET /docs/openapi.json` 回 200 且為合法 OpenAPI 3.1。
- spec 含上表 9 條路徑,且**不含** mock-gateway / webhook。
- `bearerAuth` securityScheme 存在,受保護端點有引用。
- `GET /docs` 回 200 且為 Swagger UI 頁面。
- route 改用共用 schema 後,既有整合測試全綠(驗證行為不回歸)。

## 依賴
07-subscription、04-plans、01/02-auth、payments(皆已完成)。
```
