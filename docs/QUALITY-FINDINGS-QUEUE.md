# Quality findings queue — the 56 open ledger rows

> **STATUS 2026-08-31 — most of this is done.** Worked in PR #1133; each item
> below is annotated where it was actioned. Summary of what changed and what
> was deliberately not:
>
> | cause | verdict |
> |---|---|
> | C1 `nameMatchScore` | FIXED. Measured against all 30 recorded failures rather than estimated: 27 now score 3. The proposed unrestricted containment would have broken the existing mention-vs-identity guards, so the rule is multi-word-only, plus an intercaps branch for `zkCross`. |
> | C2 limit-dependence | FIXED, and the missing consumer added — the live canary now asserts limit-independence over the keyword-admitted set, and was confirmed to catch the bug before the fix landed. |
> | C3 fabricated canaries | FIXED. Ledger re-run and the diff inspected: exactly those 7 cleared, 56 → 48 open. |
> | C4 routing drops `class` | FIXED, gated on length so the one genuine sentence-shaped routing finding survives. |
> | C5 `listContracts` | FIXED via `notFor`, keywords left entity-shaped. |
> | C6 mis-specified probes | FIXED. `octoplace` re-pointed to `freighter` rather than deleted; the ramps row got the tiebreaker instead of a changed expectation. |
> | C7 leaked project names | FIXED, and the class swept: all 287 single-token keywords checked live, 17 are project names, 15 correctly sit on the op that serves them. `dune` on getLeaderboard was the third defect. |
> | C8 `getRfps` worker vocabulary | FIXED. |
> | C9 `searchProjects` dilution | PARTIAL, deliberately. The directional `notFor` shipped; cutting 77 keywords needs a measured before/after against a scorer whose field weighting is not published. Scheduled in PLAN §6c. |
> | C10 bare-name routing | NOT DONE. The queue itself says "measure before editing" and the measurement needs Raven's scorer. Scheduled. |
> | C11 GAP means one surface | FIXED. Sibling surfaces are checked before a GAP is filed. |
> | gap matrix, 2 matcher defects | FIXED and verified live: the absence list moved 49 → 47, exactly as predicted. |
> | FxDAO cross-lane join | BUILT, and it found something different. FxDAO is not below the DefiLlama floor today — it is counted as MATCHED, because three rows we hold (usdx, eurx, gbpx) share the domain `fxdao.io`. Those are the protocol's assets, not the protocol. Of 16 domain-only matches, 14 are legitimate (Blend Pools → blend, Sushi Stellar → sushi), so flagging all of them would create 14 false findings. |
>
> Two things this queue got wrong, worth recording: the C1 fix as proposed
> fails three existing tests, and the C2 caveat about the semantic top-up was
> right and load-bearing — a naive limit-independence assertion fails a
> correctly-fixed route.


Measured 2026-08-30/31 against `origin/main` `improvements/ledger/findings.json` and the live API at
`https://stellarlight.xyz`. Worktree: `/Users/shubhbrar/Downloads/sl-iso`. Read-only throughout — no edits,
no commits, no `--write`.

Ledger shape, re-counted from the file (not from the brief):

| dimension | counts |
|---|---|
| source | engine-a-recall 26, raven-routing 16, engine-d-demand 10, nightly-battery 3, engine-e-contract 1 |
| surface | retrieval 28, consumer 16, directory 8, corpus 3, contract 1 |
| severity | medium 50, low 4, high 2 |
| failureMode | recall-miss 26, routing-miss 9, coverage-gap 8, demand-routing-miss 7, battery-coverage-weak 3, demand-miss 2, ambiguous-contract 1 |

---

## 1. What actually blocks us

**46 of the 56 open findings are explained by 10 root causes, and 3 of those causes explain 30 of them.**
Two code defects in one file each account for 23 — a name-matching asymmetry in
`src/lib/project-search-match.ts` (19) and a page-size-dependent admission gate in
`src/app/api/projects/search/route.ts` (4). The more uncomfortable number is the second one:
**16 of 56 (29%) are not product defects at all** — 7 are our own hallucination-guard canaries laundered back
in as consumer demand, 6 are curation gaps that engine-d already classified as "not a ranking bug" before
raven-routing re-filed them as routing misses, 2 are eval probes whose expected answer contradicts our own
data and our own published contract, and 1 was answered correctly by a sibling surface. Those close by
deleting rows, not by writing code. That leaves **30 genuine product defects**, of which 23 are the two
recall causes. The 10 unexplained: 3 non-project-name recall probes (P-TYPE / P-ATTR / R-SYM — different
mechanism, not investigated, no claim made), 3 nightly-battery corpus rows, 1 engine-e contract row, 2
genuine curation seeds (`finclusive`, `subfy` — verified below), and 1 real routing question
(`what-disbursement-or-payout-providers`).

---

## 2. Ranked root causes

### C1 — `nameMatchScore` reduces the query but not the name
**Clears 19** (`engine-a-recall`: the-starship-soroban, rise-in, stellar-global, dd, dex-tools,
stellar-update, ios-stellar-sdk, stellar-oracle-shield, stellar-rust-sdk, stellar-c-sdk, soroban-sdk-tools,
stellar-mpp-sdk, stellar-defi-hub, k2-lend, stellar-tip, 5x-crypto, lumens-for-charity, for-yield, zkcross)

`src/lib/project-search-match.ts:845-854` rebuilds the query's subject as
`anchorTokens(tokens ?? []).join(" ")` and compares it to the **unreduced** name/slug. `anchorTokens`
(`src/lib/search-vocabulary.ts:358`) drops `GENERIC_QUERY_TOKENS` and anything ≤2 chars; `contentTokens`
(`src/lib/repo-search.ts:626`) drops STOPWORDS including `stellar`, `the`, `in`, `by`, `for`, `protocol`.
The name side gets neither reduction, so the two sides can never be equal.

Running the real exported function over all 28 live failures, identity score goes 3 → 0 in 24/28:

