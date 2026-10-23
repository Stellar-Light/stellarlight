# locateSource ranking: natural questions to exact symbols (2026-10-23)

Evidence for `improvements/rounds/2026-10-23-locate-ranking.md`. Spec
placeholder 1.9.105.

**Verdict: bars 1 and 2 met. Bar 3 not met as written; waived by the
orchestrator because no frozen case ends below its main rank, and the joins
carry f01 25 to 15, f04 8 to 4 and two priority items.** The review's other
fixes are kept; its quickstart weight split was dropped (f15 fell 25 to 102
under it), so no frozen case ends below its main rank, and the over-match
the split targeted is a known follow-up (see "Repo named in q").

| set (symbol level) | base top 1/3/10 | this branch top 1/3/10 |
| --- | --- | --- |
| dev, 16 tuned cases | 2/6/8 | 6/9/14 |
| dev, 8 held-out cases (run once) | 1/2/4 | 3/4/6 |
| dev, all 24 | 3/8/12 | 9/13/20 |
| frozen `battery.frozen.json` (20) | 11/19/20 | 15/19/20 |
| frozen `fresh-battery.frozen.json` (20) | 7/9/10 | 8/9/12 |

| set (file level) | base top 1/3/10 | this branch top 1/3/10 |
| --- | --- | --- |
| frozen `battery.frozen.json` | 16/20/20 | 18/20/20 |
| frozen `fresh-battery.frozen.json` | 10/12/15 | 11/14/17 |

- **Bar 1** (dev top 10 up by at least 5 of 24, symbol level): up 8, from
  12 to 20. Gains: d01, d17, d19, d20, d22, d23 (tuned), d06, d24 (held
  out). d19 and d20 are won only by the new repo, so 6 without them; d22,
  d23 and d24 are the CLI command class added by amendment A1. No dev case
  left the top 10; moved down inside it: d05 3 to 8, d10 1 to 2, d11 7 to
  8, and held-out d09 1 to 4.
- **Bar 2** (no frozen top-10 loss): none at file or symbol level, and no
  frozen case below its base file rank. Symbol ranks that moved down inside
  the top 10: m2 4 to 9, f19 2 to 6.
- **Priority questions** (check, not tuned on, and not held out: they
  found the five classes): 0 to 3 strict passes, 2 to 8 of 12 required
  items. The base run reproduces the live 1.9.100 grades exactly.

Ranks are offline, rows built from public tarballs at the live index's
commits (stellar-core `05c6328c13b5`, rs-soroban-sdk `8e5b425dce5f`,
rs-soroban-env `0c99950e9612`, js-stellar-sdk `0f2fd40ba6db`, stellar-rpc
`ec4171d970ac`, quickstart `0ff76e336a43`, stellar-cli `4ff88b7ea11d`,
soroban-examples `03d42aa6b973`) plus OpenZeppelin/stellar-contracts
`ddc327eb92d6`, with the route's own parse, candidate and rank functions.
Base: origin/main `d9bd53b5` over the eight-repo index it serves (21,440
pointers). This branch: nine repos and impl locators (25,903).

## What changed

1. **Identifier candidates.** Runs of adjacent plain words (a stopword, a
   filler word, a repo name, an identifier or punctuation ends a run; the
   search stopwords stellar, protocol and build may sit inside one) are
   read as one name, case and separator blind, plurals and the code
   abbreviations folded: "token interface" is TokenInterface, "initialize
   friendbot" is init_friendbot. Per run the best span adds 8 when it is
   the whole symbol, heading or file name and 5 when the name holds it,
   times the square of the share of the run it covers; a symbol counts a
   held span only when the span is the whole run. An identifier typed in q
   (camelCase, PascalCase, snake_case, a::path, a.member, a --flag,
   kebab-case of three parts, letters run into digits such as secp256k1)
   found whole in a name counts twice its tier.
