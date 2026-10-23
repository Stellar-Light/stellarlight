"""The round's measurement over replay.mts outputs, adapted from
../2026-10-23-smart-wallet-oneway/measure.py (lane Z3). Variants per
capture: base (main 85843791), h (7bd30f78), o1h (lane Z3's candidate, for
comparison), o2 (this round's candidate).

  sheet:  the blind grading sheet, shuffled, with no mark of which variant
          listed a build, and its key apart. Rows: every winner L1-02 (z01,
          winners only) lists in any variant or mode (part A); the hybrid top
          10 of lane Z's probes z01 to z08 in base, o1h and o2 (part B);
          every build entering or leaving a top 5 (the route's keyword and
          hybrid rankings, vetIdea's five, the brief's picks), a route top 20
          or a route matched list of a changed query, base to o2, base to
          o1h and o1h to o2 (part B for a query, part C for a labeled idea).
          A row a label or lane Z3's grades already answer is left off. The
          sheet holds upstream text and the battery's questions: scratch
          only.
  grades: the two blind passes (<scratch>/grades-pass-a.json and -b.json)
          joined to the key, the stricter answer kept, plus every lane Z3
          grade a criterion reads (lanes Z's, Z2's and Z3's own), each row
          naming its source.
  report: this round's base, h and o1h against lane Z3's; (b) byte identity;
          every move base to o2 graded with bars (i) and (ii), over the six
          sets lane Z3's bar read and over the battery; the split of bar (i)'s
          rows into same-grade swaps and real losses; vetIdea's five sizes;
          (a) L1-02; (d); the probe table; o1h to o2; the battery questions'
          named builds.

A changed query is fixed by its text alone (trimmed, lowercased): it holds a
hyphen, or "smart" followed by wallet or account with spaces, underscores or
nothing between. Builds whose name holds a name this repository keeps out
are given by id; a battery question is named by its id, never its text.

Usage, from the repository root:
  python3 -I improvements/audits/2026-10-23-smart-wallet-o2/measure.py sheet <scratch> <laneZ3 grades.json> <name>...
  python3 -I improvements/audits/2026-10-23-smart-wallet-o2/measure.py grades <scratch> <laneZ3 grades.json> <out.json> <name>...
  python3 -I improvements/audits/2026-10-23-smart-wallet-o2/measure.py report <scratch> <grades.json> <name>...
reading <scratch>/<name>-<variant>.json and the captures named in <scratch>/captures.json.
"""

import json
import random
import re
import sys

cmd, scratch, *rest = sys.argv[1:]
DIR = "improvements/audits"
PHRASE = re.compile(r"smart[\s_]*(wallet|account)")
LABELED = ("40", "short", "tests", "fresh")
KEPT_OUT = {"dorahacks-buidl-42589", "dorahacks-buidl-38062"}
BATTERY = ("battery",)
VARIANTS = ("base", "h", "o1h", "o2")
SHEET_PAIRS = (("base", "o2"), ("base", "o1h"), ("o1h", "o2"))
if cmd == "sheet":
    z3_path, names = rest[0], rest[1:]
elif cmd == "grades":
    z3_path, out_path, names = rest[0], rest[1], rest[2:]
else:
    grades_path, names = rest[0], rest[1:]

# Existing labels (the labeled sets and later rounds), the stricter grade
# where two sources differ.
labels = {}


def put(k, g):
    labels[k] = min(g, labels.get(k, g))


for l in json.load(open(f"{DIR}/2026-10-22-prior-art-precision/labels.json"))["labels"]:
    put(("40", l["ideaId"], l["buildId"]), l["grade"])
for s, f in (("short", "windows-short.json"), ("tests", "windows-tests.json")):
    for i in json.load(open(f"{DIR}/2026-10-22-prior-art-precision/{f}"))["ideas"]:
        for w in i["window"]:
            if w.get("grade") is not None:
                put((s, i["id"], w["id"]), w["grade"])
