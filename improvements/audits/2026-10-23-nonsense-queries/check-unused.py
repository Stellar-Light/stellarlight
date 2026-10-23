"""An independent check of every claim the builds route's line about unused
words makes, written apart from the TypeScript. For each line in a note.mts
output it reads back:

- each word named in "searched in q (...)": searched as a whole word (no
  letter or digit beside it, any script) in every stored submission's name,
  summary, track, award and every declared package; it must have 0 uses;
- each related form named after "used:": it must have at least 1 use;
- each spelling named ("X, used in submissions, is one edit from w"): it
  must have at least 1 use and be one edit from w (a letter added, dropped
  or changed, or two adjacent letters swapped).

Usage, from the repository root:
  python3 -I improvements/audits/2026-10-23-nonsense-queries/check-unused.py <capture.json> <note-output.txt>
"""

import json
import re
import sys

capture, note = sys.argv[1], sys.argv[2]
corpus = json.load(open(capture))["corpus"]
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
    for form, word in re.findall(
        r"\(?([^\s(;]+), used in submissions, is one edit from ([^\s);]+)", text
    ):
        n, d = uses(form), edits(form, word)
        checks.append((f"spelling: {form} for {word}", n > 0 and d == 1, f"{n} uses, {d} edits"))
    for claim, ok, detail in checks:
        bad += not ok
        print(f"{cells[0]} | {cells[1]} | {cells[2]} | {claim} | {'ok' if ok else 'FALSE'} ({detail})")
print(f"\nfalse claims: {bad}")
