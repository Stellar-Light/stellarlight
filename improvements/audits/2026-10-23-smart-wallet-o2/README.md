# Smart wallet O2 on build search

Evidence for `improvements/rounds/2026-10-23-smart-wallet-o2.md` (lane Z4).

**Verdict: not shipped.** O2, the one candidate written and pinned before
any replay (`o2.diff`: lane Z3's O1H with H and two fixes), meets (a) L1-02
(2 on-topic winners where the base has 1), (b) byte identity (269 of 269
frozen queries without the phrase or a hyphen), (b)(ii) (0 builds graded 0
enter a top 5, 23 leave), (c) rule L's claims (0 false of 529) and (d) the
adversarial probes (10 of 10). It fails (b)(i): over every frozen set, 37
list rows and 15 query and build pairs graded 2 leave a top 5, a top 20 or
a matched list (over the six sets lane Z3's bar read, without the battery:
29 rows, 12 pairs). Split apart, not deciding: 30 of the 37 rows are
same-grade swaps (a build graded 2 replaced by another graded 2 in the same
window) and 7 are real losses, on 3 pairs: Veil and Passkey-Kit
integration on q=passkey or smart-wallet onboarding, and Zelyo, which
leaves the matched list of the battery's sa-01 topic form. Nothing ships;
O2 is kept as `o2.diff`.

## What O2 does

Everything O1H did (Z3's README): "smart wallet(s)" and "smart account(s)"
in q, spaced, underscored, hyphenated or joined, are one concept,
satisfied by either phrase (12 forms) or by passkey evidence (passkey,
passkeys, webauthn); passkey in q is never expanded; smart and wallet
apart are not evidence. With H (7bd30f78) and:

- **Fix (1), vetIdea's evidence rule.** textShare, which the rule's
  one-word path reads, counts for the smart concept either phrase and,
  where fix (2) leaves it, passkey evidence, in the build's own name or
  description. No other term changes. vetIdea's one-word note names what
  satisfies a smart concept instead of "it".
- **Fix (2), one passkey mention, one concept, per build.** When a build
  satisfies another concept of q with a form holding passkey or webauthn,
  that concept takes the passkey, and in that build the smart concept needs
  a phrase (matching, rarity weight, textShare). Otherwise passkey evidence
  satisfies the smart concept. A q holding both phrases has one concept,
  named by the first.
- **(3) Ties: scoring unchanged**, as the brief allows: the one rule on
  offer comes from these probes' failing rows.

## Method

Fixed in the ledger before any replay: commit d77f12f7 (before the rebase
noted under Checks), with the candidate pinned as `o2.diff` (sha256
aeebeec0...). One candidate; nothing tuned after. Informed by lane Z3's
report and grades, which show O1H's moves on every frozen set, the battery
questions included, so no set is held out for O2.

**Data.** Lane Z3's captures, reused (lanes Z's and Z2's, read-only GETs to
https://www.stellarlight.xyz, 2 s apart, every page 200; raw captures in
scratch, not committed). No new capture.

| capture | queries | api start, end |
| --- | --- | --- |
| lane Z probes | 27 | 1.9.99, 1.9.99 |
| labeled: 140 ideas, lane K's battery, its probe, passkey both ways | 158 | 1.9.99, 1.9.99 |
| fresh battery and its probe | 25 | 1.9.100, 1.9.100 |
| adversarial probes | 34 | 1.9.100, 1.9.100 |
| review probes | 23 | 1.9.100, 1.9.100 |
| event-in-q texts (no meaning scores) | 34 | text only |
| battery questions sa-01 and sa-02 (lane Z2's capture) | 4 | 1.9.101, 1.9.101 |

Live was 1.9.101 at the start (21:29:32Z) and 1.9.102 at the end
(21:54:17Z): H merged during the round as #1873 (dfeabfc0); see
Composition with H.

**Replay.** Lane Z's `replay.mts`, unchanged (sha256 b2e7d59c...), over
every capture for base (85843791), h (7bd30f78), o1h (Z3's formatted file)
and o2. Before any o2 output was read, this round's base, h and o1h replays
equal Z3's on all 305 queries, byte for byte, note lines too. The reranker
is not replayed; vetIdea's five are what it lists when its reranker does not
run.

**Grades** (`grades.json`, prompt `grader-prompt.txt`, lane Z's,
unchanged). Rows a criterion or report reads: 480. Labels and lane Z3's
grades (which hold lanes Z's and Z2's) answer 470; the other 10 (all part B:
4 on z01, 6 on the battery's sa-01 topic form) went on one shuffled sheet
with no mark of which variant listed a build. Two independent passes
(Claude Sonnet, each in its own order) agree on 10 of 10.

## Results

### (a) L1-02: met

`q=passkey smart wallet&winnersOnly=1`, hybrid, before the reranker:

| | matched | listed | on-topic winners in the first 10 |
| --- | --- | --- | --- |
| base | 4 | DeFi Quest (on-topic, packages), Wraith, Umbra Wallet, ANCHORSHIELD | 1 |
| O2 | 4 | DeFi Quest (on-topic, packages), Wraith, Tukar (on-topic, packages), ANCHORSHIELD | 2 |

Keyword: base 1 (Umbra Wallet, for wallet in its name), O2 2 (DeFi Quest
and Tukar, each matching passkey only, through declared passkey-kit). By
name or summary alone: 0 before and after.

### (b) Byte identity: met

Every frozen query without the phrase or a hyphen is byte-identical in
every field: lane Z probes 15 of 15, labeled 146 of 146, fresh 25 of 25,
adversarial 27 of 27, review 23 of 23, event-in-q 33 of 33 (269).

### (b)(i) No build graded 2 leaves: failed

| scope | list rows | query and build pairs |
| --- | --- | --- |
| every frozen set (the binding scope) | 37 | 15 |
| the six sets Z3's bar read (no battery) | 29 | 12 |
| the battery alone | 8 | 3 |
| reference: O1H, every frozen set | 32 | 14 |
| reference: O1H, the six sets | 27 | 12 |

By query (base to O2):

- **z01 passkey smart wallet, all builds (13 rows, 6 pairs).** Every
  passkey-only build now covers one concept of two, as the phrase-only
  builds do. Prism, Zelyo and TalkToStellar (declared passkey-kit, with
  smart or wallet in their text, which covered two or three of the base's
  three words) and Buckspay SDK (passkeys and WalletConnect) fall out
  of the keyword top 5 (1st to 18th, 3rd to 21st, 4th to 16th, 5th to 11th)
  for DeFi Quest, Tukar, Stellar Smart Wallets and x402 Smart Wallet; Prism
  and Buckspay SDK leave the hybrid top 5 for DeFi Quest and lumengate;
  Zelyo, TalkToStellar, Stellaro and Prism leave a top 20; the
  Tornado-style privacy pools build leaves vetIdea's five and the brief's
  picks for lumengate. Every entry is graded 2.
- **z03 smart wallet (2 rows) and z04 smart account (10 rows).** As in
  O1H (the same route order and members; only textShare differs): the two
  passkey-kit winners take 1st and
  2nd, and builds naming a passkey or a smart wallet pass builds that write
  the phrase in their summary (mechanism 3, unchanged): Safe.xlm 4th to
  7th; Agent Rep, lumengate and Stelakey leave both z04 top 5s, and Agent
  Rep and Stelakey leave vetIdea's five and the brief's picks, which now
  hold Passkey-Kit integration, x402 Smart Wallet and Safe.xlm. Every
  entry is graded 2.
- **z08 passkey or smart-wallet onboarding, all builds (4 rows, 2 pairs,
  real losses).** lumengate ("passkey smart accounts"; graded 1 for this
  query, and its text says nothing of onboarding) covers passkey and,
  through the other phrase, the smart-wallet concept, 2 of 3, and enters
  at 2nd (keyword) and 4th (hybrid, vetIdea, brief). Passkey-Kit
  integration (keyword) and Veil (hybrid), both graded 2, go from 5th to
  6th, so Veil also leaves vetIdea's five and the brief's picks. In O1H
  Veil fell to 18th.
- **Battery sa-01, topic form (8 rows, 3 pairs).** Prism leaves the keyword
  top 5 for x402 Smart Wallet and the Tornado-style build leaves the hybrid
  top 5, vetIdea's five and the brief's picks for Passkey-Kit integration
  (swaps); Zelyo leaves the keyword and hybrid matched lists (real loss).
  In the base Zelyo covered half of q through declared passkey-kit, smart
  (from "smart contracts") and contract; in O2 q's passkey takes its
  passkey-kit, smart no longer counts alone, and 2 of 5 concepts fall
  below the half rule. In O1H it stayed through the passkey counted twice.

Nothing graded 2 leaves on i02, the hyphenated labeled ideas, the
adversarial, review or event-in-q sets.

### Reported apart: the split of bar (i)'s rows (not deciding)

Each build graded 2 that leaves a window (one query, one list, one depth)
is paired with one graded 2 that enters the same window; an unpaired exit
is a real loss.

| | rows: swaps + real losses | pairs: swaps only + with a real loss |
| --- | --- | --- |
| O2, every frozen set | 37 = 30 + 7 | 15 = 12 + 3 |
| O2, the six sets | 29 = 25 + 4 | 12 = 10 + 2 |
| O1H, every frozen set | 32 = 23 + 9 | 14 = 10 + 4 |
| O1H, the six sets | 27 = 18 + 9 | 12 = 8 + 4 |

O2's real losses: z08 Veil (hybrid top 5, vetIdea's five, the brief's
picks) and Passkey-Kit integration (keyword top 5); battery sa-01 topic
Zelyo (keyword matched, hybrid top 20, hybrid matched). O1H's were z04
Stellar Smart Wallets, Agent Rep and Stelakey (vetIdea's five, the brief's
picks) and z08 Veil.

### Reported apart: vetIdea's five, its size (base, O1H, O2)

Every changed query keeps its size in O2 except z07 (smart account policy
signers, all builds): 4, 1, 1. The ones fix (1) restored: z03 all 5, 3, 5
and z04 all 5, 1, 5. The rest, equal across all three: z01 winners 1 and
all 5; z03 and z04 winners 0; z05 (passkey-kit) winners 0 and all 3; z07
winners 1; z08 winners 2 and all 5; i02 5; the nine hyphenated labeled
ideas and the two tests ideas 5 each; p28 to p34 5 each (p31 3); event-in-q
p02 0; battery sa-01 verbatim 5, sa-01 topic 5, sa-02 verbatim 5, sa-02
topic 1. On z07 the three builds that leave (Stellar Smart Wallets, Agent
Rep, lumengate) are graded 1.

### (b)(ii) Builds graded 0 in the top 5s: met

0 entered, 23 left (z03 12, z04 10, z07 1).

### (c) Rule L's claims: met

`../2026-10-23-nonsense-queries/check-unused.py` over O2's lines, with lane
K's replay run with O2 and rule L off and on: 0 false of 529 (labeled 222,
fresh 144, adversarial 54, review 69, event-in-q 38 without withheld
replays, battery 2; lane Z's probes fire none) (`unused.txt`).

### (d) Adversarial probes: met

z09 to z13, winners only and not: 10 of 10 byte-identical.

### Probe table

Hybrid, base, O1H, O2: matched builds, and in the first 10 the builds
graded 2 and 0 (blind, against the probe).

| probe | all: matched | all: grade 2 | all: grade 0 | winners: matched | winners: grade 2 | winners: grade 0 |
| --- | --- | --- | --- | --- | --- | --- |
| z01 passkey smart wallet (L1-02) | 63, 57, 57 | 8, 10, 8 | 2, 0, 2 | 4, 4, 4 | 1, 2, 2 | 2, 2, 2 |
| z02 passkey | 15, 15, 15 | 10, 10, 10 | 0, 0, 0 | 2, 2, 2 | 2, 2, 2 | 0, 0, 0 |
| z03 smart wallet | 167, 21, 21 | 5, 10, 10 | 4, 0, 0 | 12, 2, 2 | 0, 2, 2 | 6, 0, 0 |
| z04 smart account | 120, 21, 21 | 5, 10, 10 | 5, 0, 0 | 7, 2, 2 | 1, 2, 2 | 5, 0, 0 |
| z05 passkey-kit | 19, 19, 19 | 10, 10, 10 | 0, 0, 0 | 2, 2, 2 | 2, 2, 2 | 0, 0, 0 |
| z06 passkey wallet onboarding | 36, 36, 36 | 2, 2, 2 | 1, 1, 1 | 3, 3, 3 | 1, 1, 1 | 1, 1, 1 |
| z07 smart account policy signers | 11, 5, 5 | 0, 0, 0 | 4, 0, 0 | 1, 1, 1 | 0, 0, 0 | 0, 0, 0 |
| z08 passkey or smart-wallet onboarding | 65, 73, 65 | 3, 2, 3 | 3, 1, 3 | 4, 5, 4 | 1, 1, 1 | 2, 2, 2 |

On z01 and z08 over all builds, O2's hybrid top 10 holds as many builds
graded 0 as the base's (2 and 3), where O1H's held 0 and 1.

### Battery questions (part of the binding scope above)

The battery's named builds in the replay's rankings, base, O1H, O2:

| question, form | mode | first 10 | first 20 | matched |
| --- | --- | --- | --- | --- |
| sa-01 topic (all builds; 4 of 11 needed) | hybrid | 7, 6, 7 | 8, 7, 8 | 8, 8, 8 |
| sa-01 topic | keyword | 4, 4, 5 | 5, 5, 6 | 6, 6, 6 |
| sa-01 verbatim | hybrid | 4, 4, 4 | 5, 5, 5 | 10, 10, 10 |
| sa-01 verbatim | keyword | 2, 2, 2 | 2, 2, 2 | 2, 2, 2 |
| sa-02 topic and verbatim (winners; 2 required) | both | O2 byte-identical to the base | | |

## Why O2 fails

Fix (1) did what it was for: vetIdea's five on q=smart account hold 5
builds again, and O1H's six real-loss rows there are gone. Fix (2) did what
it says (a passkey mention covers one concept) and brought Veil back from
18th to 6th on z08. What is left:

1. **Ties inside one concept (mechanism 3), unchanged by design.** On z03
   and z04 the route order equals O1H's: 12 rows, all same-grade swaps.
2. **One concept of two, weighed by rarity.** On z01 every passkey-only
   build covers one concept of two, and the smart-wallet concept, now held
   by the few builds that write a phrase (passkey builds keep their passkey
   for q's passkey), is the rarer of the two. So lumengate (both concepts),
   the passkey-kit winners (the winner edge) and the builds writing the
   phrase pass the passkey-kit builds that also wrote smart or wallet: 13
   rows, all same-grade swaps.
3. **The other phrase is real coverage.** On z08 a build that writes
   passkey and smart account covers two concepts of three without the
   onboarding the query asks for, and displaces two builds graded 2 from
   5th: the only real losses on the six sets (two pairs, one query).
4. **A word match the base had goes.** On the battery's sa-01 topic form,
   Zelyo (graded 2) stood in the matched list partly on "smart" from "smart
   contracts"; with smart gone as a word (O1) and its passkey-kit counted
   for q's passkey only (fix 2), it covers 2 of 5 concepts and falls below
   the half rule.

Read with lanes Z, Z2 and Z3: each of the four candidates that lists DeFi
Quest and Tukar for L1-02 has moved builds graded 2 out of some fixed
window on lane Z's probes. Here 30 of the 37 rows are swaps inside a window
whose entries are graded 2 too; whether bar (i) should count those is the
open question Z3 left for the owner.

## Composition with H

- **With 7bd30f78** (the H this round measured): `o2.diff` is a diff
  against it; `git apply --check` passes there.
- **With the H that merged** (#1873, dfeabfc0, now on main): it differs
  from 7bd30f78 by `phraseForms` (a hyphenated phrase's number varies on its
  last part only). A plain `git apply` of `o2.diff` on dfeabfc0 fails on
  one context line (`wordForms(t).flatMap` is now `phraseForms(t).flatMap`);
  `git apply -3` applies all four files cleanly, and so does `git
  merge-file` on the matcher. The merged H replays byte-identical to
  7bd30f78 on all 305 queries, and O2 merged onto it replays byte-identical
  to the measured O2 on all 305: every result above holds on main.

## Checks

| check | O2 candidate (on 7bd30f78) | O2 with `git apply -3` on main (dfeabfc0) | evidence-only tree (on dfeabfc0) |
| --- | --- | --- | --- |
| tests first (`failing-first.txt`) | 6 of 7 new tests fail on the H tree, the guard passes; with O1H's matcher, the 5 tests of the fixes fail | n/a | n/a |
| `npx tsc --noEmit` | exit 0 | exit 0 | exit 0 |
| `npx vitest run src/lib/ src/components/ src/app/ src/collections/ src/data/ --maxWorkers=4 --minWorkers=1` | 2,694 of 2,694, 217 files (a first run timed out once in rate-limited-429's audits case at 5 s, cold import; it passed alone and in the full rerun) | 2,695 of 2,695, 217 files | 2,688 of 2,688, 217 files |
| biome | clean on the 4 changed files (after formatting) | clean on the 4 files | clean (`grades.json` formatted by biome, same JSON) |
| `pnpm contract:write`, `contract:check`; `pnpm raven:gate` | not run: nothing ships, no spec or description change | not run | not run |

The branch's two commits were moved from 7bd30f78 onto main (dfeabfc0)
after H merged as #1873: the method commit d77f12f7 is dd58c0c2, author
date kept (21:39:12Z, before the first replay at 21:39:58Z).

## Open risks

- The binding scope counts the battery. Over the six sets Z3's bar read, O2
  still fails (29 rows, 12 pairs), so the verdict does not turn on it.
- Grades are drafts: one model family for both passes, lane Z3's reused
  grades the same, labels pending owner review. The rubric grades a passkey
  build as answering q=smart wallet, so the bar protects passkey builds
  there too.
- The reranker is not replayed: route rankings are before it, and vetIdea's
  five are what it lists when its reranker does not run. Most failing rows
  are top-5 swaps the live reranker may reorder.
- Fix (2) was read at the build level. Z3's q-level lead (drop passkey
  evidence from the phrase whenever q names a passkey) was not measured.
- vetIdea's new one-word note is covered by a unit test, not the replay.

## Files

- `o2.diff`: the candidate (code and tests) against 7bd30f78, pinned in the
  method commit. Apply with `git apply` on 7bd30f78, or `git apply -3` on
  main.
- `replay.mts`: lane Z's replay, unchanged.
- `measure.py`: the blind sheet (`sheet`), the two passes joined (`grades`)
  and the results (`report`), adapted from lane Z3's for base, h, o1h and
  o2, with the binding scope, the split and vetIdea's five sizes.
- `grader-prompt.txt` (lane Z's, unchanged) and `grades.json`: every grade a
  criterion or report reads, by build name, each row naming its source; a
  battery question is named by its id (`held out sa01-topic`), its text
  stays in scratch.
- `report.txt`: the replays against Z3's, byte identity per variant, every
  graded move base to O2, bar (i) by scope, the split, vetIdea's five sizes,
  O1H and H as references, O1H to O2, L1-02, the probe top 10s and the
  battery questions (by id).
- `unused.txt`: check-unused.py on every capture (battery questions by id).
- `failing-first.txt`: the new tests on the H tree and on O1H's matcher.

## Rerun

From the repository root; `<s>` is a scratch folder holding `captures.json`
(capture name to path: lane Z's z-probes, z-labeled, z-fresh2, z-adv,
z-review, z-eventq and lane Z2's z-battery) and `check-base.txt` (this
round's base, h and o1h replays compared with lane Z3's).

```
# per variant v in base, h, o1h, o2, with that variant's src/lib/hackathon-builds.ts in the tree
# (and, for o2 only, O2's src/lib/vet-idea.ts, which imports SMART_CONCEPT):
pnpm exec tsx improvements/audits/2026-10-23-smart-wallet-o2/replay.mts <capture> <v> <s>/<name>-<v>.json <s>/<name>-<v>.note.txt
python3 -I improvements/audits/2026-10-23-smart-wallet-o2/measure.py sheet <s> <laneZ3 grades.json> probes labeled fresh2 adv review eventq battery
python3 -I improvements/audits/2026-10-23-smart-wallet-o2/measure.py grades <s> <laneZ3 grades.json> improvements/audits/2026-10-23-smart-wallet-o2/grades.json probes labeled fresh2 adv review eventq battery
python3 -I improvements/audits/2026-10-23-smart-wallet-o2/measure.py report <s> improvements/audits/2026-10-23-smart-wallet-o2/grades.json probes labeled fresh2 adv review eventq battery
# withheld claims: lane K's replay (../2026-10-23-build-matching/replay.mts) with o2, rule L off (namesAdmit = true) and on, then per capture
python3 -I improvements/audits/2026-10-23-nonsense-queries/check-unused.py <capture> <s>/<name>-o2.note.txt <s>/<name>-norule.json <s>/<name>-rule.json
```

`grades` reads `<s>/grades-pass-a.json` and `<s>/grades-pass-b.json`, the
two graders' answers to `<s>/sheet.json` in their own orders. Lane Z3's
grades are `../2026-10-23-smart-wallet-oneway/grades.json` at 7f698e75.
