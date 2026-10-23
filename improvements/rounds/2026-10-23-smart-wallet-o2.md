# 2026-10-23: smart wallet O2 on build search

## Scope

`q=passkey smart wallet&winnersOnly=1` lists 1 on-topic winner, and
benchmark question L1-02 needs at least 2. Lane Z3's O1H
(`2026-10-23-smart-wallet-oneway.md`, branch `lane/z3-smart-wallet-oneway`,
7f698e75, not merged) met L1-02 and every other bar but failed the strict
regression bar (b)(i) on 12 query and build pairs, and named the
mechanisms: (1) vetIdea's evidence rule took only q's own phrase, so
q=smart account dropped builds that write smart wallet; (2) one passkey
mention covered two concepts of q; (3) inside one concept, ties go by
score, so a form in the name passes a summary. This round measures O2, O1H
with H and fixes for (1) and (2), under Z3's strict bars unchanged.

## Lanes

| lane | model and effort | write set | output |
| --- | --- | --- | --- |
| Z4: smart wallet O2 | Claude Opus 5.5, high | own worktree, branch `lane/z4-smart-wallet-o2` off origin/main 85843791 with H (7bd30f78, `lane/h-hyphen-phrases`) fast-forwarded in: `src/lib/hackathon-builds.ts`, `src/lib/vet-idea.ts`, their tests, spec and skill text, changelog, version, `improvements/audits/2026-10-23-smart-wallet-o2/`, this ledger | commits on the branch, not pushed |

Blind grading is done by separate agents (Claude Sonnet, through the Agent
tool), which see queries and builds but never which variant listed a
build. The orchestrator's independent review follows on a model other than
the author's.

## Review

(pending: the orchestrator's review of the lane's commit)

## Method (fixed before any replay, 2026-10-23T21:38Z)

**What informed the design.** Lane Z3's README, report and grades (every
move O1H made on every frozen set, the battery questions included) and the
brief, which names the two fixes. So no set is held out for O2: Z3's report
showed O1H's moves on the battery questions too.

**The candidate, O2. One candidate; nothing is tuned after.** Pinned as
`../audits/2026-10-23-smart-wallet-o2/o2.diff` against 7bd30f78 (sha256
aeebeec0...); `src/lib/hackathon-builds.ts` sha256 bb915404...,
`src/lib/vet-idea.ts` e4b6c8e5.... No replay of any variant had run in this
tree when it was pinned.

- **O1, as Z3 measured it.** In q, "smart wallet(s)" and "smart
  account(s)", spaced, underscored, hyphenated or joined, with no letter,
  digit or hyphen against an edge, are one concept, `smart-wallet` or
  `smart-account`; smart, wallet and account stop counting on their own.
  The concept is satisfied by either phrase in either number and spelling
  (12 forms) or by passkey evidence (passkey, passkeys, webauthn;
  passkey-kit and passkey-kit-sdk hold passkey). passkey and every other
  word of q are never expanded. smart and wallet apart are not evidence.
- **H.** 7bd30f78 as it is: a hyphenated term matches both numbers, spaced
  and joined.
- **Fix (1), vetIdea's evidence rule.** textShare, which the rule's
  one-word path reads, counts for the smart concept either phrase (12
  forms) and passkey evidence, where fix (2) leaves the passkey to the
  smart concept, in the build's own name or description. No other term's
  own forms change. vetIdea's one-word note names what satisfies a smart
  concept ("smart wallet, smart account, a passkey or WebAuthn") instead of
  "it"; the replay does not read that note.
- **Fix (2), one passkey mention, one concept.** Read at the build level,
  as the brief says ("in one build"): passkey evidence is one fact, whichever
  word says it. When a build satisfies another concept of q with a form
  holding passkey or webauthn (q's passkey, passkeys, passkey-kit or
  webauthn), that concept takes it, and in that build the smart concept
  needs a phrase form: in matching, in the rarity weight and in textShare.
  Otherwise passkey evidence satisfies the smart concept, as O1H did. Two
  smart concepts would let one mention cover both, so a q holding both
  phrases has one concept, named by the first; no frozen query holds both.
  A consequence, not a scoring change: where a build's passkey is taken,
  passkey forms add no score to the smart concept. Not measured: Z3's
  q-level lead (drop passkey evidence from the phrase whenever q names a
  passkey), which also meets "at most one" but leaves a WebAuthn-only build
  with no concept of q=passkey smart wallet.