for g in json.load(open(f"{DIR}/2026-10-22-words-need-meaning/grades.json"))["grades"]:
    put(("fresh", g["ideaId"], g["buildId"]), min(g["labeler1"], g["labeler2"]))
for f in ("2026-10-23-rerank/grades.json", "2026-10-23-build-matching/grades.json"):
    for g in json.load(open(f"{DIR}/{f}"))["grades"]:
        put((g["set"], g["ideaId"], g["buildId"]), g["grade"])

capture_paths = json.load(open(f"{scratch}/captures.json"))
corpus = {}
captures = []
for n in names:
    cap = json.load(open(capture_paths[n]))
    for r in cap["corpus"]:
        corpus.setdefault(r["id"], r)
    V = {v: {x["key"]: x for x in json.load(open(f"{scratch}/{n}-{v}.json"))["queries"]} for v in VARIANTS}
    captures.append((n, cap, V))

# The battery's questions stay in scratch: outside the sheet, a battery
# query is named by its id, never its text.
BATTERY_TEXT = {x["q"]: f"held out {x['id']}" for n, cap, V in captures if n in BATTERY for x in V["base"].values()}
LABEL_TEXT = {v: k for k, v in BATTERY_TEXT.items()}


def shown(x):
    return BATTERY_TEXT.get(x["q"], x["q"])


def nm(i):
    """A build's name as served, upstream dashes as hyphens, or its id."""
    return i if i in KEPT_OUT else re.sub("[\\u2013\\u2014]", "-", corpus[i]["name"])[:48]


def same(a, b):
    return json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)


def changed_text(x):
    q = x["q"].strip().lower()
    return "-" in q or bool(PHRASE.search(q))


LISTS = (
    ("route keyword", lambda x: x["route"]["keyword"]["ids"], (5, 20, None)),
    ("route hybrid", lambda x: x["route"]["hybrid"]["ids"], (5, 20, None)),
    ("vet", lambda x: x["vet"], (5,)),
    ("brief", lambda x: x["brief"], (5,)),
)


def moves(b, a):
    """Every build entering or leaving a top 5, top 20 or matched list."""
    for what, get, depths in LISTS:
        lb, la = get(b), get(a)
        for d in depths:
            tb, ta = lb[:d], la[:d]
            for i in tb:
                if i not in ta:
                    yield what, d, "left", i, lb, la
            for i in ta:
                if i not in tb:
                    yield what, d, "entered", i, lb, la


def changed(V):
    return [k for k, x in V["base"].items() if changed_text(x)]


def is_probe(x):
    return x["id"].startswith("z") and x["id"] <= "z08"


def ctx_of(x):
    """A grade's context: (part, key) for a query or a labeled idea."""
    if x["set"] in LABELED:
        return "C", (x["set"], x["id"], x["q"])
    return "B", x["q"]


def prior(z3_path):
    """Lane Z3's grades file: its own rows and the lanes Z and Z2 rows it
    reused, the stricter where two hold a row; a battery query back to its
    text, for matching."""
    a, b, c = {}, {}, {}
    for r in json.load(open(z3_path))["grades"]:
        src = "lane Z3" if r.get("source") == "this round" else r["source"]
        r = {**r, "source": src}
        if r["part"] == "A":
            k, d = r["buildId"], a
            worse = lambda old, new: (new["uses"] is False and old["uses"] is True)
        elif r["part"] == "B":
            k, d = (LABEL_TEXT.get(r["query"], r["query"]), r["buildId"]), b
            worse = lambda old, new: new["grade"] < old["grade"]
        else:
            k, d = (r["set"], r["ideaId"], r["buildId"]), c
            worse = lambda old, new: new["grade"] < old["grade"]
        if k not in d or worse(d[k], r):
            d[k] = r
    return a, b, c


