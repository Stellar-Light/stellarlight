"""Read-only label helper: print every README line that holds a link or a
56-character C address, numbered, from the dump, for reading by eye. The
first 100,000 bytes are marked, since a read takes no more."""
import os
import re
import sys

OUT = os.environ.get("DUMPS", "dumps")
d = sys.argv[1]
name = next(f for f in os.listdir(os.path.join(OUT, d)) if re.match(r"file__readme", f, re.I))
text = open(os.path.join(OUT, d, name), encoding="utf8").read()
print(d, name, len(text.encode("utf8")), "bytes")
ids = sorted(set(re.findall(r"\bC[A-Z2-7]{55}\b", text)))
print("C addresses:", ids)
at = 0
for i, ln in enumerate(text.splitlines(), 1):
    at += len(ln.encode("utf8")) + 1
    if re.search(r"https?://|<a\s", ln):
        print(f"{i:4}{' ' if at <= 100_000 else '+'} {ln.strip()[:220]}")
