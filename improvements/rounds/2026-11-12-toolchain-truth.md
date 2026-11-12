# 2026-11-12 toolchain truth

## Scope

Is the dated SDK table in `src/lib/soroban-versions.ts` current, and does
`/api/analyze?dimension=toolchain` say what its deprecated count measures?
Opened after the measurement phase, before any fix was written.

## Lanes

| Lane | Author | Write set | Output |
| --- | --- | --- | --- |
| toolchain-truth | Claude Opus 5.5, effort medium (orchestrator) | `~/Downloads/sl-lanes/toolchain-truth`, branch `lane/toolchain-truth` | spec 1.9.140 |
| review (docs, API text) | see Review | throwaway clone, no push remote | verdict |
| review (code, other family) | see Review | sandboxed clone | leads, reproduced before acting |

## Review

Pass 1 on commit 47148da0, two reviewers in parallel, each on a no-push clone.

- Claude Fable 5.2 (fresh context, default effort; docs, API text, product
  judgment): GATE do not push, nothing high. Fixed: (1) the basis listed two
  publisher-deprecated packages, the code three; it now prints the code's
  set, pinned by a test. (2) one em dash on an edited comment line. (3)
  byJsSdkStatus did not state its population (repos carrying a soroban-sdk
  version; 5,603 scanned repos without one are outside the block); basis,
  spec and skill now say it is not an ecosystem-wide JS count. (4) "881 pin
  a supported soroban-sdk" overstated: measured 824 supported, 25 current,
  32 unreadable; reworded everywhere, and the summary now partitions the
  recomputed 1,285, not the served 1,284. (5) the table bump lowers codeDepth
  on re-scan for 27 and 28 and the raw /api/repos rows keep the stored
  status; changelog and TODO say so. (7) the nightly check's known limit is
  in its header. (9) npmStellarDep reused repo-live-read's marker rule; the
  rule now lives once in soroban-versions.ts (isLangMarker). Answered: (6)
  28 maps to Protocol 28 and reads supported; the spec says current means
  the newest major, and the table comment records that the software-versions
  page lists Rust SDK 28.0.0 for Protocol 29. (8) versionStatus stays
  declared nullable: no null is served, and the rule binds the other way
  (a served null must be declared). (10) changelog surfaces stay api and
  skill: entries that name api-client carry an api-client@ release, and
  this PR releases no client.
- Grok 4.7, effort high (code, other family), sandboxed clone: GATE do not
  push, nothing high. Reproduced and fixed: (2) check-sdk-table read a body
  with a null or empty protocol, or a non-version string, as current (exit
  0); it now exits 2 unless all three fields parse (5 malformed shapes
  checked). (6) protocolCaps said empty only when targetProtocol is null;
  now also when the registry holds no CAP for it (Protocol 29 has none), and
  the changelog names targetProtocol 28 and 29. (8) a test now pins that an
  npm alias holding ":" and "@" stays a dependency. Overlapping Fable's (1),
  (3), (7). Answered: (1, second half) "@stellar/stellar-sdk@^13" reads
  unknown because the range regex needs a dotted major; pre-existing, fails
  safe, queued in TODO Next. (4) an alias "stellar-sdk@npm:@stellar/stellar-sdk@17"
  installs @stellar/stellar-sdk, not the deprecated package, so unknown is
  not wrong; 0 aliases in the corpus. (5) consumers checked by the reviewer
  itself: none break.

Pass 2 on fix commit 0e43f90b (same reviewers, findings in the brief).

- Claude Fable 5.2: GATE push. All ten fixed or answered. New (11, low): the
  check's validation accepted any digit run, so an error text holding "503"
  would read as major 503 and report behind; it now requires a released
  semver. (12, low) the basis is long; accurate, left as is.
- Grok 4.7, effort high: GATE do not push. Its findings 1, 3, 4, 5, 6, 7, 8
  hold. New: (2, low) the spec's JS "unknown" said only "no tabled JS
  dependency" and the basis said "no readable version", both narrower than
  the classifier (a pre-release or an undotted range is unknown too); both
  reworded. The basis test used toContain per package, and "stellar-sdk" is
  a substring of "@stellar/stellar-sdk"; it now matches the printed list.
  (6, medium) the TODO said a re-scan lowers codeDepth through
  code-signals.ts's 0.15; reproduced: computeCodeSignals has no production
  caller, the scanner's depth comes from code-depth.ts (up to 0.05 inside
  the 0.20 baseline); TODO corrected. (11, low) same as Fable's 11; the
  validation is now upstreamVersions() in soroban-versions.ts with a test
  over nine malformed shapes.