```
stellar-global        3 → 0   tok=[global,live]              name loses "Stellar"
rise-in               3 → 0   tok=[rise]                     name loses "In"
lumens-for-charity    3 → 0   tok=[lumens,charity]           name loses "for"
the-starship-soroban  3 → 0   tok=[starship,soroban,live]    name loses "The"
dex-tools             3 → 0   anchors=[dex]                  "tools" is GENERIC
stellar-tools         3 → 0   anchors=[]                     all-generic
dd / coins-ph / 5x-crypto  3 → 0  anchors=[]                 ≤2-char filter
```

12 of the 24 are simply names starting with "Stellar". Why it is fatal: `nameRank` feeds
`exactName = (id) => nameRank.get(id) === 3 ? 1 : 0` at `route.ts:1672`, the **primary** comparator of the
result sort. Score 3 ranks ~1; score 0 ranks behind every prose-mentioner. These are all P-PHRASE probes —
`engine-a-recall-latest.json` has P-KNOWN at 960/960, and the bare name returns rank 1 for every one of the
28. The name works; the wrapper (`what is X`, `tell me about X`, `X on stellar`, `is X live`,
`scripts/eval/generated-recall.ts:298-307`) breaks it.

**Fix.** Stop reconstructing; test the name against the raw query. Word-bounded containment is symmetric and
needs no reduction on either side. After the `joined` block (~`project-search-match.ts:854`):

```ts
const esc = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
if (n.length >= 2 && new RegExp(`(?<![a-z0-9])${esc}(?![a-z0-9])`).test(qq)) return 3;
```

Validated against the full 960-row directory, not just the failing set: target promoted to nameRank 3 in
960/960; 19 probes (2.0%) co-promote a second record, 21 spurious total, and every co-promotion is a genuine
substring identity ("USDC" inside "USDC Swap") where the target is *also* promoted — a tie at the primary key
broken by the existing isActive / anchorIdentity / score comparators, with the target always holding strictly
more token coverage. Live check: `is USDC Swap live` returns `usdc-swap` #1; bare `usdc` is not in the top
10. Cannot regress P-KNOWN: `n === qq` short-circuits at line 831, untouched. Re-run
`src/lib/__tests__/identity-outranks-mention.test.ts` and `identity-groups.test.ts`.

**CONSUMER: none introduced.** `nameMatchScore` → `nameRank` map (`route.ts:1642-1647`) → `exactName()`
(`route.ts:1672`), the primary sort key. This repairs a signal already read and already load-bearing.

---

### C2 — the identity under-fill bypass is still gated on `limit`
**Clears 4** (`engine-a-recall`: block-by-block, stellar-wallets-kit, stellar-tools, lend)

`src/app/api/projects/search/route.ts:1593`:

```ts
const identityRows = filtered.filter((p) => p.anchorIdentity === true).length;
if (filtered.length > 0 && identityRows < limit && tokens.length >= 2) {
```

The comment directly above (lines 1583-1589) says the page-size dependence was fixed on 2026-07-21. It was
not: the fix changed the numerator and left `limit` as the threshold, so **result-set membership and `total`
are still a function of page size**. Isolated live, sweeping only `limit`:

```
is USDC Swap live         limit=3 → strict,   total=6,  top1=soroswap
is USDC Swap live         limit=4 → majority, total=79, top1=usdc-swap
is Stellars Finance live  limit=3..6 → strict, total=6, top1=redstone-finance
is Stellars Finance live  limit=7    → majority, total=59, top1=stellars-finance
```

The flip is exactly where `identityRows < limit` turns true. This also breaks an invariant the route asserts
in prose twice (`route.ts:984` "`total` is the same number at every `limit`"; `route.ts:2406-2408`) and pins
in no test — grep for `identityRows` / "limit-independent" across `src/lib/__tests__`, `scripts/`, `src/app`
returns `route.ts` only. That gap is why a comment claiming the fix outlived the fix.

**Fix.** Drop `limit` from the admission predicate (`if (filtered.length > 0 && tokens.length >= 2)`) and
delete the unused `identityRows` binding. Every other guard is retained — `anchorIdentity === true`,
`chainCorridor !== false`, `majorityAdmit`. Honest cost: multi-token result sets widen (`is USDC Swap live`
6 → 79 at every limit). That is not new behaviour; it is what `limit>=4` already ships.

**Caveat that changes the guard.** There are *two* limit-dependencies in this path. The semantic top-up is
gated on `scored.length < limit` (`route.ts:1877`), sized by `.slice(0, limit - scored.length)`
(`route.ts:1904`), and added to `total` at `route.ts:2409`. It accounts for `stellar-pulse` entirely and part
of `stellar-wallets-kit` (77→99) and `usdc-swap` (79→83). So this fix repairs 7 of the 8 live exclusions, not
8, and does not restore the `total` invariant alone. The proposed CI guard must therefore assert
limit-independence **over the keyword-admitted set only** (excluding `semanticAdds`), or the semantic path
must be made limit-independent with it — as loosely worded it would fail on a correctly-fixed route.

**CONSUMER:** `meta.matchMode` and `meta.counts.total` (`route.ts:2409`), served to Raven / Scout
`search_projects`, plus the offset/limit paging contract. Both are read today and both are wrong at small
limits. Plus one new CI test consuming the invariant `route.ts:984` documents and nothing checks.

---

### C3 — our own hallucination canaries are mined back in as consumer demand
**Clears 7** (`engine-d-demand`: what-is-orbitmintx, is-stellargizmo-live, is-flurboswap-live,
what-is-zorblend, tell-me-about-nebulabridge, is-quantumpay-live — plus
`engine-d-demand:flurbomatic-quantifold-widgetron-on-stellar`, open at **high** on the retrieval surface)

`scripts/eval/battery-banks.ts:35-38`:

```ts
export const ABSENT_BANKS: string[][] = [
	["is FlurboSwap live", "what is ZorbLend"],
	["is QuantumPay live", "tell me about NebulaBridge"],
	["is StellarGizmo live", "what is OrbitMintX"],
];
```

