#!/usr/bin/env bash
# Stop hook: 直前ターンでソース変更があったら次ターンの additionalContext に
# 「`/audit` を走らせて」 と通知する。 強制 block はしない (推奨)。
#
# `.claude/state/dirty.flag` の有無で判定。 `/audit` skill 完了時に flag が
# 削除されるので、 audit 済なら再警告しない。
#
# refs: https://code.claude.com/docs/en/hooks
set -euo pipefail

project_root="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
state_dir="$project_root/.claude/state"
flag="$state_dir/dirty.flag"
log="$state_dir/dirty-files.log"

[ -f "$flag" ] || exit 0

# 直近変更ファイル一覧 (dedup、最大 20 件)
files=""
if [ -f "$log" ]; then
  files=$(sort -u "$log" 2>/dev/null | head -20 | sed 's|^|- |')
fi
[ -z "$files" ] && exit 0

# additionalContext で次ターンの Claude に通知
msg=$(printf '直前のターンでソース変更がありました。 \`/audit\` の実行を推奨します (型 / test / knip / jscpd / madge + 必要に応じて code-reviewer agent)。\n\n変更ファイル:\n%s\n\n(audit を skip したい場合は `.claude/state/dirty.flag` を `rm` で削除)' "$files")

jq -n --arg ctx "$msg" '{
  hookSpecificOutput: {
    hookEventName: "Stop",
    additionalContext: $ctx
  }
}'
