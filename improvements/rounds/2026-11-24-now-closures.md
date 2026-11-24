# Now items 2, 3 and 4 closed on a live re-check (2026-11-24)

Each item's "Done when" was read against the live API after #2006 and #2008 deployed.

## 2. Served fields the spec still does not declare

Done when: every operation's served fields and nulls are declared and a test walks each operation's body with served-shape.

- #2006 declared every field, null, enum value and JSON type the GET operations served in a read of each on 2026-11-24, and `src/lib/__tests__/served-bodies-spec.test.ts` walks a recorded production body of every GET operation with `scripts/contract/served-shape.ts`.
- Live: `scripts/check-api-drift.ts`, run 2026-11-24 against spec 1.9.167, passed its "Response field coverage (live within spec, every GET operation)" section with no failure. Its 10 failures that day were the three partner-only cohort paths in the status-registry and header sections and `/api/status` omitting `/api/tokens/integrations`, both fixed on `lane/r1124-cohort-offspec`.

## 3. Five confirmed build-to-project links are missing

Done when: the five verified links are recorded as a curated link basis the link lane reads (a spec enum entry for the basis), the lane re-ran (dry run, then execute), and the five links are live.

- #2008 recorded the five in `src/data/curated-build-links.ts` with basis `curated` in the spec enum.
- Sync lane: dry run 45324082570 planned exactly two link changes (`dorahacks-buidl-30931: none -> juntta (curated)`, `dorahacks-buidl-27417: none -> hoops (curated)`); execute 45328918875 succeeded.
- Live `/api/hackathons/builds/<id>`, read 2026-11-24: 27417 Comet x Hoops Finance -> hoops (curated); 30931 Juntta -> juntta (curated); 27456 YieldBack.Cash -> yieldbackcash (scf-page-and-name); 25141 PayZoll_Stellar -> payzoll (submission-links-and-name); 42656 clevercon -> clevercon (moved-repo).

## 4. Events with announced winners show 0 winners

Done when: the confirmed winners are served, a partial event says it is partial, and every ended event with no winner served says why instead of a bare 0 (the Waterloo probe serves a note).

- Live 2026-11-24: of the 29 events `/api/hackathons` lists, every one whose `endDate` is past was read through `/api/hackathons/<slug>`. Every event serving 0 winners also serves a winners note (Waterloo: "Not announced upstream: no page we could read names this challenge's winners ..."); none serves a bare 0.
- The four events with published winners serve them: build-on-stellar-philippines-2026 5, hackmeridian-2025 6, alebrije2026 2 with a note, apac-stellar-hackathon-2026 1 with a note.