Pass 3 on commit f58a617b.

- Claude Fable 5.2: GATE push. Items 11, the unknown text and the codeDepth
  sentence hold; nothing broken. Note (low): a version with build metadata
  (29.0.1+abc) would exit 2; neither upstream field serves one, and 2 is the
  safe side. Left as is.
- Grok 4.7, effort high: GATE push. Items 2, 6 and 11 hold; the basis pin
  now fails if one package drops from the printed list. Note: a leading-zero
  or overlong version would still not be flagged; none of the three APIs
  returns one. Left as is.

## Log

- 2026-11-12 15:30 UTC. `curl -s 'https://stellarlight.xyz/api/analyze?dimension=toolchain'`
  at spec 1.9.136: scannedRepos 5,865, byVersionStatus current 199,
  supported 4,331, deprecated 1,284, unknown 51; deprecatedRepos rows carry
  fullName, projectSlug and sorobanSdkVersion only; basis starts
  "Soroban-SDK toolchain status per scanned repo".
- Upstream, read the same hour: crates.io soroban-sdk max_stable_version
  29.0.1 (28.0.0 on 2026-09-18, 29.0.0 on 2026-10-07, 29.0.1 on 2026-10-12,
  30.0.0-rc.1 on 2026-10-21); Horizon mainnet root current_protocol_version
  29, core_supported_protocol_version 30; `npm view @stellar/stellar-sdk
  dist-tags` latest 17.4.0, lts-16 16.4.1, no v18.
- Protocol sourcing: rs-soroban-sdk v28.0.0 release notes, "This is a
  release supporting Protocol 28"; v29.0.0, "Update soroban-env crates to
  29.0.0". developers.stellar.org software-versions (stellar-docs commit
  2efd1d55, 2026-10-07): Protocol 28 mainnet 2026-09-16 with Rust SDK
  28.0.0; Protocol 29 mainnet 2026-10-01, Smart Contract Host Environment
  29.0.0, Rust SDK listed 28.0.0, "introduces no new CAPs".
- Support policy: rs-soroban-sdk README "Support" section (added 2026-05-06,
  PR 1855): "The two most recent soroban-sdk major releases are supported
  with critical security fixes." js-stellar-sdk README: use v17 or v16;
  "Version 16 remains supported through March 2027". Ours: soroban-sdk
  floor 21 (set 2026-07-05, no sourced basis), JS floor 14 (documented as
  two majors below lts-16).
- Why "CB6" never fired: `grep -rn CB6` finds it only in the
  soroban-versions.ts comment (since 93d24cc, 2026-07-04) and in unrelated
  contract ids. It was an item in an uncommitted scratchpad safety spec
  (code-signals.ts:14 cites `scratchpad/code-truth-safety-spec.md`, never in
  the repo); no script, test, lane or detector implemented it. The table's
  fallback (a major newer than the table reads "current") also hid the gap:
  repos on 28 and 29 read current, so no output looked wrong.
- Corpus: 6 pages of `GET /api/repos?where[sorobanSdkVersion][exists]=true&select[...]`,
  5,865 rows, 5,865 unique ids, stored versionStatus counts equal the live
  rollup. Recomputed with main's table (`tsx measure.mts sv-before.ts`):
  soroban-sdk deprecated 404, JS deprecated 1,033, either 1,285 (stored
  1,284: SiLioLabs/PayFlow stored supported before its JS read), both 152,
  JS only 881, Rust only 252; soroban-sdk current 224.
- Live sample: 36 of the 50 deprecatedRepos rows are deprecated only through
  JS; their 23 distinct sorobanSdkVersion strings include 17 that are not a
  deprecated soroban-sdk (among them 29.0.0, 27.0.2, 26).
- `npm view soroban-client deprecated`: "now deprecated: transition to
  @stellar/stellar-sdk"; missing from PUBLISHER_DEPRECATED_JS_PACKAGES
  (8 scanned repos). 343 scanned repos store a non-JS scanner marker in
  stellarJsDep (rust-infra:cargo.toml 299, python and others 44).
- Fail first, on unfixed code: `vitest run sdk-version-table
  soroban-protocol-join` 8 failed, 3 passed; `vitest run toolchain-sdk-split
  explain-route-interface` 7 failed, 5 passed (the 5 are the file's earlier
  tests).
