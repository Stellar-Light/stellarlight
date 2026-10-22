"""Merge a test file where the PR changed only one import line and appended tests.

  python3 -I merge_appended_tests.py <path> <merge-base-rev> <pr-rev> <main-rev> <module> <union-import-line>

<module> is the import source both sides changed (for example ../vet-idea). The
result is main's file with that import replaced by <union-import-line>, plus the
tail the PR appended. Stops if the PR changed anything else in the file.
"""
import subprocess, sys
path, base, pr, main, module, union = sys.argv[1:7]
show = lambda rev: subprocess.run(["git", "show", f"{rev}:{path}"], capture_output=True, text=True, check=True).stdout
is_import = lambda l: l.startswith("import {") and f'from "{module}"' in l
drop_import = lambda t: "\n".join(l for l in t.split("\n") if not is_import(l))
b, p, m = show(base), show(pr), show(main)
bb, pb = drop_import(b).rstrip("\n"), drop_import(p)
assert pb.startswith(bb), "the PR changed more than the import line and the tail"
tail = pb[len(bb):]
lines = m.split("\n")
idx = [i for i, l in enumerate(lines) if is_import(l)]
assert len(idx) == 1, f"expected one import from {module} on main, found {len(idx)}"
lines[idx[0]] = union
out = "\n".join(lines).rstrip("\n") + tail
open(path, "w").write(out if out.endswith("\n") else out + "\n")
print(f"appended {tail.count(chr(10))} lines from the PR")
