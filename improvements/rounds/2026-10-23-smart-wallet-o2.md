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

## Outcome

(pending)
