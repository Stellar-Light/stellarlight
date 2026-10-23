"""Token diff of the moved code: the base route (from its SubmissionRow
interface to the end) against src/lib/hackathon-detail.ts (from the same
line), whitespace ignored. Prints every changed span, em and en dashes
written as \\u2014 and \\u2013.

  git show d9bd53b5:'src/app/api/hackathons/[slug]/route.ts' > <base.ts>
  python3 improvements/audits/2026-10-23-event-pages/move-check.py \\
    <base.ts> src/lib/hackathon-detail.ts
"""
import difflib
import re
import sys

base_path, lib_path = sys.argv[1], sys.argv[2]
base = open(base_path, encoding="utf8").read()
lib = open(lib_path, encoding="utf8").read()
b0 = base.index("interface SubmissionRow {")
l0 = lib.index("interface SubmissionRow {")
tok = lambda s: re.findall(r"\S+", s)
a, b = tok(base[b0:]), tok(lib[l0:])
show = lambda ts: " ".join(ts)[:600].replace("\u2014", "\\u2014").replace("\u2013", "\\u2013")
sm = difflib.SequenceMatcher(a=a, b=b, autojunk=False)
n = 0
for op, i1, i2, j1, j2 in sm.get_opcodes():
    if op == "equal":
        continue
    n += 1
    print(f"--- {op}")
    print("  base:", show(a[i1:i2]))
    print("  lib: ", show(b[j1:j2]))
equal = sum(i2 - i1 for op, i1, i2, _, _ in sm.get_opcodes() if op == "equal")
print("changed spans:", n, "equal tokens:", equal, "of", len(a))
