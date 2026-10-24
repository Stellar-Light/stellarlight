"""Print each dump's raw answers for reading by eye."""
import json
import os
import sys

OUT = os.environ.get("DUMPS", "dumps")
for d in sorted(os.listdir(OUT)):
    if sys.argv[1:] and d not in sys.argv[1:]:
        continue
    p = os.path.join(OUT, d)
    print("==", d)
    try:
        m = json.load(open(os.path.join(p, "meta.json")))
        print(
            {
                k: m.get(k)
                for k in (
                    "full_name",
                    "private",
                    "archived",
                    "default_branch",
                    "homepage",
                    "size",
                    "created_at",
                    "pushed_at",
                    "language",
                )
            }
        )
    except Exception as e:
        print("meta unreadable", e)
    print(open(os.path.join(p, "tree.txt")).read().splitlines()[0])
    print("commits", open(os.path.join(p, "commits.txt")).read().replace("\n", ""))
    print("releases", open(os.path.join(p, "releases.txt")).read().replace("\n", ""))
