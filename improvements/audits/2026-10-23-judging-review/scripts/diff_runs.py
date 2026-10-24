"""Item-by-item diff of two measurement runs: (state, values, count) per
evidence id per repo, plus the finding when the item changed."""
import json
import os
import sys


def items(path):
    b = json.load(open(path))
    out = {}
    for c in b["review"]["judging"]["categories"]:
        for x in c["criteria"]:
            for e in x["evidence"] or []:
                out[e["id"]] = e
    return out


old_dirs, new_dir = sys.argv[1:-1], sys.argv[-1]
changed = same = 0
for f in sorted(os.listdir(new_dir)):
    if not f.endswith(".json") or f == "timings.json":
        continue
    old = next((os.path.join(d, f) for d in old_dirs if os.path.exists(os.path.join(d, f))), None)
    if not old:
        continue
    a, b = items(old), items(os.path.join(new_dir, f))
    for k in b:
        kb = (b[k]["state"], b[k]["values"], b[k]["count"])
        if k not in a:
            changed += 1
            print(f"{f} {k}: new item\n   now {kb}\n   {b[k]['finding'][:300]}")
            continue
        ka = (a[k]["state"], a[k]["values"], a[k]["count"])
        if ka == kb:
            same += 1
            continue
        changed += 1
        print(f"{f} {k}:\n   was {ka}\n   now {kb}\n   {b[k]['finding'][:300]}")
print("same", same, "changed", changed)
