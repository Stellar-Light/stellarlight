#!/bin/zsh
# Usage: wait_checks.sh <head-sha> [expected-count]
# Exits 0 once at least <expected-count> check-runs exist on <head-sha> and every
# one is completed; prints each name, status and conclusion. Exits 1 after 20
# minutes. Read-only. `gh pr checks` can lag; this reads the check-runs API.
SHA=$1; N=${2:-8}; REPO=${REPO:-Stellar-Light/stellarlight}
for i in {1..80}; do
  OUT=$(gh api "repos/$REPO/commits/$SHA/check-runs?per_page=100" -q '.check_runs[] | "\(.name)\t\(.status)\t\(.conclusion)"' 2>/dev/null | sort)
  TOTAL=$(print -r -- "$OUT" | grep -c .)
  PENDING=$(print -r -- "$OUT" | grep -vc $'\tcompleted\t')
  if [ "$TOTAL" -ge "$N" ] && [ "$PENDING" -eq 0 ]; then print -r -- "$OUT"; exit 0; fi
  sleep 15
done
print -r -- "$OUT"; echo TIMEOUT; exit 1
