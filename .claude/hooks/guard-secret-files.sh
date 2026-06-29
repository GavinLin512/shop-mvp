#!/usr/bin/env bash
# PreToolUse 守衛:阻擋 Read/Edit/Write/Grep 等檔案工具存取機密 env 檔。
# 規則(對照 .claude/rules/SECURITY.md):
#   - .env / .env.* (含 .env.test、.env.local …) 一律禁止
#   - 唯一例外:.env.example 範本可存取
# 輸出 PreToolUse 的 permissionDecision=deny 以硬性阻擋。
set -euo pipefail

input=$(cat)
# 檔案工具的路徑欄位可能是 file_path(Read/Edit/Write)或 path(Grep)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.path // empty')
[ -z "$file" ] && exit 0

base=$(basename "$file")
case "$base" in
  .env.example)
    exit 0 ;;                       # 範本:放行
  .env|.env.*)
    jq -nc --arg b "$base" '{
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: ("SECURITY.md:禁止存取機密檔 " + $b + ",僅 .env.example 可存取。")
      }
    }'
    exit 0 ;;
esac
exit 0