def needed():
    """Every row a criterion or report reads: (part, context, build)."""
    rows = set()
    for n, cap, V in captures:
        B = V["base"]
        for k, x in B.items():
            if is_probe(x) and n not in BATTERY:
                for v in ("base", "o1h", "o2"):
                    for i in V[v][k]["route"]["hybrid"]["ids"][:10]:
                        rows.add(("B", x["q"], i))
            if x["id"] == "z01" and x["winnersOnly"]:
                for v in VARIANTS:
                    for mode in ("hybrid", "keyword"):
                        for i in V[v][k]["route"][mode]["ids"]:
                            rows.add(("A", None, i))
        for k in changed(V):
            for lo, hi in SHEET_PAIRS:
                for _, _, _, i, _, _ in moves(V[lo][k], V[hi][k]):
                    part, ctx = ctx_of(B[k])
                    rows.add((part, ctx, i))
    return rows


def known_row(r, la, lb, lc):
    part, ctx, i = r
    if part == "A":
        return i in la
    if part == "B":
        return (ctx, i) in lb
    return (ctx[0], ctx[1], i) in labels or (ctx[0], ctx[1], i) in lc


if cmd in ("sheet", "grades"):
    la, lb, lc = prior(z3_path)
    rows = needed()
    known = {r for r in rows if known_row(r, la, lb, lc)}

if cmd == "sheet":
    todo = sorted(rows - known, key=lambda r: (r[0], json.dumps(r[1]), r[2]))
    rng = random.Random(20261023)
    rng.shuffle(todo)
    sheet, key = [], {}
    for n_, (part, ctx, i) in enumerate(todo, 1):
        rid = f"r{n_:03d}"
        r = corpus[i]
        card = {"name": r["name"], "summary": r["description"]}
        if part == "A":
            sheet.append({"row": rid, "part": "A", **card, "declaredPackages": r.get("stack")})
            key[rid] = {"part": "A", "buildId": i}
        elif part == "B":
            sheet.append({"row": rid, "part": "B", "query": ctx, **card, "declaredPackages": r.get("stack")})
            key[rid] = {"part": "B", "query": ctx, "buildId": i}
        else:
            s, d, q = ctx
            sheet.append({"row": rid, "part": "C", "idea": q, **card})
            key[rid] = {"part": "C", "set": s, "ideaId": d, "idea": q, "buildId": i}
    json.dump(sheet, open(f"{scratch}/sheet.json", "w"), indent=1, ensure_ascii=False)
    json.dump(key, open(f"{scratch}/sheet-key.json", "w"), indent=1)
    parts = {p: sum(1 for r in todo if r[0] == p) for p in "ABC"}
    print(f"rows a criterion or report reads: {len(rows)}; answered by labels or lane Z3's grades: {len(known)}; "
          f"sheet: {len(sheet)} rows (A {parts['A']}, B {parts['B']}, C {parts['C']})")
    sys.exit(0)

