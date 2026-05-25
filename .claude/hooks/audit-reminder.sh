#!/usr/bin/env bash
# UserPromptSubmit hook: 直前ターンでソース変更があったら、次ターンの context に
# `/audit` 推奨を soft 注入する。 強制 block はしない。
#
# 仕様メモ:
# - `additionalContext` は Stop hook では効かない (公式 docs)。 UserPromptSubmit /
#   SessionStart のみ対応。 ここでは UserPromptSubmit を使う。
# - 公式 docs によると plain stdout (exit 0) で text を書き出すだけで自動的に
#   additionalContext として注入される。 JSON / jq 不要。
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

files=""
if [ -f "$log" ]; then
  files=$(sort -u "$log" 2>/dev/null | head -20 | sed 's|^|- |')
fi
[ -z "$files" ] && exit 0

cat <<EOF
直前のターンでソース変更がありました。 \`/audit\` の実行を推奨します (型 / test / knip / jscpd / madge + 必要に応じて code-reviewer agent)。

変更ファイル:
$files

(audit を skip したい場合は \`.claude/state/dirty.flag\` を \`rm\` で削除)
EOF