`scripts/eval/raven-truth-battery.ts:172-173` picks one pair per day and calls
`scout.searchProjects({ q, limit: 4 })` **through the Raven gateway**.
`improvements/engine/weekly/engine-d-demand-latest.json` contains exactly those six queries, grouped in their
bank pairs with matching day-counts (flurboswap 2 + zorblend 2; quantumpay 3 + nebulabridge 3; stellargizmo 3
+ orbitmintx 3). Five carry the identical `firstSeen` `2026-08-28T22:37:38.494Z`. Engine-D's own evidence
string on each: *"no record held; endpoint said so via advisory (curation gap, not a ranking bug)"* — the
endpoint behaved **correctly**. The seventh, `flurbomatic quantifold widgetron on Stellar`, is the NONSENSE
string at `scripts/eval/raven-honest-absence.ts:85`.

Why the existing guards miss it: `scripts/eval/engine-d-demand.ts:53-60` deliberately counts the `other`
User-Agent bucket as real demand because Raven's adapter sends no UA — and our battery runs *through* Raven,
so it is UA-indistinguishable from genuine Raven traffic. The backstop `isSyntheticQuery`
(`src/lib/improvement-ledger.ts:128-136`) matches only literal-nonsense shapes
(`/nonexistent|zzz{2,}|^z{4,}|^(?:asdf|qwer)/` plus a 7-word stoplist) and structurally cannot see plausible
fabricated brand names — looking real is the entire point of the guard.

These six can never close. The only way to "fix" them is to invent a fake project.

**Fix.** Import the bank into the ledger's `engine-d-demand` keep() at `improvement-ledger.ts:129-133`:

```ts
const ABSENT = new Set(ABSENT_BANKS.flat().map(s => s.toLowerCase()));
return !!q && !isSyntheticQuery(q) && !ABSENT.has(q.toLowerCase());
```

plus the two `raven-honest-absence` NONSENSE strings. The bank *is* the authoritative list of names we know
are fabricated, it is pinned by the eval-fingerprint baseline, and the filter self-maintains when the bank
changes. Do **not** extend `isSyntheticQuery` with a name regex — these names are by construction
indistinguishable from real ones, and a regex would start eating real demand.

**CONSUMER: removes rows from an existing consumer, introduces nothing.** `findings.json` is read by
`summarizeLedger` and surfaced as per-surface open counts on `/quality` and `/api/quality`, a number
`src/lib/changelog.ts:127` ships to agents as a stated limitation. Directory surface goes 8 → 2.

---

### C4 — `raven-routing` drops engine-d's `class` and re-grades curation gaps as routing defects
**Clears 6** (`raven-routing`: openx402, hypertron, planbok, vigente, cointracker, alypay)

Live `/api/projects/search` returns 0 matched projects with the advisory *"No project matches '<name>' by
name, description or category…"* for all six. Their source records in
`improvements/engine/weekly/engine-d-demand-latest.json` carry `class: GAP` with evidence
*"curation gap, not a ranking bug"*. `scripts/raven-routing.ts:424-430` reads engine-d's misses and drops the
`class` field, so every entry is re-graded as a consumer routing defect. Routing a query perfectly to
`searchProjects` for a project we do not hold still returns the no-match advisory.

**Fix.** Keep `class` when mapping demand misses; skip GAP/EMPTY. **But do not trust `class` blindly** — the
7th demand row, `what disbursement or payout providers can I integrate on stellar?`, is stamped GAP only
because engine-d probes the live API with the full literal sentence against a substring-matched `q`. We hold
that data (total=5: SDP, DCM, ElementPay), so it is a **real** routing finding and must survive the filter.
Gate the skip on a bare-token probe, or on `class: GAP` only when the query is a single token / short name.

**CONSUMER:** the open-finding count on `findings.json` and the `/quality` consumer row — both currently
show defects no routing change could ever close.

---

### C5 — `listContracts` over-captures the token "contract" and hijacks how-to questions
**Clears 2** (`raven-routing`: how-do-i-write-a-soroban-smart-contract-in-rust,
how-does-the-blend-lending-pool-calculate-intere)

Scout-only ranking (`service:"scout", limit:40`): *"how do I write a Soroban smart contract in Rust"* →
listContracts 204 wins, searchRepos 163 (rank 3), searchResearch 144 (rank 5). *"how does the Blend lending
pool calculate interest rates in the code"* → listContracts 131 wins, explainRepo 100 (rank 4). Class sweep
confirms a family, not two probes: listContracts also wins *"how do I deploy a contract"* (192), *"how to
test a Soroban contract"* (188), *"audit my smart contract"* (91), and *"who can audit my contract"* (95) —
the last beating getPartners (65) even though getPartners carries that literal phrase in its keywords. It
correctly wins only the 2 entity-shaped probes.

All 8 of its keywords contain the token "contract". A short blob with 100% term concentration on one token
outscores longer, diffuse blobs on any query containing that token, regardless of intent. Its `notFor` names
only searchRepos and listAudits.

**Fix.** Extend `listContracts` `x-routing.notFor` in `src/lib/openapi-spec.ts` in the spec's own
`<shape> -> <operationId>` form: `how do I write/deploy/test a contract -> searchResearch / searchRepos`;
`how does X work in the code / where is X implemented -> explainRepo`;
`who should audit my contract -> getPartners (type=audit-firm)`. Keep the keywords entity-shaped.

**CONSUMER:** Raven's `search` field-weighted scorer, which `openapi-spec.ts:256-257` already declares as the
consumer of `x-routing` and its `notFor` form. No new machinery.

---

### C6 — three eval probes are mis-specified against our own data and contract
**Clears 3** (`raven-routing`: what-wallets-support-stellar, octoplace, on-and-off-ramps-for-stellar-payments)

- *"what wallets support Stellar"* expects `getPartners`. Live: `/api/partners?all=true` returns 47 rows of
  which 5 are `partnerType=wallet`; `/api/projects/search?type=Wallet` reports `meta.counts.total = 64`.
  Routing to getPartners returns 5 instead of 64 — strictly worse. Our own spec agrees with the router:
  getPartners `notFor` says *"projects/products that were BUILT -> searchProjects"*, and searchProjects
  `exampleQuestions` contains the near-verbatim *"Which wallets exist on Stellar and how do they differ?"*.
  The router obeyed our contract; the BANK contradicts it.
