#!/usr/bin/env bash
# PostToolUse hook (Edit / Write): 編集されたファイルを `.claude/state/dirty-files.log`
# に記録し、 dirty.flag を touch する。 後で stop-audit-gate.sh や /audit skill が
# 状態を確認するために使う。
#
# `.claude/state/` 配下や build 出力 / node_modules への書き込みは無視 (audit 対象外)。
#
# refs: https://code.claude.com/docs/en/hooks
set -euo pipefail

input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')
[ -z "$file_path" ] && exit 0

# 監査対象外: build 出力 / node_modules / .claude/state 自身
case "$file_path" in
  */node_modules/*|*/.svelte-kit/*|*/dist/*|*/build/*|*/.claude/state/*)
    exit 0 ;;
esac

# Source 拡張子のみ (Markdown / yaml 等は audit ターゲットでないので除外)
case "$file_path" in
  *.ts|*.tsx|*.js|*.jsx|*.svelte|*.css) ;;
  *) exit 0 ;;
esac

# project root は hook 配置場所から逆算
project_root="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
state_dir="$project_root/.claude/state"
mkdir -p "$state_dir"

echo "$file_path" >> "$state_dir/dirty-files.log"
touch "$state_dir/dirty.flag"

exit 0
