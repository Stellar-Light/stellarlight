"""Read-only: fetch named files of a repo through the contents API (gh CLI)
and print their lines that mention stellar or soroban. For labels."""
import base64
import json
import subprocess
import sys
import time

repo = sys.argv[1]
for path in sys.argv[2:]:
    p = subprocess.run(["gh", "api", f"repos/{repo}/contents/{path}"], capture_output=True, text=True)
    time.sleep(0.7)
    print("==", path)
    try:
        text = base64.b64decode(json.loads(p.stdout)["content"]).decode("utf8", "replace")
    except Exception:
        print("   UNREAD")
        continue
    for i, line in enumerate(text.splitlines()):
        low = line.lower()
        if "stellar" in low or "soroban" in low:
            print(f"   {i+1}: {line.strip()[:140]}")
