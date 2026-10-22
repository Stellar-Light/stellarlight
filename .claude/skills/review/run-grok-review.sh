#!/bin/zsh
# Usage: run-grok-review.sh <branch> <brief.md> [max-turns] [evidence-file...]
# Clones <branch> from this repository into a throwaway directory and runs a
# Grok review inside it: model and effort named, strict sandbox (it reads only
# the clone, and its tools have no network), no global git config. Evidence
# files are copied into the clone root so the brief can name them.
# Prints the path of the findings file; the verdict is its first "GATE:" line.
set -eu
BR=$1; BRIEF=$2; TURNS=${3:-60}; shift $(( $# < 3 ? $# : 3 ))
ROOT=$(git rev-parse --show-toplevel)
OUT=$(mktemp -d "${TMPDIR:-/tmp}/review.XXXXXX")
git clone --quiet --no-hardlinks --branch "$BR" "$ROOT" "$OUT/repo"
cp "$BRIEF" "$OUT/repo/.review-brief.md"
for f in "$@"; do cp "$f" "$OUT/repo/"; done
cd "$OUT/repo"
GIT_CONFIG_GLOBAL=/dev/null grok -m "${GROK_MODEL:-grok-4.7}" --reasoning-effort "${GROK_EFFORT:-high}" \
  --sandbox strict --prompt-file .review-brief.md --disable-web-search --always-approve \
  --max-turns "$TURNS" > "$OUT/findings.md" 2> "$OUT/grok.err" || echo "grok exited non-zero; see $OUT/grok.err" >&2
echo "$OUT/findings.md"