if cmd == "grades":
    key = json.load(open(f"{scratch}/sheet-key.json"))
    passes = [{g["row"]: g for g in json.load(open(f"{scratch}/grades-pass-{p}.json"))} for p in "ab"] if key else [{}, {}]
    rank = {"none": 0, "packages": 1, "text": 2}
    out = []
    for rid, k in sorted(key.items()):
        a, b = (p[rid] for p in passes)
        row = {**k, "name": nm(k["buildId"]), "source": "this round"}
        if k["part"] == "A":
            uses = bool(a["uses"] and b["uses"])
            ev = min(a["evidence"], b["evidence"], key=rank.get) if uses else "none"
            row.update(uses=uses, evidence=ev, passA=[a["uses"], a["evidence"]], passB=[b["uses"], b["evidence"]])
        else:
            row.update(grade=min(a["grade"], b["grade"]), passA=a["grade"], passB=b["grade"])
        if row.get("query") in BATTERY_TEXT:
            row["query"] = BATTERY_TEXT[row["query"]]
        out.append(row)
    agree = sum(r["passA"] == r["passB"] for r in out)
    on_sheet = set()
    for k in key.values():
        if k["part"] == "C":
            on_sheet.add(("C", (k["set"], k["ideaId"], k["idea"]), k["buildId"]))
        else:
            on_sheet.add((k["part"], k.get("query"), k["buildId"]))
    print(f"rows read that no label, lane Z3's grades or this sheet answers: {len(rows - known - on_sheet)}")
    reused = []
    for part, ctx, i in sorted(known, key=lambda r: (r[0], json.dumps(r[1]), r[2])):
        if part == "A":
            reused.append(la[i])
        elif part == "B":
            r = lb[(ctx, i)]
            reused.append({**r, "query": BATTERY_TEXT.get(r["query"], r["query"])})
        elif (ctx[0], ctx[1], i) not in labels:
            reused.append(lc[(ctx[0], ctx[1], i)])
    json.dump({
        "about": "Blind grades this round's criteria and reports read (measure.py sheet): rows from two independent passes over one shuffled sheet, each in its own order, the stricter answer kept (source 'this round'); and lane Z3's grades for rows its file already held (source 'lane Z3', 'lane Z' or 'lane Z2', from ../2026-10-23-smart-wallet-oneway/grades.json at 7f698e75, the stricter where two hold a row). Labels of the labeled sets are read from their own files. Graders saw queries, ideas, build names, summaries and, for parts A and B, declared packages; never which variant listed a build. A battery question is named by its id.",
        "graders": "two agents, Claude Sonnet (the Agent tool's sonnet model), one per pass, prompt grader-prompt.txt (lane Z's, unchanged)",
        "agreement": f"{agree} of {len(out)} (this round's rows)",
        "grades": out + reused,
    }, open(out_path, "w"), indent=1, ensure_ascii=False)
    print(f"grades: {len(out)} new rows (passes agree on {agree}), {len(reused)} reused from lane Z3's file")
    sys.exit(0)

blind = json.load(open(grades_path))["grades"]
uses = {g["buildId"]: g for g in blind if g["part"] == "A"}
probe_grade = {(LABEL_TEXT.get(g["query"], g["query"]), g["buildId"]): g["grade"] for g in blind if g["part"] == "B"}
idea_grade = {(g["set"], g["ideaId"], g["buildId"]): g["grade"] for g in blind if g["part"] == "C"}


def grade(x, i):
    if x["set"] in LABELED:
        if (x["set"], x["id"], i) in labels:
            return labels[(x["set"], x["id"], i)], "label"
        g = idea_grade.get((x["set"], x["id"], i))
    else:
        g = probe_grade.get((x["q"], i))
    return g, ("blind" if g is not None else "none")


def bars(pair, sets, verbose=True):
    """Bars (i) and (ii) for a pair of variants over the changed queries of
    the named captures; and the windows bar (i)'s rows sit in."""
    lo, hi = pair
    lost, ungraded, windows = [], [], {}
    zero = {"entered": 0, "left": 0}
    for n, cap, V in captures:
        if n not in sets:
            continue
        for k in changed(V):
            b, a = V[lo][k], V[hi][k]
            if verbose:
                print(f"\n{n} {k}: \"{shown(b)}\"{' (winners only)' if b['winnersOnly'] else ''}; matched keyword "
                      f"{b['route']['keyword']['n']} -> {a['route']['keyword']['n']}, hybrid {b['route']['hybrid']['n']} -> {a['route']['hybrid']['n']}"
                      + ("; byte-identical" if same(b, a) else ""))
            for what, d, how, i, lb, la in moves(b, a):
                g, src = grade(b, i)
                tag = f"top {d}" if d else "matched"
                rank = f"{lb.index(i) + 1 if i in lb else 'none'} -> {la.index(i) + 1 if i in la else 'none'}"
                if verbose:
                    print(f"  {how} {what} {tag}: {nm(i)} | grade {g} ({src}) | rank {rank}")
                if g is None:
                    ungraded.append(f"{n} {k} {nm(i)}")
                if g == 2:
                    w = windows.setdefault((f"{n} {k}", f"{what} {tag}"), {"left": [], "entered": []})
                    w[how].append((nm(i), rank))
                if how == "left" and g == 2:
                    lost.append((f"{n} {k}", f"{what} {tag}", nm(i), rank))
                if d == 5 and g == 0:
                    zero[how] += 1
    return lost, zero, ungraded, windows


