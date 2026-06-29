#!/usr/bin/env bash
# PreToolUse 守衛:阻擋 Bash 工具執行危險指令或繞過 env 守衛讀取機密檔。
# 對照 .claude/rules/SECURITY.md 第 2 節「危險指令禁令」與第 1 節「機密檔案」。
# 命中即輸出 permissionDecision=deny 硬性阻擋,並附原因。
set -euo pipefail

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
[ -z "$cmd" ] && exit 0

# 統一的拒絕輸出
deny() {
  jq -nc --arg r "$1" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $r
    }
  }'
  exit 0
}

# --- 1) 透過 shell 讀取機密 env 檔(cat/grep/head… .env),放行 .env.example ---
if printf '%s' "$cmd" | grep -Eq '(^|[[:space:]])(cat|less|more|head|tail|grep|rg|awk|sed|strings|xxd|od|nl|tac)([[:space:]]).*\.env(\.[a-zA-Z0-9_]+)?([[:space:]"'"'"';|&]|$)' \
   && ! printf '%s' "$cmd" | grep -Eq '\.env\.example'; then
  deny "SECURITY.md:禁止用 shell 讀取 .env 機密檔,僅 .env.example 可讀。"
fi

# --- 2) 危險指令(pattern → 原因)。命中任一即擋 ---
# 每列格式:正則<TAB>原因
while IFS=$'\t' read -r pattern reason; do
  [ -z "$pattern" ] && continue
  if printf '%s' "$cmd" | grep -Eq "$pattern"; then
    deny "SECURITY.md:$reason(指令需由你本人 review 後執行)"
  fi
done <<'PATTERNS'
(^|[[:space:]])rm[[:space:]]+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)	rm 遞迴強制刪除
(^|[[:space:]])rm[[:space:]]+-[a-zA-Z]*r.*[[:space:]]/($|[[:space:]])	rm 刪除根目錄
(^|[[:space:]])sudo([[:space:]]|$)	sudo 高權限操作
(^|[[:space:]])chmod[[:space:]]+-[a-zA-Z]*R	chmod -R 遞迴改權限
(^|[[:space:]])chown[[:space:]]+-[a-zA-Z]*R	chown -R 遞迴改擁有者
(^|[[:space:]])truncate[[:space:]]+-s[[:space:]]*0	truncate 清空檔案
(^|[[:space:]])dd[[:space:]]+.*of=	dd 直接寫入裝置/檔案
(^|[[:space:]])mkfs([[:space:].]|$)	mkfs 格式化
git[[:space:]]+push	git push 影響遠端(含 --force)
git[[:space:]]+reset[[:space:]]+--hard	git reset --hard 丟棄變更
git[[:space:]]+clean[[:space:]]+-[a-zA-Z]*f	git clean -f 刪除未追蹤檔
prisma[[:space:]]+migrate[[:space:]]+reset	prisma migrate reset 重置資料庫
(DROP|TRUNCATE)[[:space:]]+(TABLE|DATABASE)	DROP/TRUNCATE 資料庫物件
PATTERNS

exit 0
