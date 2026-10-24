#!/bin/bash
# Usage: run-replays.sh <variant> <name>...   (from anywhere; runs in the worktree)
set -euo pipefail
WT=${WT:?worktree root}
S=${S:?scratch folder}
v=$1; shift
cd "$WT"
cp "$S/hb.$v.ts" src/lib/hackathon-builds.ts
for n in "$@"; do
  cap=$(python3 -I -c "import json,sys;print(json.load(open('$S/captures.json'))[sys.argv[1]])" "$n")
  pnpm exec tsx improvements/audits/2026-10-23-smart-wallet-o2/replay.mts "$cap" "$v" "$S/out/$n-$v.json" "$S/out/$n-$v.note.txt"
done
cp "${RESTORE:-$S/hb.base.ts}" src/lib/hackathon-builds.ts
cmp src/lib/hackathon-builds.ts "${RESTORE:-$S/hb.base.ts}" && echo restored