- *"octoplace"* expects `searchProjects`, but Raven returns 0 hits from any service and the live advisory
  says we hold no such project. A name-lookup probe must assert on a name in the directory, or it tests
  curation, not routing.
- *"on and off ramps"* is genuinely contested and is a different sub-defect: getPartners holds 29
  anchor-typed partners (9 with `rampTypes` populated) against 42 `type=Anchor` projects, and **both ops
  declare the same vocabulary** — getPartners keywords carry `on-ramp`/`off-ramp`/`ramps`/`anchors`,
  searchProjects carries `anchors`/`on/off-ramps` — with no tiebreaker in either `notFor`. The un-brokered
  overlap is the defect, not the route taken.

**Fix.** In `scripts/raven-routing.ts`: change the wallets expectation to `["searchProjects","getPartners"]`
(matching what our spec declares); delete or re-point the octoplace probe. For ramps, add the missing
tiebreaker rather than changing the expectation — getPartners `useWhen` claims the case it uniquely serves
("which anchors on-ramp vs off-ramp, by corridor — `rampTypes`"), searchProjects `notFor` names it
("ramp direction/corridor for a specific anchor -> getPartners").

**CONSUMER:** `scripts/raven-routing.ts` pass/fail → the ledger. The ramps tiebreaker feeds Raven's scorer
via `x-routing`, same as C5.

---

### C7 — a project name leaked into `searchResearch`'s security keywords
**Clears 1** (`raven-routing:reflector-oracle-on-stellar`)

`src/lib/openapi-spec.ts:5350` has the bare keyword `"reflector"` inside `searchResearch` (operationId at
:5302), in its oracle-manipulation security cluster beside `"yieldblox"` and `"reentrancy"`. Live scout-only
ranking for *"reflector oracle on Stellar"*: searchResearch 97 wins, listContracts 86, searchProjects 81 at
rank 2. We hold Reflector in the directory at confidence 0.97, relevance 1.0 — the best answer available —
and it loses because the research op owns the project's name.

**Fix.** Qualify the bare token to the context it was added for: `"reflector oracle manipulation incident"`
(same for `"yieldblox"` at :5349). Grep the remaining 91 keywords for other bare project names before
shipping — this leak likely exists elsewhere.

**CONSUMER:** Raven's `search` scorer via `x-routing` keywords. Same consumer as C5.

---

### C8 — `getRfps` has no worker-side vocabulary
**Clears 1** (`raven-routing:jobs-bounties-and-freelance-work-for-stellar-con`)

`grep -ci '"jobs"|freelance|"paid work"' src/lib/openapi-spec.ts` → 0. Those words appear nowhere in the
9,373-line spec. Scout-only ranking for the probe: getBuilders 106 wins (on `contributors` and `hire`);
getRfps ties at 85 with getPeople, searchRepos, searchResearch. getBuilders answers *"who can I hire"*
(employer side) while the query asks *"where can I get paid"* (worker side) — it returns a list of people to
the person looking for work, the exact inverse of intent.

**Fix.** Add worker-side terms to `getRfps` `x-routing.keywords` (`jobs`, `freelance`, `paid work`,
`where can I earn`, `get paid to build`) and one directional entry to getBuilders `notFor`:
`paid work / jobs / bounties FOR a contributor (worker side) -> getRfps`. getBuilders' `notFor` already uses
this exact form for four other cases — a one-line addition to an existing list.

**CONSUMER:** Raven's `search` scorer via `x-routing`.

---

### C9 — `searchProjects` is a generic attractor stuffed with question phrases
**Clears 1** (`raven-routing:top-stellar-projects-by-github-activity`); contributes to two C6 rows

77 keywords in a 2,409-char routing blob, second-largest of 37 ops against a median of 515. The keywords
include whole question phrases rather than nouns: *"which providers support stellar"*, *"what services can I
integrate"*, *"which exchanges list XLM"*, *"look up a project by name"*. It wins scout-only top1 on all three
category probes (wallets 105, ramps 167, activity 185). The phrase effect is directly measurable: getPartners
scores 75 and ranks 0 on the bare query `wallet`, but 23 at rank 25 on *"what wallets support Stellar"* —
behind vetIdea (48) and hackathonBrief (48). A stemming explanation was tested and **refuted**: *"what wallet
supports Stellar"* also scores getPartners at exactly 23. For getLeaderboard the loss is narrow and real —
129 at rank 3 behind searchProjects 185, searchRepos 159, resolveProject 131 — on a query whose exact shape
getLeaderboard declares in `exampleQuestions`.

`openapi-spec.ts:256-257` records that broad prose descriptions were lexically capturing other operations'
question families, which is why the vocabulary moved into `x-routing`. searchProjects' `x-routing` then became
the same bloated blob the migration was meant to eliminate — the pathology moved fields. (Note the inverse of
C5: listContracts fails by concentration, searchProjects by dilution.)

**Fix.** Cut the natural-language question phrases from `searchProjects` `x-routing.keywords` — they belong in
`exampleQuestions`, which the spec's contract scores as a separate field. Add one `notFor`:
`ranking projects by GitHub activity/stars/commits -> getLeaderboard`. **Lowest confidence of the set on
magnitude** — the scorer's field weighting is not published. Re-measure scout-only rank after the edit.

**CONSUMER:** Raven's `search` scorer, per the field-weighting contract at `openapi-spec.ts:256-257`.

---

### C10 — bare project-name lookups have ad-hoc routing coverage
**Clears 1** (`raven-routing:passkey-kit`); mechanism behind the C4 rows

Live: querying Raven for `passkey-kit` surfaces only 3 scout ops — listSkills 25, searchRepos 25 (via its
`passkey` keyword), getBuilders 15 — with **searchProjects absent** and every score under 30, against 100-400
for phrase queries. We hold the project (`/api/projects/search?q=passkey-kit` → "Passkey Kit", confidence
0.76).

