# 0006 — role 與 tier 分開 + requireRole

- 狀態:Accepted
- 日期:2026-06-29
- 相關:DECISION.md #6;`CONTEXT.md` 角色與權限

## Context(背景)

「身分驗證(authn:你是誰)」與「授權(authz:你能做什麼)」是兩件事,混在一起會導致
401/403 語意不清、權限判斷散落。另外「權限角色」與「業務分級」是不同維度,綁在同一欄位
會讓兩者互相牽連。

## Decision(決策)

- **authn 用 JWT**:登入發 token,`requireAuth` 驗 token 並填 `req.member`。
- **authz 用 RBAC**:`role` ∈ {`USER`, `ADMIN`},以 `requireRole('ADMIN')` 中介層檢查。
- **role 與 tier 分開**:`role` 管權限;`tier`(如 `NORMAL`)管業務分級,與權限無關。
- **狀態碼分明**:未登入 → **401**;已登入但沒權限 → **403**。兩者不混用。

## Consequences(後果)

**好處**
- authn/authz 解耦,權限判斷集中在中介層。
- role/tier 各自演進,互不牽連。
- 401 vs 403 語意清楚,前端可正確處理。

**代價 / 約束**
- 測試須把 401(無/壞 token)與 403(USER 存取 admin-only)分開斷言,不可混。

## Alternatives considered

- **單一欄位混權限與分級**:維度耦合,否決。
- **未登入也回 403**:語意錯誤,否決。