- **(3) Ties: scoring unchanged.** The one rule on offer (a build writing
  q's own phrase above one matched through expansion, at equal coverage)
  comes from these probes' failing rows, so it would be tuned on them.

It all lives in `queryTerms`, a new `heldTerms` and the scorer of
`searchHackathonBuilds`, so the builds route, vetIdea, hackathonBrief,
scfPitch and reviewSubmission's vet blocks, analyze's q and
wordsNoBuildUses (rule L and the warning) read it.

**Data.** Lane Z3's captures, reused (lanes Z's and Z2's, read-only GETs to
https://www.stellarlight.xyz, 2 s apart, every page 200; raw captures in
scratch): lane Z's probes (27 runs, 1.9.99 at both ends), labeled (158,
1.9.99), fresh battery (25, 1.9.100), adversarial (34, 1.9.100), review
(23, 1.9.100), event-in-q texts (34, no meaning scores), lane Z2's battery
capture (4, 1.9.101); corpus 1,356 submissions in each. No new capture.
Live at the start: 1.9.101 (21:29:32Z); origin/main 85843791.

**Replay.** Lane Z's `replay.mts` as Z3 kept it, unchanged (sha256
b2e7d59c...), over every capture for four variants, swapping
`src/lib/hackathon-builds.ts` (restore checked by `cmp`): base (85843791,
equal to Z3's base file), h (7bd30f78), o1h (Z3's formatted O1H file, for
comparison) and o2 (the candidate). Before any o2 output is read, this
round's base, h and o1h replays are compared with Z3's, byte for byte. Per
query: the builds route's keyword and hybrid rankings (declared packages
matched, one row per submission, winners only where captured so) with
every field of every row, rule L's withheld builds and the warning, the
plain rankings, vetIdea's five (as when its reranker does not run) and the
brief's picks. The reranker is not replayed.

**Changed queries**, fixed by their text alone, as in Z3: q (trimmed,
lowercased) holds a hyphen, or "smart" followed by wallet or account with
spaces, underscores or nothing between.

**Criteria: Z3's strict bars, unchanged. O2 ships only if all hold, base
to O2.**

- **(a) L1-02.** On z01 winners only (`q=passkey smart wallet`), hybrid,
  the replay's first 10 rows hold at least 2 winners graded on-topic, blind
  (lane Z's part A). Also reported: keyword mode, matched counts, the count
  by name or summary alone.
- **(b) Byte identity.** Every frozen query without the phrase or a hyphen,
  in every capture: byte-identical, every field.
- **(b)(i) No build graded 2 leaves** any top 5 (the route's keyword and
  hybrid rankings, vetIdea's five, the brief's picks), the route's top 20s
  or its matched lists, on the changed queries across all frozen sets:
  lane Z's probes, labeled, fresh battery, adversarial, review, event-in-q,
  and lane Z2's battery capture. The battery counts because it is frozen
  and not held out from O2. Also reported: the reading over the six sets
  Z3's bar read, without the battery.
- **(b)(ii)** Builds graded 0 in those top 5s do not grow in number over
  all changed queries together (entries minus exits at most 0).
- **(c) Rule L's claims.** `check-unused.py` over O2's warning lines on
  every capture, with lane K's replay run with O2 and rule L off and on for
  the withheld claims: 0 false.
- **(d) Adversarial probes.** Lane Z's z09 to z13 (smart contract, wallet
  for remittances, account abstraction, smart, wallet), winners only and
  not: byte-identical.

If any bar fails, nothing ships, H included (H ships on its own branch);
O2 is kept as `o2.diff` with the failing rows named.

**Reported apart, never deciding the verdict:**