This is a **name-coverage gap, not a structural limit**: searchProjects already carries six hardcoded product
names (`soroswap`, `etherfuse stablebonds`, `ustry`, `cetes`, `stellar.expert`, `stellarchain`) and simply
does not carry this one. The lever is `resolveProject`, which today carries only rename/wind-down vocabulary
and no bare-name `useWhen` — not growing the searchProjects name list toward 64+, which would recreate the C7
leak at scale. Caveat: `octoplace` returns 0 hits from *any* service, so for a genuinely unknown token the gap
is upstream in Raven's index. Measure before editing.

**CONSUMER:** `resolveProject`'s `x-routing` → Raven's scorer; `scripts/raven-routing.ts` BANK expectation.
Explicitly **not** proposing a new name index — resolveProject already exists and already ships.

---

### C11 — engine-D's `GAP` means "this endpoint held nothing", not "the corpus held nothing"
**Clears 1** (`engine-d-demand:crdt`)

`/api/projects/search?q=crdt` → semantic mode, 3 neighbours (dune, stellar-dashboard, audd), no hit. But
`/api/repos/search?q=crdt` returns `calimero-network/core` — a real answer, and the projects response already
carried it in its own `codeReferences`. `scripts/eval/engine-d-demand.ts` replays each logged query against
the same endpoint the consumer hit, and `improvement-ledger.ts:124-127` maps `class GAP` → surface
`directory`, failureMode `coverage-gap`. So a consumer asking the projects endpoint about a data-structure
term produces a finding reading "the directory should contain a project called CRDT". It should not.

**Fix.** `crdt` should be **dropped, not reclassified**: when a GAP query is already answered by a sibling
surface — or by the `codeReferences` the same response carries — it is not a finding on any surface. The
general rule: before filing a GAP, replay against `/api/repos/search` and `/api/research`, both already
probed elsewhere in the same script.

**CONSUMER:** the ledger → `/quality` per-surface counts.

---

### Ruled out — do not re-investigate

Four hypotheses tested and disproven against the recall lane. Recorded so the next reader does not re-run them.

| hypothesis | why it is wrong |
|---|---|
| "project search lacks the NL filler list repo search has" | It shares it exactly. `project-search-match.ts:21` imports `contentTokens`/`isContentStopword` from `./repo-search`; STOPWORDS (`repo-search.ts:459-596`) already holds `is`, `what`, `tell`, `me`, `about`, `on`, `stellar`, `protocol`. `live` is excluded from STOPWORDS but *is* in `GENERIC_QUERY_TOKENS`. Filler stripping is not the defect; the asymmetry is. |
| "generic/short names collide with common vocabulary" | DD, Lend, Stellar Tools all return rank 1 for their bare name against the same corpus (P-KNOWN 960/960). Genericness is a term inside C1, never an independent cause. |
| "rows with thin searchable text, so only the name can match" | Irrelevant to all 28 — the bare name retrieves every one at rank 1, so their text is sufficient by construction. |
| "filler words dominate the score" | For *"tell me about Rise In"* vs *"Rise In"* the token set is identical (`[rise]`) and `total` is identical (17). The filler contributes nothing to scoring; the damage is entirely in the identity key. |

One process note worth carrying: C2 is a concrete instance of the ledger's suspect close path — a code comment
asserts a fix the code does not implement, no test pins the invariant, and a detector going quiet at one page
size would have read as "cleared".

---

## 3. The gap matrix — 49 absent SCF projects

Fresh run `2026-08-31T00:51:05Z`: `directoryRecords 960`, SCF frame `{scf: 500, directory: 960}`,
`absent 49`, `absentWithRoundBadge 49`; DefiLlama `{stellarListed: 42, cexExcluded: 8, matched: 32,
missing: [], belowFloor: 2}`.

Method: probed 40 of the 49 against live `/api/projects/search`, and separately replayed the matcher offline
against a full 960-row frame with aliases added and the length floor relaxed.

**Verdict: 47 of 49 (96%) are genuine coverage gaps. 2 of 49 (4%) are matcher defects. This is an ingestion
problem, not a matching problem.**

| class | n | rows |
|---|---|---|
| matcher defect — alias-blind lane | 1 | `hermes-isy` (round 32) → we serve `zenex`, `identity.aliases = ['Hermes']`, `scfAwarded true` |
| matcher defect — length floor | 1 | `identity-operating-system-idos-nqg` (round 31) → we serve `idos` / "idOS", status Live, rounds [31] |
| genuine coverage gap | 47 | every one returns only semantic/loose neighbours on the live API |

Hand-checked near-hits, to avoid false confidence: `janus-m2t`(r45)→`xccy`(r43) different project;
`komet-formal-verification`(r30,28)→`comet`(r13,18) different; `stellar-surge`(r24)→`surgepay`(r41)
different; `stellar-women-bootcamp`(r29)→`womenbiz`(not SCF-awarded) different.

**Matcher defect 1 — the SCF lane never reads aliases, while its sibling lane in the same report does.**
`scripts/eval/scf-absence-diff.ts:90-120` `fetchDirectory()` maps only `{slug, name}`.
`scripts/report-coverage-gaps.ts:110-113` in the same report does read
`identity.aliases` and indexes each at :154. Fix: carry aliases in `fetchDirectory()` and build the match
index with one row per identity string (`[name, slug, ...aliases]`) — the shape `report-coverage-gaps.ts`
already uses. Reuse, not new machinery.

**Matcher defect 2 — idOS is killed by a 5-char containment floor, and relaxing the floor is the WRONG fix.**
Trace `scf-absence-diff.ts:129-144` with `base="identity-operating-system-idos"`: `cb.includes("idos")` is
true, but `canon("idOS")` is 4 chars so the `d.c.length >= 5` gate rejects it. Relaxing the floor to 4 was
tested and produces **new false matches** (`soroban-disassembler-working-title-ply` → `band`;
`bpv-stellarmesh-anchor-afq` → `mesh`). The floor is doing real work. Fix is a token-**equality** branch
instead: `if (tb.has(d.c) && d.c.length >= 4) return true;` — verified offline to catch idOS and reject both
false positives, floor untouched.

