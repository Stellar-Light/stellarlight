# Run from the scratch folder holding out/ (replay.mts outputs <capture>-<variant>.json), corpus-108.json,
# captures.json, battery-queries.json and grades-q1.json; see ../README.md, Rerun.
import json, re, sys
W = set("won win wins winner winners winning prize prizes award awards awarded placed hackathon hackathons built builds past ever previous previously anyone someone already before".split())
FROZEN = ["probes", "labeled", "fresh2", "adv", "review", "eventq", "battery"]
def holds(q):
    q = q.strip().lower()
    return "?" in q or bool(set(re.findall(r"[a-z0-9]+", q)) & W)
def load(n, v):
    return {x["key"]: x for x in json.load(open(f"out/{n}-{v}.json"))["queries"]}
def notes(n, v, mode_q):
    return open(f"out/{n}-{v}.note.txt").read().splitlines()
for v in ("c1", "c2"):
    print("==", v)
    for n in FROZEN + ["qbattery", "qfresh"]:
        B, C = load(n, "base"), load(n, v)
        nb, nc = open(f"out/{n}-base.note.txt").read().splitlines(), open(f"out/{n}-{v}.note.txt").read().splitlines()
        ch = [k for k in B if json.dumps(B[k], sort_keys=True) != json.dumps(C[k], sort_keys=True)]
        nch = [i for i in range(len(nb)) if nb[i] != nc[i]]
        out_scope = [k for k in ch if not holds(B[k]["q"])]
        in_scope_n = sum(1 for k in B if not holds(B[k]["q"]))
        print(f"{n}: {len(B)} queries, changed {len(ch)}, note lines changed {len(nch)}; byte-identity scope {in_scope_n}, changed inside scope {len(out_scope)}")
        for k in ch:
            print("   ", B[k]["id"][:20], "|", B[k]["q"][:90], "| W" if B[k]["winnersOnly"] else "")
