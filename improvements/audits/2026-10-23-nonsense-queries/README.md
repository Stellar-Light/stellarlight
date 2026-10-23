# Nonsense queries on build search

Evidence for lane L of `improvements/rounds/2026-10-23-build-matching.md`.

**Verdict: the rule that drops rows was not shipped; an honesty-only warning
was.** Rule L (a name match no longer admits a build alone when most of the
query's concepts occur in no build as whole words) empties
`q=quantum llama sandwich` and loses no labeled build, but cuts the fresh
nonsense battery's builds by only 19% in keyword mode and 14% in hybrid,
short of the half it was held to. What ships changes no row: on
searchHackathonBuilds, when most of the words searched in q occur as a whole
word in no submission and a build is listed by its words alone, meta.warnings
names those words and says such a build is not evidence that the idea was
built (spec 1.9.94).

**Update, spec 1.9.95: rule L ships, by the owner's decision.** It missed the
volume bar above (19% and 14% against a half), and the owner chose to ship
it past that bar only; every other bar was re-measured on the final code and
held. The warning now fires whenever any word of q is in no submission. See
"Shipped in 1.9.95" below.

## Ship criteria (fixed in the brief, before any result)

- (a) Recall: on all 140 labeled ideas, keyword and hybrid, on the builds
  route, no build graded 2 leaves the matched list or the top 20.
- (b) Shared code: vetIdea's five and hackathonBrief's picks identical to the
  base on all 140 ideas, or no build graded 2 leaves them.
- (c) Nonsense: on the fresh battery, the builds returned fall by at least
  half, and at least 12 of 24 queries return 0, in keyword and in hybrid.
- (d) Probe: `quantum llama sandwich` returns 0 in keyword mode.
- If no rule meets (a) to (d), an honesty-only change that alters no row may
  ship instead, with (c) reported as not met.

## Data

- **Fresh battery.** `nonsense-fresh.frozen.json.txt`: 24 queries (8 plain, 8
  with one tech word, 8 with a Stellar or payments word), written by a
  separate agent (Claude Sonnet 5.5) told no rule, frozen
  2026-10-23T02:09:22Z. The bytes are unchanged, sha256
  `bcf55577f7671d057e5e140a82073715ac8315434992424b587dc294256dc60a`; the
  `.txt` suffix only keeps biome from reformatting them. No query was edited
  or dropped, and nothing was tuned on it.
- **Fresh capture.** `capture.mjs`: read-only GETs to
  https://www.stellarlight.xyz, 2 s apart: every stored submission in browse
  mode (1,344), and per battery query and the probe the whole keyword and
  hybrid rankings with their meaning scores. 55 ranking pages, every one
  200, every hybrid request served hybrid. `/api/status` apiVersion **1.9.93
  at the start (02:13:07Z) and 1.9.93 at the end (02:15:48Z)**, 2026-10-23
  (`capture.txt`). The raw capture holds upstream descriptions and is not
  committed.
- **Labeled replay.** Lane K's capture of the same 1,344 submissions with 140
  labeled ideas and their live meaning scores (1.9.91), replayed with
  `../2026-10-23-build-matching/replay.mts` and compared with its
  `compare.mts`, unchanged. Before and after are both this tree's code
  (1.9.93) on one capture.
- **Names.** Committed outputs name builds as the API serves them, except
  dorahacks-buidl-42589, whose name holds a product name this repository
  keeps out; it is given by id.
- **Parity of the base replay with live (fresh capture).** Matched count
  equal on 25 of 25 queries in both modes; keyword order 25 of 25; hybrid
  order 21 of 25 (close-score swaps, the API rounds similarity).

## Rule L (measured, not shipped)

Written once, before any fresh result was read (logged at
2026-10-23T02:15Z): a query concept is absent when none of its forms
(plural or singular, synonyms, a hyphenated phrase spaced or joined) occurs
as a whole word in any build's text across the whole index. When more than
half the concepts are absent, a name match no longer admits a build alone;
it needs half the concepts like any other build. Diff: `rule-l/rule-l.diff`.

| criterion | result |
| --- | --- |
| (a) recall, 140 ideas | met: 0 builds graded 2 or 1 move in the matched list, top 20 or top 5, either mode (`rule-l/compare-labeled.txt`) |
| (b) shared code | met: vetIdea's five and the brief's picks identical for 140 of 140 ideas |
| (c) fresh battery | **not met**: builds keyword 538 -> 436 (down 19%), hybrid 683 -> 584 (down 14%); queries at 0, keyword 9 -> 17, hybrid 9 -> 15 |
| (d) probe, keyword | met: 2 -> 0 (hybrid 2 -> 0 too) |

Lost and gained by name:

- **Labeled ideas.** One row changes in all 140: i31 "loyalty points issued
  as tokens" loses Stellar Health Point (graded 0) in keyword and hybrid
  ("loyalty" and "issued" occur in no build). Nothing gained.
- **Fresh battery** (`rule-l/compare-fresh.txt` names every build). Removed
  in keyword mode, 102 builds over 9 queries: blockchain sourdough starter
  7, NFT lawnmower marathon 7, DeFi pancake flipping 18, bitcoin origami
  zeppelin 2, ethereum bagpipe tuner 6, AI toaster opera 37 of 47, wallet for
  pet iguanas 10, lumen bowling alley scheduler 10, stellar kazoo orchestra
  tickets 5. Hybrid removes the same, except 3 of the 7 blockchain builds
  that are close in meaning, 99 in all. Nothing gained.
- **What remains**, and why the rule cannot reach it: pay per yodel 132
  (two concepts, so half is one word: every build that says pay), zero
  knowledge pogo stick 156 (144 match zero and knowledge, half of four
  concepts), smart contract hamster wheel 80, soroban garden gnome registry
  23, soroban pickle juggling 21, anchor ship knot tutorial 14, AI toaster
  opera 10 (ai and "opera" inside longer words). For each, either at most
  half of q's concepts are absent, so a name still admits, or the builds
  cover half the concepts.
- **Lane K's 15-query battery** (reported, not deciding): keyword 20 -> 9,
  hybrid 21 -> 10; queries at 0, keyword 8 -> 14, hybrid 7 -> 13.

No other rule was tried: any rule written after reading the fresh battery's
results would be tuned on it.

## Shipped: a warning, no row changes

`wordsNoBuildUses` in `src/lib/hackathon-builds.ts` returns the concepts of q
that no build in the index uses as a whole word, in any form, in its text or
declared packages (common libraries left out, as matching does). The builds
route adds this to meta.warnings when they are more than half of q's
concepts and at least one listed build matched by words alone (matchedTerms
and no similarity):

> 2 of the 3 words searched in q (llama, sandwich) occur as a whole word in
> no submission in the index (a matchedTerms entry naming one was found
> inside a longer word), so a build listed by its words alone, with no
> similarity, matches only part of q and is not evidence that this idea was
> built

A build found by meaning is scored on the whole query, so it is not covered.
When every word searched in q is in no submission, the line says so exactly
("the word searched in q (llama) ..." or "none of the 3 words ..."). The
term building moved into `queryTerms`, shared by the scorer and the new
function.

After review, the whole-word test the warning reads is its own: a form
counts as used when it occurs with no letter or digit on either side, in any
script, with its edge punctuation dropped. The first version used the
scorer's ASCII `\b`, so "agents," and "café" were reported in no build while
matchedTerms named them, and `q=AI agents, payments, café` fired the line
with both of its clauses false. The scorer's own matching is unchanged.
Re-run on both captures with this test: rows identical to the base, and
where the line fires unchanged (the same queries and ideas, the same absent
words).

**Rows are identical.** The replay with and without the change gives the same
output, every field of every ranking: on the 140 labeled ideas (the builds
route in keyword and hybrid, vetIdea's five, the brief's picks and the hash
of the rankings prior art reads) and on the 25 fresh queries. The slim
outputs `labeled/` and `fresh/` `before.json` and `after.json` differ only in
their label line; `compare.txt` in each reports nothing lost or gained.

**Where the line fires** (`note.mts`; `note-fresh.txt`, `note-labeled.txt`):

| set | queries | with rows, keyword / hybrid | line fires, keyword / hybrid |
| --- | --- | --- | --- |
| fresh plain | 8 | 0 / 0 | 0 / 0 |
| fresh tech | 8 | 8 / 8 | 6 / 6 |
| fresh stellar | 8 | 7 / 7 | 3 / 3 |
| probe | 1 | 1 / 1 | 1 / 1 |
| lane K battery | 15 | 7 / 8 | 6 / 6 |
| 140 labeled ideas | 140 | 139 / 140 | 1 / 1 |

The labeled idea is i31 "loyalty points issued as tokens": its only build
listed by words alone is Stellar Health Point, graded 0; Loyal Local, graded
2, is listed by meaning and the line does not cover it. Of the 15 fresh
queries that list builds, it is silent on 6, the queries under "What
remains" other than AI toaster opera: at most half of their words are in no
build.

Against the criteria, for what shipped: (a) met, (b) met (identical), (c) not
met (rows unchanged: 538 and 683 builds, 9 queries at 0), (d) not met (the
probe still lists 2 builds, now with the line).

## Shipped in 1.9.95: rule L and the wider warning

The owner chose, in chat, to ship rule L ("don't ship it half-ass"),
overriding criterion (c)'s volume bar and only that one. Built on main
02d7deba (1.9.94). Before is main's code, after the final code, both
replayed over the same captures; the base slim outputs are byte-identical to
`labeled/before.json` and `fresh/before.json`.

**What changed.**

- In the shared scorer, so the builds route, vetIdea, hackathonBrief and
  analyzeHackathonSubmissions' q agree (and meta.counts.entries still
  equals analyze's total): when more than half of q's concepts occur as a
  whole word in no submission, a name match no longer lists a build alone.
  "In no submission" is `wordsNoBuildUses`, the warning's own test.
- That test now counts every declared package, the common libraries too
  (soroban-sdk was called unused beside 66% of read repos), reads the
  plural or singular `wordForms` leaves out (charities is charity, family is
  families), and names a word without its edge punctuation ("(rosca," is
  rosca).
- The warning fires when at least one word of q is in no submission and a
  build is listed by its words alone, and says the build matches only q's
  other words. The wordings for one word and for every word absent are
  unchanged. It never changes rows.

**(a) Recall, 140 labeled ideas** (`shipped/compare-labeled.txt`): no build
graded 2 or 1 leaves or enters the matched list, the top 20 or the top 5, on
any set, in keyword or hybrid mode.

**(b) Prior art**: vetIdea's five and the brief's picks are identical to the
base on 140 of 140 ideas. The rankings prior art reads differ for one idea:
i31 "loyalty points issued as tokens" loses Stellar Health Point (graded 0)
in keyword and hybrid.

**(c) Fresh battery** (`shipped/compare-fresh.txt`, every build named):

| mode | builds returned | queries at 0 |
| --- | --- | --- |
| keyword | 538 -> 436 | 9 -> 17 |
| hybrid | 683 -> 584 | 9 -> 15 |

Removed, keyword (102): blockchain sourdough starter 7, NFT lawnmower
marathon 7, DeFi pancake flipping 18, bitcoin origami zeppelin 2, ethereum
bagpipe tuner 6, AI toaster opera 37, wallet for pet iguanas 10, lumen
bowling alley scheduler 10, stellar kazoo orchestra tickets 5. Hybrid
removes the same less 3 blockchain builds close in meaning (99). Nothing
added. Lane K's battery: 20 -> 9 keyword, 21 -> 10 hybrid.

**(d) Probe**: `quantum llama sandwich` 2 -> 0, keyword and hybrid.

**(e) Where the warning fires among the 140 labeled ideas**
(`shipped/note-labeled.txt`; each word checked by `check-unused.py`, a
separate Python whole-word search over every submission's text and every
declared package, and every related form and spelling the line names,
`shipped/unused-labeled.txt`): after the second commit, 32 ideas in
keyword mode and 32 in hybrid, every line's exact text in
`shipped/note-labeled.txt`. 0 false claims: every word named is used by no
submission, and every related form named is used.

| idea | words named | related forms the line names |
| --- | --- | --- |
| cross-border remittance app cashing out through local anchors | cashing | cash |
| NFT event ticketing with resale royalties | resale | none |
| savings circle (ROSCA, tanda) with automatic payouts | rosca | none |
| merchant QR code payments for small shops | shops | shopping |
| fiat on-ramp and off-ramp for a local currency | on-ramp | none (nor onramp, on ramp) |
| loyalty points issued as tokens (0 rows keyword, meaning only hybrid) | loyalty, issued | issue, issues, issuing |
| tokenized gold or commodities (0 rows keyword, meaning only hybrid) | gold, commodities | none |
| a stablecoin with 1:1 backing for merchant payments | backing | backed, back |
| fiat-backed stablecoin for payments | fiat-backed | none |
| a minted stablecoin for payments | minted | mint, minting |
| a stablecoin pegging the dollar for payments | pegging | none |
| redeemable stablecoin for merchant payments | redeemable | none |
| a stablecoin with daily redemptions for payroll | redemptions | none |
| a stablecoin minter for merchant payments | minter | mint, minting |
| an overcollateralized stablecoin for lending | overcollateralized | none |
| an algorithmic stablecoin for merchant payments | algorithmic | algorithms |
| a depegged stablecoin for merchant payments | depegged | none |
| a stablecoin that anchors its peg to gold | peg, gold | none |
| donation matching for nonprofits | nonprofits | none |
| tokenized farmland | farmland | none |
| crop insurance | crop | none |
| refugee aid vouchers | vouchers | none |
| cheapest route to swap USDC into naira | cheapest | cheap |
| Soroban contract template generator from plain English | generator, plain, english | generated, generate, generating |
| quadratic voting for community grants | quadratic | none |
| verifiable diploma credentials for university graduates | diploma | none |
| NGO tool to track disaster relief cash transfers ... | relief | none |
| onchain fantasy sports game where winners are paid ... | fantasy | none |
| round up savings app that sweeps spare change ... | sweeps, spare | none |
| marketplace for renting out tools and equipment ... | renting, held | rent, rental, rentals |
| forex hedging tool for exporters ... | forex, hedging | hedge, hedged |
| DAO tool that lets members delegate votes ... revoke any time | delegate, revoke | delegation, delegating |

Real ideas with one rare word no submission uses get a true line: quadratic
voting, diploma credentials, tokenized farmland, crop insurance, resale
royalties, an overcollateralized stablecoin, fantasy sports. 12 ideas name a
related form; revoke names none (revocable is related, but k to c is past
the rule), nor do vouchers (vouch), relief (reliable) or forex (forever).

**(f) Adversarial probes** (`probes.json`, fixed before any probe ran;
captured live on 1.9.94 to 1.9.94, 98 pages, every one 200;
`shipped/probes-table.txt`, `shipped/unused-probes.txt`):

| id | group | q | in no submission | keyword | hybrid | warning (kw / hy) |
| --- | --- | --- | --- | --- | --- | --- |
| p01 | one word | escrow | none | 34 -> 34 | 34 -> 34 | no / no |
| p02 | one word | llama | llama | 1 -> 1 | 1 -> 1 | yes / yes |
| p03 | product name | soroswap | none | 15 -> 15 | 18 -> 18 | no / no |
| p04 | product name | blend | none | 47 -> 47 | 47 -> 47 | no / no |
| p05 | product name | reflector | none | 14 -> 14 | 14 -> 14 | no / no |
| p06 | product name | soroswap aggregator | none | 19 -> 19 | 50 -> 50 | no / no |
| p07 | product name | blend lending pool | none | 77 -> 77 | 77 -> 77 | no / no |
| p08 | typo | sorobn wallet | sorobn | 89 -> 89 | 141 -> 141 | yes / yes |
| p09 | typo | remitance app | remitance | 0 -> 0 | 0 -> 0 | no / no |
| p10 | typo | pasky wallet | pasky | 89 -> 89 | 91 -> 91 | yes / yes |
| p11 | typo | decentralised exchnage for stablecoins | exchnage | 1 -> 1 | 285 -> 285 | yes / no |
| p12 | accent | café payments | café | 270 -> 270 | 270 -> 270 | yes / yes |
| p13 | punctuation | AI agents, payments | none | 147 -> 147 | 147 -> 147 | no / no |
| p14 | accent | pagos en línea para comercios | none | 22 -> 22 | 26 -> 26 | no / no |
| p15 | accent | paiement mobile sécurisé | paiement, sécurisé | 1 -> 0 | 1 -> 0 | no / no |
| p16 | punctuation | x402!!! paywall??? | none | 0 -> 0 | 83 -> 83 | no / no |
| p17 | two words | pogo payments | pogo | 270 -> 270 | 270 -> 270 | yes / yes |
| p18 | two words | escrow sandwich | sandwich | 34 -> 34 | 34 -> 34 | yes / yes |
| p19 | two words | llama wallet | llama | 90 -> 90 | 90 -> 90 | yes / yes |
| p20 | five words | loyalty points for coffee shops | loyalty, coffee, shops | 2 -> 0 | 3 -> 1 | no / no |
| p21 | five words | tokenized carbon credits for farmers | none | 8 -> 8 | 27 -> 27 | no / no |
| p22 | five words | proof of reserves for stablecoin issuers | none | 64 -> 64 | 109 -> 109 | no / no |
| p23 | five words | crowdfunding platform for indie game developers | indie | 6 -> 6 | 11 -> 11 | yes / yes |
| p24 | five words | trombone lessons marketplace with escrow payments | trombone | 30 -> 30 | 31 -> 31 | yes / yes |
| p25 | only stellar | stellar | none | 874 -> 874 | 874 -> 874 | no / no |
| p26 | only stellar | stellar zorblax | zorblax | 0 -> 0 | 1 -> 1 | no / no |
| p27 | only stellar | stellar zorblax quibbet | zorblax, quibbet | 0 -> 0 | 47 -> 47 | no / no |
| p28 | hyphenated | pay-per-call | none | 5 -> 5 | 5 -> 5 | no / no |
| p29 | hyphenated | zero-knowledge pogo stick | pogo, stick | 4 -> 0 | 223 -> 220 | no / no |
| p30 | hyphenated | cross-border remittance | none | 34 -> 34 | 36 -> 36 | no / no |
| p31 | package | passkey-kit | none | 12 -> 12 | 19 -> 19 | no / no |
| p32 | package | soroban-sdk | none | 0 -> 0 | 57 -> 57 | no / no |
| p33 | package | @creit.tech/stellar-wallets-kit | none | 0 -> 0 | 284 -> 284 | no / no |
| p34 | package | stellar-hd-wallet | none | 7 -> 7 | 286 -> 286 | no / no |

Removed: p15 Stellar Mobile Agents (a name holding "mobile"); p20 X402-MCP
Shopify Commerce and Stellar Health Point; p29 four builds named for zero
knowledge in keyword, three of them in hybrid. Nothing added. Product names
that are one invented word are used words, so nothing changes for them.
Packages count as used, the common libraries too (p32, p33). Every word the
warning names is used by no submission (`shipped/unused-probes.txt`; sorobn
is a typo of soroban, which is used).

Read with care:

- A hyphenated phrase is one concept. `zero-knowledge pogo stick` has 2 of
  3 concepts in no submission, so rule L holds back its four zero-knowledge
  builds, while `zero knowledge pogo stick` (2 of 4) keeps 156 with the
  warning.
- Closed in the second commit: a build found by meaning had no caveat
  (`blockchain sourdough starter`, 99 in hybrid mode), a word with a used
  related form could be over-read, and a query that listed nothing said
  nothing (`remitance app`). See "Second commit" below.

**Second commit: meaning rows, related forms, spelling.** Rows are
identical to the first commit's on the 140 ideas, the battery and the 34
probes (every field of every replay). The line now fires whenever any word
of q is in no submission:

| set | queries | line fires, keyword / hybrid | was |
| --- | --- | --- | --- |
| 140 labeled ideas | 140 | 32 / 32 | 30 / 29 |
| fresh battery | 24 | 24 / 24 | 7 / 7 |
| lane K's battery | 15 | 15 / 15 | 1 / 1 |
| adversarial probes | 34 | 16 / 16 | 10 / 9 |

- Rows found by meaning: "every build listed was found by meaning
  (similarity, no matchedTerms) and is close to q as a whole, not to those
  words" when no build is listed by words (`blockchain sourdough starter`,
  hybrid, 99 rows); both kinds together: "a build listed by its words
  matches only the other words of q (...), and a build with similarity is
  close to q as a whole, not to those words".
