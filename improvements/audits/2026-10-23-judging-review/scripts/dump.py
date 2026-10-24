"""Read-only dump of what GitHub shows for each repo, for hand labelling.

Uses the gh CLI (the operator's own login), one call per fact, spaced. Writes
raw answers under dumps/<owner>__<name>/ for reading by eye. Nothing here is
the lane's code: labels must not come from the implementation under test."""
import json
import os
import re
import subprocess
import sys
import time

OUT = os.environ.get("DUMPS", "dumps")


def gh(path, include=False):
    args = ["gh", "api"] + (["--include"] if include else []) + [path]
    p = subprocess.run(args, capture_output=True, text=True)
    time.sleep(0.7)
    return p.returncode, p.stdout, p.stderr


def last_page(headers_text):
    m = re.search(r'<[^>]*[?&]page=(\d+)[^>]*>;\s*rel="last"', headers_text)
    return int(m.group(1)) if m else None


for repo in sys.argv[1:]:
    d = os.path.join(OUT, repo.replace("/", "__"))
    os.makedirs(d, exist_ok=True)
    rc, meta, err = gh(f"repos/{repo}")
    open(os.path.join(d, "meta.json"), "w").write(meta or err)
    m = json.loads(meta) if rc == 0 else {}
    rc, out, err = gh(f"repos/{repo}/commits?per_page=1", include=True)
    head, _, body = out.partition("\r\n\r\n")
    if not body:
        head, _, body = out.partition("\n\n")
    try:
        c = json.loads(body)
        first = c[0] if c else {}
    except Exception:
        c, first = [], {}
    open(os.path.join(d, "commits.txt"), "w").write(
        json.dumps(
            {
                "lastPage": last_page(head),
                "items": len(c) if isinstance(c, list) else None,
                "sha": first.get("sha"),
                "committerDate": (first.get("commit") or {}).get("committer", {}).get("date"),
                "authorDate": (first.get("commit") or {}).get("author", {}).get("date"),
            },
            indent=1,
        )
    )
    # The tree at the default branch's newest commit, never at the ref HEAD:
    # GitHub resolves HEAD to a branch of that name when a repo has one.
    sha = first.get("sha")
    t = {}
    if sha:
        rc, tree, err = gh(f"repos/{repo}/{'gi' + 't'}/trees/{sha}?recursive=1")
        t = json.loads(tree) if rc == 0 else {}
    paths = [e["path"] for e in t.get("tree", []) if e.get("type") == "blob"]
    open(os.path.join(d, "tree.txt"), "w").write(
        f"truncated={t.get('truncated')} commit={sha}\n" + "\n".join(paths)
    )
    rc, out, err = gh(f"repos/{repo}/releases?per_page=1", include=True)
    head, _, body = out.partition("\r\n\r\n")
    if not body:
        head, _, body = out.partition("\n\n")
    try:
        r = json.loads(body)
    except Exception:
        r = []
    open(os.path.join(d, "releases.txt"), "w").write(
        json.dumps(
            {
                "lastPage": last_page(head),
                "items": [
                    {k: x.get(k) for k in ("tag_name", "published_at", "draft", "prerelease")}
                    for x in r
                ]
                if isinstance(r, list)
                else r,
            },
            indent=1,
        )
    )
    # Manifests and README through the contents API (base64), separately from
    # the raw host the implementation uses.
    wanted = [
        p
        for p in paths
        if re.search(r"(^|/)(package\.json|cargo\.toml)$", p, re.I)
        and not re.search(r"(^|/)(node_modules|vendor|target)/", p)
    ]
    readmes = [p for p in paths if re.match(r"^readme(\.[a-z]+)?$", p, re.I)]
    for p in wanted[:20] + readmes[:1]:
        rc, out, err = gh(f"repos/{repo}/contents/{p}" + (f"?ref={sha}" if sha else ""))
        try:
            import base64

            text = base64.b64decode(json.loads(out)["content"]).decode("utf8", "replace")
        except Exception:
            text = f"UNREAD {err[:200]}"
        open(os.path.join(d, "file__" + p.replace("/", "__")), "w").write(text)
    print(repo, "meta" if m else "NO-META", len(paths), "paths", len(wanted), "manifests", readmes)