def summary(pair, lost, zero, ungraded, windows, label):
    print(f"\n{label}: {pair[0]} -> {pair[1]}: ungraded moves {len(ungraded)}; bar (i) builds graded 2 that left a top 5, top 20 or matched list: "
          f"{len(lost)} list rows, {len({(q, b) for q, _, b, _ in lost})} query and build pairs; "
          f"bar (ii) grade-0 top-5 entries {zero['entered']}, exits {zero['left']}, net {zero['entered'] - zero['left']:+d}")
    for q, where, b, rank in lost:
        print(f"  LOST {q} {where}: {b} (rank {rank})")
    for u in ungraded:
        print(f"  UNGRADED {u}")


def split(lost, windows, label):
    """Bar (i)'s rows: a build graded 2 that left a window, paired one to one
    with a build graded 2 that entered the same window, is a same-grade swap;
    an unpaired exit is a real loss."""
    swap_rows, real_rows = [], []
    for (q, where), w in sorted(windows.items()):
        if not w["left"]:
            continue
        paired = min(len(w["left"]), len(w["entered"]))
        print(f"  window {q} {where}: graded 2 left {len(w['left'])} ({'; '.join(b for b, _ in w['left'])}), "
              f"entered {len(w['entered'])} ({'; '.join(b for b, _ in w['entered']) or 'none'}): swaps {paired}, real losses {len(w['left']) - paired}")
        for j, (b, rank) in enumerate(w["left"]):
            (swap_rows if j < paired else real_rows).append((q, where, b, rank))
    pairs_real = {(q, b) for q, _, b, _ in real_rows}
    pairs_all = {(q, b) for q, _, b, _ in lost}
    print(f"{label}: {len(lost)} rows = {len(swap_rows)} same-grade swaps + {len(real_rows)} real losses; "
          f"{len(pairs_all)} pairs = {len(pairs_all - pairs_real)} swaps only + {len(pairs_real)} with a real loss")
    for q, where, b, rank in real_rows:
        print(f"  REAL LOSS {q} {where}: {b} (rank {rank})")


SIX = ("probes", "labeled", "fresh2", "adv", "review", "eventq")
ALL = SIX + BATTERY

print("== this round's base, h and o1h replays against lane Z3's ==")
print(open(f"{scratch}/check-base.txt").read().strip())

print("\n== (b) byte identity, per variant and capture ==")
for v in VARIANTS[1:]:
    for n, cap, V in captures:
        B, A = V["base"], V[v]
        diff = [k for k in B if not same(B[k], A[k])]
        outside = [k for k in diff if not changed_text(B[k])]
        ch = [k for k in B if changed_text(B[k])]
        print(f"{v} {n}: api {cap['apiVersionStart']} -> {cap['apiVersionEnd']}, corpus {len(cap['corpus'])}; queries {len(B)}: "
              f"byte-identical {len(B) - len(diff)}, changed {len(diff)}; without a phrase or hyphen {len(B) - len(ch)}, of them changed {len(outside)}; "
              f"with one {len(ch)}, of them unchanged {len([k for k in ch if k not in diff])}")
        for k in outside:
            print(f"  CHANGED WITHOUT A PHRASE OR HYPHEN: {k}")

print("\n== (d) lane Z's adversarial probes z09 to z13 ==")
for v in VARIANTS[1:]:
    res = []
    for n, cap, V in captures:
        for k in sorted(k for k in V["base"] if V["base"][k]["id"] in ("z09", "z10", "z11", "z12", "z13")):
            res.append((k, same(V["base"][k], V[v][k])))
    print(f"{v}: {sum(ok for _, ok in res)} of {len(res)} byte-identical" + "".join(f"\n  CHANGED {k}" for k, ok in res if not ok))

