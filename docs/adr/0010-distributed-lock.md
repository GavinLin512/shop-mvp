# 0010 — 多實例下的重複觸發防護(分散式鎖)

- 狀態:Proposed(TALK-ONLY,本版不實作)
- 日期:2026-06-29
- 相關:DECISION.md #10;ADR-0001(UNIQUE 兜底)、ADR-0007(逐筆 tx)

## Context(背景)

cron 在多實例部署下可能同時觸發,兩個實例同時撈到同一批到期訂閱、各自嘗試扣款,造成重複
處理。本版 MVP 為單實例,尚不需要正式的分散式鎖,但須說明可重複觸發的風險與正解方向。

## Decision(決策)

**本版不實作分散式鎖**,僅靠 ADR-0001 的 Order UNIQUE key 作為最後兜底:即使兩實例同時
建同一週期單,DB UNIQUE 也只會留一筆,不會重複扣。

記錄正解方向(未來若上多實例再實作):
- 排程改為**外部觸發**(單一 scheduler),避免每個實例各自跑 timer。
- 撈取待處理列用 **`SELECT ... FOR UPDATE SKIP LOCKED`**,讓多 worker 安全瓜分工作而不互相
  阻塞、不重複拿同一筆(可搭配 Neon / Postgres)。

## Consequences(後果)

**好處**
- 明確標示「本版靠 UNIQUE 兜底」的邊界與假設,避免誤以為已具備多實例安全。
- 留下清楚的升級路徑。

**代價 / 約束**
- UNIQUE 只能防「重複寫入」,擋不住「重複 charge 呼叫」本身的副作用;真要多實例須落實
  上述正解。

## Alternatives considered

- **應用層搶鎖(如 DB flag 先讀後寫)**:有 race,不如 SKIP LOCKED,否決(作為正解方向記錄)。
- **現在就上分散式鎖**:超出 MVP 範圍,過度設計,本版否決。
