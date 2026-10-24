# Run from the scratch folder holding out/ (replay.mts outputs <capture>-<variant>.json), corpus-108.json,
# captures.json, battery-queries.json and grades-q1.json; see ../README.md, Rerun.
"""Moves base -> variant on changed queries, with known grades; writes the
rows still needing a grade to need.json."""
import json, sys
DIR = sys.argv[0].rsplit("/improvements/audits/", 1)[0] + "/improvements/audits" if "/improvements/audits/" in sys.argv[0] else "../q1-wt/improvements/audits"
FROZEN = ["probes", "labeled", "fresh2", "adv", "review", "eventq", "battery"]
EXTRA = sys.argv[1:] if len(sys.argv) > 1 else []
labels = {}
def put(k, g): labels[k] = min(g, labels.get(k, g))
for l in json.load(open(f"{DIR}/2026-10-22-prior-art-precision/labels.json"))["labels"]:
    put(("40", l["ideaId"], l["buildId"]), l["grade"])
for s, f in (("short", "windows-short.json"), ("tests", "windows-tests.json")):
    for i in json.load(open(f"{DIR}/2026-10-22-prior-art-precision/{f}"))["ideas"]:
        for w in i["window"]:
            if w.get("grade") is not None: put((s, i["id"], w["id"]), w["grade"])
for g in json.load(open(f"{DIR}/2026-10-22-words-need-meaning/grades.json"))["grades"]:
    put(("fresh", g["ideaId"], g["buildId"]), min(g["labeler1"], g["labeler2"]))
for f in ("2026-10-23-rerank/grades.json", "2026-10-23-build-matching/grades.json"):
    for g in json.load(open(f"{DIR}/{f}"))["grades"]:
        put((g["set"], g["ideaId"], g["buildId"]), g["grade"])
qgrades = {}
for r in json.load(open(f"{DIR}/2026-10-23-smart-wallet-o2/grades.json"))["grades"]:
    if r["part"] == "B":
        k = (r["query"], r["buildId"]); qgrades[k] = min(r["grade"], qgrades.get(k, 9))
    elif r["part"] == "C":
        put((r["set"], r["ideaId"], r["buildId"]), r["grade"])
try:
    for r in json.load(open("grades-q1.json"))["grades"]:
        k = (r["query"], r["buildId"]); qgrades[k] = min(r["grade"], qgrades.get(k, 9))
except FileNotFoundError:
    pass
LABELED = ("40", "short", "tests", "fresh")
def ctx(x, n):
    if n in ("battery", "qbattery"): return f"held out {x['id']}"
    return x["q"]
def grade(x, n, i):
    if x["set"] in LABELED and (x["set"], x["id"], i) in labels: return labels[(x["set"], x["id"], i)]
    return qgrades.get((ctx(x, n), i))
LISTS = (("route keyword", lambda x: x["route"]["keyword"]["ids"], (5, 20, None)),
         ("route hybrid", lambda x: x["route"]["hybrid"]["ids"], (5, 20, None)),
         ("vet", lambda x: x["vet"], (5,)), ("brief", lambda x: x["brief"], (5,)))
corpus = {r["id"]: r for r in json.load(open("corpus-108.json"))["corpus"]}
need = {}
for v in ("c1", "c2"):
    tally = {"left2": 0, "swap": 0, "real": 0, "entered0_top5": 0, "ungraded": 0}
    print("==", v)
    for n in FROZEN + EXTRA:
        B = {x["key"]: x for x in json.load(open(f"out/{n}-base.json"))["queries"]}
        C = {x["key"]: x for x in json.load(open(f"out/{n}-{v}.json"))["queries"]}
        for k, b in B.items():
            c = C[k]
            if json.dumps(b, sort_keys=True) == json.dumps(c, sort_keys=True): continue
            for what, get, depths in LISTS:
                lb, la = get(b), get(c)
                for d in depths:
                    tb, ta = lb[:d], la[:d]
                    left = [i for i in tb if i not in ta]; ent = [i for i in ta if i not in tb]
                    if not left and not ent: continue
                    gl = [(i, grade(b, n, i)) for i in left]; ge = [(i, grade(b, n, i)) for i in ent]
                    for i, g in gl + ge:
                        if g is None:
                            tally["ungraded"] += 1
                            need[(ctx(b, n), i)] = {"query": ctx(b, n), "q": b["q"], "winnersOnly": b["winnersOnly"], "buildId": i}
                    e2 = sum(1 for _, g in ge if g == 2)
                    l2 = [i for i, g in gl if g == 2]
                    tally["left2"] += len(l2); tally["swap"] += min(len(l2), e2); tally["real"] += max(0, len(l2) - e2)
                    if d == 5: tally["entered0_top5"] += sum(1 for _, g in ge if g == 0)
                    if n in FROZEN or True:
                        print(f"  {n} {b['id'][:16]:16} {what} {'top'+str(d) if d else 'matched'} ({len(lb)}->{len(la)}): left {[(corpus[i]['name'][:28], g) for i, g in gl]} entered {[(corpus[i]['name'][:28], g) for i, g in ge]}")
    print(" ", v, tally)
json.dump({"rows": list(need.values())}, open("need.json", "w"), indent=1)
print("need", len(need))
