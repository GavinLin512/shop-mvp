# 06-idempotency — 測試

風格:單元(key 生成)+ 整合(DB UNIQUE 行為)。

## 任務 Checklist

- [x] 1. key 生成具決定性 [tracer bullet,單元]
- [x] 2. 重試 key 與原 key 不同 [單元]
- [x] 3. 相同 idempotencyKey 插入只留一筆 [整合,真 DB]
- [x] 4. 不同 key 各自建立 [整合]

## 行為清單(RED → GREEN,逐一)

### 1. key 生成具決定性 [tracer bullet,單元]
- `buildOrderKey('sub_1', 'cycle0')` → `"sub_1:cycle0"`,多次呼叫相同
- 週期 key:`buildOrderKey('sub_1', '2026-07-01')` → `"sub_1:2026-07-01"`

### 2. 重試 key 與原 key 不同 [單元]
- 重試序加 `:retry1` 後綴,與原週期 key 不相等

### 3. 相同 idempotencyKey 插入只留一筆 [整合,真 DB]
- **Given** 用某 key 建一筆 Order
- **When** 用相同 key 再 `createIdempotent`
- **Then** DB 仍只有一筆,且回傳的是既有 Order(非丟錯給呼叫端)

### 4. 不同 key 各自建立 [整合]
- 原 key 與 retry1 key 各建一筆 → DB 兩筆(失敗單不重用,建新單)

## 注意
- 第 3 項要真的撞 DB UNIQUE(`P2002`)再由 repo 吞掉,**不可**改成「先 findFirst 再 create」——那正是 #1 要避免的 race。
