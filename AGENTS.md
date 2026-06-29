# AGENTS.md

## Rules 索引

- [`.claude/rules/ARCHITECTURE.md`](.claude/rules/ARCHITECTURE.md) — 專案架構分層與資料流
- [`.claude/rules/DECISION.md`](.claude/rules/DECISION.md) — 核心設計決策、冪等鍵、Webhook 順序、多幣別、範圍取捨
- [`.claude/rules/preferences.md`](.claude/rules/preferences.md) — 個人偏好設定
- [`DESIGN.md`](DESIGN.md) — demo 前端視覺系統(深色工業風)

---

## 實作工作流程

- `plans/` 底下每個子資料夾(如 `00-foundation`、`06-idempotency`)各代表一個獨立任務。
- 每個任務固定包含兩份文件:
  - `spec.md` — 該任務的規格與實作內容。
  - `test.md` — 該任務的測試。
- 實作順序:先依 `spec.md` 完成實作,**完成後必須接著做 `test.md`**。`test.md` 未完成,該任務不算結束。
- **`test.md` 的 checklist 在測試通過後必須逐項打勾**(`- [ ]` → `- [x]`)。

## 實作前必讀

在開始任何任務之前,**必須先讀以下文件**,確認術語與決策不衝突:

1. `CONTEXT.md` — 領域術語表,命名以此為準,不使用表內「不要用的同義詞」。
2. `docs/adr/` — 讀與本次任務相關的 ADR。若實作與現有 ADR 衝突,**必須明確說明衝突點**,不得靜默覆蓋。

---

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

## Agent skills

### Issue tracker

Issues 追蹤於 GitHub Issues(`gh` CLI);外部 PR 不當作 triage 請求來源。See `docs/agents/issue-tracker.md`.

### Triage labels

使用預設 label 詞彙(needs-triage / needs-info / ready-for-agent / ready-for-human / wontfix)。See `docs/agents/triage-labels.md`.

### Domain docs

單一 context(root `CONTEXT.md` + `docs/adr/`)。See `docs/agents/domain.md`.

---