2. **Synonym map** (`src/lib/source-locator-synonyms.ts`, 11 entries, each
   with its reason and a test, and a test that fails when an entry has
   none): passkey, webauthn, p256 to secp256r1; ecdsa to secp256k1 and
   secp256r1; ethereum to secp256k1, keccak256 and eth; keccak to
   keccak256; sep41 and sep0041 to TokenInterface; sac to
   StellarAssetContract; signature to sig; bls to bls12 and bls12381. A
   word scores its best form; a synonym in identifier form counts as typed.
3. **A repo named in q** (owner/name, name or alias) adds 8, the weight of
   an exact name, where it added 3. Not a filter: see "Repo named in q".
4. **`impl Trait for Type` locators** for top-level Rust impl blocks
   (generic arguments dropped: `impl<'a> From<&'a Address> for Val` is
   `impl From for Val`), kind symbol, with a per-file cap of their own so
   no existing locator is displaced.
5. **OpenZeppelin/stellar-contracts** in the allowlist, role
   implementation, alias `openzeppelin` only ("stellar contracts" in prose
   names no repo), the same HEAD and ref handling as the others.
6. **CLI commands** (amendment A1): `stellar` or `soroban`, or an alias
   naming stellar-cli ("the stellar CLI"), followed by two or more
   lowercase words names a module under `cmd/soroban-cli/src/commands/`
   (alias and filler words skipped; punctuation, a quote or a stopword
   other than build or show ends the words). The route also reads every
   row under it (its `Cmd` and `run` share no word with q), each matching
   command word adds 8, the deepest module first, and a command no pointer
   implements ("how stellar contracts store data") is dropped, so it adds
   nothing to the score's maximum either.

The score's maximum counts each word of q at its strongest form, so a
synonym in identifier form (sac as StellarAssetContract) no longer pins
every top pointer at 100.

## Repo named in q: a strong boost, not a filter

Measured on the chosen configuration (`rules.txt`, f-repo3): with the old
weight 3, m2 leaves the symbol top 10 (9 to 13) and f01 (15 to 21), f12 (5
to 7) and f20 (1 to 2) fall; on an earlier variant f17 also fell 3 to 7
(`ablations.txt`, a-repo3). Every one of those questions names its repo by
a hyphenated name. The review asked for a split weight, 3 for quickstart,
a docs word too: "quickstart guide to deploy a contract" puts a quickstart
README heading ("Deploy to Digital Ocean") above the exact deploy and
Contract symbols. Measured, the split moved only f15, 25 to 102: it names
quickstart by the bare word and also names stellar-rpc and stellar-core,
whose integration-test port constants then outranked quickstart's README
"Ports" heading (`rules.txt`, r-lift8). It was dropped; quickstart lifts by
8 and the over-match stays a known follow-up in `improvements/TODO.md`, for
a split weight that also handles f15's case, measured in a later round. A
filter, or a rank tier that puts the named repo first, was not chosen: the
priority questions name one repo while half the answer is in another
(sa-05 names the Soroban SDK and expects the soroban-examples account
contract's `impl CustomAccountInterface for AccountContract`, rank 9 with
the boost; it would be gone under a filter), "quickstart" is also a common
word, and `total` keeps counting every match. `repo=` stays the explicit
filter.

## Typed identifiers: a weight, not a rank tier

The first variant ranked every pointer matching a typed identifier first.
It put m2's expected options at symbol rank 335: every row holding
getTransactions (rpcv2 defaults, handlers, js types) outranked
`default-transactions-limit`, whose name lacks "get". Counting a whole
typed match twice keeps m2 in the top 10 (9). Once instead of twice puts
c06's symbol out of the top 10 and moves c08, c18, c19, f05, f09 and f12
down (`rules.txt`, f-typed1); three times, measured on an earlier variant,
put m2 at 23.

## Bar 3