- Related forms: "; a related form is used: cash for cashing". A stem of
  four letters or more takes an ending back; a stem found by dropping er,
  or or ic takes back only inflections (tractor is not traction), er is
  never grown (stick is not sticker), ers is never dropped (vouchers is not
  vouch). The first measured version named traction for tractor; this rule
  was then narrowed, and a test holds it.
- Zero rows: ", and no build matched q; check the spelling", naming a used
  word only when it is one edit away (a letter added, dropped or changed,
  or two adjacent letters swapped), starts with the same letter, neither is
  a prefix of the other, and no other such word is used more than a fifth
  as often. A first version took any word within two edits and named
  summarise for submarine, royalty for loyalty, gambling for gargling and
  tempo for teapot on these sets; it was replaced before shipping. The one
  spelling named now on all three sets is remittance for remitance (probe
  p09); the corpus also holds remmitance once, against remittance 9 times.
- `check-unused.py` reads back every claim in every line on all three
  sets: 0 false (`shipped/unused-*.txt`).

**Third commit: review fixes (written as spec 1.9.96 after merging main's 1.9.95; ships as 1.9.97 because #1862 took 1.9.96 first).**
The review (Claude Fable 5.1, high) replayed the second commit on the live
corpus (1,356 submissions) and found these, all fixed:

- Related forms named unrelated words (port: portal, portion; mill:
  million; miner: mineral; strip: stripe; center: cent; stalling: stale;
  wither: with). Now the word itself takes back only inflections, a stem
  from dropping er or or takes back no bare stem, an undone doubled
  consonant takes back no e, es is dropped only after s, x, z, ch or sh
  (themes is not them, found while measuring this fix) and a dropped e is
  not left off. center still names centered, its own past tense.
- The zero-row tail read as a correction ("check the spelling", with a used
  word): the review's sweep of 2,410 dictionary words named one for 70
  words spelled right. It now reads ", and no build is listed; if it is
  misspelled, correct it (games is the used word one edit from gamer)". The
  naming rule is unchanged; gamer, routine, discard, monkey, thorough,
  inventor and garantie still name games, routing, discord, money, through,
  investor and garantir, now only as a conditional.
- Rule L withheld real name matches silently: church tithe donations app
  held back Donation Management, Sorobix IDE plugin held back Stellar-IDE,
  and the line asked to check the spelling. The line now adds "1 build
  matched by name for donations is not listed, because most of the words
  searched in q occur in no submission", and meta.counts.withheldByName
  counts them (builds held back and not listed by meaning either).
- otherNumber read notes, modes, planes, themes, hopes, toes, does and uses
  as used through not, mod, plan, them, hop, to, do and us. es is now
  dropped only after ss, x, z, ch or sh.
- The spec's spelling clause gained the conditions the code applies, and
  analyze's q says a word only a package uses counts as used for rule L.
- The used text and its word counts are built once per index (a WeakMap).

Re-measured: rows identical to the second commit's on the 140 ideas, the
battery, the 34 probes and the review's 23 examples (captured live on
1.9.95 to 1.9.95, `review-probes.json`, `shipped/review-table.txt`).
otherNumber feeds rule L's count of unused words, so it could move rows in
principle; it moved none here. Where the line fires is unchanged from the
second commit (32 / 32 ideas, 24 / 24 battery, 16 / 16 probes); the review's
examples fire 19 of 23. `check-unused.py` now also checks each withheld
count against the builds the before and after replays differ by: 0 false
claims on all four sets.

