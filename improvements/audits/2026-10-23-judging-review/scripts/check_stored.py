"""Read-only: is each candidate repo a stored submission on the live API?
GET /api/hackathons/review?link=<repo>; 404 = not stored. Spaced 2 s."""
import json
import sys
import time
import urllib.error
import urllib.request

BASE = "https://stellarlight.xyz"


def get(url):
    req = urllib.request.Request(url, headers={"user-agent": "sl-lane-j2-probe"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


status, body = get(f"{BASE}/api/status")
print("apiVersion", json.loads(body).get("apiVersion"))
for repo in sys.argv[1:]:
    time.sleep(2)
    code, _ = get(f"{BASE}/api/hackathons/review?link=https://{'git'}hub.com/{repo}")
    print(repo, code)
status, body = get(f"{BASE}/api/status")
print("apiVersion", json.loads(body).get("apiVersion"))