`rules.txt` removes each rule alone from the chosen configuration. Every
synonym entry, the map as a whole, headings and file names in joins, the
three stopwords that may join, kebab typing, typed x2, repo +8, impl
locators, CLI commands and the owner/name rule move no frozen case down.
Four joining rules do under the strict reading (rule on against rule off,
everything else equal):

| rule | case: rank off to on (base) |
| --- | --- |
| joins at all | f05 1 to 4 (4) |
| held joins | f05 2 to 4 (4) |
| a symbol's held join needs the whole run | f19 1 to 2 (2) |
| squared run share | f01 3 to 15 (40), f04 3 to 4 (7), f19 1 to 2 (2) |
| punctuation ends a run | f05 1 to 4 (4) |

None of these leaves a case below its base rank, and each also helps
(joins: f01 25 to 15, f04 8 to 4; held joins: f08 2 to 1, f13 4 to 3; the
whole-run rule: f17 3 to 1; the squared share: f06 2 to 1 and c17's
symbol back into the top 10, 18 to 2). The ledger fixed the bar as "its file rank worsens with
the rule on, everything else equal"; read that way every joining variant
tried fails on f05 (`ablations.txt`, round 2), because f05's own phrases
("max TTL", "min persistent") are names in other files. Applied against
the base ranks, which is what these batteries guard, all rules pass.

Bar 3 not met as written; waived by the orchestrator because no frozen case ends below its main rank, and the joins carry f01 25 to 15, f04 8 to 4 and two priority items.

## Builder: creates only

`builder-dry-run.test.ts` runs `scripts/build-source-locators.ts` in dry
mode with in-memory stores filled by the base extraction over the same
tarballs (`builder-dry-run.txt`):

| repo | stored | create | update | delete |
| --- | ---: | ---: | ---: | ---: |
| stellar/stellar-core | 7,228 | 26 | 0 | 0 |
| stellar/rs-soroban-sdk | 874 | 205 | 0 | 0 |
| stellar/rs-soroban-env | 3,091 | 502 | 0 | 0 |
| stellar/js-stellar-sdk | 3,789 | 0 | 0 | 0 |
| stellar/stellar-rpc | 3,258 | 0 | 0 | 0 |
| stellar/quickstart | 410 | 0 | 0 | 0 |
| stellar/stellar-cli | 1,977 | 128 | 0 | 0 |
| stellar/soroban-examples | 813 | 11 | 0 | 0 |
| OpenZeppelin/stellar-contracts | 0 | 3,591 | 0 | 0 |

Every create in the eight indexed repos is an impl locator, and every
stored row is rebuilt byte for byte (asserted). `rowKey` and `rowTerms` are
unchanged, the impl cap is separate, so a re-key cannot happen; the shrink
guard is never reached. A unit test in
`src/lib/__tests__/build-source-locators.test.ts` holds the same property.

## Priority questions, base to this branch

| id | class | must items: rank (met, partial, not) | strict |
| --- | --- | --- | --- |
| hm26-sc-05 | joined, SEP-41, impl | TokenInterface 19 n to 1 m; `impl TokenInterface for Token` p to 2 m | no to yes |
| hm26-sc-06 | typed, repo named | NewSimulateTransactionHandler 28 n to 1 m | no to yes |
| hm26-sa-05 | joined, impl | CustomAccountInterface 2 m to 1 m; `impl CustomAccountInterface for AccountContract` p to 9 m | no to yes |
| hm26-sa-06 | passkey, WebAuthn | secp256r1_verify 227 n to 17 n; secp256r1_verify_signature 24 n to 10 m | no |
| hm26-cc-05 | Ethereum, secp256k1 | secp256k1_recover 198 p to 24 p; keccak256 6 m to 1 m; recover_key_ecdsa_secp256k1 421 p to 25 n | no |
| hm26-cc-06 | SAC, CLI deploy | asset.rs `Cmd` p to n; StellarAssetContract 12 n to 1 m | no |