print("\n== (b)(i) and (b)(ii): base -> o2, the changed queries of every capture, every move graded ==")
res_all = bars(("base", "o2"), ALL)
summary(("base", "o2"), *res_all, "ALL SEVEN CAPTURES (the binding scope)")
res_six = bars(("base", "o2"), SIX, verbose=False)
summary(("base", "o2"), *res_six, "THE SIX SETS LANE Z3'S BAR READ (no battery)")
res_bat = bars(("base", "o2"), BATTERY, verbose=False)
summary(("base", "o2"), *res_bat, "THE BATTERY ALONE")

print("\n== reported apart: bar (i)'s rows split into same-grade swaps and real losses (base -> o2) ==")
split(res_all[0], res_all[3], "all seven captures")
print()
split(res_six[0], res_six[3], "the six sets")

print("\n== reported apart: vetIdea's five, its size, for every changed query (base, o1h, o2) ==")
for n, cap, V in captures:
    for k in changed(V):
        sizes = [len(V[v][k]["vet"]) for v in ("base", "o1h", "o2")]
        flag = "" if sizes[0] == sizes[2] else ("  (o2 smaller than base)" if sizes[2] < sizes[0] else "  (o2 larger than base)")
        print(f"{n} {k} \"{shown(V['base'][k])}\": {sizes[0]} -> o1h {sizes[1]} -> o2 {sizes[2]}{flag}")

print("\n== reference: base -> o1h (lane Z3's candidate) under the same grades, and its split ==")
res_o1h = bars(("base", "o1h"), ALL, verbose=False)
summary(("base", "o1h"), *res_o1h, "all seven captures")
split(res_o1h[0], res_o1h[3], "o1h, all seven captures")
res_o1h_six = bars(("base", "o1h"), SIX, verbose=False)
split(res_o1h_six[0], res_o1h_six[3], "o1h, the six sets")
print("\n== reference: base -> h ==")
summary(("base", "h"), *bars(("base", "h"), ALL, verbose=False), "all seven captures")

print("\n== reported apart: o1h -> o2, the changed queries where they differ ==")
for n, cap, V in captures:
    for k in changed(V):
        b, a = V["o1h"][k], V["o2"][k]
        if same(b, a):
            continue
        print(f"{n} {k} \"{shown(b)}\": matched keyword {b['route']['keyword']['n']} -> {a['route']['keyword']['n']}, hybrid {b['route']['hybrid']['n']} -> {a['route']['hybrid']['n']}")
        for what, d, how, i, lb, la in moves(b, a):
            g, src = grade(V["base"][k], i)
            print(f"  {how} {what} {'top ' + str(d) if d else 'matched'}: {nm(i)} | grade {g} ({src})")

print("\n== (a) L1-02: q=passkey smart wallet, winners only ==")
for n, cap, V in captures:
    k = "adversarial|z01|winners"
    if k not in V["base"]:
        continue
    for side in ("base", "o1h", "o2"):
        x = V[side][k]
        for mode in ("hybrid", "keyword"):
            ids = x["route"][mode]["ids"]
            on = [i for i in ids if uses.get(i, {}).get("uses")]
            text = [i for i in on if uses[i]["evidence"] == "text"]
            how = {r["id"]: (r["matched"], r.get("similarity")) for r in x["route"][mode]["top20"]}
            print(f"{side} {mode}: matched {len(ids)}: " + "; ".join(
                f"{nm(i)} [{('on-topic, ' + uses[i]['evidence']) if i in on else 'not on-topic' if i in uses else 'UNGRADED'}; matched {how[i][0]}, similarity {how[i][1]}]"
                for i in ids[:10]))
            print(f"    on-topic winners in the first 10: {len([i for i in ids[:10] if i in on])}; in the matched list {len(on)}; by name or summary alone {len(text)}")