- The (b)(i) rows split. Per query, list and window (top 5, top 20,
  matched list), each build graded 2 that leaves is paired one to one with
  a build graded 2 that enters the same window: a paired exit is a
  same-grade swap, an unpaired exit a real loss. vetIdea's five and the
  brief's picks are windows of up to 5, so where they shrink an exit stays
  unpaired. Counted in rows and in query and build pairs (a pair is a real
  loss when any of its rows is).
- vetIdea's five, its size base, O1H and O2, for every changed query.
- The probe table (z01 to z08: matched; graded 2 and 0 in the hybrid top
  10; all and winners only), base, O1H and O2.
- O1H to O2 on the changed queries, every move graded.

**Grading.** Existing labels first (the labeled sets and later rounds, the
stricter where two differ), then Z3's `grades.json` (which holds lanes Z's,
Z2's and Z3's blind grades), then new blind grades: one sheet of every row
a criterion or report reads that has none, from every variant, shuffled,
with no mark of which variant listed a build; two independent passes
(Claude Sonnet), each over its own shuffle; the stricter answer is kept.
Rubric: lane Z's grader prompt, verbatim.

## Log

- 2026-10-23T21:29:01Z: `git fetch origin`; `git checkout -b
  lane/z4-smart-wallet-o2 origin/main` (85843791); `git merge --ff-only
  7bd30f78` (H; its parent is 85843791).
- `pnpm install --frozen-lockfile --prefer-offline` exit 0; `pnpm
  generate:importmap` exit 0.
- 21:29:32Z: live `/api/status` apiVersion 1.9.101. `cmp`: the tree's
  `src/lib/hackathon-builds.ts` equals Z3's H file, main's equals Z3's base
  file.
