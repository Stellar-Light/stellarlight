#!/bin/bash
# The lane's live measurement: the real reviewSubmission handler with the
# live GitHub read, the operator's gh token in the environment (never
# printed), no database. Run from the repo root:
#   OUT=<dir> MEASURE_REPOS=owner/a,owner/b \
#     bash improvements/audits/2026-10-23-judging-review/scripts/run-measure.sh
# MEASURE_REPOS is required: individuals' repos are named by pseudonym in
# the labels, and the map is not in the repository. The SCF round state is
# the one live scfPitch served at the time (scf-round.json).
set -euo pipefail
AUD=improvements/audits/2026-10-23-judging-review
TOKEN="$(gh auth token)"
export GITHUB_TOKEN="$TOKEN"
export MEASURE_OUT="$OUT"
export SCF_ROUND_FILE="${SCF_ROUND_FILE:-$AUD/scf-round.json}"
export MEASURE_REPOS="${MEASURE_REPOS:?name the repos to measure}"
date -u +%Y-%m-%dT%H:%M:%SZ
npx vitest run --config "$AUD/vitest.measure.config.mts" measure
date -u +%Y-%m-%dT%H:%M:%SZ
