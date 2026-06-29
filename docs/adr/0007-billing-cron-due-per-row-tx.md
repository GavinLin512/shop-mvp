# 0007 — 續扣 cron:`nextBillingDate <= now` + 逐筆 tx

- 狀態:Accepted
- 日期:2026-06-29
- 相關:DECISION.md #7;ADR-0001(週期冪等鍵)、ADR-0009(期末取消);`CONTEXT.md` 狀態機

## Context(背景)

定期續扣若只掃「今天到期」的訂閱,一旦某次 cron 沒跑(當機、部署、時區問題),逾期的訂閱
就被永久跳過。又若把整批訂閱包在單一大 transaction,中途一筆出錯會回滾全部,且無法續跑。

## Decision(決策)

續扣 cron 掃 **`nextBillingDate <= now`**(不綁「今天」,逾期也會被撈到),對撈到的訂閱
**逐筆各開一個 transaction** 處理:建週期 Order(key=`sub_<id>:<cycleDate>`,見 ADR-0001)→
charge → 推進 `nextBillingDate` 一個 interval。

逐筆隔離 → 某筆失敗不影響其他筆,中斷後重跑可從未處理的續上。同週期重跑靠 Order UNIQUE
擋住,不會重複扣(承 ADR-0001)。期末取消的到期訂閱在此轉 CANCELED 且不建單(見 ADR-0009)。

## Consequences(後果)

**好處**
- 漏跑可補(`<= now`),不會永久跳過。
- 逐筆 tx → 故障隔離、可續跑、半套狀態不殘留。
- 重跑冪等(UNIQUE),安全可重入。

**代價 / 約束**
- cron 須注入可控 `now`,不可用系統時間或真 timer(否則測試 flaky)。
- 多實例並跑的重複,本版靠 UNIQUE key 兜底,正解見 ADR-0010(TALK-ONLY)。

## Alternatives considered

- **只掃今天到期**:漏跑即永久跳過,否決。
- **整批單一大 tx**:一筆錯回滾全部、無法續跑,否決。
