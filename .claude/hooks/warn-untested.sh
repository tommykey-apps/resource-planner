#!/usr/bin/env bash
# PreToolUse hook for Edit / Write on web/src code (#92).
#
# AI / 人間が `web/src/**.{ts,svelte}` を編集する前に、対応する `*.test.ts` を
# staging area に置いたかを確認する。staging されていなければ
# `permissionDecision: "ask"` で確認 prompt を出す (deny ではなく ask、
# iterative work を阻害しないため)。
#
# Trigger 対象外:
# - test ファイル本体 (`*.test.ts` / `*.spec.ts`)
# - 拡張子が ts / svelte 以外
# - web/src 配下以外
#
# 参考: https://code.claude.com/docs/en/hooks.md
set -euo pipefail

# stdin から hook input JSON を読む
input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')

# Edit / Write 以外、または file_path が空ならスキップ
if [ -z "$file_path" ]; then
  exit 0
fi

# 拡張子チェック
case "$file_path" in
  *.ts|*.svelte) ;;
  *) exit 0 ;;
esac

# test / spec ファイル本体は除外
case "$file_path" in
  *.test.ts|*.test.svelte|*.spec.ts|*.spec.svelte) exit 0 ;;
esac

# web/src 配下以外は対象外
case "$file_path" in
  *web/src/*) ;;
  *) exit 0 ;;
esac

# repo root を解決 (Claude Code の cwd ではなく、編集対象ファイルの dir から逆算)
file_dir=$(dirname "$file_path")
repo_root=$(git -C "$file_dir" rev-parse --show-toplevel 2>/dev/null || true)
if [ -z "$repo_root" ]; then
  exit 0
fi

# 対応する test ファイルを推測 (foo.ts → foo.test.ts、foo.svelte → foo.svelte.test.ts)
case "$file_path" in
  *.svelte) test_file="${file_path%.svelte}.svelte.test.ts" ;;
  *) test_file="${file_path%.*}.test.ts" ;;
esac

rel_test_file="${test_file#$repo_root/}"

# staging area に対応 test が乗っているか確認
if git -C "$repo_root" diff --cached --name-only | grep -Fxq "$rel_test_file"; then
  exit 0
fi

# どこかで test が触られているか (untracked / unstaged 含む) も見る
if git -C "$repo_root" status --porcelain "$rel_test_file" 2>/dev/null | grep -q .; then
  # 触っているが staged ではない → やや弱めの警告
  cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "ask",
    "additionalContext": "対応 test ($rel_test_file) は変更中ですが staged されていません。TDD では先に test を書いて git add してから実装を編集してください (ADR 0007)。"
  }
}
EOF
  exit 0
fi

# test ファイルがそもそも存在しない / 触られてもいない → 強めの警告
cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "ask",
    "additionalContext": "対応 test ($rel_test_file) が staged されていません。TDD では先に失敗するテストを書いてから実装してください (ADR 0007、/tdd skill 参照)。"
  }
}
EOF
exit 0
