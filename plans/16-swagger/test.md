# 16-swagger — 測試

風格:整合(supertest 打 `createApp()`),純驗 spec 結構與 UI 可用,不碰 DB 業務。
**搭配既有整合測試回歸**:確認 schema 搬家後驗證行為不變。

## 任務 Checklist

- [ ] 1. `GET /docs/openapi.json` 回 200 且為合法 OpenAPI 3.1
- [ ] 2. spec 含全部 9 條對外路徑
- [ ] 3. spec **不含** mock-gateway / webhook 路徑
- [ ] 4. `bearerAuth` securityScheme 存在,受保護端點有引用
- [ ] 5. `GET /docs` 回 200 且為 Swagger UI 頁面
- [ ] 6. schema 搬家後既有整合測試全綠(無回歸)

## 行為清單(RED → GREEN,逐一)

### 1. openapi.json 合法
- **When** `GET /docs/openapi.json`
- **Then** 200;body `openapi` 以 `3.1` 開頭,具 `info.title` / `info.version` / `paths`。

### 2. 含全部對外路徑
- **When** 讀 spec `paths`
- **Then** 含 `/auth/register`、`/auth/login`、`/plans`(get+post)、
  `/subscriptions`、`/subscriptions/{id}`、`/subscriptions/{id}/cancel`、
  `/payments/charge`、`/health`。

### 3. 不含內部路徑
- **When** 讀 spec `paths`
- **Then** 不含任何 `/mock-gateway` 或 `/webhooks` 開頭的 key
- 守住「僅對外端點」決策,避免誤把不可互動端點放進 UI。

### 4. bearer 授權正確
- **Given** spec `components.securitySchemes`
- **Then** 有 `bearerAuth`(`type:http, scheme:bearer`)
- **And** `/subscriptions`(POST)、`/payments/charge`、`/plans`(POST)的 operation
  帶 `security: [{ bearerAuth: [] }]`;`/health`、`/plans`(GET)不帶。

### 5. Swagger UI 可開
- **When** `GET /docs/`
- **Then** 200,`content-type` 含 `text/html`,body 含 `swagger-ui`。

### 6. 無回歸
- **When** 跑整套 `pnpm test`
- **Then** 既有 auth/plans/subscription/payment 整合測試全綠
- 證明 request schema 從 route 搬到 `src/schemas/` 後驗證行為(400 錯誤、欄位規則)不變。

## 注意
- 本任務測試**不需** DB 業務資料,但 6 走真 DB(沿用既有測試)。
- `GET /docs` 注意尾斜線:swagger-ui-express 對 `/docs` 會 301 轉 `/docs/`,測試打 `/docs/`。
- 驗 OpenAPI 合法性可用簡單結構斷言即可,不強制引入 validator 套件(避免再加依賴)。
