"""Print each measured body's evidence items once (deduped by id), for the
hand comparison against labels.json."""
import json
import os
import sys

d = sys.argv[1]
for f in sorted(os.listdir(d)):
    if not f.endswith(".json") or f == "timings.json":
        continue
    if sys.argv[2:] and not any(a in f for a in sys.argv[2:]):
        continue
    b = json.load(open(os.path.join(d, f)))
    r = b["review"]
    print("=" * 100)
    print(f, "| stored:", r.get("stored"), "| repo:", json.dumps(r.get("repo")))
    seen = {}
    nc = []
    for c in r["judging"]["categories"]:
        for x in c["criteria"]:
            if not x["checkable"]:
                nc.append(f'{c["category"]}/{x["criterion"]}: {x["reason"][:60]}')
                continue
            for e in x["evidence"]:
                seen.setdefault(e["id"], e)
    print("  not checkable:", len(nc), nc)
    for k, e in seen.items():
        print(f'  - {k}: {e["state"]} values={e["values"]} count={e["count"]}')
        print(f'      {e["finding"]}')
