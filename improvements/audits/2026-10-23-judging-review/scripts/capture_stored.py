"""Read-only: save live reviewSubmission bodies, byte for byte, for stored
submissions requested with no hackathon parameter. apiVersion before and
after. Spaced 2 s."""
import json
import os
import sys
import time
import urllib.parse
import urllib.request

out = sys.argv[1]
os.makedirs(out, exist_ok=True)


def get(url):
    req = urllib.request.Request(url, headers={"user-agent": "sl-lane-j2-probe"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.status, r.read()


print("apiVersion", json.loads(get("https://stellarlight.xyz/api/status")[1]).get("apiVersion"))
for i, link in enumerate(sys.argv[2:]):
    time.sleep(2)
    q = urllib.parse.quote(link, safe="")
    status, body = get(f"https://stellarlight.xyz/api/hackathons/review?link={q}")
    with open(os.path.join(out, f"stored-{i}.json"), "wb") as f:
        f.write(body)
    with open(os.path.join(out, f"stored-{i}.link"), "w") as f:
        f.write(link)
    print(link, status, len(body), "bytes")
time.sleep(2)
print("apiVersion", json.loads(get("https://stellarlight.xyz/api/status")[1]).get("apiVersion"))