sa-06 and cc-05 now reach the crypto names, but benchmark and cost-runner
rows named after the same words (`VerifyEcdsaSecp256r1SigMeasure`,
`ComputeKeccak256HashRun`) fill the top 10. cc-06's CLI item needs
`stellar contract asset deploy`, which the question never types.
`priority-base.json`, `priority-final.json`; battery sha256
`9b4ee6be767ba63331e66917e8be979cc11d7712b1a1e761a03bf16b4dcf4745` (not in
this repo).

## Open risks

- Bar 3's strict reading would drop every joining rule (above).
- sa-06 and cc-05: a per-file cap in a page, or ranking `benches/` and
  cost-runner files below equal matches, is the next lever; neither built
  nor measured.
- "quickstart" as a docs word lifts stellar/quickstart by 8: "quickstart
  guide to deploy a contract" puts a quickstart README heading first
  (known follow-up). Camel-case brand names (WebAuthn, JavaScript) count as
  typed identifiers.
- scout-mcp's `locate_source` (repo enum without OpenZeppelin, "eight
  repos" text) and the api-client release trail the API; both are queued in
  `improvements/TODO.md`.
- The CLI mapping hard-codes stellar-cli's tree; a restructure turns it off
  silently (term reads still answer). Clap aliases are not followed;
  `stellar contract deploy` lifts the `deploy.rs` dispatcher and
  `deploy/wasm.rs` alike.
- OpenZeppelin's examples repeat generic names (`ExampleContract` in 40
  files, `TokenContract`): f04 is at file rank 4 with them, 2 without.
- Scores deflate (the maximum counts joined runs, typed doubles and
  command words); `factors` gains `join`, `ident` and `cmd`.
- Once deployed, the daily schedule writes the impl locators for the eight
  repos on its next run (creates only, about 872 at these commits), with no
  hand dry run first unless one is dispatched before 05:17 UTC.
- d21 exposed a defect (command detection read only the first "stellar"),
  fixed after the held-out run: d21 is no longer held out (rank 2 after the
  fix). The held-out numbers above are the run before the fix.
- sa-05's impl pointer is at rank 9: a thin margin.

## Reproduce

```bash
# tarballs: https://codeload.github.com/<owner>/<repo>/tar.gz/<ref> saved as <owner>_<repo>.tar.gz
pnpm exec tsx scripts/source-locator-battery.ts --tarballs <dir> \
  --battery improvements/audits/2026-10-23-locate-ranking/dev-set.frozen.json
pnpm exec tsx scripts/source-locator-battery.ts --tarballs <dir> \
  --battery improvements/audits/2026-10-23-source-locator/fresh-battery.frozen.json \
  --also OpenZeppelin/stellar-contracts@ddc327eb92d63709436da3a8455f641c2d5476c5
BASE_LIB=<dir with origin/main's two source-locator files> TARBALLS=<dir> \
  pnpm exec vitest run --config improvements/audits/2026-10-23-locate-ranking/vitest.dry-run.config.mts
pnpm exec tsx improvements/audits/2026-10-23-locate-ranking/priority-check.ts <battery.json> <dir>
```

Base numbers come from the same harness logic run over a copy of origin/main's
`src/lib/source-locator.ts` and `source-locator-extract.ts`.

## Files

- `dev-set.frozen.json`, `dev-heldout.frozen.json`, `dev-set-a1.frozen.json`,
  `dev-heldout-a1.frozen.json`: the dev set and amendment A1 (hashes in the
  ledger).
- `before-after.json`: every case, base and branch ranks (held-out cases
  also with the run before the fix).
- `*-result.json`: this branch's harness output per set (frozen batteries
  over nine repos).
- `failing-first.txt`, `ablations.txt`, `rules.txt`, `builder-dry-run.txt`,
  `raven-gate.txt` (ACCEPT 1.9.105, output identical to the 1.9.101 run
  apart from the version; a first wording of the routing purpose that
  named "OpenZeppelin's Soroban contracts" was held, see the ledger),
  `priority-*.json`.
