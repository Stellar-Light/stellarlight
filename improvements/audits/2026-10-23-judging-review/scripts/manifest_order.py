"""Which manifests a read takes and which it leaves (the stated rule:
shallow first, examples/tests/fixtures/benches/templates last, cap 12)."""
import os
import re
import sys

OUT = os.environ.get("DUMPS", "dumps")
MAN = re.compile(r"(^|/)(package\.json|cargo\.toml|go\.mod|pubspec\.yaml|package\.swift|podfile|build\.gradle(\.kts)?"
                 r"|libs\.versions\.toml|requirements\.txt|pyproject\.toml|setup\.py|setup\.cfg|pom\.xml|composer\.json)$", re.I)
VEND = re.compile(r"(^|/)(node_modules|vendor|target|dist|build|\.next|out)/")
DEF = re.compile(r"(^|/)(examples?|tests?|fixtures?|benches?|templates?|test[-_]wasms)(/|$)", re.I)
paths = open(os.path.join(OUT, sys.argv[1], "tree.txt")).read().splitlines()[1:]
m = sorted([p for p in paths if MAN.search(p) and not VEND.search(p)],
           key=lambda p: (bool(DEF.search(p)), p.count("/"), p))
print(len(m), "manifests")
for i, p in enumerate(m):
    print("  read  " if i < 12 else "  LEFT  ", p)
