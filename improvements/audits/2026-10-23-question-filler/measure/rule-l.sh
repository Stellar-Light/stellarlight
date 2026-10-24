#!/bin/bash
# check-unused.py for variant $1: lane K's replay with rule L off and on.
set -u
WT=${WT:?worktree root}
S=${S:?scratch folder}
v=$1
cd $WT
F=src/lib/hackathon-builds.ts
K=improvements/audits/2026-10-23-build-matching/replay.mts
C=improvements/audits/2026-10-23-nonsense-queries/check-unused.py
cap() { python3 -I -c "import json,sys;print(json.load(open('$S/captures.json'))[sys.argv[1]])" "$1"; }
NAMES=(probes labeled fresh2 adv review battery qbattery qfresh)
sed 's/^	const namesAdmit = unused.absent.length \* 2 <= unused.concepts;$/	const namesAdmit = true;/' $S/hb.$v.ts > $F
grep -q "const namesAdmit = true;" $F || { cp $S/hb.base.ts $F; echo "PATCH FAILED"; exit 1; }
for n in "${NAMES[@]}"; do pnpm exec tsx $K $(cap $n) norule $S/out/$n-$v-norule.json >/dev/null || { cp $S/hb.base.ts $F; echo FAILED; exit 1; }; done
cp $S/hb.$v.ts $F
for n in "${NAMES[@]}"; do pnpm exec tsx $K $(cap $n) rule $S/out/$n-$v-rule.json >/dev/null || { cp $S/hb.base.ts $F; echo FAILED; exit 1; }; done
cp $S/hb.base.ts $F; cmp -s $F $S/hb.base.ts && git diff --quiet $F && echo "restored base"
for n in "${NAMES[@]}"; do
  python3 -I $C $(cap $n) $S/out/$n-$v.note.txt $S/out/$n-$v-norule.json $S/out/$n-$v-rule.json > $S/out/unused-$n-$v.txt
  echo "$n: exit $?; claims $(grep -c ' | ok \| | FALSE ' $S/out/unused-$n-$v.txt); $(tail -1 $S/out/unused-$n-$v.txt)"
done
python3 -I $C $(cap eventq) $S/out/eventq-$v.note.txt > $S/out/unused-eventq-$v.txt
echo "eventq: exit $?; claims $(grep -c ' | ok \| | FALSE ' $S/out/unused-eventq-$v.txt); $(tail -1 $S/out/unused-eventq-$v.txt)"
