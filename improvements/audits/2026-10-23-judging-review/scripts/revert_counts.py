"""Put the pre-fix counts back into hackathon-judging.ts (each partial-read
count served as a length again), to show the regression test fails. The
caller restores the file from its saved copy."""
p = "src/lib/hackathon-judging.ts"
s = open(p).read()
swaps = [
    ("m.unread ? null : values.length", "values.length"),
    ("m.cargoUnread ? null : m.contractCrates.length", "m.contractCrates.length"),
    ("rd.truncated ? null : rd.contractIds.length", "rd.contractIds.length"),
    ("t.complete ? t.ci.length : null", "t.ci.length"),
]
for old, new in swaps:
    assert old in s, old
    s = s.replace(old, new)
open(p, "w").write(s)
print("pre-fix counts in place:", len(swaps))
