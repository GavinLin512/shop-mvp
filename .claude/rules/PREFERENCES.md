# 個人偏好設定

- 在重要邏輯上必須加上註解說明
- coding style 必須符合 SOLID 原則
- code 保持低耦合性，可以抽象就做抽象，或是依賴注入，但也必須顧及可讀性

## Express 5 注意事項

### async route handler
Express 5 原生處理 rejected Promise，自動轉呼叫 `next(err)`。
**不需要** `asyncHandler` wrapper，直接用 `async`：

```ts
// 正確：Express 5 直接支援
router.post('/subscriptions', async (req, res) => {
  const sub = await subscriptionService.create(req.body)
  res.status(201).json(sub)
})
```

### error middleware
四個參數，寫法不變：

```ts
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  res.status(500).json({ error: err.message })
})
```

### 已移除的 API（不可使用）

| 移除 | 改用 |
|------|------|
| `req.param()` | `req.params` / `req.body` / `req.query` |
| `app.param(fn)` | 移除，無替代 |
| `res.json(status, obj)` | `res.status(status).json(obj)` |
| `app.del()` | `app.delete()` |
| `req.host`（只含 hostname） | `req.hostname`（`req.host` 現在含 port） |

### wildcard 路徑語法

```ts
// 不可用（Express 4 語法）
router.get('*', handler)

// 必須命名（Express 5）
router.get('/*path', handler)
```

## Zod 4 注意事項

### 錯誤訊息參數：`message` → `error`

```ts
// ❌ v3（已棄用）
z.string().min(5, { message: "Too short" })

// ✅ v4
z.string().min(5, { error: "Too short" })
```

### `invalid_type_error` / `required_error` 已移除

```ts
// ❌ v3（不可用）
z.string({ required_error: "必填", invalid_type_error: "非字串" })

// ✅ v4
z.string({ error: (issue) => issue.input === undefined ? "必填" : "非字串" })
```

### 字串格式 validator 移至頂層（method 形式已棄用）

```ts
z.string().email()    // ❌ deprecated
z.email()             // ✅

z.string().uuid()     // ❌ deprecated
z.uuid()              // ✅

z.string().url()      // ❌ deprecated
z.url()               // ✅

z.string().datetime() // ❌ deprecated
z.iso.datetime()      // ✅
```

### `ZodError.flatten()` → `z.flattenError()`

```ts
err.flatten()         // ❌ deprecated
z.flattenError(err)   // ✅
```

### 其他注意點

- `z.coerce.*` 的 input 型別改為 `unknown`（v3 為 `string`）
- `.refine()` 的型別謂詞不再收窄型別（`val is string` 會被忽略）
- `.superRefine()` 的 `ctx.path` 已移除

## Vitest 4 注意事項

### env 載入：改用 `loadEnv`（不用 dotenv 手動解析）

```ts
// ❌ v1 手動做法
import dotenv from 'dotenv'
const { parsed = {} } = dotenv.config({ path: '.env.test' })
export default defineConfig({
  test: { env: parsed as Record<string, string> },
})

// ✅ v4 慣用做法：mode='test' 時自動載入 .env.test
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
export default defineConfig(({ mode }) => ({
  test: { env: loadEnv(mode, process.cwd(), '') },
}))
```

### 已移除的設定選項（不可使用）

| 移除 | 改用 |
|------|------|
| `poolOptions.*` | 頂層 `execArgv`、`isolate`、`maxWorkers`、`vmMemoryLimit` |
| `poolMatchGlobs` | `projects` |
| `environmentMatchGlobs` | `projects` |
| `workspace` | `test.projects` |
| `deps.*` | `server.deps.*` |
| `minWorkers` | 移除，無替代 |

## TypeScript 6 注意事項

### 目前 tsconfig.json 狀態（無問題）

| 選項 | 我們的值 | 說明 |
|------|----------|------|
| `strict` | `true`（明確設定） | TS 6 預設改為 `true`，我們已明確設定，不受影響 |
| `target` | `"ES2022"`（明確設定） | TS 6 預設改為 `ES2025`，我們已明確設定，不受影響 |
| `module` | `"commonjs"` | 未棄用，正常 |
| `baseUrl` | 未設定 | 已棄用（TS 7 移除），我們不用，無問題 |

### 已棄用的選項（不可新增使用）

```jsonc
// ❌ 以下在 TS 6 已棄用，TS 7 會完全移除
{
  "compilerOptions": {
    "target": "ES3",            // ❌ 棄用
    "target": "ES5",            // ❌ 棄用
    "module": "AMD",            // ❌ 棄用
    "moduleResolution": "classic", // ❌ 棄用
    "moduleResolution": "node10",  // ❌ 棄用（將影響我們，見下）
    "baseUrl": "./src"          // ❌ 棄用
  }
}
```

### 待處理：`moduleResolution` 隱式 `node10`（TS 7 升級前需遷移）

