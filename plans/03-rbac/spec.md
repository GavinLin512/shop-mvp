# 03-rbac — 認證與授權中介層

## 目標
分離 authn(JWT)與 authz(RBAC),正確區分 401 與 403(#6)。

## 公開介面
- `requireAuth`:驗 `Authorization: Bearer <jwt>`,成功把 member 放 `req.member`;失敗 → 401。
- `requireRole(role)`:在 `requireAuth` 之後,`req.member.role !== role` → 403。

## 規則
- 未帶 / 格式錯 / 簽章錯 / 過期 token → **401**(未認證)。
- 已認證但角色不符 → **403**(已認證、無權限)。
- 為測試掛一條保護 route(或直接於 04 plans 驗證)。

## 範圍外
細粒度權限、資源擁有者檢查(擁有者檢查在各自 route,如 07/14)。

## 完成準則
401 與 403 行為與情境明確分離,可被後續 admin route 直接複用。

## 依賴
02-auth-login。
