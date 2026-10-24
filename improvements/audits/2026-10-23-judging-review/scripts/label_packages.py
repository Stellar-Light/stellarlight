"""Read-only label helper: fetch the manifests a read takes (the order in
manifest_order.py) through the contents API at the dumped commit, and list
every dependency each declares, marking those on Scout's Stellar list (the
list as stellar-deps.ts publishes it, re-typed here) and soroban-sdk crates
that build a cdylib. The marks are for the eye; the label is written by
hand from this print and the files."""
import base64
import json
import os
import re
import subprocess
import sys
import time

OUT = os.environ.get("DUMPS", "dumps")
NPM_SCOPES = ("@stellar/", "@creit.tech/", "@creit-tech/", "@blend-capital/", "@soroswap/",
              "@phoenix-protocol/", "@script3/", "@reflector-network/", "@defindex/", "@x402/",
              "@sorobanbyexample/", "@colibri/", "@stellar-indexer/")
NPM_EXACT = {"stellar-sdk", "stellar-base", "soroban-client", "passkey-kit", "passkey-kit-sdk",
             "stellar-wallets-kit", "stellar-hd-wallet", "sorosan-sdk", "mercury-sdk", "as-soroban-sdk"}
CARGO_EXACT = {"soroban-sdk", "soroban-token-sdk", "soroban-fixed-point-math", "soroban-decimal",
               "blend-contract-sdk", "sep-40-oracle", "sep-41-token", "stellar-xdr", "stellar-strkey",
               "stellar-baselib"}
CARGO_PREFIX = ("soroban-env-", "soroban-spec", "stellar-contract-")
MAN = re.compile(r"(^|/)(package\.json|cargo\.toml|go\.mod|pubspec\.yaml|package\.swift|podfile|build\.gradle(\.kts)?"
                 r"|libs\.versions\.toml|requirements\.txt|pyproject\.toml|setup\.py|setup\.cfg|pom\.xml|composer\.json)$", re.I)
VEND = re.compile(r"(^|/)(node_modules|vendor|target|dist|build|\.next|out)/")
DEF = re.compile(r"(^|/)(examples?|tests?|fixtures?|benches?|templates?|test[-_]wasms)(/|$)", re.I)

repo, d = sys.argv[1], sys.argv[2]
lines = open(os.path.join(OUT, d, "tree.txt")).read().splitlines()
sha = re.search(r"commit=(\w+)", lines[0]).group(1)
paths = lines[1:]
man = sorted([p for p in paths if MAN.search(p) and not VEND.search(p)],
             key=lambda p: (bool(DEF.search(p)), p.count("/"), p))
listed = set()
for p in man[:12]:
    r = subprocess.run(["gh", "api", f"repos/{repo}/contents/{p}?ref={sha}"], capture_output=True, text=True)
    time.sleep(0.6)
    try:
        text = base64.b64decode(json.loads(r.stdout)["content"]).decode("utf8", "replace")
    except Exception:
        print("==", p, "UNREAD")
        continue
    base = p.rsplit("/", 1)[-1].lower()
    deps, mark = [], []
    if base == "package.json":
        j = json.loads(text)
        for k in ("dependencies", "devDependencies", "peerDependencies"):
            for n, v in (j.get(k) or {}).items():
                deps.append(f"{n}@{v}")
                if n in NPM_EXACT or n.startswith(NPM_SCOPES):
                    mark.append(n)
    elif base == "cargo.toml":
        # Sections by hand (no TOML library on this Python): keys under a
        # dependencies table, [dependencies.name] headers, and [lib]'s crate-type.
        sec = ""
        for ln in text.splitlines():
            h = re.match(r"^\s*\[([^\]]+)\]\s*$", ln)
            if h:
                sec = h.group(1).strip()
                sub = re.match(r"^(?:workspace\.|target\..+\.)?(?:dev-|build-)?dependencies\.([A-Za-z0-9_-]+)$", sec)
                if sub:
                    deps.append(sub.group(1))
                continue
            if re.match(r"^(?:workspace\.|target\..+\.)?(?:dev-|build-)?dependencies$", sec):
                k = re.match(r"^\s*([A-Za-z0-9_-]+)\s*(?:=|\.\s*workspace)", ln)
                if k:
                    deps.append(k.group(1))
            if sec == "lib" and re.match(r"^\s*crate-type\s*=.*cdylib", ln):
                mark.append("[cdylib]")
        mark += [n for n in deps if n in CARGO_EXACT or n.startswith(CARGO_PREFIX)]
    else:
        hits = [ln.strip() for ln in text.splitlines() if re.search(r"stellar|soroban", ln, re.I)]
        mark += [f"line: {h[:80]}" for h in hits]
    listed.update(m for m in mark if not m.startswith(("[", "line:")))
    print("==", p, "| on list:", sorted(set(mark)))
print(len(man), "manifests,", min(12, len(man)), "read; on the list across them:", len(listed), sorted(listed))