Note on the headline arithmetic: an earlier draft claimed "4 flips / 92% coverage". That does not reproduce —
relaxing the floor gives 5 flips, 3 of them false. Applying only the two correct fixes moves 49 → 47. The
directional conclusion (chase curation, not the matcher) is if anything stronger than first stated.

**Two adjacent findings that no lane escalates.**

1. **FxDAO** is absent from the directory (`/api/projects/search?q=fxdao` → lumenwipe, orion,
   nectar-network) and visible in **both** external rosters: `api.llama.fi/protocols` lists `FxDAO` with
   `chains:['Stellar']`, and it is on the SCF absent list as `fxdao-xov`. Because `chainTvls.Stellar = 0 <
   TVL_REPORT_FLOOR_USD (50,000)`, `report-coverage-gaps.ts:194-196` drops it into `belowFloor`, rendered only
   as the bare count `belowFloor: 2`. A per-lane relevance floor fires before any cross-lane join, so the
   DefiLlama lane reports `missing: 0` for a protocol it can see. Fix: after both lanes return, itemize any
   below-floor llama protocol whose canon name also appears in the SCF absent list. **Cost correction:** this
   is not "one Set intersection over two arrays already in scope" — `laneDefillama` must return the
   below-floor rows and `laneScf` must return the full absent list (today capped at 40; FxDAO sits at
   position 42). Two files, two return shapes. Also flag: $0 Stellar TVL may mean wound down, which is a P3
   orientation question — adding the row without that dated fact just creates another undated Live-looking
   record.
2. **Reclaim / zkFetch is a missing alias in OUR data, and the alias fix will not catch it.**
   `/api/projects/search?q=zkfetch` returns slug `reclaim`, `identity = null`, `scfAwarded = false` — while
   our own stored `shortDescription` on that row reads *"…Its zkFetch SDK generates zero-knowledge
   proofs…"*. Two defects, neither in the matcher: the alias does not exist to be indexed, and `scfAwarded`
   is false on a row whose SCF listing carries rounds (the scf-crosscheck "understated" class). Fix is
   curation, human-gated. Do **not** auto-derive an alias from a description substring. Honest scope note:
   this is the only one of the 47 I hand-verified this way — a nonzero share of the rest may be the same
   shape, and each needs the same verification.

**Curation is the lane, and the ledger already lost this argument once.** `findings.json` shows
`engine-d-demand:kutana`, `:sorted`, `:etesia` and `:octopos` as **cleared** — all four are on today's SCF
absent list with round badges (kutana carries rounds 45,44,43,39,38). Real demand, we held nothing, the
detector went quiet, the ledger auto-cleared. That is the "closed means a detector stopped reporting"
pathology, on this exact data.

**CONSUMER:** `coverageGaps.scf.absent` → `src/lib/quality-artifacts.ts:378-395`, the public `/quality` row
"SCF-funded projects served". Its `severity` flips high↔medium at `absent > 25` and `passing` is
`absent === 0`, so every false absentee inflates a published scoreboard number.

---

## 4. P3 orientation layer

**The problem is not schema and not consumers — both exist and are wired. It is writers.**

`knowledgeNotes` (`src/collections/Repos.ts:105-120`) has two live consumers: `src/lib/verify-claim.ts:352-358`
pushes **every** note into `/api/verify` answers as typed `kind:'curated-note'` evidence, and
`src/lib/repo-search.ts:1534-1535` serializes it on every `searchRepos` row → MCP `search_repos` → Raven. It
has **no ranker** (grep across `repo-search.ts` returns only the interface declarations at :78/:136 and the
serializer; `src/app/api/repos/search/route.ts` has zero hits) and almost no writer: `REPO_KNOWLEDGE_NOTES`
(`src/lib/repo-knowledge.ts:35-96`) is a hand-typed map of **four repos**, plus two derived generators
(`derived:audit`, `derived:usage`).

Live census (`GET /api/quality`, today): `repoQuality.withKnowledgeNotes = 265` of population 12,961 (~2%);
`coverage.knowledgeNotes = {pool: 284, withNotes: 28}` = 9.9% of the curation pool. A 387-repo live sample
across 10 topic queries: 25 carry notes, mix `derived:audit` 24 / `derived:usage` 2 / `curated` 6. The
genuinely curated orientation layer is ~4 repos. (The "8 notes / 7,000 repos" figure in circulation is stale —
it is the comment at `scripts/check-consumption.ts:12`, not a measurement.)

`successorRepo` is worse and more wired: `repo-search.ts:1383` (`const superseded = (r as any).successorRepo
? 1 : 0`) is an **actual ranking demotion**; it is serialized at :1521-1522, selected and returned by
`/api/repos/explain` (:168, :196-197), emits a `superseded` signal in `trust-report.ts:184` and drives a
reverse predecessors lookup at :163, and is carried in `contracts-registry.ts:151`. Its writer,
`REPO_SUCCESSIONS` (`src/lib/repo-relations.ts:16-20`), contains **one pair**
(`blend-capital/blend-contracts` → `-v2`). 1 of 100 sampled live repos carries a non-null value.

**The constraint's real boundary is the PREDICATE, not the topic.** Every triage tag in
`src/lib/repo-triage.ts:22-36` (`dead-hackathon-project`, `farm-signals`, `inert-fork`, `archived-upstream`,
`dead-long-tail`, `tutorial-or-template`) is a verdict *we* reached, and `repo-triage.ts:10-13` is right that
those stay internal. But each has a factual pre-image: something a first party declared, or arithmetic over
two dated facts we already store. Serve the pre-image; let the agent conclude.
`improvements/audits/consumption-latest.json` (asOf 2026-08-31T00:06:54Z) lists `triageTags` as **DEAD** —
written in 6 places for 12,961 repos, read by no serving path.

### The taxonomy

