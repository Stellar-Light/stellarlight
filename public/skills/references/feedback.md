---
name: stellar-scout-feedback
description: Optional, opt-in companion to the Stellar Scout skill. Sends a report about a wrong answer, missing data, a bug or a suggestion to the stellarlight.xyz curator queue.
side-effects: Writes. Each submission creates one row in the stellarlight.xyz curator queue.
read-only: false
opt-in: true
---

# Stellar Scout: feedback (optional write)

The Stellar Scout skill (`SKILL.md`, `references/api-reference.md`, `references/examples.md`) is read-only. This file is not part of it. It documents the one Scout operation that writes, plus the read that describes that write's shape.

Load this file only when your host allows write operations and the user wants to report a problem. Where your host exposes only reads, ignore this file and tell the user what looked wrong instead.

---

## `POST /api/feedback`
Writes to stellarlight.xyz. An in-skill feedback channel: an agent can report a bug, missing data, a wrong answer or a suggestion without leaving the workflow.

**Body:**
```json
{
  "kind": "bug" | "missing-data" | "wrong-answer" | "suggestion" | "other",
  "message": "10-4000 chars describing the issue concretely",
  "context": {
    "query": "optional: the user query that triggered the issue",
    "endpoint": "optional: the /api/* endpoint that misbehaved",
    "skillVersion": "optional: SKILL.md frontmatter version",
    "agentName": "optional: claude-code | codex | openclaw | etc."
  }
}
```

**Returns:** `{ok: true, id, message}` on 201; `{error, validKinds?, hint?, example?}` on 400; `{error, hint}` on 429.

**Rate limit:** 6 requests / minute / IP (lower than read endpoints; feedback shouldn't fire-hose).

**When to call this:** when you (the agent) detect a quality issue worth a curator's eye; bad citation, missing protocol, wrong tag, unexpected 0-result for a real question. Don't fire on every empty response; reserve for things a human reviewer should investigate.

Tell the user when you submit one: *"I've also flagged this as a quality issue via /api/feedback so curators can fix it."*

---

## `GET /api/feedback`
Returns the **schema** for `POST /api/feedback` (valid `kind` values, required fields, size limits) so an agent can self-discover the shape without reading this doc. No side effects of its own; it is only useful where the write above is available.
