#!/usr/bin/env bash
# Merge gate: refuse to merge until every GitHub Actions CheckRun on a PR has
# COMPLETED with SUCCESS / SKIPPED / NEUTRAL.
#
#   scripts/gate-pr.sh <pr-number> [timeout-seconds]
#
# Two failure modes this exists to prevent, both observed:
#
#   1. A merge that races the checks. On 2026-09-06 this gate passed a PR on
#      which the ONLY reported row was Vercel's comment bot — the Actions
#      workflows had not been created yet, so "no check is running" was true
#      and vacuous. It now requires at least one Actions CheckRun, and it
#      SETTLES: after the rows go quiet it waits and re-reads, and any new row
#      appearing restarts the wait. Late-arriving checks are the normal case.
#
#   2. A fixed expected-set. Path-filtered workflows legitimately do not report
#      on every PR (`build` never runs on a scripts-only change), so demanding
#      a hardcoded list times out forever on honest PRs. The rule is therefore
#      about quiescence, never about names.
#
# A row that never reports is never counted as passing.
set -uo pipefail

pr="${1:-}"
[[ "$pr" =~ ^[0-9]+$ ]] || { echo "gate: PR number required — refusing"; exit 1; }
deadline=$(( $(date +%s) + ${2:-900} ))
SETTLE=${GATE_SETTLE_SECONDS:-45}

rows_of() {
  gh pr view "$pr" --json statusCheckRollup \
    -q '.statusCheckRollup[] | select(.__typename=="CheckRun") | "\(.status)|\(.conclusion // "none")|\(.name)"' \
    2>/dev/null | sort
}

quiet_since=0
last=""
while :; do
  rows="$(rows_of)"
  running="$(printf '%s\n' "$rows" | grep -c -v '^COMPLETED|' || true)"
  [[ -z "$rows" ]] && running=1
  count="$(printf '%s\n' "$rows" | grep -c '|' || true)"

  if [[ "$rows" != "$last" ]]; then
    # The set changed: a check appeared or finished. Restart the settle clock.
    last="$rows"; quiet_since=0
  fi

  if (( running == 0 && count > 0 )); then
    (( quiet_since == 0 )) && quiet_since=$(date +%s)
    if (( $(date +%s) - quiet_since >= SETTLE )); then
      bad="$(printf '%s\n' "$rows" | grep -vE '^COMPLETED\|(SUCCESS|SKIPPED|NEUTRAL)\|' || true)"
      if [[ -n "$bad" ]]; then
        echo "PR #$pr NOT MERGEABLE — failing checks:"; printf '%s\n' "$bad"; exit 1
      fi
      echo "PR #$pr all checks green (settled ${SETTLE}s, $count check(s)):"
      printf '%s\n' "$rows" | sed 's/^/   /'
      exit 0
    fi
  fi

  if (( $(date +%s) > deadline )); then
    echo "PR #$pr TIMEOUT — $running running, $count reported. NOT merging."
    printf '%s\n' "$rows" | sed 's/^/   /'
    exit 2
  fi
  sleep 15
done
