"""Compare two replay outputs per query: identical or changed, and whether the query holds a targeted shape.
python3 -I compare.py base.json q2.json -> report on stdout"""
import json, re, sys, unicodedata
a = {x["key"]: x for x in json.load(open(sys.argv[1]))["queries"]}
b = {x["key"]: x for x in json.load(open(sys.argv[2]))["queries"]}
STOP = None
def core(t): return re.sub(r"^[^\w]+|[^\w]+$", "", t, flags=re.U).replace("_", "") if t else t
def tokens(q):
    q = q.lower().replace("?", " ")
    out = []
    for t in q.split():
        out.append(t)
        out += [p for p in re.split(r"[_-]", t) if p]
    return out
def targeted(q):
    why = []
    for t in q.lower().split():
        c = re.sub(r"^[^\w]+|[^\w]+$", "", t, flags=re.U)
        if c != t and not (t.endswith("?")): why.append(f"edge:{t}")
        if not re.search(r"[^\W_]", t, flags=re.U): why.append(f"noletter:{t}")
    for t in re.split(r"[\s_\-]+", q.lower().replace("?", " ")):
        c = re.sub(r"^[^\w]+|[^\w]+$", "", t, flags=re.U)
        if len(c) == 3: why.append(f"three:{c}")
    return sorted(set(why))
same = changed = 0; untargeted_changed = []; rows = []
for k in a:
    x, y = a[k], b[k]
    fields = lambda r: {k2: r[k2] for k2 in ("route", "plain", "vet", "brief")}
    eq = json.dumps(fields(x), sort_keys=True) == json.dumps(fields(y), sort_keys=True)
    t = targeted(x["q"])
    if eq: same += 1; continue
    changed += 1
    rk, ry = x["route"]["keyword"], y["route"]["keyword"]
    rows.append((x["q"], t, rk["n"], ry["n"], rk["warning"], ry["warning"]))
    if not t: untargeted_changed.append(x["q"])
print(f"queries {len(a)}: identical {same}, changed {changed}, changed without a targeted shape {len(untargeted_changed)}")
for q in untargeted_changed: print("  UNTARGETED CHANGE:", repr(q))
tq = sum(1 for k in a if targeted(a[k]["q"]))
print(f"queries with a targeted shape: {tq}")
for q, t, n0, n1, w0, w1 in rows:
    print(f"- {q!r} {t} keyword rows {n0} -> {n1}")
    if w0 != w1: print(f"    warning: {w0!r}\n          -> {w1!r}")