- After the fix, same corpus (`tsx measure.mts src/lib/soroban-versions.ts`):
  soroban-sdk deprecated 404, current 45, supported 5,321; JS deprecated
  1,041; either 1,291; JS only 887; stored vs recomputed differ on 166 rows.
- Publisher-window floors (soroban-sdk 28, JS 16), measured for the owner
  decision: soroban-sdk deprecated 5,651, JS 2,531, either 5,713.
- `pnpm exec tsx scripts/check-sdk-table.ts`: exit 0 on the new table.
- `zsh ~/.config/stellarlight/merge-tools/checks.sh`: first run red on
  code-signals.test.ts (it pinned 27.0.5 as current; updated to 29.0.1 and
  28.0.0 supported), then red on the enum-literal ratchet (8 new hand-typed
  enums, 103 over a baseline of 95); the SDK status and deprecatedBy enums
  now spread VERSION_STATUSES and DEPRECATED_BY, baseline lowered to 94.
  Then CHECKS-GREEN: tsc, 272 files and 3,753 tests, contract checks,
  writers, dating, no dashes, route exports, changelog contract, scripts
  types, lessons.
- `pnpm raven:gate --raven <stellar-raven cd1ca34>`: self-check reproduces
  the accepted totals and rebuilds Scout 1.9.135. First candidate HOLD:
  legacy cardHit5 113 to 112, q-scf-rfp-tooling lost getRfps from its top 5
  to analyzeEcosystem (224 to 244). Bisected with `--spec`: the op
  description alone (the schema additions moved nothing); a wording without
  the added "for" accepted with 3 top-5 lists changed (analyzeEcosystem
  entering a Lab, a liquidity and an auth-testing question). Final wording
  "Soroban-SDK and JS-SDK version-status distribution, apart and combined"
  (576 characters): ACCEPT, legacy 220/293/327/113, 0 questions moved, 0
  top-5 lists changed.

- 2026-11-12, after pass 3. The main session reported how the external tool
  reads the block: its deprecated-version set is the unique
  deprecatedRepos[].sorobanSdkVersion, and its diagnose step
  (src/core/diagnose.ts:105-113 in that repository, read the same day)
  marks a repo critical when its major is below the docs' current major
  and in that set. With 27 in today's sample, repos on 27 read critical
  instead of a warning. Change: the sample lists soroban-sdk-line rows
  first (404 of them: 50 on major 0 and 354 on major 20 in the corpus, so
  the 50-row sample carries majors below 21 only) and the block serves
  deprecationRule. Fail first: 4 of 10 tests in toolchain-sdk-split failed
  before 7101e7dc, all pass after; the consumer-fields test added in
  db2ecdc8 also fails on df999b52's store order.

Pass 4 on commits 7101e7dc and db2ecdc8 (sample order, deprecationRule).

- Claude Fable 5.2: GATE push. Fixed: (4) the rule text now excepts the
  publisher-deprecated packages and names undotted JS ranges as unknown;
  (5) the spec says the ordered sample is not representative. Answered:
  (3) below.
- Grok 4.7, effort high: GATE do not push. Fixed: (1, medium) same as
  Fable's 4; (3) the skill line says no rank within a group; (5) the spec
  test checks the rule's five properties; (6) the ledger now gives the
  measured majors (0 and 20) instead of the table's; (7) the fail-first
  line covers db2ecdc8's test. Answered: (2, medium) JS-only rows still
  fill the sample when fewer than 50 repos are deprecated on the
  soroban-sdk line, and those rows truthfully carry a supported
  soroban-sdk. Hiding that version would be wrong; the order is a
  mitigation for a consumer that reads the sample as a version list, the
  spec now states when it stops holding, deprecationRule and deprecatedBy
  are the fix, and the upstream draft tells the consumer to use them. On
  the 2026-11-12 corpus 404 repos are on that line.

Pass 5 on commit 798b894b.

- Claude Fable 5.2: GATE push. Items 4 and 5 hold; the answer on the
  JS-only fill is accepted. Note: the basis does not repeat "not
  representative"; the spec and skill do. Left as is.
- Grok 4.7, effort high: GATE push. Items 1 to 7 hold or the answer is
  accepted; nothing in 798b894b breaks the contract.

## Outcome

(appended at merge and after the live re-check)