| type | note text | extraction source | consumer |
|---|---|---|---|
| **T1 `derived:rename`** | "GitHub resolves `<old>` to `<new>` — the repository was renamed or transferred (observed YYYY-MM-DD)." | `scripts/enrich-repos.ts:490-495` — the `info.nameWithOwner !== full` mismatch we already detect, `console.log`, and **throw away**; :525 then overwrites the row under the new name. Zero new API calls. | `/api/verify` maintainedVerdict (`verify-claim.ts:356`) + `searchRepos` rows (`repo-search.ts:1534`). Directly repairs the failure mode where a repo that **moved** reads to the maintained-verdict as one that stopped committing. Replaces the opinion "this repo is dead". |
| **T2 `derived:archived`** | "Archived by its owner on YYYY-MM-DD (GitHub)." | GitHub GraphQL `archivedAt` — one extra field beside the `isArchived` boolean already requested (`enrich-repos.ts:502,548,591`). | maintainedVerdict's CONTRADICTED branch, which today asserts archival with **no date for the archival act** (`verify-claim.ts:341-347` carries `isArchived` as a bare boolean plus `lastCommitAt`). Gives our strongest verdict its missing date. Factual: the owner performed the act, we quote it. Replaces `archived-upstream`. |
| **T3 `derived:fork-parent`** | "Fork of `<parent nameWithOwner>` (GitHub), as of YYYY-MM-DD." | GitHub GraphQL `parent.nameWithOwner`. We store `isFork` as a bare boolean (`Repos.ts:122`) with no parent, so "is this a real project or a mirror" is unanswerable from a served row. | `searchRepos` rows + verify evidence. Factual pre-image of `inert-fork`. |
| **T4 `curated:self-declared`** | "The repository README states: \"`<exact quote>`\" (README, fetched YYYY-MM-DD)." | Deterministic exact-phrase match over the already-stored `readmeExcerpt` (`Repos.ts:125`) against a short allowlist ("no longer maintained", "not intended for production", "this repository has moved to", "deprecated in favour of", "use X instead"). **No LLM** — the SURFACE-don't-summarize doctrine holds. | verify maintainedVerdict evidence + `searchRepos`. This is the type that dissolves the constraint: "bad example" is our opinion; "the README says not intended for production use" is theirs, quoted and dated. |

**One schema change, and only one:** `KnowledgeNote.source` is a provenance *kind* (`curated`,
`derived:audit`), not a link, so a note that quotes a source has nowhere to put the thing quoted. Add an
optional `sourceUrl` to `src/lib/repo-knowledge.ts:14-29` and the field list at `Repos.ts:107-119`. Required
by T4 and by nothing else.

**Explicitly recommended against — T5 `predates-protocol-N`.** Buildable with no new scanning
(`codeVerified.sorobanSdkVersion` + `SDK_MAJOR_PROTOCOL` / `LATEST_PROTOCOL=27` in
`src/lib/soroban-versions.ts:23-56`) — but `codeVerified.versionStatus` **already serves exactly this** on
every row (live 100-row sample: current 13, supported 49, deprecated 5, unknown 32). A note restating a served
typed field is the dominant defect class. Build it only if someone names a consumer that reads notes but not
`codeVerified`.

**Do not add a ranker for notes.** Nothing reads notes for ordering today and I am not proposing one. The
honest claim: these change what an agent is **told**, not what it is shown first. A note added tomorrow
changes an agent-visible answer the same day with zero new machinery.

**On `successorRepo`, do not auto-populate from renames.** It drives a demotion, and an org rename is not a
new generation — auto-demoting on a rename would be a confident wrong answer. Feed the candidate stream into
T1 where it only adds evidence, and keep `successorRepo` human-gated. The curation discipline in
`repo-relations.ts:10-14` ("a name ending in -v2 is a CANDIDATE, never proof") is correct and should stay.

---

## 5. Attribution — ours vs the router's

All 16 consumer-surface findings were reproduced live against `agents.stellar.buzz/mcp` and
`stellarlight.xyz`.

| bucket | n | rows |
|---|---|---|
| **Ours — fixable in `x-routing` / the spec** | 6 | listContracts over-capture (2), reflector keyword leak (1), getRfps worker vocab (1), searchProjects attractor (1), ramps un-brokered overlap (1) |
| **Ours — but the defect is in the detector, not the product** | 8 | 6 GAP-class curation gaps re-filed as routing (C4), 2 mis-specified BANK probes (wallets, octoplace) |
| **Partly upstream** | 1 | `passkey-kit` — the name-coverage side is ours (`resolveProject` has no bare-name `useWhen`); `octoplace` returning 0 hits from any service is Raven's index |
| **Genuine open routing work** | 1 | `what-disbursement-or-payout-providers` — we hold the data (total=5), engine-d mis-stamped it GAP |

**The honest answer is that attribution is currently unrecoverable for most of them, and that is our fault.**
`scripts/raven-routing.ts:392` calls `{name:"search", arguments:{query:item.q}}` with **no `service` and no
`limit`**. Raven's `search` returns a global top-10 across stellarDocs / skills / lumenloop / scout (verified:
for "what wallets support Stellar" the 10 hits are 4 stellarDocs, 4 skills, 2 scout). Line 395-398 then takes
`scoutHits.slice(0,3)` from within that 10. **In 7 of the 9 capability misses the expected op is absent from
the global 10 entirely** — so the detector cannot distinguish "our op ranks badly among our ops" from "our
whole service was crowded out". Re-running with `service:"scout", limit:40` gives a completely different
signal:

```
getPartners @ wallets          scout-rank 25      searchProjects @ reflector   rank 2
getPartners @ ramps            rank 6             getRfps @ jobs               rank 2
getLeaderboard @ activity      rank 3             explainRepo @ blend          rank 4
searchRepos @ soroban-rust     rank 3             searchProjects @ passkey-kit ABSENT (3 scout ops surface)
                                                  searchProjects @ octoplace   ABSENT (0 hits)
```

A spread of 2 → 25 → absent, recorded identically as `routing-miss`. The demand phase is harsher: line 445-446
requires the first scout op to be in the **global** top-3 across all services, while stellarDocs/skills
routinely score 150-416 against our 80-200. Separately, the catalog sweep at line 350 uses
`codemode.search(q, {service:"scout", limit:20})` inside `execute`, and **the sandbox SDK ignores both
params** (proved: it returned stellarDocs and skills hits); only the JS `startsWith("scout.")` filter saves
correctness, but each sweep query samples ≤10 mixed hits instead of 20 scout ops.

