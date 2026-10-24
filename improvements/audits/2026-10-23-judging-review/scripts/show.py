"""Show one dump's tree lines worth a look (broad patterns, for the eye),
its manifests' Stellar-looking lines, and README links and contract ids."""
import os
import re
import sys

OUT = os.environ.get("DUMPS", "dumps")
d = os.path.join(OUT, sys.argv[1])
tree = open(os.path.join(d, "tree.txt")).read().splitlines()
print(tree[0], len(tree) - 1, "files")
broad = re.compile(
    r"test|spec|e2e|cypress|workflows/|circleci|ci\.ya?ml|travis|jenkins|pipelines|"
    r"package\.json$|cargo\.toml$|^readme|requirements|pyproject|go\.mod|pubspec|\.toml$",
    re.I,
)
for p in tree[1:]:
    if broad.search(p) and "test_snapshots/" not in p:
        print("  ", p)
print("test_snapshots files:", sum("test_snapshots/" in p for p in tree))
for f in sorted(os.listdir(d)):
    if not f.startswith("file__") or "README" in f.upper():
        continue
    print("==", f)
    for i, line in enumerate(open(os.path.join(d, f)).read().splitlines()):
        if re.search(r"stellar|soroban|creit|freighter|passkey|crate-type|blend|x402", line, re.I):
            print(f"  {i+1}: {line.strip()[:140]}")
for f in sorted(os.listdir(d)):
    if f.startswith("file__") and "README" in f.upper():
        text = open(os.path.join(d, f)).read()
        print("== README", f, len(text), "chars")
        for i, line in enumerate(text.splitlines()):
            for m in re.finditer(r"https?://[^\s)>\"'`|]+", line):
                print(f"  {i+1}: {m.group(0)[:120]}   <- {line.strip()[:90]}")
        ids = sorted(set(re.findall(r"\bC[A-Z2-7]{55}\b", text)))
        print("  contract ids:", ids)
