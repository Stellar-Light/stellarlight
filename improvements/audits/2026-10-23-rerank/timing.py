# Read-only GETs: wall time of the builds route in keyword and hybrid mode, and vet-idea.
import json
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

B = "https://www.stellarlight.xyz"


def get(path):
    t = time.monotonic()
    with urllib.request.urlopen(B + path, timeout=30) as r:
        body = r.read()
        st = r.headers.get("Server-Timing")
    return time.monotonic() - t, body, st


def version():
    _, body, _ = get("/api/status")
    return json.loads(body).get("apiVersion")


print("status start", version(), datetime.now(timezone.utc).strftime("%H:%M:%SZ"))
ideas = [
    "AI agent that pays for API calls with USDC using x402",
    "passkey smart wallet so users never handle a seed phrase",
    "prediction market on Soroban",
    "remittance app",
    "tokenized real estate with fractional ownership",
    "savings circle with automatic payouts",
]
for q in ideas:
    e = urllib.parse.quote(q)
    for mode in ["keyword", "hybrid"]:
        t, _, st = get(f"/api/hackathons/builds?q={e}&mode={mode}&limit=5")
        print(f"builds {mode} {t:.2f}s server-timing={st} | {q}")
        time.sleep(1.5)
    t, _, st = get(f"/api/vet-idea?q={e}")
    print(f"vet-idea {t:.2f}s server-timing={st} | {q}")
    time.sleep(1.5)
print("status end", version(), datetime.now(timezone.utc).strftime("%H:%M:%SZ"))