我們的 `module: "commonjs"` 隱式使用 `moduleResolution: "node10"`。
`node10` 已在 TS 6 棄用，TS 7 將完全移除。
目前因為未顯式設定所以**沒有警告**，但升級 TS 7 前需要遷移。

遷移方向（升 TS 7 時再處理）：
- `"module": "NodeNext"` + `"moduleResolution": "NodeNext"`（ESM，需加 `.js` 後綴）
- 或 `"moduleResolution": "bundler"`（適合 bundler 環境）

### 程式化 API（Programmatic API）尚未穩定

官方說明：穩定的程式化 API 最快要到 **TypeScript 7.1** 才會提供。
TS 6 / 7.0 期間若有依賴 `ts.createProgram()`、`ts.transpileModule()` 等 API 的工具或套件，
行為可能在小版本間異動，**不應在此專案中直接呼叫 TypeScript compiler API**。

## node-cron 4 注意事項

### 預設行為改變：`schedule()` 立即啟動

```ts
// v3：預設不啟動，需 scheduled: true
cron.schedule('0 * * * *', fn, { scheduled: true })

// v4：建立後立即啟動，無需任何選項
cron.schedule('0 * * * *', fn)
```

### 建立暫停狀態的任務：改用 `createTask()`

```ts
// v3（不可用）
cron.schedule('0 * * * *', fn, { scheduled: false })

// v4：用 createTask()，呼叫 start() 前不會執行
const task = cron.createTask('0 * * * *', fn)
task.start()
```

### 已移除的 options（不可使用）

| 移除 | 替代做法 |
|------|----------|
| `scheduled: true/false` | `schedule()` 預設啟動；暫停改用 `createTask()` |
| `runOnInit: true` | 建立後呼叫 `task.execute()` |

### billing / reconciliation cron 必用：`noOverlap: true`

防止上一輪還沒跑完、下一輪又觸發（符合 DECISION.md #7 逐筆 tx 設計）：

```ts
cron.schedule('0 * * * *', fn, { noOverlap: true })
```

### 新增可用的 options

```ts
cron.schedule('0 * * * *', fn, {
  name: 'billing-cron',     // 任務名稱，便於除錯
  timezone: 'UTC',          // 時區
  noOverlap: true,          // 防重疊執行
  maxExecutions: 10,        // 最多執行幾次（測試用）
})
```

### 任務控制 API

```ts
task.stop()        // 暫停
task.start()       // 恢復
task.execute()     // 立即手動執行一次
task.destroy()     // 永久移除
task.getStatus()   // 'stopped' | 'idle' | 'running' | 'destroyed'
task.getNextRun()  // 下次執行的 Date，或 null
task.lastRun()     // { date, result } | { date, error } | null
```

## Stripe demo 注意事項（實測踩過的坑）

切 `PAYMENT_PROVIDER=stripe` 演示首扣時，依序會撞到下列問題：

| 症狀 | 原因 | 解法 |
|------|------|------|
| 後端啟動即崩、vite proxy `ECONNREFUSED` | `PAYMENT_PROVIDER=stripe` 但缺 `STRIPE_SECRET_KEY`，`new Stripe(undefined)` 擲錯 | `.env` 補 `STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`（缺後者 webhook 驗簽 401） |
| 按訂閱沒有刷卡畫面 | 前端**未實作 Stripe Elements**（ADR-0011 規劃但沒做） | 首扣靠 CLI confirm 測試卡，非 app 內收卡 |
| confirm 後訂閱不轉 ACTIVE、查無 `payment_intent.succeeded` | 本機 `localhost` Stripe 打不到，沒開 `stripe listen` 轉發 | 先開 `stripe listen --forward-to localhost:3000/webhooks/stripe`，secret 對上 `.env` |
| confirm 報錯要求 `return_url` | 建 PI 未設 `automatic_payment_methods`，預設啟用 Dashboard 全部方式（含跳轉） | 建 PI 時 `automatic_payment_methods: { enabled: true, allow_redirects: 'never' }` |
| PI `succeeded` 了但訂閱仍 INCOMPLETE | Stripe PI 事件**不帶內部 orderId**；`subscriptionService.create` 丟棄 charge 回傳、首扣未建 Payment，webhook 反查不到 Order | 建 PI 帶 `metadata: { orderId }`；webhook `resolveOrderId` 先讀 `metadata.orderId`，再 fallback `providerTxnId` |

通用心法：
- **本機 Stripe webhook 一定要 `stripe listen`**，且其印出的 `whsec_` 必須等於 `.env` 的 `STRIPE_WEBHOOK_SECRET`（部署到公開 URL 才改用 Dashboard endpoint 的 secret）。
- 改碼後**已建立的舊 PI 不會套用新設定**（如 metadata / allow_redirects），驗證一律開**新訂閱**。
- 驗證刷卡成功用 `pm_card_visa`（4242，不觸發 3DS）；盯 `stripe listen` 視窗應見 `<-- [200] POST .../webhooks/stripe`，`[401]` 即 secret 不符。
```