## Open risks

- The battery's rows are unchanged. An agent that ignores meta.warnings still
  reads "quantum llama sandwich" as two prior-art hits.
- Two-concept queries ("pay per yodel") and queries whose real half covers
  many builds ("zero knowledge pogo stick") get no line: at most half their
  words are in no build. A different rule for those needs its own battery
  written before it runs.
- The vocabulary is the index at request time: a word that a new submission
  uses stops counting as absent, which is intended.
- The line reads the whole index on each q request where a build is listed by
  words alone: one regex pass per absent word over about 1,400 entries.

## Files

- 1.9.95 additions: `probes.json` (the probe list) and `probes.mts` (the
  probe table); `check-unused.py` (the separate word check); `shipped/` (the
  final replay's comparisons, slim `labeled-after.json` and
  `fresh-after.json`, where the warning fires, the probe table, the word
  checks and the probe capture log). `capture.mjs` takes a probe file as a
  second argument; `note.mts` reads the wider firing rule.

- `nonsense-fresh.frozen.json.txt`: the fresh battery, bytes unchanged.
- `capture.mjs`, `capture.txt`: the fresh capture and its log.
- `note.mts`: where the warning fires, per query.
- `note-fresh.txt`, `note-labeled.txt`: its output on the fresh capture and
  on lane K's.
- `labeled/`, `fresh/`: base against the shipped change (`compare.txt`, slim
  `before.json` and `after.json`).
- `rule-l/`: the rule that was not shipped: its diff, both comparisons and
  the fresh battery's slim replay under it.

## Rerun

From the repository root (the capture reads production, read-only; live data
moves, so numbers can change):

```
node improvements/audits/2026-10-23-nonsense-queries/capture.mjs <scratch>/fresh-live.json
pnpm exec tsx improvements/audits/2026-10-23-build-matching/replay.mts <scratch>/fresh-live.json after <scratch>/f-after.json
pnpm exec tsx improvements/audits/2026-10-23-build-matching/compare.mts <scratch>/fresh-live.json <scratch>/f-base.json <scratch>/f-after.json
pnpm exec tsx improvements/audits/2026-10-23-nonsense-queries/note.mts <scratch>/fresh-live.json
```

Run `replay.mts` once with the parent commit's `src/lib/hackathon-builds.ts`
(44407222) for `f-base.json`, and once with `rule-l/rule-l.diff` applied to
it for rule L. The labeled numbers use lane K's capture
(`../2026-10-23-build-matching/capture.mjs`) the same way.
