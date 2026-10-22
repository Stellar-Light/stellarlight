#!/bin/zsh
# Usage: update_pr_branch.sh <worktree> [<spec-version>]
# Merges origin/main into the worktree's branch. On conflict it takes main's
# generated files (specs/openapi.json, api-client/src/schema.ts, version.ts),
# merges src/lib/changelog.ts by entry with the PR's own entries on top
# (renumbered to <spec-version> when given), sets API_VERSION, rebuilds the
# contract artifacts and commits. Optional: TEST_FILE, TEST_MODULE and
# UNION_IMPORT merge one appended-tests file (see merge_appended_tests.py).
# Stops on any other conflict.
set -u
HERE=${0:A:h}
WT=$1; VER=${2:-}
cd "$WT" || exit 2
git fetch -q origin
MB=$(git merge-base HEAD origin/main); PR=$(git rev-parse HEAD)
LOG=${TMPDIR:-/tmp}/merge-train-merge.out
git rev-parse -q --verify MERGE_HEAD > /dev/null && { echo "STOP: a merge is already in progress here; finish or abort it first"; exit 1; }
if ! git merge -q --no-edit origin/main > "$LOG" 2>&1; then
  # A conflict leaves MERGE_HEAD; a refused merge (dirty tree) does not.
  git rev-parse -q --verify MERGE_HEAD > /dev/null || { echo "STOP: the merge did not start (see $LOG)"; exit 1; }
fi
U=$(git diff --name-only --diff-filter=U)
for f in ${(f)U}; do
  case "$f" in
    src/lib/changelog.ts) ;;
    specs/openapi.json|api-client/src/schema.ts|src/lib/version.ts) git checkout -q --theirs -- "$f" ;;
    *)
      if [ "$f" = "${TEST_FILE:-}" ] && [ -n "${TEST_MODULE:-}" ] && [ -n "${UNION_IMPORT:-}" ]; then
        python3 -I "$HERE/merge_appended_tests.py" "$f" "$MB" "$PR" origin/main "$TEST_MODULE" "$UNION_IMPORT" || exit 1
        git add "$f"
      else
        echo "STOP: conflict in $f (merge log: $LOG)"; exit 1
      fi ;;
  esac
done
if [ -n "$VER" ]; then
  python3 -I "$HERE/merge_changelog.py" "$MB" "$PR" origin/main --version "spec@$VER" || exit 1
  python3 -I - "$VER" <<'PY'
import re, sys
p = "src/lib/version.ts"; s = open(p).read()
s2, n = re.subn(r'export const API_VERSION = "[0-9.]+";', f'export const API_VERSION = "{sys.argv[1]}";', s)
assert n == 1; open(p, "w").write(s2)
PY
elif echo "$U" | grep -q "src/lib/changelog.ts"; then
  python3 -I "$HERE/merge_changelog.py" "$MB" "$PR" origin/main || exit 1
fi
pnpm -s contract:write > /dev/null 2>&1 || { echo "contract:write failed"; exit 1; }
git add -A src specs api-client
[ -n "$(git diff --name-only --diff-filter=U)" ] && { echo "STOP: unresolved conflicts"; exit 1; }
git commit -q --no-edit 2>/dev/null || git commit -q -m "chore: merge main" 2>/dev/null
echo "merged main into $(git branch --show-current) at $(git rev-parse --short HEAD)"