print("\n== probes: top 10, base -> o1h -> o2; hybrid graded ==")
table = []
for n, cap, V in captures:
    if n in BATTERY:
        continue
    for k in sorted(k for k in V["base"] if V["base"][k]["id"].startswith("z")):
        b, o, a = V["base"][k], V["o1h"][k], V["o2"][k]
        for mode in ("hybrid", "keyword"):
            lb, lo_, la = (x["route"][mode]["ids"][:10] for x in (b, o, a))
            head = f"{b['id']} \"{shown(b)}\"{' winners' if b['winnersOnly'] else ''} {mode}: matched {b['route'][mode]['n']} -> o1h {o['route'][mode]['n']} -> o2 {a['route'][mode]['n']}"
            if mode == "hybrid" and is_probe(b):
                g = [[probe_grade.get((b["q"], i)) for i in x["route"]["hybrid"]["ids"][:10]] for x in (b, o, a)]
                table.append((b["id"], b["q"], b["winnersOnly"], b["route"]["hybrid"]["n"], o["route"]["hybrid"]["n"], a["route"]["hybrid"]["n"], g))
            if same(b, a):
                print(f"{head}; o2 byte-identical to base")
                continue
            print(head)
            print(f"    base: {'; '.join(nm(i) for i in lb)}")
            print(f"    o1h:  {'; '.join(nm(i) for i in lo_)}")
            print(f"    o2:   {'; '.join(nm(i) for i in la)}")
print("\nprobe | all: matched | all: grade 2 | all: grade 0 | winners: matched | winners: grade 2 | winners: grade 0 (hybrid top 10, base -> o1h -> o2; ungraded counted apart)")
by = {}
for pid, q, w, mb, mo, ma, g in table:
    by.setdefault((pid, q), {})["winners" if w else "all"] = (mb, mo, ma, g)
for (pid, q), val in sorted(by.items()):
    cells = []
    for side in ("all", "winners"):
        mb, mo, ma, (gb, go, ga) = val[side]
        cells += [f"{mb} -> {mo} -> {ma}", f"{gb.count(2)} -> {go.count(2)} -> {ga.count(2)}", f"{gb.count(0)} -> {go.count(0)} -> {ga.count(0)}"]
        if None in gb + go + ga:
            cells[-1] += f" (ungraded {gb.count(None)}, {go.count(None)}, {ga.count(None)})"
    print(f"{pid} {q} | " + " | ".join(cells))

print("\n== battery questions: the battery's named builds (base, o1h, o2) ==")
EXPECT = {
    "sa01": {"must_any 4 of": ["42401", "42507", "46229", "46203", "46264", "45996", "46098", "30648", "25271", "28426", "30911"]},
    "sa02": {"must": ["30648", "25271"], "should": ["28426"], "acceptable": ["32688", "40214", "32404"]},
}
for n, cap, V in captures:
    if n not in BATTERY:
        continue
    for k in sorted(V["base"]):
        b = V["base"][k]
        qid = b["id"].split("-")[0]
        print(f"\n{b['id']} ({'winners only' if b['winnersOnly'] else 'all builds'}): o2 {'byte-identical to base' if same(b, V['o2'][k]) else 'changed'}")
        for mode in ("hybrid", "keyword"):
            for side in ("base", "o1h", "o2"):
                ids = V[side][k]["route"][mode]["ids"]
                parts = []
                for label, want in EXPECT[qid].items():
                    want_ids = [f"dorahacks-buidl-{w}" for w in want]
                    pos = {w: (ids.index(w) + 1 if w in ids else None) for w in want_ids}
                    in10 = sum(1 for p in pos.values() if p and p <= 10)
                    in20 = sum(1 for p in pos.values() if p and p <= 20)
                    inm = sum(1 for p in pos.values() if p)
                    found = ", ".join(f"{nm(w)} {p}" for w, p in pos.items() if p)
                    parts.append(f"{label} ({len(want)}): first 10 {in10}, first 20 {in20}, matched {inm} [{found}]")
                print(f"  {mode} {side}: matched {len(ids)}; " + "; ".join(parts))
