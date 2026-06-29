# 資安守則(SECURITY）

本檔規範 AI agent 在本專案可做與不可做的操作。**任何任務開始前都適用,優先於便利性。**

---

## 1. 機密檔案讀取禁令

| 檔案 | 可否讀取 | 說明 |
|------|----------|------|
| `.env` | ❌ 禁止 | 含正式 `JWT_SECRET` / `WEBHOOK_SECRET` / `DATABASE_URL` |
| `.env.test` | ❌ 禁止 | 測試密鑰仍是密鑰,不得讀取或輸出 |
| `.env.*`(其他環境) | ❌ 禁止 | 同上 |
| `.env.example` | ✅ 可讀 | 只有變數名稱與假值,作為對照範本 |

- 需要知道某環境變數**存不存在**時,讀 `.env.example` 的鍵名即可,不讀實際值。
- **嚴禁**用 `cat` / `Read` / `grep` / `head` 等任何方式印出 `.env*`(範本除外)的內容。
- 嚴禁把密鑰值寫進程式碼、註解、log、commit message、PR 內文或對話輸出。

---

## 2. 危險指令禁令

下列指令 AI **不可直接執行**,只能「草擬」交由使用者本人 review 後執行:

| 類型 | 禁止指令(範例) |
|------|------------------|
| 刪除 / 覆蓋檔案 | `rm`、`rm -rf`、`rm -rf *`、`cat /dev/null > file`、`truncate -s 0`、大範圍 `mv` / `cp -rf` |
| 版控 / 推送 | `git push`(含 `--force` / `--force-with-lease`)、`git reset --hard`、`git clean -fd` |
| 系統權限 | 任何 `sudo`、`chmod -R`、`chown -R`、改 `/etc/*`、`iptables` / `ufw` / `nmcli` |
| DB 寫入 / 刪除 | `DROP TABLE` / `DROP DATABASE`、無 `WHERE` 的 `DELETE` / `UPDATE`、`prisma migrate reset` |
| 外部 / 計費 | 大量寄信 / 簡訊、開雲端資源、改 API key / token / 權限、自動 commit-push-PR 流程 |

- 規則為**白名單以外即拒絕**:不確定某指令是否危險時,先停下來問,不要先做。
- 需要破壞性操作時,輸出指令字串並說明風險,由使用者複製執行。

---

## 3. 專案資安要點

對照 [`DECISION.md`](DECISION.md),實作時必須守住:

### 機密與設定
- 密鑰一律從環境變數讀(`process.env`),不得 hardcode。
- `JWT_SECRET` ≥ 256-bit、來源為 CSPRNG;dev / test / prod 各用不同密鑰。
- 確認 `.gitignore` 持續涵蓋 `.env` 與 `.env.test`,密鑰不得進 git。

### 認證 / 授權(#6)
- authn 用 JWT、authz 用 RBAC;未登入回 **401**、已登入但沒權限回 **403**,不可混用。
- JWT 一律驗簽後才信任 payload,過期 token 視為未登入。

### Webhook(#2)
- 用 `express.raw()` 取 **raw bytes** 做 HMAC-SHA256 驗簽,驗簽錯回 **401**。
- 順序固定:**驗簽 → 冪等(查 `providerTxnId`)→ 更新狀態**,不可調換。
- HMAC 比對用 constant-time(如 `crypto.timingSafeEqual`),避免時序攻擊。

### 資料存取
- 一律走 Prisma 參數化查詢;**不得**用字串拼接組 SQL(防 SQL injection)。
- 對外輸入一律經 Zod 驗證後才進 service。
- 錯誤回應不外洩內部細節(stack trace、SQL、密鑰)。

### 金流冪等(#1)
- `Order.idempotencyKey` 由 DB UNIQUE 保證唯一,不靠應用層先查再寫,避開 race。

---

## 4. 遇到資安疑慮時的處置

- 發現密鑰疑似外洩(進 git、印到 log):**立即停下並告知使用者**,建議輪替密鑰。
- 任務需求與本檔衝突:**明確指出衝突點**,不得靜默繞過。
- 不確定是否安全:寧可問,不要先執行。
