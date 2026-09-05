<!-- Cross-vendor audit (Grok CLI, grok 1.0.13, --disable-web-search, hard-scoped bundle) of 2026-09-05 daytime work. Claims were verified before acting: the eight-row packet finding and the twelve stale state-block sentences held; the writer claim was half right (basis-from-deployment already skipped shadows; curate STATUS_FIX and basis-from-onchain did not, fixed in #1349). Bundle: merged PR bodies, packets high tier, interventions, receipts, board numbers, routing battery. -->

# Audit report — Stellar Scout quality program, 2026-09-05

Worked only from this directory. No `REPORT.md` written.

---

## 1. The packet method

**The Live rule the packets used.** High-confidence Live is defined as two independent in-window signals:

> `high` = two independent live signals inside 90 days (a 200 page today serving substantive product content **and** a repo pushed ≤90d), or a parked / retired / removed-site page. (`03-packets-high-tier.md` line 17)

The parked/retired clause is the Inactive half. Death is not inferred from silence: “A live-200 page never stands as ‘observed dead’” (`03-packets-high-tier.md` line 18). X/blog is could-not-check for all 100 (`03-packets-high-tier.md` line 19). SCF awards are row data, not today’s fetch, and no verdict rests on them (`03-packets-high-tier.md` line 20). On-chain creation dates without a recent-activity counter are not an in-window signal (`03-packets-high-tier.md` line 22).

**Why orbitcdp and skyhitz were admitted.** Both satisfied that pair and nothing else.

- **orbitcdp** (`03-packets-high-tier.md` line 33; machine entry lines 92–98): HTTP 200 title “Orbit CDP — Collateralized Debt Protocol on Stellar”; repo `zenith-protocols/relayer-plugin-zenex` pushed 2026-08-27 (inside 90 days). The note that actually justified Live is chrome: `CDP protocol page: "Live on Stellar", Launch App`. Prior row state was already `Inactive / site-liveness`.
- **skyhitz** (`03-packets-high-tier.md` line 53; machine entry lines 295–301): HTTP 200 title “Skyhitz - Gravity. Mainnet”; repo `skyhitz/hitz-gravity` pushed 2026-09-05. Same-day push plus a title.

The receipts the owner used to overturn them were on the same pages the packets treated as live signals: orbitcdp `oUSD Minted —`, `Collateral Locked —`, `Borrow APY —` (`orbitcdp-2026-09-05.json` `markers[]`, `httpStatus` 200); skyhitz `Total Mass 0.00`, `Event Horizon 0.0000`, `Balance —` (`skyhitz-2026-09-05.json` `markers[]`). Owner corrections: `03-packets-high-tier.md` lines 379–381; interventions `04-interventions.json` last two `curate-projects` entries.

**Smallest rule change that would have rejected both and kept true positives.** Keep the two-signal rule. Tighten only what “substantive product content” and “a repo” mean:

- A 200 is not a live signal if the page’s own product/protocol metrics are empty, dashed (`—`), or zero. A banner, page title, or “Launch App” CTA is not a live signal.
- The already-written word “substantive” is enforced by the packet’s own rendered-char annotations: a body the packet records in the tens of characters is not substantive.
- Signal (B) must be a repository of *this* project. A 404, an org-newest substitute, a hackathon/seeder/fund repo, or another row’s repo does not count.

That fails orbitcdp (dashed protocol stats; evidence cited is a banner) and skyhitz (0.00 / — stats; evidence cited is a title plus a push). It still clears rows whose packets show a descriptive product page *and* a same-project repo push (allbridge, dia, blindpay, onekey, rango, …). It does not require on-chain activity the packets themselves say they cannot see (`03-packets-high-tier.md` line 22).

**Apply that rule to the remaining 31 high-tier Live rows** (the original 34 Live minus orbitcdp, skyhitz, and rozo — the three already re-litigated; `03-packets-high-tier.md` lines 379–382). The packets did not capture protocol stats for these 31, so empty-stat failures cannot be read off the table. These rows still fail the rule from packet text:

| slug | why it would not clear |
|---|---|
| **fairblock** | Line 40: `40 chars rendered` — stub, not substantive. |
| **untangled** | Line 59: `17 chars rendered`. Contract present but “no recent-activity counter, so none of the three counts as an in-window signal” (line 22). |
| **wagelink** | Line 62: `8 chars rendered`. Repo is `Zebec-protocol/canton-dev-fund`, the same repo used for **zebec** (line 63). |
| **hot-wallet** | Line 36 / note lines 107–114: second signal is `hot-dao/pitchtalk-hachathon`, a hackathon repo, not HOT Wallet. |
| **tala** | Line 57 / note lines 147–154: second signal is `inventure/docker-play-seeder`, not Tala. |
| **normal** | Line 45 / note lines 163–170: `linked repo 404`; they substituted “org newest”. |
| **vanna-finance** | Line 61 / note lines 360–365: `linked repo 404`; same org-newest substitute. |
| **zebec** | Line 63 / note lines 132–138: second signal is `Zebec-protocol/canton-dev-fund`, shared with wagelink — one repo cannot be two products’ independent live signals. |

The other 23 remaining Live rows still clear from packet text (descriptive 200 title + a same-project push inside 90 days). Whether their pages hide empty stats is **cannot tell from the bundle**: the packets never recorded those fields. **rozo** (excluded from the 31): packet Live (`03-packets-high-tier.md` lines 51, 156–161); coordinator re-probe “coming soon”; owner LIVE (line 382). Lesson 7 in `02-state-of-program.md` lines 162–163 already bans serving a “coming soon” page as a live market. The packet text itself does not contain “coming soon”.

**Rows whose packet evidence already contradicts a Live verdict** (original rule, before any change):

- **fairblock / untangled / wagelink** — the packets themselves annotated 40 / 17 / 8 chars rendered, then stamped **Live** / high. That is a direct contradiction of “substantive product content” (`03-packets-high-tier.md` lines 17, 40, 59, 62).
- **orbitcdp** — the machine note cites a marketing banner and a CTA, not product content (lines 92–98).
- **wagelink and zebec** — one repo used as the second live signal for two products (lines 62–63, 132–138, 367–373).
- **hot-wallet / tala / normal / vanna-finance** — the cited repo is not this product’s repo, or 404s (lines 36, 45, 57, 61 and the matching JSON notes).

skyhitz’s packet text does *not* contradict Live; the contradiction is on the page the packet did not quote (receipt markers). That is the method failure.

---

## 2. 62.7% → 57.2%: reclassification, not new evidence

**Endpoints.** Start: P4 “62.7%” (`02-state-of-program.md` lines 55–56); `#1325` still treats weak as 617 (`01-merged-prs-today.md` lines 275–277). End: `projects.servedPopulation` 984, `strongBasisSplit.weakLiveRows` 563 (`05-board-numbers.json`). 563/984 = 57.2%. 617/984 = 62.7%. Denominator at both ends is 984. Drop = **54 rows off the weak count, served unchanged**.

`strongByBasis` now: human-verified 201, onchain-activity 47, product-integration 57, repo-activity 116 (sum 421). 984 − 421 = 563. `basisMix` sums to 984; the weak four (site-liveness 462 + source-inherited 93 + unverified 6 + operator-announcement 2) = 563.

`#1325` after the night basis work: human-verified 162, onchain-activity 46, product-integration 56, repo-activity 116 (sum 380); weak 604 (`01-merged-prs-today.md` lines 275–277). Packets draft population: 984 served, **601 weak** (`03-packets-high-tier.md` line 6). Board now: 563 weak. 604 − 3 = 601; 601 − 38 = 563.

**Decompose the 54 (617 → 563):**

| n | mechanism | what actually moved | evidence or reclass? |
|---|---|---|---|
| **13** | `basis-from-deployment` (`#1312`, `#1325`) | Status record copies a strong basis the deployment record already held (2026-08-28 pass, some with receipts). | **Reclassification.** `#1312` body: “This is NOT a classifier change. No row is re-probed and no evidence is invented… Report its output as **propagated N**, never as new evidence and never as ‘verified N’.” (`01-merged-prs-today.md` lines 461–467). `#1325`: “13 propagated from receipted deployment evidence… read back 13/13”. |
| **3** | “3 by curated evidence” (night addendum, `02-state-of-program.md` lines 126–127), closing 604 → 601 before the packet snapshot | `#1325` names Blend upgraded on dated DeFiLlama TVL (one real evidence upgrade). `#1317` is mostly `from===to` STATUS_FIX backfills (“No status changed”). Net on the board after `#1325`: onchain-activity 46→47, product-integration 56→57, and one more human-verified before/aside from the 38. | **Mixed.** At most one (Blend) is new dated evidence. The rest are provenance backfills. |
| **38** | High-tier packets `#1345` | 38 weak rows become `human-verified`. `#1345`: “34 Live rows keep status and gain human-verified provenance… 4 Live rows retire — basement, chainsatlas, code4rena, soundness… orbitcdp Inactive → Live”. `#1346`: “38 rows human-verified, 5 status moves”. | **Reclassification of basis**, not 38 newly observed lives. 34/38 are keep-status stamps. 4 are real Inactive moves with receipts. 1 (orbitcdp) was a false Live, then reverted `#1347` still `human-verified`. skyhitz later reverted `#1348` still `human-verified`. |
| **0 of the 54** | Dedup hides | `#1325`: “dedup hid 11 duplicate rows (served set shrinks, not an upgrade)”. Night addendum: shadows leave the count “only if the scorer learns to skip canonicalSlug rows (queued)” (`02-state-of-program.md` lines 127–128). `#1338`: sync “restored Live onto 13 shadows”. Served is still 984. | **Attempted denominator change that did not land on this board.** Flag it; do not credit it. |

**Check:** 13 + 3 + 38 = 54. human-verified 162 → 201 is +39 (38 packets + 1 of the curated/fxdao set). `#1343` fxdao Live → Inactive, `human-verified`: if fxdao was already strong, it is a status move inside the 54, not a 55th weak drop; **cannot tell from the bundle** what fxdao’s prior `statusBasis` was.

**What is not evidence:** the 13 propagations (author of the lane said so); 34 keep-status packet stamps; orbitcdp’s trip Inactive→Live→Inactive, which still left the weak set because the basis is now `human-verified`; the 11 hides (denominator, and they did not move 984). Official-record dropped from `STRONG_BASES` served 0 forever (`#1325`) — no numeric effect.

The headline 62.7% → 57.2% is almost entirely recategorization. Real new death evidence in the 54 is the four receipted Inactives (and skyhitz after the owner overrode the packet). That is 5 rows of status truth, not 54.

---

## 3. The findings split — “waiting on upstream” is mostly honest, and it hides one unfiled filing plus one declined fix

`05-board-numbers.json` `findings`: total 542 = open 3 + refreshQueue 3 + blockedUpstream 16 + cleared 513 + verified 7. `states` says `open` is the defect backlog this repo can act on; `blockedUpstream` is “open rows an upstream consumer decides… never folded into `open`”. `blockedBy`: `raven-catalog-lag` 9, `raven-scorer` 7.

`#1335` (`01-merged-prs-today.md` lines 139–152): open 19 → 3 by counting 16 upstream apart; the remaining 3 are “2 drift — clear on the next nightly-drift run; 1 routing vocabulary the widening was declined for”. The 3 `refreshQueue` match the three stale version notes that PR refreshed. Mapping in that PR: `catalog-lag` → `raven-catalog-lag`; `outscored` / `id-noun-exclusion` / `no-scout-op` / `named-entity` → `raven-scorer`. Vocabulary is not in that map — it stayed in `open`. That part is honest.

`07-routing-battery.json` `misses[]` by `missClass` (17 misses; `frame.failed` 17):

| missClass | n in battery | in blockedUpstream? | Action on this side? |
|---|---|---|---|
| **catalog-lag** | 9 | Yes (9) | **Wait, then re-read — do not re-patch our spec.** `06-lesson-routing.md` L1 lines 45–61: Raven manifest `2026-09-03T17:09Z` still serves pre-08-31 descriptions; three routing fixes were shipped, re-measured, and “worked again” against a consumer that had not absorbed them. Our text already ranks those ops #1–2. Done when `codemode.catalog()` + the manifest show the words. They have not filed this (“Not filed — lag, not drift”, `02-state-of-program.md` lines 38–44). Filing a Raven catalog refresh is an action; writing more x-routing is not. `#1344` only patched *our* skill-reference hole for `GET /api/rwa`. |
| **outscored** | 3 | Yes, under `raven-scorer` | **Almost none.** L2 (`06-lesson-routing.md` lines 64–75): gated pass scores stopwords; a long description beats a short complete one. “Our side: nothing to add.” Night addendum calls this a “candidate issue, unfiled” (`02-state-of-program.md` lines 118–119). The hiding is the unfiled upstream issue, not a Scout vocabulary patch. L3 shows the wrong “action” (widening) steals siblings. |
| **id-noun-exclusion** | 2 | Yes, `raven-scorer` | **No.** Lesson 12 (`02-state-of-program.md` lines 183–184); `#1328` / `#1318`. stellar-raven #124. Scout vocabulary does not fix it. |
| **named-entity** | 1 (`reflector`) | Yes, `raven-scorer` | **No.** “no operation text carries project names” (`06-lesson-routing.md` lines 102–105). By construction. |
| **no-scout-op** | 1 (`freighter`) | Yes, `raven-scorer` | **No good Scout-side patch.** Same standing decision: names are not in op text. Calling it “waiting on upstream” is a decision, not an inability — they could index a name resolver and they chose not to, because it is the named-entity class. |
| **vocabulary** | 1 (`soroban` / searchProjects) | **No — this is the 1 open routing finding** | **Yes, and it was done and reverted.** L3 (`06-lesson-routing.md` lines 77–87): adding `soroban` fixed that item and moved 8 of 14 Soroban questions; sls-078 delist risk; declined. Honest as ours. |

`could-not-check` is in `#1328`’s classifier and not in this battery’s 17 misses.

**Verdict on honesty:** splitting 16 out of `open` is better than treating id-noun misses as Scout defects. It hides (a) that catalog-lag is closable by a Raven re-baseline they have not filed, (b) that the stopword/`outscored` issue is unfiled, and (c) that `no-scout-op`/`named-entity` are standing product decisions. It does not hide a pile of unfixed Scout bugs. The 2 remaining open drift findings are this repo’s, scheduled for the next nightly-drift run (`#1335`).

---

## 4. The lane fight — the fix is not complete

What happened: three writers, one field, one day. Dedup hid 11 as Draft; curate `DUPE_MERGES` forced `Inactive`; sync restored `Live` onto 13 shadows (`04-interventions.json` `dedup-projects` entry; `#1338` body, `01-merged-prs-today.md` lines 100–103; lesson 17, `02-state-of-program.md` lines 186–190).

Shipped:

- `#1337`: `DUPE_MERGES` writes `Draft` not `Inactive` (unless `Inactive` + `statusBasis: human-verified` + `statusSourceUrl` — “human death verdict kept”); detector stamps `canonicalSlug` + `Draft`; search/`/project/{slug}` admission updated (`01-merged-prs-today.md` lines 109–119).
- `#1338`: `sync-lumenloop` skips `canonicalSlug` (“the feed never writes onto a lineage shadow”).
- `#1339`: log line only. “No behaviour change, no data touched.”

**Remaining writers/paths that can still overwrite a hidden duplicate’s status, judging only from PR bodies:**

1. **`sync-lumenloop` on any duplicate that does not yet have `canonicalSlug`.** `#1338` skip is keyed on that field. Unmarked duplicates still get Live. `#1338` itself: “Not verified live until the next scheduled sync (10:58 UTC).” This bundle has no read-back of that sync.
2. **`STATUS_FIX` / curate-projects generally.** `#1343`, `#1345`, `#1347`, `#1348` all write `status` by slug with no shadow guard in those PR bodies. If a packet or owner entry names a shadow, it overwrites Draft. The “one owner” contract in `#1337` covers `DUPE_MERGES`, not `STATUS_FIX`.
3. **`scripts/basis-from-deployment.ts` (and the onchain/product/repo basis lanes it was modelled on).** `#1312` “moves an already-earned strong basis from the DEPLOYMENT record to the STATUS record.” No `canonicalSlug` skip in that body. A shadow with a deployment record can still have its status record mutated.
4. **`#1321` is the pattern, not a fix for status:** sync writes every field `curatedFieldsFor` does not own. `#1338` now skips the whole shadow row *if* `canonicalSlug` is set. Fields on shadows without that stamp remain feed-owned.

`#1337`’s keep-Inactive exception is intentional, not a remaining bug. The fix is code-incomplete (other status writers) and operationally unverified (next sync).

---

## 5. State block sentences that are now false or stale

Quoted from `02-state-of-program.md`:

1. **“P4 done-bar (weak < 50%): 62.7%, and the last drop was mostly new tiers.”** (lines 55–56) — False. Board is 57.2% (`05-board-numbers.json` 563/984). Today’s drop is packets + propagation, not “new tiers” (that sentence is the `#1310` 794→617 story, reused stale).

2. **“583 app-only weak rows and 144 never-answered sites: human triage (relink / Inactive / leave). Since 2026-09-01.”** (lines 45–46) — Stale. `strongBasisSplit.appOnly` is 550; `onchainEligible` is 13 (`05-board-numbers.json`). 144 is not in this bundle’s board.

3. **“Exhaust the 34 `onchainEligible` weak rows with the existing lane (dispatch; done = onchainEligible 0 or each row carries a could-not-check).”** (lines 84–86) — Stale. `onchainEligible` is 13.

4. **“6 rows with a strong deployment basis and no citable artifact (xoxno, huma, untangled, rozo, bondhive, allbridge, blend)”** (lines 122–124) — False/stale. Lists seven names as “6 rows”. After `#1312` propagated 13, `deploymentStrongStatusWeak` is 2 (`05-board-numbers.json` lines 8–9: “the un-citable residue”). allbridge/rozo/untangled were then packet-stamped Live in the high tier (`03-packets-high-tier.md`).

5. **“P4 weak share unchanged in kind: tonight moved 13 by propagation and 3 by curated evidence, and removed 5 lineage shadows from the count only if the scorer learns to skip canonicalSlug rows (queued).”** (lines 126–128) — Stale. `#1345` moved 38 more off weak. Served is still 984; the shadow skip did not change this board.

6. **Night-shift next step 5: “Silence-close out of the headline close rate (ledger PR).”** (line 138) — False as a next step. The same file already marks it DONE `#1327` (lines 70–76).

7. **Night-shift next step 1: “Scorer skips lineage shadows; STRONG_BASES drops `official-record` … names the five real tiers.”** (lines 132–134) — Half-done and stale as a next step. `#1325` dropped `official-record` and named the five tiers (`01-merged-prs-today.md` lines 264–273).

8. **“22 dedup clusters from the dry-run: human call …”** (lines 47–49) — Stale. Night addendum: “dedup 11 records hidden (3 clusters vetoed for a human)” (lines 101–103). `#1337`/`#1338` then changed what a hide means.

9. **“Measured 2026-09-05: 2 misses of this class, plus 2 named-entity misses (bare project names route to no operation text) and 3 where a long description wins on stopword density”** (lines 35–37) — Wrong on class split. Battery: named-entity 1 (`reflector`), no-scout-op 1 (`freighter`), outscored 3, id-noun-exclusion 2 (`07-routing-battery.json`).

10. **“~80 merged PRs (#1229–#1309)”** (lines 20–21) — Stale. Today continues through `#1348`.

11. **“dedup (manual, dry-run)”** (lines 15–16) — Stale. `#1311`/`#1337` executed hides (11 records).

12. **“21 Inactive rows rest on site-liveness (duplicates parked as Inactive before Draft-hide existed)”** (lines 120–121) — Stale vs `#1326` (31 Inactive/site-liveness, all 200 with product content) and vs `#1337` (shadows now Draft).

---

## 6. Five rules for the next agent (each tied to one failure here)

1. **A Live verdict is the product’s own state, never chrome.** Failure: orbitcdp flipped Inactive → Live on the banner “Live on Stellar” and a Launch App CTA while the same page served `oUSD Minted — / Collateral Locked — / Borrow APY —` (`03-packets-high-tier.md` lines 92–98, 380; `orbitcdp-2026-09-05.json` `markers`; `04-interventions.json` orbitcdp entry: “a marketing banner is never a product-state signal”).

2. **If the page exposes metrics, empty or zero metrics veto Live even when HTTP is 200 and a repo pushed today.** Failure: skyhitz stamped Live on the title “Skyhitz - Gravity. Mainnet” plus `skyhitz/hitz-gravity` pushed 2026-09-05 while Total Mass was 0.00 HITZ and Balance was — (`03-packets-high-tier.md` lines 295–301, 381; `skyhitz-2026-09-05.json` `markers`; `#1348`).

3. **One field, one writer, registered before either lane runs unattended.** Failure: dedup wrote Draft, curate wrote Inactive, sync wrote Live onto the same `status` the same day (`04-interventions.json` `dedup-projects` entry; `#1337`/`#1338`; lesson 17 at `02-state-of-program.md` lines 186–190 was written and then violated). `#1338` still unverified live; `STATUS_FIX` and basis-from-deployment still write status with no shadow skip in their PR bodies.

4. **Do not report recategorization as weak-share progress.** Failure: 62.7% → 57.2% is 54 rows, of which 13 are `#1312` copies of 2026-08-28 deployment evidence (“never as new evidence”), 38 are `#1345` `human-verified` stamps (34 of them keep-status), and the state block still said “the last drop was mostly new tiers” (`02-state-of-program.md` lines 55–56) — the same class of lie `#1310` already recorded (794→617 = 173 new tiers + 4 upgrades).

5. **A number is taken from the run’s own job steps or the fetched page, not from an agent’s packet note or memory.** Failure: `#1331` — “I wrote 18 from a report without reading the runs myself”; the hardened counter showed 3 scheduled no-ops (`01-merged-prs-today.md` lines 177–185). Same class: packets cited titles while the pages’ stats were dashes/zero; `#1320` treated green workflow runs as executes when the execute step was skipped.

---

## Verdict

Today’s 62.7% → 57.2% movement is real as arithmetic (617 → 563 weak on a frozen 984 denominator) and not real as evidence: 13 rows were copies of an old deployment basis, 3 were mixed backfills, 38 were owner-approved provenance stamps, and 34 of those 38 did not change status. The four receipted Inactives (basement, chainsatlas, code4rena, soundness) and the later skyhitz death are the actual row-quality wins; orbitcdp left the weak set while remaining dead, which is the empty case of a human-verified stamp. The findings split is mostly honest; the Draft/Inactive/Live fight is only half-closed. The single highest-risk thing in the bundle is the packet Live rule still in force — two independent signals defined as a 200 title plus any recent repo — with medium and low tiers (32 + 30) unapplied, after that rule already returned two dead products to Live in the high tier and the owner had to catch both by reading the stats the packets ignored.