- 21:34:20Z: tests first. `npx vitest run
  src/lib/__tests__/hackathon-builds.test.ts
  src/lib/__tests__/vet-idea.test.ts -t "smart wallet|smart account"` on
  the H tree: 6 of 7 new tests fail, the guard passes, exit 1. With Z3's
  O1H matcher swapped in: 5 of 7 fail (the fixes' tests); O1's phrase test
  and the guard pass, exit 1; H restored, `cmp` ok.
- About 21:36Z: O2 written in `src/lib/hackathon-builds.ts` and
  `src/lib/vet-idea.ts`. hackathon-builds, vet-idea and hackathon-brief
  tests 116 of 116; `npx tsc --noEmit` exit 0; `npx vitest run src/lib/`
  2,388 of 2,388 (187 files); biome clean after formatting.
- 21:38Z: this method written, before any replay in this tree.
- 21:39Z: method and `o2.diff` committed (d77f12f7).
- 21:39:58Z to 21:40:46Z: replays of base, h and o1h (`replay.mts`,
  unchanged, sha256 b2e7d59c...), swapping `src/lib/hackathon-builds.ts`
  and `src/lib/vet-idea.ts` (O2's vet-idea imports SMART_CONCEPT; the replay
  never calls vetIdea); O2 restored, `cmp` ok. Each equals Z3's replay on
  all 305 queries, byte for byte, note lines too.
- 21:41:03Z to 21:41:29Z: the o2 replay; O2 restored, `cmp` ok.
- 21:43:03Z: `measure.py sheet`: 480 rows read; labels and Z3's grades
  answer 470; 10 on the sheet (all part B). Two graders (Claude Sonnet
  through the Agent tool, lane Z's prompt verbatim), each over its own
  shuffle; both answered 10 of 10.
- 21:44:13Z to 21:44:43Z: lane K's replay with O2, rule L off and on;
  `check-unused.py`: 0 false of 529 claims (labeled 222, fresh 144,
  adversarial 54, review 69, event-in-q 38, battery 2; lane Z's probes fire
  none). O2 restored, `cmp` ok.
- 21:44:57Z: `measure.py grades`: the passes agree on 10 of 10, 0 rows
  unanswered. `measure.py report`: (a) met, 2 on-topic winners (DeFi Quest
  and Tukar, by declared packages) where the base had 1; (b) met, 269 of
  269; (b)(i) failed, 37 list rows and 15 query and build pairs over every
  frozen set (29 and 12 over the six sets Z3's bar read; 8 and 3 on the
  battery); (b)(ii) met, 0 builds graded 0 enter a top 5, 23 leave; (c)
  met; (d) met, 10 of 10. Split apart: 30 of the 37 rows are same-grade
  swaps and 7 real losses (z08: Veil and Passkey-Kit integration from 5th
  to 6th behind lumengate, graded 1; the battery's sa-01 topic form: Zelyo
  leaves both matched lists). vetIdea's five keep their size on every
  changed query but z07 (4, O1H 1, O2 1); fix (1) restores z03 (5, 3, 5)
  and z04 (5, 1, 5).
- 21:48Z to 21:52Z: candidate checks on the O2 tree: `npx vitest run
  src/lib/ src/components/ src/app/ src/collections/ src/data/
  --maxWorkers=4 --minWorkers=1` first 2,693 of 2,694 (rate-limited-429's
  audits case timed out at 5 s on a cold import; it passed alone on the
  second try), then 2,694 of 2,694 (217 files); tsc exit 0 and biome clean
  from 21:36Z.
- 21:54:17Z: live `/api/status` apiVersion 1.9.102. `git fetch origin`:
  origin/main dfeabfc0, H merged as #1873, which differs from 7bd30f78 by
  phraseForms (a hyphenated phrase's number varies on its last part only).
- 21:55:50Z to 21:56:21Z: dfeabfc0's matcher replays byte-identical to
  7bd30f78's on all 305 queries; O2 merged onto it (`git merge-file`, exit
  0, no conflict) replays byte-identical to the measured O2 on all 305.
  `git apply --check` of `o2.diff` passes on 7bd30f78; on dfeabfc0 (a
  scratch index) a plain apply fails on one context line, `git apply -3`
  applies all four files cleanly and its matcher equals the merged file.
- About 21:57Z: O2 not shipped, per the brief and this method:
  `src/lib/hackathon-builds.ts`, `src/lib/vet-idea.ts` and their tests
  restored to the branch (`git checkout --`, `cmp` against 7bd30f78's
  files).
- 22:01Z: evidence committed (229da3d6); `git rebase --onto origin/main
  7bd30f78`: the two commits now sit on dfeabfc0 (H as merged), the
  method commit d77f12f7 is dd58c0c2, author date kept (21:39:12Z).
- 22:01:34Z to 22:02:16Z: evidence-only tree on dfeabfc0: `npx tsc
  --noEmit` exit 0; the full vitest set 2,688 of 2,688 (217 files); biome
  clean.
- 22:02:43Z to 22:03:22Z: O2 applied with `git apply -3` onto dfeabfc0
  (the files a scratch index took): tsc exit 0, 2,695 of 2,695 (217 files),
  biome clean on the 4 files; then restored, tree clean.

## Outcome

Nothing observable changes: the branch carries this ledger and the evidence
in `improvements/audits/2026-10-23-smart-wallet-o2/`. O2 meets L1-02 (2
on-topic winners in a matched list of 4), byte identity on every frozen
query without the phrase or a hyphen, (b)(ii), rule L's claims and the
adversarial probes, and fix (1) restores vetIdea's five on q=smart wallet
and q=smart account. It fails the strict regression bar fixed before the
run, with or without the battery counted: 37 list rows and 15 pairs over
every frozen set, 29 and 12 over the six sets lane Z3's bar read (O1H: 32
and 14, 27 and 12). Of the 37 rows, 30 are same-grade swaps inside a fixed
window (mechanism 3 on z03 and z04, unchanged by design; on z01, passkey
builds that also wrote smart or wallet passed by the winners and the builds
writing the phrase); 7 are real losses on 3 pairs: on q=passkey or
smart-wallet onboarding a build writing passkey smart accounts (graded 1)
covers two concepts of three and pushes Veil and Passkey-Kit integration
to 6th; on the battery's sa-01 topic form Zelyo, matched in the base on
smart from "smart contracts", falls below the half rule once its passkey
counts for q's passkey alone. Open for the owner, as after Z3: whether bar
(i) should count same-grade swaps inside a fixed window.
