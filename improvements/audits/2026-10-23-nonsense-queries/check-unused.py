"""An independent check of every claim the builds route's line about unused
words makes, written apart from the TypeScript. For each line in a note.mts
output it reads back:

- each word named in "searched in q (...)": searched as a whole word (no
  letter or digit beside it, any script) in every stored submission's name,
  summary, track, award and every declared package; it must have 0 uses;
- each related form named after "used:": it must have at least 1 use;
- each spelling named ("X is a used word one edit from w"): it must
  have at least 1 use and be one edit from w (a letter added, dropped or
  changed, or two adjacent letters swapped);
- each "N builds matched by name for W, or inside a longer word for V,
  are not listed", when the two replays (replay.mts) before and after rule L
  are given: exactly N builds the before replay listed are missing after,
  the words they matched are W and V (for a labeled idea, whose replay
  keeps no matched words, the count alone), and for each word of V some
  name among them holds it (or it with s added or dropped) and none holds
  it as a whole word.

Usage, from the repository root:
  python3 -I improvements/audits/2026-10-23-nonsense-queries/check-unused.py <capture.json> <note-output.txt> [<before.json> <after.json>]
"""

import json
import re
import sys

capture, note = sys.argv[1], sys.argv[2]
corpus = json.load(open(capture))["corpus"]
name_of = {r["id"]: (r["name"] or "").lower() for r in corpus}
replays = [json.load(open(f)) for f in sys.argv[3:5]]


def removed(q, mode):
    """Builds the before replay lists for q in this mode and the after one does not."""
    if len(replays) < 2:
        return None
    rows = []
    for r in replays:
        found = [x for x in r["extra"] if x["q"] == q] or [
            {mode: [{"id": i, "matched": None} for i in x[mode]["ids"]]}
            for x in r["ideas"]
            if x["idea"] == q
        ]
        rows.append({y["id"]: y.get("matched") for y in found[0][mode]} if found else {})
    return [(i, m) for i, m in rows[0].items() if i not in rows[1]]
hays = [
    " ".join(
        [r["name"] or "", r["description"] or "", r["track"] or "", r["award"] or ""]
        + (r.get("stack") or [])
    ).lower()
    for r in corpus
]


def uses(word):
    pattern = re.compile(r"(?<![^\W_])" + re.escape(word) + r"(?![^\W_])")
    return sum(1 for h in hays if pattern.search(h))


def edits(a, b):
    """Optimal string alignment distance: a swap of adjacent letters is one."""
    d = [[i + j if i * j == 0 else 0 for j in range(len(b) + 1)] for i in range(len(a) + 1)]
    for i in range(1, len(a) + 1):
        for j in range(1, len(b) + 1):
            d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] != b[j - 1]))
            if i > 1 and j > 1 and a[i - 1] == b[j - 2] and a[i - 2] == b[j - 1]:
                d[i][j] = min(d[i][j], d[i - 2][j - 2] + 1)
    return d[-1][-1]


print("group | q | mode | claim | checked")
bad = 0
for line in open(note):
    cells = line.rstrip("\n").split(" | ")
    if len(cells) != 5 or cells[4] == "none" or cells[2] not in ("keyword", "hybrid"):
        continue
    text = cells[4]
    checks = []
    for word in re.search(r"searched in q \((.*?)\) occur", text).group(1).split(", "):
        n = uses(word)
        checks.append((f"unused: {word}", n == 0, f"{n} uses"))
    related = re.search(r"; (?:a related form is|related forms are) used: (.*)$", text)
    if related:
        for part in related.group(1).split("; "):
            forms, word = part.rsplit(" for ", 1)
            for form in re.split(r", | and ", forms):
                n = uses(form)
                checks.append((f"related: {form} for {word}", n > 0, f"{n} uses"))
    held = re.search(r"; (\d+) builds? matched (.+?),? (?:is|are) not listed", text)
    if held:
        gone = removed(cells[1], cells[2])
        parts = held.group(2).split(", or ")
        inside = [
            w
            for p in parts
            if p.startswith("inside a longer word for ")
            for w in re.split(r", | or ", p[len("inside a longer word for ") :])
        ]
        words = {
            w
            for p in parts
            for w in re.split(r", | or ", re.sub(r"^(by name|inside a longer word) for ", "", p))
        }
        for w in inside:
            forms = {w, w + "s", w[:-1] if w.endswith("s") else w}
            whole = [
                i
                for i, _ in (gone or [])
                if any(re.search(r"(?<![^\W_])" + re.escape(f) + r"(?![^\W_])", name_of.get(i, "")) for f in forms)
            ]
            inside_any = [i for i, _ in (gone or []) if any(f in name_of.get(i, "") for f in forms)]
            ok = not whole and bool(inside_any)
            checks.append((f"inside a longer word: {w}", ok, f"{len(inside_any)} names hold it, {len(whole)} whole"))
        if gone is None:
            checks.append((f"withheld: {held.group(0)[2:]}", True, "unchecked, no replays given"))
        else:
            core = lambda t: re.sub(r"^[\W_]+|[\W_]+$", "", t)
            got = {core(t) for _, m in gone for t in (m or [])}
            ok = len(gone) == int(held.group(1)) and (got == words or all(m is None for _, m in gone))
            checks.append((f"withheld: {held.group(1)} for {', '.join(sorted(words))}", ok, f"{len(gone)} removed, matched {sorted(got) or 'not kept'}"))
    for form, word in re.findall(
        r"\(?([^\s(;]+) is a used word one edit from ([^\s);]+)", text
    ):
        n, d = uses(form), edits(form, word)
        checks.append((f"spelling: {form} for {word}", n > 0 and d == 1, f"{n} uses, {d} edits"))
    for claim, ok, detail in checks:
        bad += not ok
        print(f"{cells[0]} | {cells[1]} | {cells[2]} | {claim} | {'ok' if ok else 'FALSE'} ({detail})")
print(f"\nfalse claims: {bad}")