Fix: pass `service:"scout"` on the grading call, keep the unfiltered call as the `globalRank` measurement,
and emit two failure modes — `routing-miss:our-ranking` vs `routing-miss:crowded-out` — so the ledger stops
filing service crowding as our bug. Swap the line-350 sweep to the top-level `search` tool, which does honor
`service` (verified: 12/12 scout ops). **CONSUMER:** `findings.json` `failureMode` and the `/quality`
scoreboard that renders it — this splits a field the ledger already stores and already displays.

**Adjacent gap, invisible to this queue.** `improvements/engine/raven-drift-2026-08-28.json` lists
`laggingInCatalog` = getQualityReport (2026-08-28), partnerOnboard (2026-08-18), verifyClaim (2026-08-27),
vetIdea (2026-08-18), `graceDays 10`. Re-probed today: **vetIdea has cleared** (rank 0, score 242 for "vet my
startup idea"); getQualityReport (age 2) and verifyClaim (age 3) are genuinely fine inside grace;
**partnerOnboard is age 12, past grace, and absent on 8 probes including its literal operationId**. Across all
460 ledger rows ever recorded, zero mention it.

The escalation code is **not** missing: `check-raven-drift.ts:265-275` recomputes `ageDays` every run and its
else branch pushes past-grace ops into `missingFromCatalog`, which `improvement-ledger.ts:531-558` already
turns into a finding with failureMode `op-missing-from-catalog`. The defect is that **`check-raven-drift.ts`
is in no workflow** (`grep -rl check-raven-drift .github/workflows/` → nothing), so the artifact is frozen at
2026-08-28 — the one day partnerOnboard sat at exactly `ageDays === graceDays` and landed in
`laggingInCatalog`. **The fix is a cron entry, not new finding-filing code.** On attribution: partnerOnboard
and submitPartnerListing are both data-creating POSTs and both absent, while the cataloged matchPartners is a
query-shaped POST — write-exclusion is a live hypothesis. Per the catalog-lag-is-not-drift rule, ask Raven
whether write ops are intentionally excluded before filing anything upstream.

---

## 6. Do this next

Ranked by findings-cleared per unit of effort.

1. **`nameMatchScore` raw-query containment** (`src/lib/project-search-match.ts:854`) — **clears 19**, ~4
   lines. Validated 960/960 with 21 spurious co-promotions, all benign ties. Re-run
   `identity-outranks-mention.test.ts` and `identity-groups.test.ts`.
2. **Filter ABSENT_BANKS + the two NONSENSE strings out of demand ingestion**
   (`src/lib/improvement-ledger.ts:129-133`) — **clears 7**, ~3 lines. Removes rows from an existing consumer;
   adds nothing.
3. **Keep engine-d's `class` and skip GAP/EMPTY** (`scripts/raven-routing.ts:424-430`) — **clears 6**, ~4
   lines. Gate the skip on bare-token queries so the disbursement row survives.
4. **One `openapi-spec.ts` pass** — listContracts `notFor`, reflector/yieldblox keyword qualification,
   getRfps worker vocab + getBuilders `notFor`, searchProjects phrase trim + getLeaderboard `notFor` —
   **clears 5**, one file. Re-measure scout-only ranks after; the searchProjects magnitude is the least
   certain claim in this document.
5. **Drop `limit` from the identity admission predicate** (`route.ts:1593`) — **clears 4**, ~2 lines. Add the
   limit-independence CI guard **scoped to the keyword-admitted set**, or fix the semantic top-up
   (`route.ts:1877/1904`) with it; the naive guard fails on a correctly-fixed route.
6. **Fix the eval BANK** (`scripts/raven-routing.ts`) — **clears 2**. Wallets expects
   `["searchProjects","getPartners"]`; octoplace deleted or re-pointed at a name we hold.
7. **Drop `engine-d-demand:crdt`** — **clears 1**. Answered by a sibling surface and by its own response's
   `codeReferences`; add the sibling-replay check before filing future GAPs.
8. **Add `service:"scout"` to the routing grading call and emit two failure modes** — clears 0 today, but
   without it no routing finding can be honestly attributed or honestly closed. Do this before item 4 if you
   want to verify item 4 worked.
9. **Schedule `check-raven-drift.ts`** — clears 0, unfreezes a stale artifact and surfaces partnerOnboard
   through machinery that already exists. Ask Raven about write-op exclusion before escalating.
10. **The two SCF matcher fixes** (`scf-absence-diff.ts` aliases + token-equality branch) — clears 0 ledger
    rows, moves the published `/quality` absent count 49 → 47. Worth doing to de-noise a public number, not
    to close the gap.
11. **Curation, human-gated** — `finclusive` and `subfy` (both verified: 0 hits on projects *and* repos), the
    47 SCF absentees, the zkFetch alias and `scfAwarded` reconciliation on the `reclaim` row, FxDAO's
    liveness. These are the only two of the 56 that are genuine "we don't hold it" gaps, and the 47 are seeds
    for the existing detect→verify→curate flywheel. `scf-absence-diff.ts`'s own header forbids auto-create,
    correctly.
12. **T1 `derived:rename`** (`scripts/enrich-repos.ts:490-495`) — clears 0 ledger rows, and it is still the
    cheapest real win on the board: the fact is already observed on every pass, logged to console, and thrown
    away, and it lands in two consumers that ship today.

**Not covered by any lane, and not claimed:** the 3 non-project-name recall probes
(`5-of-top-10-carry-types-ai-51-exist`, `ping-in-top-13-of-52-matches-its-own-coverage-co`,
`acta-team-did-stellar-in-top-5-for-its-own-symbo`), the 3 `nightly-battery` corpus rows
(doc-category-filter-empty, soroban-sdk-cve, tool-indexer-repos-discovery), and
`engine-e-contract:get-api-partners-accepting`. Seven findings, no root cause offered.
