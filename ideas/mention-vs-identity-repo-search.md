# Mention-vs-identity for repo search

**Projects from:** the 2026-07-19 custody fix on PROJECT search (#590/#592) applied forward. **Status: SHIPPED 2026-07-20 (#621)** — ported `identityZone` + the identity-over-mention sort key + candidate-pool admission to repo-search.ts; regression-guarded with mock-payload rank tests.

**What:** the same class exists on repos: a repo whose README merely MENTIONS an anchor noun outranks the repo that IS the thing when the latter misses a secondary token. Port `identityZone` (name/topics/description-lead) + the identity-over-mention sort key + under-fill admission to repo-search.ts.

**Why:** the answer-key eval already showed name-token luck dominating (wallet vertical 0/5 flagship recall pre-#595); floats patch the curated verticals but the long tail has no float — the structural fix is the same one project search just got.

**How:** same three pieces as #590/#592, adapted to repo fields; regression-guard with the existing mock-payload rank tests.
