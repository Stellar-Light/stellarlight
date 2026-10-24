# Run from the scratch folder holding out/ (replay.mts outputs <capture>-<variant>.json), corpus-108.json,
# captures.json, battery-queries.json and grades-q1.json; see ../README.md, Rerun.
import json, sys
bat = json.load(open("../bench-priorities/battery.json"))["questions"]
corpus = {r["id"]: r for r in json.load(open("corpus-108.json"))["corpus"]}
byname = {}
for r in corpus.values():
    byname.setdefault(r["name"], []).append(r["id"])
req = {}
for x in bat:
    if x["id"] in ("hm26-sc-02", "hm26-sa-02", "hm26-cc-02"):
        ids = []
        for m in x["expect"]["must"]:
            bid = "dorahacks-buidl-" + m["buidl"].rstrip("/").split("/")[-1]
            assert bid in corpus, bid
            ids.append(bid)
        req[x["id"]] = ids
for x in json.load(open(__file__.rsplit("/measure/", 1)[0] + "/fresh-set.json"))["questions"]:
    req[x["id"]] = [r["id"] for r in x["required"]]
def load(n, v):
    return {x["id"]: x for x in json.load(open(f"out/{n}-{v}.json"))["queries"]}
for n in ("qbattery", "qfresh"):
    tot = {}
    for v in ("base", "c1", "c2"):
        Q = load(n, v)
        for mode in ("hybrid", "keyword"):
            for depth in (20, None):
                tot[(v, mode, depth)] = 0
    rows = []
    for qid, x in load(n, "base").items():
        line = [qid, len(req[qid])]
        for v in ("base", "c1", "c2"):
            X = load(n, v)[qid]
            for mode in ("hybrid", "keyword"):
                ids = X["route"][mode]["ids"]
                for depth in (20, None):
                    met = sum(1 for i in req[qid] if i in ids[:depth] if True) if depth else sum(1 for i in req[qid] if i in ids)
                    tot[(v, mode, depth)] += met
                    line.append(met)
            pos = [ (X["route"]["hybrid"]["ids"].index(i) + 1 if i in X["route"]["hybrid"]["ids"] else None) for i in req[qid]]
            line.append(pos)
        rows.append(line)
    print("==", n, "cols: id, required | per variant base c1 c2: hybrid top20, hybrid matched, keyword top20, keyword matched, hybrid positions")
    for r in rows: print(r)
    print("total required", sum(len(req[q]) for q in load(n, 'base')))
    for k, val in tot.items(): print(k, val)
