"""Masked triage of a redacted gitleaks JSON report. Never prints a secret value.

  python3 -I triage.py <report.json>

Run from the repository root. For each finding prints the rule, file and lines,
commit, date, fingerprint, and the shape of each long token in the match: an
identifier-type prefix (app, tbl, viw, rec, fld) when present, then its length.
"""
import json, re, subprocess, sys

ID_PREFIXES = ("app", "tbl", "viw", "rec", "fld")
for i, f in enumerate(json.load(open(sys.argv[1])), 1):
    text = subprocess.run(["git", "show", f"{f['Commit']}:{f['File']}"], capture_output=True, text=True).stdout
    lines = text.split("\n")[f["StartLine"] - 1 : f["EndLine"]]
    span = lines[0][f["StartColumn"] - 1 : f["EndColumn"]] if len(lines) == 1 else "\n".join(lines)
    shapes = [(t[:3] if t[:3] in ID_PREFIXES else "") + f"#{len(t)}" for t in re.findall(r"[A-Za-z0-9_\-]{12,}", span)]
    print(f"{i:2d} {f['RuleID']} {f['File']}:{f['StartLine']}-{f['EndLine']} {f['Commit'][:8]} {f['Date'][:10]} {f['Fingerprint']} shapes={shapes}")
