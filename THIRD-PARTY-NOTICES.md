# Third-party notices

This repository is licensed under the MIT License (see [LICENSE](./LICENSE)).
The files below include code from other projects, which keeps its own
license.

## scripts/eval/raven-gate-replica.ts

Portions are ported, with changes, from
[stellar-experimental/stellar-raven](https://github.com/stellar-experimental/stellar-raven)
at commit b1dc866, licensed under the Apache License, Version 2.0. A copy of
that license is in [LICENSES/Apache-2.0.txt](./LICENSES/Apache-2.0.txt).

Changes: Raven's catalog search, the Scout half of its catalog builder, and
its routing-gate grading were ported into one TypeScript module that reads a
Raven checkout as data at run time; result signatures and advisories, which
never change hits, were left out.

Raven's field scorer, ported as part of that, is itself adapted from
`@cloudflare/codemode` 0.4.2 (`src/connectors/search.ts`), MIT License,
Copyright (c) 2025 Cloudflare, Inc. A copy of that license is in
[LICENSES/MIT-cloudflare-agents.txt](./LICENSES/MIT-cloudflare-agents.txt).
