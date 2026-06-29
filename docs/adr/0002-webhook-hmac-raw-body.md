# 0002 — Webhook HMAC 驗簽(raw body)+ 處理順序

- 狀態:Accepted
- 日期:2026-06-29
- 相關:DECISION.md #2、#3;ADR-0001(冪等);`CONTEXT.md` Glossary `webhook`、`idempotencyKey`

## Context(背景)

訂閱啟用、扣款成敗都依賴金流商**非同步回打的 webhook**。這個端點是公開的,任何人都能
打,因此必須能驗證請求**真的來自金流商**、且 **body 未被竄改**。

同時 webhook 是 at-least-once:同一筆 `providerTxnId` 可能被重送,若每次都更新狀態會造成
重複啟用 / 重複記帳。再者,callback 也可能漏送,需要有人主動補。

驗簽有個常見陷阱:框架自動 `JSON.parse` 後再 `JSON.stringify` 重組的 body,其位元組
(空白、欄位順序)與金流商實際簽章的原始 bytes 不同,會導致簽章對不上。

## Decision(決策)

**驗簽對象是 raw bytes**,且 webhook 固定走三步驟順序:

1. **取 raw body** — 路由用 `express.raw()` 取得原始位元組,**不**先 parse 成 JSON。
2. **HMAC 驗簽** — 以 `GATEWAY_SECRET` 對 raw body 算 `HMAC-SHA256`,與請求 header 的
   `X-Signature` 比對。不符回 **401**,不進下一步。
3. **冪等檢查** — 以 `providerTxnId` 判定是否已處理過;已處理直接回 **200**,不重複更新。
4. **更新狀態** — 通過前兩關才更新 Order / Payment / Subscription(三表同一 tx)。

順序不可調換:**驗簽 → 冪等 → 更新**。任一前置失敗就停在該步,不污染後面。

webhook 與 polling 互補:另有對帳 cron(DECISION.md #3)掃 PENDING Payment 主動查 gateway
補狀態,漏掉的 callback 由它兜底。webhook 與對帳共用同一套冪等,避免兩邊各更新一次。

## Consequences(後果)

**好處**
- 簽對 raw bytes → 不受序列化差異影響,簽章穩定可重算。
- 公開端點有真實性 + 完整性保證(HMAC),竄改/偽造直接 401。
- 冪等下推到 `providerTxnId`,重送安全;與 ADR-0001 的 Order 冪等互補。
- webhook + 對帳雙保險,漏送可補。

**代價 / 約束**
- 路由必須用 `express.raw()`;若被全域 `express.json()` 先吃掉 body,驗簽必失敗。
- `GATEWAY_SECRET` 為機密,需走環境變數,不可進版控。
- 三步驟順序是硬約束,測試須把三關拆開斷言(任一前置失敗不進下一步)。

## Alternatives considered(被否決的替代方案)

- **對 parse 後的 JSON 重算簽章**:位元組不一致,簽章對不上,否決。
- **只靠 webhook 不做對帳**:漏送即永久卡 PENDING,否決(改採雙保險,見 DECISION.md #3)。
- **先更新再驗簽 / 先更新再查冪等**:前置失敗已污染狀態,違反順序,否決。
