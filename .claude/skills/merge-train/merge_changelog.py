"""Entry-level merge of src/lib/changelog.ts while merging origin/main into a PR branch.

  python3 -I merge_changelog.py <merge-base-rev> <pr-rev> <main-rev> [--version spec@X]

Writes src/lib/changelog.ts = main's file with the PR's own new entries (present in
<pr-rev>, absent from <merge-base-rev>) inserted at the top of CHANGELOG. With
--version, the PR's own entries' `version: "spec@..."` lines are set to that value.
"""
import subprocess, sys
base, pr, main = sys.argv[1:4]
ver = sys.argv[sys.argv.index("--version") + 1] if "--version" in sys.argv else None
PATH = "src/lib/changelog.ts"
HEAD = "export const CHANGELOG: ChangelogEntry[] = [\n"

def show(rev):
    return subprocess.run(["git", "show", f"{rev}:{PATH}"], capture_output=True, text=True, check=True).stdout

def entries(text):
    i = text.index(HEAD) + len(HEAD)
    lines = text[i:].splitlines(keepends=True)
    out, cur = [], None
    for ln in lines:
        if cur is None:
            if ln == "\t{\n":
                cur = [ln]
            elif ln.startswith("];"):
                break
            continue
        cur.append(ln)
        if ln == "\t},\n":
            out.append("".join(cur)); cur = None
    assert cur is None, "unterminated entry"
    return out

base_e, pr_e, main_text = set(entries(show(base))), entries(show(pr)), show(main)
own = [e for e in pr_e if e not in base_e]
if ver:
    import re
    own = [re.sub(r'version: "spec@[0-9.]+"', f'version: "{ver}"', e) for e in own]
main_e = set(entries(main_text))
own = [e for e in own if e not in main_e]
i = main_text.index(HEAD) + len(HEAD)
open(PATH, "w").write(main_text[:i] + "".join(own) + main_text[i:])
print(f"inserted {len(own)} entr{'y' if len(own) == 1 else 'ies'} from the PR on top of main's {len(main_e)}")
