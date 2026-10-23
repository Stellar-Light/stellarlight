"""An independent check of the words the warning names, written apart from
the TypeScript: for every row of a note.mts output where the line fires, each
named word is searched as a whole word (no letter or digit beside it, any
script) in every stored submission's name, summary, track, award and every
declared package, and the corpus words sharing its first letters are listed,
so a related form that is used (cash for cashing) shows.

Usage, from the repository root:
  python3 -I improvements/audits/2026-10-23-nonsense-queries/check-unused.py <capture.json> <note-output.txt>
"""

import collections
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
vocab = collections.Counter(
    w for h in hays for w in re.findall(r"[^\W_]+(?:-[^\W_]+)*", h)
)
print("group | q | word | submissions using it as a whole word | related words used (count)")
for line in open(note):
    cells = line.rstrip("\n").split(" | ")
    if len(cells) != 8 or "yes" not in (cells[6], cells[7]):
        continue
    for word in cells[3].split(", "):
        uses = sum(
            1
            for h in hays
            if re.search(r"(?<![^\W_])" + re.escape(word) + r"(?![^\W_])", h)
        )
        stem = word[: max(4, len(word) - 3)]
        related = [
            f"{w} ({n})" for w, n in vocab.most_common() if w.startswith(stem) and w != word
        ][:4]
        print(f"{cells[0]} | {cells[1]} | {word} | {uses} | {', '.join(related) or 'none'}")
