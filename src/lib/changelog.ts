/**
 * Stellar Scout API changelog — a curated, agent-readable feed of notable
 * changes to the public API, MCP tools, and typed client. Served at
 * `GET /api/changelog` so consuming agents (and their owners) can diff
 * "what changed lately" without trawling git history.
 *
 * Keep it latest-first. Add an entry whenever a change alters the contract
 * an agent depends on: new/removed endpoints or tools, param/enum changes,
 * description/routing rewrites, or response-shape changes. Skip purely
 * internal refactors that don't change observable behavior.
 */

export type ChangelogSurface = "api" | "mcp" | "api-client" | "skill";
export type ChangelogType = "added" | "changed" | "fixed" | "removed";

export interface ChangelogEntry {
	/** ISO date (YYYY-MM-DD) the change went live. */
	date: string;
	/** Which distribution surface(s) the change touched. */
	surfaces: ChangelogSurface[];
	/** Released package/spec version, when applicable (e.g. "scout-mcp@1.1.2"). */
	version?: string;
	/** Kind of change, keep-a-changelog style. */
	type: ChangelogType;
	/** One-line, agent-facing summary. */
	summary: string;
	/** Optional longer detail / migration note. */
	detail?: string;
}

/** Latest-first. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		date: "2026-09-05",
		surfaces: ["api", "mcp"],
		version: "spec@1.9.43",
		type: "fixed",
		summary:
			"getBuilders: the owned-repo language match is exact (not a substring — 'java' no longer fills the page with JavaScript repos), and a capped roster is disclosed in `meta.warnings`; a mixed prose+code hit keeps its code-language basis and says so.",
		detail:
			"From the second cross-vendor audit of 2026-09-05. The 1.9.41 admission fetched owned repos with a substring match on primaryLanguage under a silent 500-row cap; the match is now exact with GitHub's own casing (typescript → TypeScript, c# → C#) and the cap, when hit, is a warning on the response. The spec's description of match.basis for a mixed hit was corrected: matchedFields includes codeEvidence rather than being only codeEvidence. Same PR, not on the contract: the routing detector reports a zero-denominator run as vacuous (never 100%), classifies catalog lag before id-noun exclusion, and fails closed on a resolver error; /api/changes byFacet counts only rows also written since `since`.",
	},
	{
		date: "2026-09-05",
		surfaces: ["api", "mcp"],
		version: "spec@1.9.42",
		type: "fixed",
		summary:
			"getPartners `region` normalises labels and case before the vocabulary check and the parameter carries its enum; searchProjects with a `type` filter no longer lets `q` gate the typed set at the query.",
		detail:
			"Two fixes from the 2026-09-05 audits. (1) The 1.9.38 region check compared exact values, so 'North America' and 'Africa' — spellings a consumer carries from another surface — returned 400 alongside genuinely unknown values; labels and case now normalise to the stored value and the OpenAPI parameter lists the eight values. (2) searchProjects with type=<T>&q=<terms> promised that q only RANKS within the closed typed set (matchMode 'all') but the text clauses still ran at the query: type=Exchange&q=exchange served 15 of 18 Exchange rows. With a type filter the whole typed set is fetched and ranked in memory; the truth battery's G slice is green for every type.",
	},
	{
		date: "2026-09-05",
		surfaces: ["api", "mcp"],
		version: "spec@1.9.41",
		type: "added",
		summary:
			'getBuilders: a language in `q`/`skill` also admits builders who OWN an indexed repo in that language, with `match.basis: "code-language"` and the proving repos in `codeEvidence`.',
		detail:
			"Measured 2026-09-05: `?q=rust` returned 8 builders while 40 of the 170 served profiles carry Rust in onStellar.languages — a builder whose Passport bio never says Rust but who owns Rust repos on Stellar was invisible to 'who are experienced Rust Soroban devs'. Admission by code language is candidate discovery, never verified experience: such rows carry match.basis 'code-language', matchedFields INCLUDING 'codeEvidence' (a mixed row — one token by code, another by prose — also lists the prose fields and keeps the code-language basis), matchedTerms with the language as indexed, and sort below every prose hit. Only OWNED repos admit (onStellar's contributor join is computed after filtering); AND semantics across tokens hold, so 'rust nigeria' still needs the location to hit. The language match is EXACT and case-insensitive against GitHub's own casing (a substring net made `java` match every JavaScript repo), and a truncated owned-repo pass is disclosed in meta.warnings rather than silently dropping owners.",
	},
	{
		date: "2026-09-05",
		surfaces: ["api", "mcp"],
		version: "spec@1.9.40",
		type: "changed",
		summary:
			"x-routing vocabulary widened on getClusters, getPartners, getRfps and searchRepos from a builder-persona routing battery scored on the INTENDED operation.",
		detail:
			"The through-Raven routing detector (scripts/raven-routing.ts) now grades every question on the operation that should answer it — not on whether some scout operation appeared — with a persona tag (brand-new / knows-a-little / experienced / SDF-level), the intended op's rank, the top hits across services, and an evidence-classed miss (catalog-lag, outscored, id-noun-exclusion, no-scout-op, named-entity, vocabulary). Live 2026-09-05: 48 of 65 graded questions route to the intended op; persona bank 16 of 28. Nine misses are catalog lag: Raven's deployed catalog manifest is dated 2026-09-03T17:09Z and still carries pre-08-31 descriptions for getRfps, explainRepo and getPartners, so routing words added since then have not been read by the consumer yet. Vocabulary added here uses the askers' own words — 'verticals / least competition' (getClusters), 'implement SEP-24' (getPartners), 'who gives out grants' (getRfps), 'copy or fork' (searchRepos) — and cannot move the live number until Raven re-baselines.",
	},
	{
		date: "2026-09-05",
		surfaces: ["api", "mcp"],
		version: "spec@1.9.39",
		type: "added",
		summary:
			"getChanges: `meta.byFacet` counts rows whose DATED fact moved past `since` per surface — the material-change number next to `counts`, which is every write.",
		detail:
			"Asked 'what changed this week' on 2026-09-05, the feed answered 943 project rows, 10,476 repo rows and 9 partners — every row an enrichment lane had touched, because updatedAt moves on every write. byFacet.projects {status, scf-awards, deployment}, byFacet.repos {code-facts} and byFacet.partners {toml} are counted over the whole surface with the row's own dated fields; facets overlap; a `note` on every response says how to read the two numbers. Rows also gain a `deployment` facet (deployment.asOf). Limitation stated in the note: a lane that stamps an evidence date older than `since` (statusAsOf is the observation day, never the write day) shows as `row`, not as a facet.",
	},
	{
		date: "2026-09-05",
		surfaces: ["api", "mcp"],
		version: "spec@1.9.38",
		type: "fixed",
		summary:
			"getPartners: an unknown `region` value now returns 400 with `validRegions` instead of a silent 0 — a country is not a region, use q.",
		detail:
			"region is a hasMany select with a closed vocabulary (global, north-america, latam, europe, africa, mena, asia, oceania). Payload's contains operator is a substring test on hasMany, so region=Nigeria matched nothing and served counts 0/0 with an advisory that read as 'no partners here' — while q=nigeria found an anchor. Found by a through-Raven hand battery on 2026-09-05. Same pattern as the ramps filter: unknown values 400 with the vocabulary and a hint that countries and currencies live in q (coverage.countries is matched from query text).",
	},
	{
		date: "2026-09-05",
		surfaces: ["api"],
		version: "spec@1.9.37",
		type: "added",
		summary:
			"getRwaAssets rows gain `measured` — supply, holders and activity read by a six-hour lane and dated — the second bounded lane (P3).",
		detail:
			"P3 said one lane is not a system. The RWA registry was a one-off: 97 assets verified by hand on 2026-09-04, with a verifiedAt that would only age. It is now the identity source for a bounded lane that MEASURES each row every six hours into its own collection (rwa-assets) — classic assets via stellar.expert (supply, trustlines, lifetime payments), Soroban tokens via the contract record (lifetime events, supply where exposed). Every reading is dated; a failed fetch never blanks a good number (measureBasis unmeasured, previous values kept, note says why); a row is never deleted; and a run that could not measure most of the set exits 2 rather than passing as clean. On the row, `measured` is null until the lane has read that asset — an admission, never zero — and counts.measured says how many served rows carry one. If the store is unreachable, the registry still serves and meta.warnings says the readings are missing this request. Not a human stamp: the lane writes only measurement fields and never touches identity, verification level or state.",
	},
	{
		date: "2026-09-05",
		surfaces: ["api"],
		version: "spec@1.9.36",
		type: "added",
		summary:
			"Repo rows gain `supersededBy`, `deprecatedAt` and `supersessionKind` — supersession as fields a consumer can join on, from a curated dated map (P5).",
		detail:
			"P5's remaining item said it plainly: supersededBy / deprecatedAt existed nowhere as fields — the facts lived in knowledgeNotes prose, which a consumer had to read rather than join on. 50 of 254 curated notes carried that prose (GitHub archive banners, 'this repository has moved', npm deprecation notices). Each was read by eye and 34 became entries in a curated map keyed by the SUPERSEDED repo: kind (archived | renamed | deprecated | superseded), supersededBy as GitHub spells it, deprecatedAt as the repo's OWN date — GitHub's archive banner or a release notice — and the repo's statement quoted as source. Deliberately left out: repos whose older packages are deprecated in their favour (js-stellar-sdk, typescript-wallet-sdk, js-xdr are successors, not superseded); case-only path changes; and read dates — kotlin-wallet-sdk's banner gives no date, so its deprecatedAt is null rather than the day we looked. The existing successorRepo (weekly-stamped by enrich) is now derived from the same map, so there is one truth; on the row, supersededBy prefers the stored value and never overrides it. A test holds prose and fields together: every public note that says ARCHIVED, RENAMED, REPOSITORY DEPRECATED or 'has moved' must have a map entry, and no successor may.",
	},
	{
		date: "2026-09-05",
		surfaces: ["api"],
		version: "spec@1.9.35",
		type: "added",
		summary:
			"RWA rows and product records gain `controls` — the issuer's on-chain whitelist / freeze / clawback flags read from Horizon (sls-023 GT-18).",
		detail:
			"GT-18 in sls-023 asked how a live regulated fund share differs from a stablecoin: eligibility, whitelisting and clawback controls. For a classic Stellar asset those are not prose — they are the issuer's flags on the ledger, and Horizon serves them. Every classic registry row (65) now carries controls {authRequired, authRevocable, authImmutable, clawbackEnabled} with `controlsBasis` horizon-issuer-flags, and the product record on a project row carries the same object. Read live on 2026-09-05: 23 rows require issuer approval to hold (a whitelist) and are revocable with clawback — the BENJI family and YLDS among them; 25 are revocable with clawback but open to any holder (USDY, the WisdomTree funds); 4 are revocable only; 13 carry no flags and are freely transferable. Soroban tokens carry null: their controls live in contract logic and are not uniformly readable, and null says so rather than guessing. Not carried: legal class beyond rwa.xyz's assetClass, and transfer-agent record priority — prospectus facts, not ledger facts.",
	},
	{
		date: "2026-09-05",
		surfaces: ["api"],
		version: "spec@1.9.34",
		type: "changed",
		summary:
			"RWA registry corrected after a cross-vendor audit: new state `issued-single-holder` (34 rows were served as live with one holder), duplicate tranches linked via `pairedWith`, product records gain issuer / assetId / verificationLevel / `registryState` / launchedAt, and the #494 close-out is reframed.",
		detail:
			"A second auditor (Grok, hard-scoped to the shipped diffs and the registry) found what the first pass had not: 34 rows served as live had exactly one holder — the issuer or its custodian — which the spec's own definition ('issued with supply and activity') did not cover; six real-estate tranches were deployed twice (same wasm, same deployer, minutes apart, identical supply) and rwa.xyz lists both, so a project could be double-counted; grBENJI carried gBENJI's name; USDY, USDM1 and YLDS were classed stablecoin by a ticker list while rwa.xyz classes them US Treasury Debt; USDGLO was joined to Brale, its issuing platform, rather than its own row; the contract-metadata level promised a total_supply three rows do not have; and the product record served on project rows carried none of the identity, issuer, verification level or launch date the finding asked for, only a hard-coded status. Each is corrected: the new state is served and lends mainnet-deployment evidence (it is minted) but is never a live market; a pair yields one product; productKind follows rwa.xyz's asset class; the product record carries the fields; the level's definition says where total_supply is absent. Not changed: ZUSD stays joined to the gyen row, which itself names ZUSD as GMO's sister token. Also reframed on #494: the product model is served for issuers with a project row, and the finding's own probe remains majority-null because most of its 61 rows are not issuers — that is coverage, not a fix of every row, and the earlier comments said 'fixed' too broadly.",
	},
	{
		date: "2026-09-04",
		surfaces: ["api"],
		version: "spec@1.9.33",
		type: "changed",
		summary:
			"`deployment` on project rows is now filled from the verified RWA registry (new basis `rwa-registry`) where it was unknown — the last open item in sls-023.",
		detail:
			"sls-023's 2026-09-04 re-check measured the RWA rows: deployment present on 61, but 47 with network unknown, basis null and sourceUrl null. A project whose live product is in the registry has proven mainnet deployment — the issuer's own stellar.toml plus Horizon, or the Soroban contract itself — which is exactly the evidence `deployment` is documented to require. Where the stored fact was unknown and the registry holds a live row for the project, the row now serves network=mainnet, basis=rwa-registry, sourceUrl = the strongest-verified product's own evidence URL, and asOf = the registry's verification date. A stored mainnet or testnet fact is never overwritten: it is a stronger, deliberately placed claim. A project with no live registry row stays unknown — unknown is an admission, and this must not turn it into a claim.",
	},
	{
		date: "2026-09-04",
		surfaces: ["api"],
		version: "spec@1.9.32",
		type: "fixed",
		summary:
			"getRwaAssets meta.counts.issuers no longer counts a missing issuer entity as an issuer; the 1.9.31 entry overstated deployed-no-supply rows as four — it is one.",
		detail:
			"Live read after the 1.9.31 deploy: meta.counts.byState served deployed-no-supply=1 (chfSAFO) while the changelog said four. The other three zero-supply contracts (eurUSTBL, eurUKTBL, FOCGX) were read on-chain during verification but are not rwa.xyz-listed, so they were never registry rows; the number was written from the verification notes rather than from the served registry. The entry text is corrected. Separately, meta.counts.issuers used the set of issuerEntity values including null — 16 Brazilian receivables tokens carry no issuer entity — so it reported 53 where 52 named issuers exist; null is excluded now. The lesson is the same one this project keeps relearning: read the served number before publishing it.",
	},
	{
		date: "2026-09-04",
		surfaces: ["api"],
		version: "spec@1.9.31",
		type: "added",
		summary:
			"New `getRwaAssets` (/api/rwa): 97 tokenized real-world assets on Stellar, each re-verified on-chain, and the `products` array on project rows is now fed by it (sls-023).",
		detail:
			"sls-023 (filed 2026-07-10, recurred six times) asked for product-level deployment records distinct from entity status — a Live project row never established that a product is issued on Stellar today, and `products` was populated on 1 of 61 RWA rows. The registry holds every RWA token rwa.xyz lists on Stellar (97 tokens, 52 issuers) with the six facts asked for: product name and issuer, network, state, dated evidence, evidence URL, verification level. Each row was verified from the entity OUTWARD — the issuer's own stellar.toml naming the (code, issuer) and the issuer's home_domain pointing back — never from the asset code inward, because BENJI alone has 22 issuers on mainnet and five embed the brand in a scam subdomain. Soroban tokens (35 rows, including all nine of Spiko's, the largest RWA issuer on Stellar at $1.56B) were read from the contract itself via RPC: Horizon's /assets never lists them, which is how a code-inward check reports the network's biggest RWA issuer as absent. state=deployed-no-supply marks a contract that exists with zero supply and zero events (chfSAFO today); it is served on /api/rwa but never as a live product on a project row. Three more zero-supply contracts were read on-chain (eurUSTBL, eurUKTBL, FOCGX) but are not rwa.xyz-listed and so are not registry rows. rwa.xyz's USD value is carried as its own field beside supply and holders, so a $500M row with one holder and eight events reads as a valuation, not activity. Coverage is a curated registry: absence means untracked, never not-on-Stellar.",
	},
	{
		date: "2026-09-04",
		surfaces: ["api"],
		version: "spec@1.9.30",
		type: "added",
		summary:
			"New statusBasis tier `repo-activity` — the project's own indexed repository committed inside a dated window, which is what liveness means for a library or SDK.",
		detail:
			"A website probe is the wrong instrument for a library: driving a page says nothing about whether an SDK is alive. What answers that is whether the source moved, and those commit dates are already indexed. repo-activity records the newest commit in the project's own repositories, joined on the exact projectSlug, and cites that repository. It is deliberately NOT awarded to deployed products — there a commit shows the team is working, not that the service is running, and conflating the two is how a dead product with a tidy repo would read as Live. The window is 365 days, generous because a stable SDK legitimately goes quiet for months; the award records the real commit date either way, so a consumer can apply a stricter bar than ours. A repository quiet for longer is reported and left exactly as it was, never demoted: quiet is not dead, and only a human-verified list may say otherwise.",
	},
	{
		date: "2026-09-04",
		surfaces: ["api"],
		version: "spec@1.9.29",
		type: "added",
		summary:
			"New statusBasis tier `product-integration` — the live product itself was found to reference Stellar infrastructure, which is stronger than a page merely answering and weaker than a person confirming it.",
		detail:
			"site-liveness only records that a page answered: a parked domain, a coming-soon splash and a dead product's marketing site all pass it, and 518 of the 601 app-only rows rested on exactly that. product-integration records what the deployed surface actually contains — a SEP-1 stellar.toml, a Horizon or Soroban RPC endpoint, an on-chain address, or a Stellar SDK in the product's own JS bundle. It is deliberately NOT called verification: it observes an integration, never exercises a user flow, and is never evidence the product works. human-verified stays a separate, higher tier because a person looked, and relabelling machine work as a human attestation would be a lie about provenance. The probe skips SDK/RPC/indexer/analytics rows entirely — a website check says nothing about whether a package is alive, and pointing it at libraries would manufacture false negatives. Precision was checked against controls before it was trusted: three known Stellar products resolved via their stellar.toml, while example.com and the Wikipedia article about Stellar (which is full of the word) correctly returned nothing, because the marker list carries endpoints, SDK names, the network passphrase and address formats but never the bare word `stellar`.",
	},
	{
		date: "2026-09-03",
		surfaces: ["api"],
		version: "spec@1.9.28",
		type: "changed",
		summary:
			"analyze?dimension=toolchain reported a 5,616-repo headline over buckets computed from only 2,000. It now measures the whole corpus and states its own denominator (`measuredRepos`, `measurementComplete`, `deprecatedListTruncated`).",
		detail:
			"The toolchain query capped at 2000 rows while `scannedRepos` reported totalDocs, so byVersionStatus summed to exactly the cap (1826 supported + 43 current + 107 deprecated + 24 unknown = 2000) beneath a headline of 5616. Anyone computing the deprecated rate the obvious way got 107/5616 = 1.9% when the measured rate was 107/2000 = 5.4% — a 2.8x understatement of precisely the question this rollup exists to answer (who is on an unsupported toolchain). The scan now covers the corpus, and the response states the denominator it actually used: measuredRepos is what the buckets were computed over, measurementComplete says whether that is the whole population, and deprecatedListTruncated says whether deprecatedRepos (capped at 50) is shorter than deprecatedTotal so the roster length is never mistaken for the count. A future overflow now states itself instead of quietly deflating every rate.",
	},
	{
		date: "2026-09-03",
		surfaces: ["api"],
		version: "spec@1.9.27",
		type: "changed",
		summary:
			"SCF awards that carry no round number are no longer dropped. `scfRoundAwards` entries can now have `round: null` plus the award's own `awardName`, so an empty `scfAwardedRounds` beside real award money is explainable.",
		detail:
			"SCF grants awards outside the numbered rounds. Blend's $50,000 is a \"Liquidity Award - '24 Q1\", status Awarded on SCF's own project page, and it carries no SCF #N — so it mapped onto no numeric round, was dropped by the parser, rejected by the schema (roundAwards.round was required) and filtered out again on read (pickScfRoundAwards demanded a numeric round). The project surfaced $50,000 of award money beside scfAwardedRounds: [] with nothing to explain it, and an empty array reads as 'none'. Three projects in the first hundred SCF-awarded rows were in this shape (Blend $50k, Orally $48k, Zenex $150k). Awards now flow through with round null and awardName, verified against the live pages: Blend yields round=null / \"Liquidity Award - '24 Q1\" / $50,000, while Aquarius still yields 17+23+27 = $291,000 and Beans 10+15+21+29 = $490,160, both matching their stored totals exactly. Aquarius's Liquidity Award stays out because SCF marks it Pending, not Awarded. The numeric round SETS are deliberately unchanged — the never-accuse and no-resurrect guards read them, so this adds award records and changes no verdict.",
	},
	{
		date: "2026-09-03",
		surfaces: ["api"],
		version: "spec@1.9.26",
		type: "changed",
		summary:
			"Hackathon build rows gain `prizeUsd` (what a project actually won), `award` is documented as the shared category pool it really is, and `votes` is null instead of a fabricated 0.",
		detail:
			"DoraHacks nests placements under an award category, and we assigned the category title to every winner's `award`. All five winners of Stellar Hacks: Real-World ZK carried award \"$10,000 XLM Prize\" while placing 1st ($5,000) through 5th ($750) — the five placements sum to exactly that pool. An agent asked what Umbra Wallet won read `award` and answered $10,000; the truth is $1,250, an 8x overstatement, and summing `award` across winners returns 5x the pot. The field is now documented as the category title it has always been, and `prizeUsd` carries what the project itself won, parsed from its own placement string ('3rd Place - $1,250 in XLM' -> 1250) and null — never 0 — when the placement is tier-labelled and names no amount. Separately, `votes` was hardcoded 0 on every submission because the v1 hub API stopped serving vote counts; 0 asserts that nobody voted rather than that we cannot see votes, so it is null now, and an unknown count contributes nothing to build ranking rather than being scored as a zero.",
	},
	{
		date: "2026-09-03",
		surfaces: ["api"],
		version: "spec@1.9.25",
		type: "changed",
		summary:
			"Routing vocabulary now covers how builders actually phrase questions, not just how we do — `Stellar Community Fund` alongside `SCF`, `total value locked` alongside `TVL`, `smart contract audit` alongside `security audit`.",
		detail:
			'Ran the catalog through Raven as four different askers: someone brand new to Stellar, someone who has shipped a toy app, a working protocol dev, and an SDF-level analyst. Our operations were the top hit for 12 of 32 questions, and the gradient tracked expertise exactly — 1/8 for the newcomer, 2/8 for the near-beginner, 5/8 and 4/8 for the two experts. The cause is vocabulary, not capability: we write the routing surface in our own words, and under a coverage gate a word we never say is a question we never see. listAudits covered 0.25 of "which projects had a smart contract audit published in the last year" — we say `security audit`, never `smart contract audit` — so a registry of 58 real audit reports lost that question to a how-to-write-contracts skill. analyzeEcosystem covered 0.57 of "how much has the Stellar Community Fund awarded in total" because we only ever write the acronym. Both now cover 1.00 and win their probe. The additions are narrow and intent-scoped rather than broad, since over-broad keywords get an operation excluded outright. Seven builder-phrased win-probes are now asserted in routing-surface-check, along with a neighbour guard: the audit-corpus question and the hire-an-auditor question share nearly every token, so widening the first must never outrank getPartners on the second. Probes another of our own operations answers just as well are deliberately not asserted — a guard that forces one of two correct answers measures nothing. Takes effect for agents only once Raven re-crawls the catalog.',
	},
	{
		date: "2026-09-03",
		surfaces: ["api"],
		version: "spec@1.9.24",
		type: "changed",
		summary:
			"Contract rows gain `contractBasis`, and the `verified-contract-id` trust signal now fires only when a contract is provably the repo's own. A weaker `publishes-contract-id` signal covers the rest. Some `contractId` values are removed outright.",
		detail:
			"`mainnetContractId` was set from any address in a repo's README that stellar.expert could resolve — which proves the contract exists and nothing about whose it is. A README naming the USDC SAC as a config value, or the Reflector oracle it reads prices from, had that address stamped in as the repo's own deployment and published under a signal called `verified-contract-id`. Audited over all 137 live rows on 2026-09-03: 19 were shared token contracts (XLM/USDC/BLND) and 8 were contracts stellar.expert independently attributes to a different repo (reflector-network, blend-capital, consulting-manao) — 27 provably wrong against 4 provably right; 50 more could not be checked in that pass (rate-limited) and were left untouched. Two provable exclusions now apply at scan time and to the stored rows: an address carrying an `asset` is a Stellar Asset Contract, shared by everyone who mentions it; an address whose stellar.expert source validation names a different repository is not this repo's. What survives carries `contractBasis`: `self-validated` (stellar.expert's validation names THIS repo) or `published` (the repo publishes it and neither exclusion applies, but nothing proves ownership). Only `self-validated` earns `verified-contract-id`; `published` now reports `publishes-contract-id`, which is a true claim about the same fact. A rate-limited lookup is treated as could-not-check throughout and never as a negative.",
	},
	{
		date: "2026-09-02",
		surfaces: ["api"],
		version: "spec@1.9.23",
		type: "added",
		summary:
			"New partner type `asset-issuer` — a company that mints/issues an asset on Stellar but runs no fiat ramp of its own, distinct from `anchor` (which takes fiat in and pays fiat out, typically via SEP-6/24). `?type=asset-issuer` on /api/partners.",
		detail:
			"`anchor` had become a catch-all: 27 of 44 partners carried it, including tokenized-fund issuers with no deposit/withdrawal capability (e.g. a global asset manager issuing a tokenized money-market fund, shown as an on/off-ramp on its own public profile). An audit of all 27 reclassified the ones whose own words — tagline, description, or published stellar.toml (SEPs/rampTypes) — show pure issuance with no ramp: franklin-templeton, gmo-zcom-trust, audd → `asset-issuer`; anchor-coca-wallet → `wallet` (the type already existed); anchor-blox-global → `infrastructure` (its own site disclaims taking deposits or converting fiat). Rows with a real, evidenced ramp stayed `anchor` even where genuinely also an issuer (etherfuse, clpx, finclusive, zeam-money, aps-money, and the existing MoneyGram/Bitso/Yellow Card cohort) — SEP-6/24 or a curator-verified proprietary ramp API outweighs a mint-sounding tagline.",
	},
	{
		date: "2026-09-02",
		surfaces: ["api"],
		version: "spec@1.9.22",
		type: "added",
		summary:
			"getStablecoins rows gain `logoUrl` and `logoSource` — the issuer's mark, when one resolves, and where it came from (toml, toml-org, fallback, country-flag, none).",
		detail:
			"The pipeline has resolved these since launch; the public shape just never carried them (storeRowToApi renamed measuredAt to updatedAt but dropped logoUrl/logoSource outright), so every row read as logo-less to anything reading /api/stablecoins directly, even though the site's own listing page — which reads the stored doc rather than the public shape — rendered real logos the whole time. Also new: `toml-org`, a `logoSource` for a toml's org-level mark used when no per-currency image exists, stored only after a HEAD check confirms it actually serves an image (APS Money's own ORG_LOGO 404s, so its rows correctly stay on the country-flag fallback rather than a broken link).",
	},
	{
		date: "2026-09-02",
		surfaces: ["api"],
		version: "spec@1.9.21",
		type: "changed",
		summary:
			"Routing metadata only: getLeaderboard, getRfps, explainRepo and searchProjects gain distinctive multi-word keywords for ranking-by-activity, contributor jobs/bounties, code-mechanism and oracle-product questions; two product-named keywords leave searchResearch.",
		detail:
			"Four of the five open through-Raven routing cases misrouted on our own card: ties resolved by operation order (searchProjects/getLeaderboard, getBuilders/getRfps), a research keyword carrying a product name ('reflector oracle manipulation incident') hijacking a name query, and explainRepo lacking 'how does it calculate / in the code' vocabulary. Scored locally after: getLeaderboard 1.000, searchProjects 0.667 (top), getRfps 1.000, explainRepo 0.429. Descriptions and schemas unchanged.",
	},
	{
		date: "2026-09-02",
		surfaces: ["api"],
		version: "spec@1.9.20",
		type: "added",
		summary:
			"Every repo row (searchRepos, and the Repo shape searchProjects inlines) and explainRepo.repoMeta carry `kind` — archived | fork | hackathon | template-or-tutorial | contract | application | code — plus `kindBasis`, the signal that decided it.",
		detail:
			"Consumers treated every repo row alike: a hackathon demo, a fork of a template and a shipped product all read as 'a repo', because the telling signals (isArchived, isFork, judgedHackathon, a template-looking name, codeVerified.isDeployableContract, the project link) were scattered across the row. kind is DERIVED at read time from those stored signals — first match wins in that order; nothing new is stored or researched — and kindBasis names the deciding signal so the label can be weighed (nameLooksTemplate is the one heuristic, the rest are facts). No kind filter param yet.",
	},
	{
		date: "2026-09-01",
		surfaces: ["api"],
		version: "spec@1.9.19",
		type: "fixed",
		summary:
			"explainRepo: a bare owner/name in q routes explicitly (routedVia 'explicit'), outranking the concept map — 'stellar/stellar-etl' had wordy-split into 'etl' and routed to stellar-ledger-data-indexer, so the named repo's own knowledge notes never surfaced.",
		detail:
			"Same behaviour as passing ?repo=. Only a query that is exactly one owner/name token qualifies; a sentence that mentions a repo still routes by trigger phrase, concept map, then index. canonicalFor treats a bare owner/name like a code identifier (maps to nothing). Description-only change to routedVia in the spec.",
	},
	{
		date: "2026-09-01",
		surfaces: ["api"],
		version: "spec@1.9.18",
		type: "added",
		summary:
			"explainRepo returns knowledgeNotes — every public dated fact held for the routed repo — alongside any answer, and routes plain-English questions by curated trigger phrase (routedVia 'knowledge-trigger') before the lexical index votes.",
		detail:
			"P5 batch 3 brought the registry to 54 repos of dated facts (deprecations, renames, registry names, advisories), but an identifier question ('stellar/stellar-cli') returned only the DeepWiki walkthrough — notes were dropped unless one directly answered — and 'soroban cli renamed' routed to tupui/soroban-cli-python by name while the rename note lived on stellar/stellar-cli. Notes now ride every answer as knowledgeNotes (internal notes never leave; trigger phrases are not exposed), and a trigger that names exactly one repo routes there; ambiguous triggers fall through to search.",
	},
	{
		date: "2026-09-01",
		surfaces: ["api"],
		version: "spec@1.9.17",
		type: "changed",
		summary:
			"Routing metadata only, no schema change: searchResearch's x-routing now carries protocol-history and incident vocabulary (upgrade history P19→latest, why a version shipped, the Protocol 24 state-archival bug), and getChanges / getChangelog / getPartner / matchPartners gain x-routing blocks — they had none.",
		detail:
			"The upstream card change Raven's research-lane routing trigger (T1) asks for: their lexical index flattens x-routing into keywords, and protocol-history questions never reached searchResearch because none of that vocabulary was on the card. Descriptions are untouched (routing-surface ≤600 holds); keywords are multi-word phrases, never a bare 'protocol'.",
	},
	{
		date: "2026-09-01",
		surfaces: ["api"],
		version: "spec@1.9.16",
		type: "fixed",
		summary:
			"explainRepo knowledge notes now answer plain-English phrasings via hand-authored trigger phrases (sls-080 round 2: the upstream monitor asks 'highest supported protocol version' with no identifier, so the identifier-only matcher fell through to DeepWiki's stale 25).",
		detail:
			"A trigger fires only when every one of its words appears as a whole word in the question; phrases are curated in-repo per note, never derived from input, so the hijack surface closed in 1.9.15 stays closed. First covered note: stellar/stellar-horizon MaxSupportedProtocolVersion = 28.",
	},
	{
		date: "2026-09-01",
		surfaces: ["api"],
		version: "spec@1.9.15",
		type: "fixed",
		summary:
			"explainRepo knowledge-note hardening: citation URLs and bare domains can no longer route a note onto an unrelated question (exact identifier-set matching, never substring), and answerAsOf serializes the note's day-granular date as RFC3339.",
		detail:
			"Independent audit reproduced three hijacks of the day-old knowledge-note precedence: a question quoting github.com led with a security-advisory note because the note's citation URL was matchable; bare registrable domains passed the dotted-identifier shape; and canon-squashing the whole note let infix fragments (internal_ingest) match file paths (internal/ingest/main.go). Matching is now exact equality between identifier token sets extracted from both sides with the same regex — URLs stripped, bare lowercase domains dropped, substring containment gone — with the three reproduced hijacks pinned as tests. answerAsOf for note answers previously emitted a bare YYYY-MM-DD where the contract declares date-time; it now serializes as that day's 00:00:00Z with the day granularity stated in the spec.",
	},
	{
		date: "2026-09-01",
		surfaces: ["api"],
		version: "spec@1.9.14",
		type: "fixed",
		summary:
			"explainRepo: curated dated facts now LEAD answers that name the exact identifier asked about (answerSource 'knowledge-note', dated by answerAsOf) — and horizon questions route to stellar/stellar-horizon, the split repo where the living code moves.",
		detail:
			"Closes the value half of the consumer's sls-080/#1134 (the dating half shipped in 1.9.8): DeepWiki's undated index answered MaxSupportedProtocolVersion = 22–25 for a constant the source defines as 28 at our own scanned ref. Two root causes fixed. (1) Routing: Horizon split out of the stellar/go monorepo; the canonical map still sent horizon questions to the monorepo, whose frozen copy answers with pre-split values — stellar/stellar-horizon now leads the canonical entry. (2) Precedence: when a curated knowledge note directly names the identifier asked about (tight camelCase/snake/dotted match, ≥8 chars, public notes only), the note leads the answer with its verification date as answerAsOf, and any DeepWiki walkthrough is appended underneath labeled as possibly lagging — a dated, source-cited fact we verified beats an undated index we didn't. The stellar/stellar-horizon note carries the constant verified 2026-09-01 from source at master AND the scanned ref.",
	},
	{
		date: "2026-08-31",
		surfaces: ["api"],
		version: "spec@1.9.13",
		type: "added",
		summary:
			"New project type `Yield` — yield/asset-management products (vaults, strategy allocators, structured yield). `?type=Yield` on projects/search and leaderboard; 'yield'/'vault(s)' route to the type in search intents.",
		detail:
			"The P4 untyped census found the vertical had no enum member: five rows (arka-fund, cushion, meria + class) stayed honestly untyped rather than be force-fitted into Lending, and vault products that DID get typed were approximated (defindex, backyard, normal-finance as Lending/Stablecoin). Same class gap as Oracle (2026-08-27) and Card Issuing (2026-08-21): a vertical without an enum member is invisible to type browse regardless of how many rows exist. Rows are typed in the follow-up curation pass; until it lands, ?type=Yield returning few rows is the tagging lag, not the vertical's size.",
	},
	{
		date: "2026-08-31",
		surfaces: ["api"],
		version: "spec@1.9.12",
		type: "changed",
		summary:
			"getPartners `accepting` is a two-valued filter: 1 = only accepting partners, 0 = only NOT-accepting (today the honest empty set). `meta.filters.accepting` echoes the applied value, null when omitted.",
		detail:
			"Closes the oldest open contract finding (engine E, ambiguous-contract, open since 07-22): `accepting` was a single-value enum whose only value returned pages byte-identical to the bare call — every published partner currently accepts clients — so a caller could not tell a live filter from an inert parameter. The filter was live all along; the contract was undecidable from outside. accepting=0 selects the complement, making the parameter self-proving (the two values return different pages the moment either subset is non-empty), and the meta echo distinguishes explicit 0 from omitted (previously both read `false`). Rows with no acceptingClients verdict match neither filter — unknown is not claimable either way.",
	},
	{
		date: "2026-08-31",
		surfaces: ["api"],
		version: "spec@1.9.11",
		type: "changed",
		summary:
			"Routing vocabulary restored to five operation DESCRIPTIONS (getPartners, getLeaderboard, getRfps, searchProjects, explainRepo) — the text consumers actually index. No parameter, shape, or behavior changes.",
		detail:
			"Live interrogation of the #1 consumer's discovery index showed it embeds ONLY summary+description: the x-routing keyword blocks (split out in sls-051) never reach it, so a month of routing vocabulary was invisible to the consumer it was written for. Measured misses this fixes the vocabulary for: 'on and off ramps' (getPartners now spells the phrase out beside on/off-ramp, and says Stellar, which the description never contained), 'top Stellar projects by GitHub activity' (getLeaderboard now leads with top/most-active phrasing), 'jobs bounties and freelance work' (getRfps carries the worker-side words — the spec had an inline comment DOCUMENTING this exact gap without applying it), bare 'oracle/wallet/anchor' vocabulary (searchProjects enumerates sample type values), and ecosystem-repo mechanism questions (explainRepo says it also routes any indexed ecosystem repo — true since the graded-index fallback landed). Descriptions stay within the routing-surface budget; x-routing blocks remain for consumers that do read them.",
	},
	{
		date: "2026-08-31",
		surfaces: ["api"],
		version: "spec@1.9.10",
		type: "added",
		summary:
			"searchRepos rows serve `tierReason` and `tierChangedAt` beside `tier` — the tier's basis and its date. Null until the code-tier lane has judged the row: a bare tier means the schema default, not a verdict.",
		detail:
			"tierReason, tierPrev, tierChangedAt and tierRunId have existed in the Repos schema since the CTL design and were never written — tierReason spent a month on /quality as the canonical dead field of the consumption guard. The backfill lane now writes the full provenance suite (reasons array, previous tier, change timestamp, run id) with per-write read-back, and the search row serves the two consumer-facing halves. This is class 33 applied to our own machinery: a verdict without its basis beside it invites a reader to infer one from the nearest other field, and tierChangedAt is the date that covers tier — not scannedAt, not lastCommitAt, which describe the scan and the repo.",
	},
	{
		date: "2026-08-31",
		surfaces: ["api"],
		version: "spec@1.9.9",
		type: "fixed",
		summary:
			"explainRepo answer-dating residuals: repoMeta's description no longer instructs consumers to attach lastCommitAt as the answer's as-of date; unroutable responses carry explicit `answerSource: null` / `answerAsOf: null` instead of omitting the keys; and the operation's meta.warnings is declared as the answer-dating disclaimer.",
		detail:
			"Adversarial-audit residuals of #1134 (a value wearing provenance that does not cover it). (1) The spec's repoMeta description still said 'attach lastCommitAt as the as-of date when citing the answer' — the exact wrong inference #1134 reported; it now says repoMeta dates the INDEX's view of the repo, not the answer, and points at answerAsOf. (2) The unroutable-200 envelope emitted answered: false but omitted answerSource/answerAsOf entirely, so a client checking `answerAsOf === null` (the documented 'age unknown' signal) read undefined and never took that branch; both keys are now explicit nulls. (3) explainRepo's meta.warnings carries the deepwiki answer-dating disclaimer, but the shared Meta.warnings is documented as ignored-query-param disclosure — the operation now declares its own warnings schema so a generated consumer cannot misread the disclaimer as 'you sent a bad param'.",
	},
	{
		date: "2026-08-31",
		surfaces: ["api"],
		version: "spec@1.9.8",
		type: "added",
		summary:
			"explainRepo serves `answerAsOf` beside `answerSource`. It is NULL for every DeepWiki answer — DeepWiki exposes no index date, so the age of that answer is unknown and we will not infer one from the code scan.",
		detail:
			"Raven reported (issue #1134, three independent reproductions) that explainRepo answered `MaxSupportedProtocolVersion = 25` for stellar/stellar-horizon while the source at our own codeVerified.scannedRef (82660510) defines 28; re-verified here against raw.githubusercontent at that ref and at 2abda012, both 28. The stale number is DeepWiki's index. OUR defect was that the response carried three timestamps — meta.generatedAt, codeVerified.scannedAt, repoMeta.lastCommitAt — every one describing the source scan and none dating the answer, so a consumer reading scannedAt beside answerSource 'deepwiki' would reasonably conclude the answer was as fresh as the scan. `answerAsOf` is now explicit: null on the deepwiki path (an admission, since DeepWikiAnswer carries only {repo, answer, searchUrl} and the MCP envelope exposes no index date — inventing a timestamp would make an unknown look measured), and populated from scannedAt on the stellarlight-code-scan path, where the answer IS the scan. A meta.warnings entry names the three fields that do NOT date the answer, because an absent field is easy to skim past. The spec says the same and tells readers not to substitute the scan dates. Not done, and deliberately: verifying numeric constants in an answer against scannedRef content would need per-request source fetches, which is a different and much larger change than making the dating honest.",
	},
	{
		date: "2026-08-31",
		surfaces: ["api"],
		version: "spec@1.9.7",
		type: "fixed",
		summary:
			"getPartners and searchProjects both declared ramp vocabulary with no tiebreaker; the split is now stated on both sides — rampTypes (direction, corridor) is a partner fact, the larger anchor roster is a directory fact.",
		detail:
			'"on and off ramps for Stellar payments" was contested by construction: getPartners keywords carried on-ramp/off-ramp/ramps/anchors, searchProjects carried anchors and on/off-ramps, and neither notFor named the other. The un-brokered overlap was the defect, not the route taken. The split follows the data — 29 anchor-typed partners of which 9 have rampTypes populated, against 42 type=Anchor projects — so getPartners useWhen now claims the case it uniquely serves (which anchors on-ramp vs off-ramp, in which corridor) and searchProjects notFor points ramp direction and corridor questions at it. Routing metadata only.',
	},
	{
		date: "2026-08-31",
		surfaces: ["api"],
		version: "spec@1.9.6",
		type: "fixed",
		summary:
			"Three routing-vocabulary fixes: project names no longer sit bare on operations that do not serve them, getRfps gains worker-side terms (jobs, freelance, paid work) that appeared nowhere in the spec, and searchProjects defers GitHub-activity ranking to getLeaderboard.",
		detail:
			"(1) A bare project name on another operation makes that operation the router's answer for the project itself: 'reflector oracle on Stellar' ranked searchResearch 97 above searchProjects 81, for a project the directory holds at confidence 0.97. `reflector` and `yieldblox` sat bare in searchResearch's oracle-manipulation security cluster and are now the phrases that cluster meant — 'reflector oracle manipulation incident'. A sweep of all 287 single-token routing keywords against the live directory found 17 that are project names; the other 15 sit on the operation that SERVES them (audit firms on listAudits, stablecoins on getStablecoins, Soroswap and Stellarchain on searchProjects) and are correct. One more was qualified: `dune` on getLeaderboard meant Dune-style analytics export, and now says so. (2) getRfps described itself entirely in the funder's vocabulary — rfp, brief, grant, round — and the words 'jobs', 'freelance' and 'paid work' appeared nowhere in the 9,000-line spec, so 'jobs bounties and freelance work for Stellar contributors' routed to getBuilders and returned a list of people TO the person looking for work. getRfps gains the worker-side terms and getBuilders gains the directional notFor. (3) searchProjects now defers activity ranking to getLeaderboard, which declares that question shape in its own exampleQuestions and was losing it at rank 3. Routing metadata only; no schema or response change.",
	},
	{
		date: "2026-08-31",
		surfaces: ["api"],
		version: "spec@1.9.5",
		type: "fixed",
		summary:
			"listContracts stops capturing how-to questions: its x-routing.notFor now names searchResearch/searchRepos for 'how do I write/deploy/test a contract', explainRepo for 'how does X work in the code', and getPartners for 'who should audit my contract'.",
		detail:
			"All eight of listContracts' routing keywords contain the token 'contract', so a short blob with total term concentration outscored longer, more diffuse blobs on any query carrying that word, whatever the intent. Measured against the field-weighted scorer, listContracts won 'how do I write a Soroban smart contract in Rust' (204, vs searchRepos 163 at rank 3), 'how do I deploy a contract' (192), 'how to test a Soroban contract' (188), 'audit my smart contract' (91) and 'who can audit my contract' (95) — the last beating getPartners at 65 despite getPartners carrying that exact phrase in its own keywords. It correctly won only the two entity-shaped probes. The keywords stay entity-shaped, which is what they are for; the notFor entries name where the how-to families belong, in the spec's documented '<question shape> -> <operationId>' form. No schema or response change — routing metadata only.",
	},
	{
		date: "2026-08-28",
		surfaces: ["api"],
		version: "spec@1.9.4",
		type: "added",
		summary:
			"searchProjects rows carry `deployment` (mainnet | testnet | unknown, evidence-backed) as a separate fact from lifecycle status; `status: Live` is now explicitly defined as NOT a mainnet-deployment claim (sls-079).",
		detail:
			"sls-079 showed one label carrying two facts: Stellars Finance returned status Live (basis site-liveness) while the operator's own bundle held an empty mainnet config beside populated testnet contracts. The new `deployment` group is populated only from evidence (verified mainnet contract joins, on-chain activity readings, or human-verified operator artifacts) and serves network 'unknown' explicitly everywhere else — absence of evidence is never read as 'not deployed'. The status field's spec text now defines Live as 'operating for users somewhere' and points deployment questions at the sibling field. Stellars Finance itself is corrected to Pre-Release (human-verified, receipt committed).",
	},
	{
		date: "2026-08-28",
		surfaces: ["api"],
		version: "spec@1.9.3",
		type: "fixed",
		summary:
			"Opacity ratchet paid off: all 47 grandfathered open maps (additionalProperties:true) in operation schemas replaced with real property declarations observed from live responses; ratchet baseline lowered 47 → 0. Also fixes partnerOnboard's extract response key: the spec said `profile`, the route serves `fields`.",
		detail:
			"Every response object whose shape the contract previously refused to declare is now typed from live observation plus the serializer's own TS interface: the one-shot report metas (scf-pitch, hackathon-brief, vet-idea, repos/trust — {source, generatedAt, note}), the full vet block (competitors incl. matchMode, maturity, priorArt, gap) shared by vetIdea/scfPitch/hackathonBrief, SCF round/fundedPeers/fundingBar, hackathonBrief startFrom trust summaries and liveContracts rows, repos/trust usage + audits, contracts meta/codeInUse/audits, every analyze dimension block (categories, developers, gaps, hackathons, tvl, funding.byRound), changelog meta (incl. the deprecated flat returned/total), filter/count echoes on hackathons/builds, hackathons/compare, rfps and leaderboard (leaderboard filters.type is string[]|null, not string), repos/explain protocolCaps rows, partner caseStudies rows, partners/match + /assistant public-partner rows, partnerOnboard extract fields, submitPartnerListing accepted fields, and the feedback GET self-description. One key correction surfaced by the pass: partnerOnboard mode=extract returns `fields` — the spec's `profile` property never existed in a live response. analyze funding.postHackathonStatusFunnel stays a map by design (keys are recorded post-hackathon status names) but now declares scope + a typed integer value schema instead of additionalProperties:true. specs/opacity-baseline.json openMaps: 47 → 0 — the ratchet now fails the build if ANY operation schema reintroduces an untyped open map.",
	},
	{
		date: "2026-08-28",
		surfaces: ["api"],
		version: "spec@1.9.2",
		type: "fixed",
		summary:
			"verifyClaim response enum gains issued (sls-077); getQualityReport routing narrowed to source-calibration questions (sls-078); six served-but-undocumented fields documented; contract probe re-baselined at 0 violations.",
		detail:
			"sls-077: the verify request accepted type=issued while the 200 response claim.type enum still read audited/live/maintained; both now project ONE shared enum and a unit test pins them equal, so the drift class cannot reopen. sls-078: getQualityReport carried standalone routing words (trust, coverage, health, limitations) and Raven measured it hijacking 56 of 338 unrelated top-5 routings; every keyword is now anchored to Scout/Stellar Light itself and notFor carries explicit negative controls for technical questions that merely contain those words. Also: the fresh Engine E sweep (37 ops, 783 fields) confirmed all five 2026-07-11 violations fixed live and surfaced six response fields served but missing from the spec (getSkill tagline/source/targetUser/tags, analyzeEcosystem toolchain, compareHackathons prizePoolUSD) — all documented, and the probe artifact stamps generatedAt + opsReached so a clean bill is distinguishable from never having probed.",
	},
	{
		date: "2026-08-28",
		surfaces: ["api"],
		version: "spec@1.9.1",
		type: "fixed",
		summary:
			"getQualityReport repoQuality.coverage: rates against the population each metric targets; mainnet join read the wrong field (2 -> 76).",
		detail:
			"The census denominators divided every repo metric by all 12,938 rows including the ~10k ec-taxonomy tail that is scanned opportunistically by design, making the rates meaningless; repoQuality.coverage now reports curatedIndex (project-link + builder-owned), tail (no target attached), knowledgeNotes against the actual curation pool (curated rows with repoScore >= 60), and mainnetJoin against deployable-contract rows only. Also fixed: the mainnet join was read via the search API's serialized field name (codeInUse.contracts) against raw collection rows, undercounting 76 joined repos as 2. Whole-census withCodeDepth/withNotes/withMainnet remain for continuity.",
	},
	{
		date: "2026-08-28",
		surfaces: ["api"],
		version: "spec@1.9.0",
		type: "changed",
		summary:
			"getQualityReport rebuilt after a three-lane adversarial eval: verdict block first, per-operation contract state, honest guard staleness.",
		detail:
			"New top-level fields: verdict (guards holding/breached/stale + safeToRelyOn/doNotRelyOn, derived not authored), northStar (with ageDays and a non-null warning when stale/below target), perOperation (contractProbe per operationId: clean/violations/skipped/unmeasured — unmeasured is NOT clean), consumerFindings (their answer key fenced from our issue states). Guards now carry measure/state/severity/ageDays/cadence/freshnessDays; a guard whose evidence is older than its own window reads stale, never green. Entity counts moved from a search-mediated sample to a CENSUS (rowQuality/repoQuality gain read/population/frame; repoQuality publishes duplicateRows). Row scores are five BINARY facts (multiples of 20; the old fractional weighting made published scores unreachable under the published definition). findings gains total + the disjoint-states rule; missFunnel.population names the probes it cannot replay (coveragePct); gapMatrix rows carry share/exampleSource/examplePoolSize/exampleTruncated; flow.links carry sourceId/targetId; trend gains batteryErrors and population; meta gains cachePolicy. No fields were removed except repoQuality.topGraded label/evidence (renamed to the raw collection's language/projectSlug).",
	},
	{
		date: "2026-08-24",
		surfaces: ["api-client"],
		version: "api-client@1.9.0",
		type: "added",
		summary:
			"api-client reaches full spec coverage: 17 missing operations added (was 18 of 35).",
		detail:
			"New wrappers: getStablecoins, vetIdea, scfPitch, hackathonBrief, searchHackathonBuilds, listAudits, listContracts, getRepoTrust, resolveProject, getPeople, getPartner(slug), getChanges, getFeedbackSchema, matchPartners, partnerAssistant, partnerOnboard, submitPartnerListing. getChanges takes a REQUIRED `since`. All GET operations live-verified against production; README method table now lists all 35 ops.",
	},
	{
		date: "2026-08-29",
		surfaces: ["api", "mcp"],
		type: "changed",
		summary:
			"The open-findings count is now real: 185 findings that no longer reproduced were re-probed live and cleared, taking open from 263 to 78 (openapi@1.8.110). /api/quality also serves phase progress read from QUALITY.md and the written library — lesson write-ups, correction receipts, audit reports.",
		detail:
			"A detector only clears its own findings when it next runs, so fixes landing mid-week left their findings sitting open and the count read as debt. The sweep replays every open recall finding against live search and clears only on a pass observed right now, writing clearedAt and clearedBy so the reason is auditable; it runs daily before the artifacts are rebuilt. With the staleness gone the miss funnel became readable and actionable: 21 real findings, 9 ranking (returned but below top-3) and 12 admission (not returned for that phrasing), zero corpus and zero identity gaps. Phase progress is derived from QUALITY.md's own status markers — a phase cannot show done on the dashboard without being done in the plan — and P3 states plainly what is missing: no agent yet ACTS on the gap matrix.",
	},
	{
		date: "2026-08-29",
		surfaces: ["api", "mcp"],
		type: "added",
		summary:
			"Miss funnel on /api/quality and /quality (openapi@1.8.109): every open recall finding replayed live and classified at the FIRST failing stage — passing / ranking / admission / identity / corpus — each naming its owning area. First run: 70 of 80 sampled misses NO LONGER REPRODUCE, so the open finding count was carrying the previous week's fixes as if they were debt.",
		detail:
			"'200 recall misses' hides four problems with four owners: a corpus gap no retrieval change can fix, an identity gap where a row's own name misses it, an admission gap where the tier ladder never let it in, and a ranking gap where the row is returned just below the cut. Classifying at the first failing stage makes them mutually exclusive and each independently actionable, with real example slugs per stage. The finding that matters most is the staleness: the open count is now labelled on the page as an upper bound on real debt, with the replay share stated inline rather than left for a reader to discover. The daily pipeline rebuilds both artifacts so neither goes stale itself.",
	},
	{
		date: "2026-08-29",
		surfaces: ["api", "mcp", "skill"],
		type: "added",
		summary:
			"The quality report gains a GAP MATRIX (openapi@1.8.108) — one row per entity-x-missing-field with real identifiers, so an agent can work or check a gap instead of only being warned about it. Served on /api/quality and rendered on /quality, alongside the curation queue and repo work queue as full lists.",
		detail:
			"Today's matrix: 257/259 repos have no verified mainnet contract join, 550/588 rows rest on a weak status basis, 236/259 repos have no curated knowledge notes, 40 rows are untyped, 24 Live rows have no source URL, 3 repos were never scanned for depth. Each row states why it matters to a caller, what closes it, and example slugs. Readability pass on the page: every figure now declares its direction (higher/lower is better) and carries an info affordance defining what it measures — a bare percentage is unreadable — and the entity lists grew from 8 rows to 25-30 with the same data available in full via the API.",
	},
	{
		date: "2026-08-29",
		surfaces: ["api", "mcp", "skill"],
		type: "added",
		summary:
			"GET /api/quality (openapi@1.8.107) — this service's quality report, machine-readable, so an agent can calibrate trust without reading a webpage. Leads with knownLimitations: DERIVED from our own measurements, each carrying the number behind it and what to do instead.",
		detail:
			"Today's four, all computed: most statuses rest on site-liveness or source-inherited (544/588 sampled) — weigh statusBasis, verify a Live claim against statusSourceUrl; 40 rows untyped — an empty ?type= result is a statement about our tagging, not the ecosystem; knowledgeNotes exist on 23 of 259 sampled repos — absence is absence of curation, never evidence about the repo; 214 open recall-miss findings — for a known name prefer an exact slug or the resolver over natural language. Also serves per-surface open-finding counts in consumer terms, the row-quality score definition, statusBasisMix with its strength ordering, repo coverage, every guard with promise+holding, and the trend history. The /quality page gains the same limitations at the top with a link to the endpoint. Sample counts always carry their denominator.",
	},
	{
		date: "2026-08-29",
		surfaces: ["api", "mcp"],
		type: "fixed",
		summary:
			'Two wave-5 eval finds closed (openapi@1.8.106): the typo-correction registry was a 1000-row window on a 1000+ collection (soroswapp and aquarious silently fell to vector neighbours while blendd recovered — which side of the cutoff a project landed on decided whether its misspelling was correctable), and a capitalized mid-query proper noun matching a record\'s name or alias now promotes to an exact identity hit ("what happened to Hermes exchange" finds zenex via its new Hermes alias).',
		detail:
			"The registry truncation is the vet-idea 400-of-500 class in the rung that exists to rescue misspellings — now a full fetch (name+slug only, cheap). The proper-noun promotion fires only on words the USER capitalized mid-query (never the first word — sentence case is not a signal — and never network names, which cap in nearly every query), so lowercase category queries keep their ranking; five tests pin the boundaries. The Hermes alias itself ships as ALIAS_ADD in the curation pass — rename continuity as data (sls-050), never as an invisible synonym patch.",
	},
	{
		date: "2026-08-28",
		surfaces: ["api", "mcp"],
		type: "added",
		summary:
			"Stablecoin issuer relations become conflation-proof (openapi@1.8.105): getStablecoins meta gains multiIssuerTickers (EURC is issued by BOTH Circle and MyKobo — attribute by issuer account, never by ticker alone), and /api/verify gains the issued claim family ('is EURC issued by Circle') answered from the hand-verified registry, with the multi-issuer warning attached to every supported verdict.",
		detail:
			"The sls-066-class miss this closes: an agent read 'Circle issues USDC and EURC' (true) and attributed MyKobo's EURC to Circle. The registry already held both issuers with distinct accounts — verified on-chain today (home_domain circle.com and mykobo.co on the respective issuer accounts) — but nothing made the multi-issuer axis salient to a caller projecting {ticker}, and nothing let an agent CHECK an attribution. Now the disambiguation lives where the numbers are (computed over the whole inventory, so a peg filter or limit boundary cannot hide it), and the attribution is checkable: supported carries the other issuers as a warning, contradicted fires only when the registry records the ticker under other issuers, and an unknown ticker is honestly 'not in our registry', never 'does not exist'.",
	},
	{
		date: "2026-08-28",
		surfaces: ["api", "mcp"],
		type: "fixed",
		summary:
			"type=DEX no longer counts Indexers (openapi@1.8.104). Payload contains on the hasMany types field is case-insensitive SUBSTRING per element — 'DEX' matched In-DEX-er, so the DEX enumeration reported total 61 for a 46-row set, with the 15 Indexers stripped page-side into ghost pages. The candidate filter and the intent-type clauses now use `in` (exact element membership).",
		detail:
			"Found by the build-audit sweep the user asked for: a closed-set check across every enum type flagged DEX (46 of 61) — the one enum pair where one value is a substring of another. The route's own comment claimed contains was exact array membership while the memory bank recorded the substring trap; the operator contradicted both. Battery slice G now pins Wallet AND DEX (the collision witness) into every run with a third type rotating daily, and it ran RED against prod on DEX before this deploy.",
	},
	{
		date: "2026-08-28",
		surfaces: ["api", "mcp"],
		type: "fixed",
		summary:
			"Typed enumerations exclude lineage shadows from membership (openapi@1.8.103) — the residual half of the sls-033 ghost. The q path keeps shadows as candidates so their NAMES stay findable, but in a type enumeration a shadow duplicates a row already in the set; the page-side fold swapped lone shadows back to their canonicals on later pages, re-serving three rows and inflating total to 65 for a 63-row set.",
		detail:
			"Battery slice G caught the residual on the previous deploy's verification run (pagination walked 64, stellar-passport twice) — the guard doing its job against its own fix. With shadows excluded, the q+type pool is byte-identical to the no-q enumeration at any limit/offset: 63 rows, total 63, offset past the end serves zero.",
	},
	{
		date: "2026-08-28",
		surfaces: ["api", "mcp"],
		type: "fixed",
		summary:
			"Exact-type enumerations are limit-independent sets (openapi@1.8.102, sls-033's count instability closed at root): with ?type= present, type defines membership and q only ranks within it. One enumeration used to serve 58 uniques at limit=10 and 63 at limit=100, report total 65, and serve three rows twice across pages.",
		detail:
			"Root cause: with q+type, the keyword tier ladder gated MEMBERSHIP and the identity-underfill bypass re-admitted rows gated on `limit` — so what the set contained depended on how many rows you asked for, the exact rule the route already enforces for shadow-folds one layer down. Now the typed candidate set IS the result set (identical to the no-q pool), q orders it, the semantic pad is skipped (padding a closed set with vector neighbours recreated the ghost pages), and matchMode reports `all` with an explicit label — a tier would falsely claim q gated the set. Battery slice G (enumeration integrity) pins it daily: closed-set, q-ranks-only, pagination walks the set exactly once, no duplicate normalized names. Slice G ran RED against prod before this deploy (stellar-passport served twice on a limit-17 walk) — the guard predates its own fix.",
	},
	{
		date: "2026-08-28",
		surfaces: ["api"],
		type: "changed",
		summary:
			"getChanges speaks the standard provenance dialect (openapi@1.8.101): meta.generatedAt joins the existing asOf, and counts gains a total alongside the per-surface keys. Raven's host captures an exact-path allowlist (generatedAt, counts.total, matchMode) from responses into its judge-visible evidence block — a dialect difference silently dropped this op's provenance from an agent's evidence chain even when the data was retrieved.",
		detail:
			"Found by a census of every operation's meta against the sidecar allowlist their product lane shipped on 2026-08-26. Additive only — asOf and the per-surface counts keys are unchanged. analyze and vet-idea still lack a counts.total deliberately: neither has a single honest 'total' semantic, and a forced number that misleads is worse than absence; both are tracked in QUALITY.md §5.",
	},
	{
		date: "2026-08-28",
		surfaces: ["api", "mcp"],
		type: "changed",
		summary:
			"Every q-taking operation now labels HOW it matched (openapi@1.8.100) — the honesty-layer debt paid with ONE shared vocabulary. audits/contracts/skills/people/hackathons/builds report all|filtered; builders reports expanded (its matching is synonym/stem expansion, and the label now says so); research reports vector|keyword (it already knew which mechanism served you — now the response does too).",
		detail:
			"Pays all 8 grandfathered entries in the honesty ratchet (specs/honesty-baseline.json now holds only the 4 exempt ops, which are honest through different declared mechanisms). The shared vocabulary lives in src/lib/match-mode.ts: all = no text query; filtered = rows contain the query terms literally; expanded = synonym/stem expansion (verify relevance for niche terms); keyword = vector search unavailable, coarse fallback; vector = similarity ranking, not literal keyword truth. Labels state the MECHANISM actually used — sls-076's lesson: the lie is the label, not the match. The conformance checker also became $ref-aware (getHackathons declares through a component schema), and /quality gains a build-enforced contract-honesty row showing both ratchets.",
	},
	{
		date: "2026-08-27",
		surfaces: ["api"],
		type: "changed",
		summary:
			"Verify grows to the full claim surface (openapi@1.8.99): audited + live + maintained, a contradicted verdict, and the complete subject card (links, types, status with provenance, prominence) on every answer. The verdicts are joins over data we already label — the status record, indexed code activity with repo quality labels, and each repo's curated knowledgeNotes ride along as evidence.",
		detail:
			"'is X live' is now answered from the status record and its provenance tier — a Pre-Release row CONTRADICTS a live claim with the dated source attached (the laina/noether class becomes a first-class verifiable answer instead of a search interpretation). 'is X maintained/abandoned' is answered from indexed code activity: newest commit within 180 days on a non-archived repo supports it; every repo archived or a year-plus of silence contradicts it; between the two the caller gets the dates and no adjective. Evidence rows are typed (audit-report | status-record | code-activity | curated-note) so an agent can discriminate on kind. Nothing is recomputed: factConfidence scores the basis and age, repoScoreLabel is quoted, knowledgeNotes are quoted with their sources.",
	},
	{
		date: "2026-08-27",
		surfaces: ["api"],
		type: "changed",
		summary:
			"Zero silent opacity in the contract (openapi@1.8.98): every object schema now declares its shape or an explicit additionalProperties open map. A new CI lock makes a bare object schema unshippable, and the 47 explicit open maps are baselined with a ratchet — the count may only decrease.",
		detail:
			"The first closure-rule invariant from QUALITY.md. The hand sweeps (#1035, #1040) typed every fully-opaque top-level response; the lock's first run found 37 MORE nested bare objects (meta envelopes, filter echoes, embedded report objects) — the thesis proven on contact: sampling misses what invariants catch. Each is now either properly typed or an explicit additionalProperties:true open map, which is machine-readable as 'deliberately open' rather than silent. Additive only — no field changed shape; consumers see strictly more declared structure.",
	},
	{
		date: "2026-08-27",
		surfaces: ["api"],
		type: "added",
		summary:
			"Verify v1 (openapi@1.8.97): GET /api/verify — claim in, verdict + evidence + confidence out. Slice 1 verifies audit claims ('is X audited', by=firm, since=date) with three verdicts: supported (reports on record, dated evidence attached), unsupported (nothing in OUR corpus — the statement carries the denominator and never claims the world), unresolved (unknown subject, resolver note served).",
		detail:
			"PLAN §5's first slice. Subject resolution shares resolveProject's machinery so renames and aliases work; the auditor filter names who DID audit on a miss; supported verdicts cross the newest report date against the subject's latest code activity and carry a currencyNote when the audit predates the code by >90 days — an audit is a statement about the code as it was. 'contradicted' is deliberately absent from v1: for audit claims we can rarely prove the negative, and a verdict we cannot stand behind is what this API exists to not emit. Free text is a closed grammar; anything else 400s with the supported forms. The skeleton (parse → resolve → evidence → verdict) is the deliverable — contract-liveness and canonical-repo claims drop into the same frame next.",
	},
	{
		date: "2026-08-27",
		surfaces: ["api", "mcp", "skill"],
		type: "fixed",
		summary:
			"A spelling-corrected match no longer calls itself a keyword match (openapi@1.8.96). q=Strupey returned Stroopy.AI at matchMode=strict / 'all keywords matched' / 0.92 although neither name nor slug contains the token — the admission came from our own curated correction synonym. New matchMode 'corrected' names what happened (sls-076, stellar-raven #1055).",
		detail:
			"The correction expansion itself is deliberate and stays — strupey is a real misspelling of the former mascot with 17 asks in 30 days, and routing it to the right row is the point. What was broken is the label: an agent reading strict + 'all keywords matched' treated a spelling neighbour as identity evidence for an unverified name, and two independent Raven runs promoted Stroopy.AI's SCF history onto 'Strupey'. Rows admitted ONLY through a SPELLING_CORRECTIONS entry now report matchMode='corrected' with a label telling the caller the query token does not occur in the rows. Domain synonyms (cex → centralized exchange) are not corrections and keep their tiers. Documented in the spec prose and the pinned reference, which also gains the previously-missing 'semantic' bullet in its matchMode ladder.",
	},
	{
		date: "2026-08-27",
		surfaces: ["api", "mcp"],
		type: "changed",
		summary:
			"vetIdea's competitors block now says HOW it matched (openapi@1.8.95): matchMode vertical | scored | weak. An absurd idea used to return prominent SDK rows as 'competitors' with nothing marking them as neighbours — a caller could read filler as a competitive landscape.",
		detail:
			"Found by the hacker-journey battery (round 3): 'quantum teleportation of physical goods on Stellar' returned python-stellar-sdk, stellar-php-sdk and wisdomtree as competitors. The no-vertical fallback scores RAW tokens, so the word 'stellar' alone matches most of the directory. The directory search already serves matchMode for exactly this reason; vet-idea dropped it. Now: vertical = typed membership, scored = a non-generic anchor token contributed, weak = only generic words matched — labelled 'nearest rows, not evidence a competitor exists'. Additive; existing consumers unaffected.",
	},
	{
		date: "2026-08-27",
		surfaces: ["api"],
		type: "added",
		summary:
			"Oracle joins the types enum (openapi@1.8.94) — the vertical had NO enum member, so reflector, dia, band, redstone-finance, lightecho and pyth all carried types:[] and the whole category was invisible to type browse. Ten rows gain the type via the curation pass; laina corrected Live → Pre-Release (its app pins Networks.TESTNET — no mainnet path exists).",
		detail:
			"Found by truth-battery guard D's row-quality slice: three oracle providers flagged 'no types' in one sample. The fix is the full vertical, done once: enum member in the collection and both contract enum sites, ?type=Oracle accepted by search and leaderboard, oracle/oracles mapped in INTENT_TYPE so category questions admit typed rows, and searchProjects x-routing carries the browse vocabulary. Data lands additively via TYPE_ADD in the curation pass — reflector, dia, band, lightecho, redstone-finance, pyth, quasar, nebula, orally, soroban-optimistic-oracle — each row's evidence being its own already-sourced description; type is identity, not liveness, so statuses and provenance are untouched. Deliberately excluded on mention-vs-identity grounds: stellar-oracle-shield (oracle monitoring), mpcvault (a wallet whose prose mentions oracles). The laina correction is the noether class again: Live rested on a 200 from a landing page while src/lib/horizon.ts hardcodes horizon-testnet and Networks.TESTNET.",
	},
	{
		date: "2026-08-26",
		surfaces: ["api"],
		type: "changed",
		summary:
			"getPartner now declares its full 31-field profile (openapi@1.8.93) — the earlier declaration covered 9. All 12 operations Raven's drift check flagged were tested against their own declarations: zero declared-but-absent fields anywhere.",
		detail:
			"Raven's drift detector (their #67) picked up the schema-declaration wave, so every flagged operation was verified live against its own contract, both directions: nothing we declare is missing from responses, and served-but-undeclared gaps were closed — the partner profile's contact/coverage/verification fields (contactEmail, seps, rampTypes, verified.*, freshness.*) are exactly what a partner-matching agent needs and were invisible in the contract; builds meta now declares upstream/filters/counts and per-row matchedTerms (the evidence behind inclusion); compare meta declares counts. POST paths verified too: matchPartners returns scored matches with reasons and an honest candidatesConsidered denominator; onboard/assistant/submit-listing return precise 400s naming what is required rather than accepting garbage.",
	},
	{
		date: "2026-08-26",
		surfaces: ["api", "mcp"],
		type: "fixed",
		summary:
			'Asking about a project in a normal sentence no longer costs it its own identity. "tell me about Bridge" returned allbridge, axelar and spacewalk; the record literally named Bridge was absent. Together with the liveness fix, natural-language recall went from 78.3% to 93.9% and total eval failures from 262 to 67.',
		detail:
			'Two bugs of the same shape: the machinery was right, its INPUT was wrong. (1) Liveness words were treated as identity anchors — "live" was not in the generic vocabulary, nearly every project\'s prose says it, so "is X live" admitted every row at matchMode=majority with HIGH confidence while the named project was often absent. (2) The exact-name signal is the FIRST key in the result sort, but it was computed against the RAW query string, so ordinary phrasing destroyed it: q=Bridge scored an exact hit and ranked correctly, q="tell me about Bridge" scored zero. It now also considers the query\'s SUBJECT (its anchor tokens), compared both as written and slug-shaped so "Blue Orion" matches blue-orion. The token path promotes only to an exact hit — it never manufactures a weaker prefix match, which is what made prefix/word affinity a late tiebreaker rather than a primary key. Both matter beyond ranking: every honesty guard is gated on matchMode==="semantic", so a query landing in a keyword tier believes it succeeded and bypasses the confidence cap and the neighbours-not-matches advisory — returning a confidently-wrong answer instead of an honest refusal.',
	},
	{
		date: "2026-08-25",
		surfaces: ["api"],
		type: "changed",
		summary:
			"Every remaining opaque response schema now declares its shape (openapi@1.8.91). Zero operations left where the contract says only 'object'.",
		detail:
			"Completes the sweep started in 1.8.89. listAudits and getSkill were the two that mattered most — both are exposed to agents and both returned an unprojectable blob: listAudits now declares the whole registry row (20 fields, matching live exactly) including findingsTotal's honest null (extraction failed, NOT zero findings) and counts.matched as the denominator behind a narrow query. getSkill declares content's null (the source ships no SKILL.md, which is not absence of the skill). The partner POST paths declare their success shapes and a shared 503 unavailable contract, and getFeedbackSchema declares the self-describing body it hands callers. Shapes captured from live responses or each route's own documented contract, then diffed against live: no undeclared field, no declared-but-absent field.",
	},
	{
		date: "2026-08-25",
		surfaces: ["api"],
		type: "changed",
		summary:
			"listSkills now honours its q parameter instead of ignoring it (openapi@1.8.90). ?q=oracle used to return all 43 skills, so an agent read an unfiltered catalog as a filtered answer.",
		detail:
			"q was in Raven's tool signature but never applied server-side — the silent-filter trap the partners route already guards against. It now matches over name/tagline/description/tags (all terms), is advertised in unknownParamWarning, and is echoed in meta.filters; an unmatched query returns an honest empty list rather than the whole catalog. Found by sweeping every list endpoint for honest-absence, not by a report.",
	},
	{
		date: "2026-08-25",
		surfaces: ["api"],
		type: "changed",
		summary:
			"Four agent-facing operations declared their full response shape (openapi@1.8.89). compareHackathons, searchHackathonBuilds, getPartner and matchPartners each declared only `type: object` — an agent could call them and could not project a single field, the same class as the resolver in #1030.",
		detail:
			"A sweep of the live spec found 13 fully-opaque response schemas; these four are the ones agents actually reach through Raven, so they are the active harm. Each now declares its real properties (captured from live responses) with what the values mean: build submissions carry name/placement/isWinner/votes and an honest note that a non-win is not a quality judgement; partner matches carry score/reason and candidatesConsidered as the denominator behind a miss. Additive only. The remaining opaque schemas are on operations Raven does not yet expose; typing them is the path to exposure and is tracked separately.",
	},
	{
		date: "2026-08-25",
		surfaces: ["api"],
		type: "changed",
		summary:
			"resolveProject's nested objects are typed, so a model can project them (openapi@1.8.88). subject, current and evidence declared only `type: object` with no properties, and the live `meta` envelope was not declared at all — Raven kept the operation UNEXPOSED because the model-facing contract never named the fields a caller must read.",
		detail:
			"An operation nobody can safely project is an operation nobody can use. subject (slug/name/status), current (slug/name/status/url) and evidence (statusAsOf/statusBasis/statusSourceUrl/unsourced) now declare their properties, each carrying what the value MEANS rather than just its type — statusAsOf is when the status was observed, statusBasis says how it was established, and unsourced: true marks a claim with no citable source that must not be reported as established fact. The meta envelope (source, generatedAt, searched, methodology) is declared too; `searched` is the denominator behind a miss. The API reference also gains `repo` in the matchedOn vocabulary, which OpenAPI already allowed but the pinned reference omitted. Additive only: no field removed, no behaviour changed.",
	},
	{
		date: "2026-08-25",
		surfaces: ["api"],
		type: "changed",
		summary:
			"searchRepos and getPartners now say when their rows did NOT match your query (openapi@1.8.87). Both used to answer a query that matched nothing with plausible near-matches and no marker, so an agent reported ranked neighbours as findings — searchProjects already solved this with matchMode, and these now follow it.",
		detail:
			'Measured through the live Raven gateway: the query "zzqqxx nonexistent protocol 9999" returned a real repo from searchRepos and five partners from getPartners, with nothing in either response indicating the rows were filler. searchRepos gains meta.matchMode (strict | partial | weak | all | none) + matchModeLabel, derived from how many query terms actually hit the page being served; `weak` states in words that the rows are ranked neighbours and NOT matches, and `none` (search failed) is now distinguishable from a genuine empty result, so a failure can never read as proof of absence. getPartners gains meta.matchMode (scored | weak) — scorePartners deliberately falls back to fresh/accepting partners when a query yields no signal, which is a fine ranking choice and a misleading answer unless labelled. Additive only: no field is removed and no existing caller breaks. A new eval (raven-honest-absence) asks four surfaces an unmatched query through Raven and fails any that returns rows without admitting it.',
	},
	{
		date: "2026-08-23",
		surfaces: ["api"],
		type: "changed",
		summary:
			"listPaidEndpoints is withdrawn from the public API (openapi@1.8.86). The agent-payments index it served is real and still being built, but it stays unadvertised until the lane is less new — the endpoint existed for under two hours and is removed at the cheapest possible moment for downstream catalogs.",
		detail:
			"Removing an operation is expensive drift for a consumer's catalog, so the honest thing is to do it immediately rather than let it settle. Nothing else changes: no other operation, field or behaviour is touched, and no data an existing caller depends on is affected. The work itself continues against the same store, so if it returns it returns with history rather than as a fresh list.",
	},
	{
		date: "2026-08-21",
		surfaces: ["api"],
		type: "added",
		summary:
			"Exchange is a project type, and 14 centralized exchanges that trade XLM today join the directory with CoinGecko market evidence (openapi@1.8.84). 'Which exchanges list XLM?' returned DEXes and a trading bot, because the directory held no Exchange type and 23 of the Stellar Playbook's 30 CEXes were absent.",
		detail:
			"Every imported row had to earn it with evidence dated 2026-08-21: a live XLM market on CoinGecko's stellar tickers (last trade under 24h) — Binance, Coinbase, Kraken, Upbit, Bithumb, Bybit, KuCoin, Gate, Bitstamp, HTX, WhiteBIT, Crypto.com, Coinone, CEX.IO. Eight Playbook CEXes show no XLM market (Liquid wound down in 2023; Coincheck, CoinMENA, PDAX, Newton, Bitmama, Busha, Buenbit) and were NOT imported — a directory row is a claim. The same gate was applied to the Playbook's 20 missing ramps: 19 publish no stellar.toml and mention Stellar on no docs or assets page, so only MoonPay (a dedicated moonpay.com/stellar page) was added. Listed-in-the-Playbook is a reason to check, never a reason to import; the Playbook repo's last commit is 2026-02-06.",
	},
	{
		date: "2026-08-21",
		surfaces: ["api", "skill"],
		type: "added",
		summary:
			"Card Issuing is a project type (openapi@1.8.83, stellar-raven #39). 'What card services can I integrate on Stellar?' returned a defunct issuer first, missed Bridge entirely, and padded the list with anchors, wallets and a card GAME \u2014 because 'card' was only ever a word to match, never a category to ask for. It is a category now: searchProjects?type=Card Issuing, and card/debit-card queries resolve to it.",
		detail:
			"The answer an SDF reviewer checked against the Stellar Playbook debit-cards page (Bridge, Kulipa, Rain, Wirex) failed on every axis, and each failure was ours. Kulipa led the list: it shut down on 2026-07-29 (insolvency; ~20 wallet partners, 120,000 cards disabled \u2014 six independent reports) while our row said Live on a site-liveness basis because its domain still serves a 'changing home' placeholder. Bridge was absent: its row never mentioned cards, so no card query fetched it, although bridge.xyz leads with stablecoin-backed cards integrated with Stripe Issuing. Rain's website pointed at rain.com \u2014 a Bahrain crypto exchange \u2014 instead of rain.xyz, the card company. Wirex's row still carried its 2023 SCF pitch ('would like to support Stellar too') eight months after Wirex and Stellar went live with dual-stablecoin Visa settlement in USDC and EURC (Nov 2025). GetBlockCard (Ternio's BlockCard, later Unbanked, wound down 2023) showed Live because its lapsed domain now serves a lottery-spam site that answers HTTP 200 \u2014 the lesson that a 200 is not liveness. And with no type to anchor on, 'card' ranked Yellow Card (name homonym) and CyberBrawl (a card game) above every issuer. The type plus intent mapping fix the retrieval class; the row corrections are curated with a citation each and a protected NAME_FIXES registry so the nightly feed sync cannot revert the Wirex rename. Then the same question was asked of the real Raven gateway for 16 categories, which found the class: plural category words (DEXes, AMMs, bridges, wallets, indexers) mapped to no intent at all, so every such question lost its category; a Scout directory op reached Raven's routing top-8 for only 3 of 16 — the searchProjects/getPartners routing text now carries that vocabulary; and a liveness sweep of all 856 Live sites found 23 parked/placeholder/spam pages and 45 off-site redirects behind site-liveness, so the weekly link check now records what a 2xx SERVED (page verdict) and the basis upgrader refuses — and downgrades — anything that is not a product. Status is never changed by a machine; humans decide death.",
	},
	{
		date: "2026-08-21",
		surfaces: ["api"],
		type: "fixed",
		summary:
			"Contract hygiene from a red guard nobody was reading (openapi@1.8.82): six composites (/api/projects/resolve, /api/vet-idea, /api/scf-pitch, /api/hackathon-brief, /api/repos/trust, /api/contracts) now emit CORS + X-API-Version and appear in /api/status.endpoints; resolveProject gets its api-reference section; ResearchResult documents the live docKind and docVersionStatus fields.",
		detail:
			"The daily API drift guard had been failing since 2026-08-13 \u2014 eight consecutive reds \u2014 and because the failure was chronic it had become background noise. Every item it flagged was real. The headers one is the most consequential: an endpoint not enumerated in next.config.mjs publicApi[] ships without Access-Control-Allow-Origin, so a browser-side agent calling /api/scf-pitch got a CORS failure while curl worked fine. docKind and docVersionStatus were being served on every research row with no schema entry, so a consumer reading the spec could not know that an old doc with docKind=spec is still authoritative while an old guide is not.",
	},
	{
		date: "2026-08-21",
		surfaces: ["api"],
		type: "added",
		summary:
			"supportedNetworks coverage 9.3% \u2192 52.7% by deriving Stellar membership from evidence already on the row, plus a new networksBasis saying which evidence and therefore whether the list is exhaustive (openapi@1.8.81, stellar-raven sls-017). Curation had reached 94 of 1,010 projects in a year; the honest null we started serving for the rest was still an answer nobody could use.",
		detail:
			"Four signals are PROOF that a project operates on Stellar rather than inference, and all four already sit on the row: onchain.contracts (contract records observed on Stellar), tvlUSD (DefiLlama tracks its Stellar TVL), coverage (SEP/corridor rails are Stellar rails), and scf.awarded \u2014 the Stellar Community Fund funds only Stellar work, which alone accounts for 409 of the 438 newly covered rows. networksBasis reports which one, strongest first, so a caller can weigh a deployed contract differently from a grant. The basis field is load-bearing, not decorative: a derived list is exactly ['stellar'] and is NOT exhaustive, because evidence of Stellar is not evidence about XRPL \u2014 without it this would have traded one false negative (null everywhere) for a worse one (every derived row implying Stellar-only). Only networksBasis 'curated' means the list is complete and a missing chain is informative. The DTCC case that motivated the caution is the proof the rule is safe: it sits at Development announcing Stellar availability for H1 2027 and derives to null, because announcing a future deployment leaves no evidence behind. Status is deliberately not a factor \u2014 an SCF award proves the project targets Stellar whether or not it runs today, and whether it runs is what status is for. 478 projects still derive to null, honestly.",
	},
	{
		date: "2026-08-21",
		surfaces: ["api"],
		type: "fixed",
		summary:
			"Partner rows stop claiming emptiness they never checked (openapi@1.8.80). assets and seps are now NULL until we have actually fetched the partner's stellar.toml, and [] only when we fetched it and it declared none \u2014 so [] becomes a checkable claim instead of a shrug. rampTypes and caseStudies go null when never curated. 31 of 44 partners were telling callers they support no SEPs and issue no assets.",
		detail:
			"Found by sweeping every list endpoint for array fields that are empty on nearly every row \u2014 a field that is [] 100% of the time is not carrying information, it is asserting emptiness. assets was the clearest signal: empty on 0 of 13 partners whose toml we had fetched, and on 29 of 31 we had not. So emptiness tracked our own fetching, not the partner. This also repairs a documented inference that the old encoding quietly broke: the spec says empty seps alongside non-empty rampTypes means the ramp is proprietary rather than SEP-based, which is only sound if empty means we looked. It now is, and the spec says the inference holds against [] and never against null. caseStudies was empty for all 44 partners, i.e. never curated for anyone. Deliberately NOT changed: builders.projects, which ships beside an explicit projectCount that disambiguates it, and repo knowledgeNotes, where [] is a true statement about our own annotations rather than about the repo. The rule applies where empty misrepresents the subject, not mechanically everywhere.",
	},
	{
		date: "2026-08-21",
		surfaces: ["api"],
		type: "fixed",
		summary:
			"products now serves NULL when no product-level records are modelled, instead of [] (openapi@1.8.79, stellar-raven sls-023 / sls-029 / #742). 1,008 of 1,010 projects \u2014 including every wallet in the directory \u2014 were asserting that they ship no products on Stellar. The field exists precisely because a project-level Live label cannot say which product is live on which network, and [] answered that question with a confident, wrong 'none'.",
		detail:
			"sls-023 and sls-029 both report this as 'products remain null'. They are not null, which is the problem: they are [], and an empty array is an assertion where null is an admission. The distinction matters most for exactly the cases those findings name \u2014 DTCC, whose entity is Live while its Stellar availability is expected H1 2027, and the oracle providers, where a published mainnet contract that relays and a published testnet mapping that returns Contract not found are different facts a provider-level label flattens. Both of those rows ARE modelled (dtcc, lightecho); the other 1,008 now say so honestly instead of claiming emptiness. The spec already carried the right intent in prose \u2014 'Empty = no product-level records yet (never no products)' \u2014 but prose in a description cannot be acted on by a machine reading the array; null can. This is the same rule now applied consistently across supportedNetworks, routes, coverage and llamaSlugs. No curation was invented: coverage is still 2 projects, and raising it is evidence work, not a serializer change.",
	},
	{
		date: "2026-08-21",
		surfaces: ["api"],
		type: "fixed",
		summary:
			"supportedNetworks now serves NULL when we have no curated chain evidence, instead of [] (openapi@1.8.78, stellar-raven sls-017). An empty array is not the absence of a claim \u2014 it is a claim of emptiness, and 916 of 1,010 projects were telling every caller they support no blockchain at all, Stellar included. In a directory of Stellar projects that inverted the exact rule the field exists to enforce: omission must not read as negation.",
		detail:
			"The field was added so a multichain wallet's silence about a chain could not be mistaken for a denial (LOBSTR = [stellar, xrpl]). But the serializer mapped any missing value to [], and the spec text said \"Empty when unknown\" \u2014 so the contract itself documented the false negative. `routes` and `coverage`, added later for the same shape of problem, already got this right: null means UNKNOWN, never 'none exist'. supportedNetworks now matches them. Search behaviour is unchanged \u2014 it reads the stored document, and chainCorridorHit already treated an unenriched field as unknown and fell back to a prose match rather than using empty as proof of absence, so no ranking moves. Coverage itself is untouched at ~9%: only 23 further projects carry evidence we could derive from (on-chain contracts, curated routes, anchor SEP coverage), and asserting 'stellar' across the directory was rejected because a Development-status record is not a live deployment \u2014 the same error we corrected on DTCC. Raising coverage needs real evidence collection (stellar.toml probes, chain probes), which is separate work; what shipped here is that the absence is now honest, which is the half that was actively misleading.",
	},
	{
		date: "2026-08-20",
		surfaces: ["api"],
		type: "added",
		summary:
			"resolveProject (GET /api/projects/resolve?q=) — turn a project name found in an old post, changelog or repo into what it is now: the record it names, where to look if that record was superseded, and the evidence behind any inactive status (openapi@1.8.77).",
		detail:
			"We already answered this for people — a dead slug 307s to its survivor in a browser — and not for machines, which is backwards for a question only agents ask. Matching runs strongest-first (slug, then alias, then normalized name) and reports which via `matchedOn`, so an exact slug can be weighted differently from a name collision; a name matching two projects returns a MISS naming both rather than picking one and attributing a history to the wrong company. Three refusals are load-bearing: `found: false` means NOT TRACKED HERE, never that a name never existed or is defunct; `superseded: false` on an inactive row means no successor is RECORDED, never that nothing succeeded it; and `evidence.unsourced: true` marks a status we assert with no citable source. That last one is honest rather than flattering — of ~80 inactive rows only 10 carry a source URL, so most resolutions say out loud that they are our unverified record. 14 unit tests, including a dangling successor pointer and a supersession cycle, both of which degrade to what we hold instead of throwing.",
	},
	{
		date: "2026-08-20",
		surfaces: ["api"],
		type: "fixed",
		summary:
			'statusAsOf now dates the OBSERVATION instead of the last sync (openapi@1.8.76, stellar-raven sls-024). The nightly lumenloop sync re-stamped statusAsOf on every weak-basis row on every run, so 850 projects nobody had re-checked since import reported "Live, as of today" each morning. It advances only when the incoming status actually differs now; an unchanged label keeps the date we first observed it. statusBasis is also documented for what it is: source-inherited and unverified are ADMISSIONS that nobody checked, not evidence.',
		detail:
			'Measured before changing anything: of 1,010 projects, 850 (84%) carry statusBasis source-inherited, statusAsOf was 96% populated but meaningless on those rows, statusSourceUrl 68%, supportedNetworks 9%. (An earlier version of this note also said "statusConfidence 0%" — that was a miscount: statusConfidence is not a stored column but a per-request computation from basis \u00d7 freshness, and it was already served on every row. Censusing the collection instead of the API produced the wrong number.) The vocabulary already distinguishes operator-announcement / site-liveness / onchain-activity / human-verified — it is simply barely applied, and only 18 of the 850 inherited rows carry on-chain or TVL evidence that would let us upgrade them honestly. So this ships the two things that are true rather than inventing provenance we do not have: a date that means something, and a description that stops a Live label on an inherited basis from reading as verification. Populating a real basis for the remaining rows needs evidence collection (site probes, chain probes, curation), which is separate work and does not belong behind a schema edit.',
	},
	{
		date: "2026-08-19",
		surfaces: ["api"],
		type: "changed",
		summary:
			"Remediation history is out of the model-facing schema descriptions (openapi@1.8.75, stellar-raven sls-069). 33 served descriptions named an internal finding id a caller cannot resolve from the OpenAPI document; those ids are gone, along with specced-on dates, prior field shapes, and past-incident anecdotes. Every rule the descriptions carried is unchanged — only the release history moved out, to here.",
		detail:
			"A schema description is a contract for the caller: current meaning, scope, provenance rules. An internal finding id is none of those, it costs prompt budget on an endpoint already over the consumer truncation cap, and it created a second, staler owner of change records alongside this changelog. Removed: the ids themselves; `it was the whole-set count until 2026-08-18` from stablecoin counts.total; the Circle USDC incident from stablecoin coverage; the BREAKING date and prior string shape from supplyChange7d; `retained for response-shape compatibility` from verified; `served since / specced on` from the two RFP round fields and from scfRound.source. Code comments in openapi-spec.ts keep their finding ids — they are not served. Two of the offending descriptions were added by us the same day while closing sls-071 and sls-072, which is why the fix also had to cover new writing, not just old.",
	},
	{
		date: "2026-08-19",
		surfaces: ["api"],
		type: "added",
		summary:
			"Two stellar-raven findings closed (openapi@1.8.74). sls-071: an exact audit-finding identifier the corpus does not hold now returns `meta.exactMiss` naming it, instead of the report's section boilerplate — which on 2026-08-19 came back at HIGHER confidence (0.85) for an identifier that does not exist than a real one scored (0.73). sls-072: `meta.scfRound.source` (live | unavailable) is declared in the response schema; it was served but undeclared, and it is the field that separates a failed round-feed fetch from a genuine 'no round open'.",
		detail:
			"An identifier is present verbatim or it is a miss — there is no nearest-neighbour version of a finding id, so vector fallback for one is never an answer. Detection requires two hyphen-separated groups (V-SOR-VUL-002, V-SOR-APP-VUL-003) so CAP-0038 and SEP-0010, which are pinned by document URL, never route through it. The rows are still returned, because the neighbours may be useful, but meta.exactMiss says in words that their scores rank similarity rather than a match and that the identifier must not be reported as found. On sls-072: `unavailable` means the fetch failed, so an empty roundsInProgress means we could not look, never that nothing is open — undeclared, a consumer could not tell an outage from a negative claim.",
	},
	{
		date: "2026-08-19",
		surfaces: ["api"],
		type: "changed",
		summary:
			"/api/stablecoins now serves OUR OWN measurements instead of proxying a third-party-hosted snapshot service (openapi@1.8.73). Every row gains `basis` (live | curated-static | unmeasured) so an as-of estimate can never be read as a live measurement, plus `assetId` (`CODE-<issuer[0:8]>`, the safe join key when a ticker is ambiguous), `assetType`, `note`, and the FULL issuer account instead of a truncated display form. `meta.counts.byBasis` breaks the returned rows down by provenance. BREAKING: `supplyChange7d` is a number (percent) — it was a display string ('-5.80%'); it is null across the board until the series is seven days deep. `meta.upstream` is gone.",
		detail:
			"We now measure the registry ourselves every 6h (Horizon for existence, Stellar Expert for supply/holders/volume, live peg FX for USD conversion) into two collections: current state, plus one dated snapshot per asset per UTC day that the 7-day change is computed from. The motivation is sls-066: the previous upstream silently dropped Circle USDC for hours while the asset was live on-chain, and a missing row reads to an agent as 'this asset does not exist on Stellar'. The writer therefore emits an `unmeasured` row rather than no row, and a null metric never overwrites a good previous value in current state (the snapshot still records the null — current state answers 'what is it', the series answers 'what did we see when'). A datastore outage now returns 503 with an explicit advisory rather than an empty 200, because an empty 200 is exactly the shape that reads as 'Stellar has no stablecoins'. Coverage basis changes from `single-upstream-snapshot` to `curated-registry`: 23 hand-verified (code, issuer) pairs — absence still means 'not tracked here', never 'not issued on Stellar'.",
	},
	{
		date: "2026-08-18",
		surfaces: ["api"],
		type: "fixed",
		summary:
			"Two stellar-raven findings closed (openapi@1.8.72). sls-067: /api/rfps no longer claims an open brief is 'fundable in the current round' — `status=open` means the sponsor brief is still soliciting; whether SCF accepts a submission TODAY is answered only by meta.scfRound (submissionWindow, currentPhase, roundsInProgress), dated by asOf. Five model-visible descriptions rewritten; `currentPhase` and `roundsInProgress` (served since the round feed shipped) are now in the response schema. sls-066: /api/stablecoins meta.counts.total is now the FILTERED count (peg=USD returned 7 rows under total 22 — it was the whole-set count); `counts.tracked` keeps the whole inventory; new `meta.coverage` names the inventory as one upstream snapshot's tracked set, never a census — Circle USDC was absent for hours on 2026-08-18 while live on-chain.",
		detail:
			"No breaking shape changes: `total` changes MEANING to match every other endpoint (a consumer summing filtered rows against total now gets a true statement); `tracked` and `coverage` are additive. The hourly live canary gains a known-asset check: Circle's official USDC and EURC issuers must be present, and an absence is reported as an UPSTREAM COVERAGE GAP, never as proof of absence; it also asserts counts.total == returned under peg=USD. The phase-vs-official-page disagreement in sls-067 was the 6-hour revalidate window catching a transition (both read 'Panel Review' at 22:30 UTC); the contract overclaim was the durable defect.",
	},
	{
		date: "2026-08-18",
		surfaces: ["api"],
		type: "removed",
		summary:
			"`searchHackathonBuilds` (GET /api/hackathons/builds): removed three advertised-but-unimplemented filter parameters — capability, domain and dependsOn. The handler accepted only `q`, `winnersOnly`, `track` and `limit`, rejecting the other three with 400, so an agent that trusted the spec wrote a valid-looking call and burned a recovery turn (stellar-raven sls-065). The scanned repo signals those filters describe still power the same filtering on searchRepos and listContracts; they were simply never wired into the builds route (openapi@1.8.71).",
		detail:
			"Contract-honesty fix, not a capability loss: the params named real scanned repo data (SDK-capability tags, code domains, manifest dependencies) but the builds handler only ever whitelisted q/winnersOnly/track/limit and 400-ed anything else as an unsupported parameter — the spec had run ahead of the implementation. Dropped from the spec rather than left as a lie; wiring the build→repo join to actually serve them is a separate additive change if demand warrants. A guard shipped in the same commit closes the whole class: `engine-e-contract` now flags any advertised param whose every valid value returns non-200 against a 200 baseline (a REJECTED PARAMS finding that fails the run), so 'spec advertises, handler rejects' can never ship silently again.",
	},
	{
		date: "2026-08-18",
		surfaces: ["api", "skill"],
		type: "added",
		summary:
			"Hackathon-brief composite: GET /api/hackathon-brief?q=<idea> — the one-call version of the skill's Hackathon Build Brief workflow. `vet` (same computation as vet-idea), `builds` (prototype-layer prior art from every DoraHacks submission), `startFrom` (top non-archived competitor repos with a trust SUMMARY each; full contractInterface at `fullReport`), `liveContracts` (verified mainnet contracts for the idea's closest code domain), `funding` (live round + funded peers), and `whatNotToClaim` — deterministic cautions derived from the brief's own facts (openapi@1.8.70). Rails and open RFPs deliberately not bundled.",
		detail:
			"Fourth spine composite. Composed from the existing builders — scf-pitch (which already contains the vet-idea view), trust-report, contracts-registry, and the builds index — no new data. The builds search moved out of the /api/hackathons/builds route into src/lib/hackathon-builds.ts (searchHackathonBuilds) so the composite calls it in-process; the route delegates to the same function and cannot drift. Trimmed on purpose: consumers sit behind a ~6k-token result cap and a full trust report's contractInterface alone can exceed it. Idea text picks the contracts domain before the vertical does (an oracle for RWA prices is oracle, not RWA→null); a vertical with no code-domain axis says so instead of guessing.",
	},
	{
		date: "2026-08-18",
		surfaces: ["api", "skill"],
		type: "added",
		summary:
			"/api/builders: every row now carries `onStellar` — what the person has actually shipped from the repos we index (`repoCount`, `stars`, `commits90d` on OWN repos only, `contributedCommits12m` their own share of others' repos, `lastCommitAt`, `languages`, `builds`, `contributesTo`, `topRepos`), query-independent, on the unfiltered listing too. Before this the unfiltered call — the one agents make hundreds of times a week — read projectCount 0 / codeEvidence null on every row: an empty ecosystem. `projects` stays Passport-declared and `codeEvidence` stays query-scoped, unchanged (openapi@1.8.69, additive).",
		detail:
			"Same join the /builders/[username] page renders (owned repos + Passport-declared repos + the contributor pass + a project whose GitHub org IS the person), so the API says what the page says. Attribution rule enforced in the block and its ordering: `builds` ≠ `contributesTo`; a repo's total is never credited to a contributor; `topRepos` ranks ownership > the person's own commits > the repo's 90d activity, lexicographically — an additive weight let a repo's total outrank a repo the person actually committed to, caught by the unit test. `null` = the join could not run; an all-zero block = it ran and found no indexed code.",
	},
	{
		date: "2026-08-18",
		surfaces: ["skill"],
		type: "added",
		summary:
			"Scout skill: a fourth specialized workflow, Hackathon Build Brief — five calls in order (vet-idea → repos/search + repos/trust → contracts → stablecoins + partners → rfps + scf-pitch) with the honesty rules inline (gap = supply-side coverage; signals ≠ safety score; registry absence ≠ nonexistence; round never asserted closed on fetch failure) and a mandatory 'what not to claim in the demo' section. The four composites also gain trigger phrases and quick-reference rows — they had appeared nowhere in SKILL.md itself, only in references/api-reference.md (sk-018 one level up). No API change.",
		detail:
			"Written for the HackMeridian 2026 cohort (Lisbon, Oct 25–26): a two-day team's first-hour questions are 'is this built', 'is this repo safe to fork', 'what is live to build against', 'which rails', 'is there money after' — each now a single composite call instead of 4–6 lower-level searches, which on a ~6k-token result cap is also the difference between an answer and a truncation.",
	},
	{
		date: "2026-08-18",
		surfaces: ["api"],
		type: "fixed",
		summary:
			"Audit relation metadata for the three remaining duplicate (protocol, auditor) pairs (stellar-raven sls-064 recurrence): Blend V2 / Certora reports 40+51 share engagementId certora-blend-v2-2025q1 (each document cites the other as its 'separate report'; both state work from February 03, 2025); OpenZeppelin Stellar Contracts Library reports 2 (0.1.0, Feb 3–7 2025) and 35 (v0.3.0-rc.2, Jun 4–18 2025) get distinct engagementIds; Allbridge Estrela / Quarkslab reports 15 (2024) and 16 (2025) get distinct engagementIds — report 16 itself states Quarkslab 'had already performed an audit of an earlier version'. reportVersion is what each title/document states; engagementStart/End only where the report states a window (Quarkslab states none — stays null). No supersession claimed anywhere: no document states one.",
		detail:
			"Values are read from the report texts (stellarsecurityportal.com/api/v1/reports/{id} mdFile), not inferred from titles or portal dates. Rows land on the next audit ingest; the API shape is unchanged (fields existed since the Veridise fix), only nulls become values.",
	},
	{
		date: "2026-08-18",
		surfaces: ["skill", "api"],
		type: "fixed",
		summary:
			"Scout skill api-reference now documents every read-only operation (stellar-raven sk-018): the four composites (vetIdea, scfPitch, getRepoTrust, listContracts) plus getChanges, searchHackathonBuilds, getStablecoins, getPartner, matchPartners and getFeedbackSchema were live in the spec and Raven's catalog but absent from the skill agents actually read. Two codeVerified names (codeConfidence, scannedRef) added to the repos/search entry (sk-009 class). partnerOnboard is now flagged x-side-effecting like its siblings (openapi@1.8.68 — metadata only, no shape change).",
		detail:
			"check-skill-reference.ts gains an operation-coverage check: every non-side-effecting operation in the live spec must have a `## `METHOD /path`` heading in the reference, so a new endpoint goes red the day it ships instead of sitting undocumented for a release. Side-effecting ops (partner onboarding, listing submission, feedback POST, concierge) are portal flows outside the read-only reference's scope.",
	},
	{
		date: "2026-08-16",
		surfaces: ["api"],
		type: "added",
		summary:
			"SCF-pitch composite: GET /api/scf-pitch?q=<idea> — live round state, the vertical's funded peers with recorded award totals, the vet-idea view, and deterministic evidence-named pitch angles in one call (openapi@1.8.67). find-partner intentionally NOT added: /api/partners/match already IS that composite (natural-language need in, toml-verified scored partners out) — its routing keywords gained the find-a-partner phrasing instead.",
		detail:
			"Third spine composite. round never asserts a negative on fetch failure (source: 'unavailable' says verify yourself). fundedPeers reads the structured scf.awarded truth (the legacy scfAwarded checkbox is null on awarded projects — also fixed in vet-idea's funding count). angles are deterministic derivations that each name the fact they stand on — an open round's deadline, a coverage gap's count, funded peers to differentiate against, dead prior art to explain, the working-code bar when competitors run live on mainnet.",
	},
	{
		date: "2026-08-15",
		surfaces: ["api"],
		type: "added",
		summary:
			"Vet-idea composite: GET /api/vet-idea?q=<idea> — competitors (repos + active projects), maturity from verified evidence, hackathon prior art with alive/dead state, the vertical's supply-side gap verdict, and SCF funding presence, in one call (openapi@1.8.66).",
		detail:
			"Second spine composite. Vertical detection is a closed deterministic token map onto the gaps axis (real types enum values only; EVM porter vocabulary included — erc-3643 maps to RWA). Every block carries its basis: gap is SUPPLY-side coverage (not demand); maturity absence means no evidence on record; priorArt covers judged-hackathon repos in our index and says so. No verdict synthesis.",
	},
	{
		date: "2026-08-15",
		surfaces: ["api"],
		type: "added",
		summary:
			"Trust report composite: GET /api/repos/trust?repo=owner/name — one evidence-grounded answer to 'should I depend on this repo?' joining code truth, live usage, audits with drift, succession, and activity, with a closed deterministic signals vocabulary (openapi@1.8.65).",
		detail:
			"First spine composite: the join a consumer previously made across five calls (search + explain + audits + contracts + changes), served as one shape. No synthetic scores — `signals` names facts that hold (scanned, deep-code, live-on-mainnet, verified-contract-id, audited, multi-audited, code-changed-since-audit, actively-maintained, archived, superseded); absence of a signal means the evidence doesn't hold, not that the opposite is proven. codeTruth.contractInterface carries the full scanned fn signatures (≤60) as a codegen guard: verify generated calls against the real interface before invoking. auditDrift is present when commits landed after the latest audit report. 404 for unindexed repos — absence of evidence, not a verdict.",
	},
	{
		date: "2026-08-15",
		surfaces: ["api"],
		type: "fixed",
		summary:
			"Structured filters (domain/dependsOn/capability) on /api/repos/search now drive candidate inclusion DB-side, so filter-only browsing sees the whole corpus; /api/repos/explain codeVerified now serves contractInterface, stellarDeps, and codeInUse (openapi@1.8.64).",
		detail:
			"Two serve-path defects found by the new code-truth probe pack: (1) filter-only browse (no q) drew candidates from the top-200-by-repoScore pool BEFORE filtering, so domain=oracle served [] while the corpus held 590 domain-tagged rows and dependsOn=soroban-sdk served 9 of 299 true dependents; filters now push per-element predicates into the candidate query. (2) The explain route's codeVerified assembly predated three scan-derived fields — contract interfaces, dependency crates, and live on-chain usage are now in the block. scripts/eval/code-truth-probes.ts freezes these answers as a standing gate.",
	},
	{
		date: "2026-08-14",
		surfaces: ["api"],
		type: "added",
		summary:
			"Contracts as first-class entities: GET /api/contracts — the evidence-gated mainnet contract registry. One row per contract the scanner verified live on-chain (or on-chain enrichment attributed real activity to), joining code truth (proof, depth, interface, domains), live usage stats, per-project audit records, and succession (openapi@1.8.63).",
		detail:
			"Membership is evidence-gated by construction — no self-declared registries: a README-claimed contract id must echo-check live on mainnet at scan time, or weekly on-chain enrichment must attribute activity. Absence is NOT a claim a contract doesn't exist; coverage grows exactly as fast as scans reach repos (the EC corpus is being scanned prominence-first now). Filters: q (repo/project/contract-id substring), domain (code-evidenced, closed set). Most-evidenced first: live usage > verified id > depth. This is the Soroban 'verified contract set' in registry form — the spine's contract-entity extension, v1.",
	},
	{
		date: "2026-08-14",
		surfaces: ["api"],
		type: "added",
		summary:
			"Dependency-graph reverse read: `dependsOn` filter on /api/repos/search — 'who builds on passkey-kit / @blend-capital/blend-sdk / soroban-sdk' as a structural query over scanned manifest dependencies (openapi@1.8.62).",
		detail:
			"stellarDeps has been extracted from Cargo.toml/package.json manifests on every scan since 2026-08; this makes the reverse edge first-class: exact case-insensitive package name, open set (unknown packages return 0 rows honestly), scan-derived (unscanned repos never match — absence of a scan is not absence of the dependency). Adoption evidence no README can fake. Pair with q for keyword+dependency precision; meta.counts.total is the dependents count.",
	},
	{
		date: "2026-08-14",
		surfaces: ["api"],
		type: "added",
		summary:
			"Code-domain classification: every scanned repo now carries `codeDomains` (defi-lending | defi-amm | defi-yield | oracle | payments-x402 | wallet-infra | anchor-ramp | indexer) inside `codeVerified`, derived ONLY from code evidence — ecosystem dependencies, SDK capability tags, and contract-interface traits — never from topics or README self-description. New `domain` filter on /api/repos/search (closed set, unknown values 400) answers 'show me the real DeFi / x402 / oracle code' structurally (openapi@1.8.61).",
		detail:
			"Scan-derived semantics: an unscanned repo can never match, and [] means the code proved nothing domain-specific — an honest null, not a negative. Populates as scan waves reach repos (the EC-taxonomy corpus is being scanned prominence-first). Evidence mapping: @blend-capital/blend-* → defi-lending; @soroswap/@phoenix-protocol → defi-amm; @defindex → defi-yield; @reflector-network + the SEP-40 lastprice interface trait → oracle; @x402/x402-* → payments-x402; passkey-kit/stellar-wallets-kit/@creit.tech → wallet-infra; the sep24-ramp capability → anchor-ramp; @stellar-indexer/mercury-sdk → indexer.",
	},
	{
		date: "2026-08-14",
		surfaces: ["api"],
		type: "added",
		summary:
			"Repo quality tiers + Electric Capital taxonomy coverage (staged): every `/api/repos/search` row now carries `tier` (quality | community | archive — tag-and-demote: archive sinks in ranking and never rides as inline codeReferences, but stays name-findable) and `source` (project-link | ec-taxonomy). The index expands from ~2.4k project-linked repos toward ~10.5k via Electric Capital's public crypto-ecosystems Stellar list, metadata-only, each repo scored on own-merit at ingest (openapi@1.8.60).",
		detail:
			"Lead with quality-tier repos; treat archive-tier as historical reference only. EC-sourced repos carry no inherited authority — their score is pure freshness/traction own-merit until they earn anchors (SCF, judge scores, project links, code scans). Ingest is staged over dispatched waves with read-back verification, rename-twin guards, GraphQL budget pacing, and a post-ingest live answer-key gate (10 canonical queries must keep their top-3 answers); allowlisted canonical repos can never tier to archive.",
	},
	{
		date: "2026-08-14",
		surfaces: ["api"],
		type: "added",
		summary:
			"Relation-class sweep (sls-064 analogs): repos.successorRepo + superseded ranking demotion, builtBy reference fix + nightly referential-integrity lane, SEP rows dated (openapi@1.8.59).",
		detail:
			"Round-6 Raven probes generalized sls-064: (A) repo generations — blend-contracts now carries successorRepo=blend-capital/blend-contracts-v2 (curated REPO_SUCCESSIONS, verified against the repos' own statements) and superseded generations rank below successors at equal relevance; (B) peer's builtBy pointed at a non-existent slug — fixed via ownership-registered curation, and a nightly S0 referential-integrity lane now asserts every served builtBy/canonicalSlug/supersededByReportId target resolves, so no stored cross-reference can dangle silently again; (C) SEP research rows gain observedAt + publishedAt from each SEP's own preamble dates (Updated preferred over Created) — the provenance-trio gap on stellar-protocol-sourced chunks closes as the corpus refresh re-reaches them.",
	},
	{
		date: "2026-08-14",
		surfaces: ["api"],
		type: "added",
		summary:
			"audits: relation metadata + extraction completeness (sls-064) — engagementId/reportVersion/supersededByReportId/engagementStart/engagementEnd/findingsExtraction (openapi@1.8.58).",
		detail:
			"Raven's eval loop found 4 (protocol, auditor) pairs holding 2 rows each with no way to classify a revision vs a separate engagement (stellar-raven sls-064). New per-row fields: engagementId links every report of ONE engagement (curated in AUDIT_RELATIONS, verified against the reports' own text — the confirmed Veridise Soroban Core pair 28/42 now shares veridise-soroban-core-2023q4 with its stated Oct 30–Dec 22 2023 window; reportVersion 'V2' on 28 as its title states); supersededByReportId stays null unless a document states supersession — never guessed; findingsExtraction makes findingsTotal 7 vs null read as different states of knowledge, not conflicting counts. Unclassified pairs stay null — never asserted independent. Finding-identifier indexing (the item's 4th recommendation) is a follow-up phase.",
	},
	{
		date: "2026-08-14",
		surfaces: ["api"],
		type: "changed",
		summary:
			"searchRepos ranking: verified mainnet usage now ranks above raw keyword coverage (code-truth 5).",
		detail:
			"Within a stellarness tier, a repo whose attributed contract has real lifetime events (codeInUse, stellar.expert-verified) outranks a keyword-luckier row without usage evidence — the round-5 probe case where unused oracle feeders outranked the one oracle live on mainnet. Exact identity (alias/anchor) still beats usage; usage never lifts a no-evidence repo above a code-verified one (the F4 contract holds); rows without usage are unaffected relative to each other. Coarse binary tier, fixture-gated in the ranking harness.",
	},
	{
		date: "2026-08-13",
		surfaces: ["api"],
		type: "added",
		summary:
			"searchRepos capability filter — 'which repos actually implement X' becomes structural (openapi@1.8.57).",
		detail:
			"The Raven-lens gap hunt found agents could only free-text toward capability questions ('sep-24 anchor implementation' surfaced protocol/docs repos, not implementers). searchRepos now takes capability=<tag> over the closed scan-derived sdkCapabilities set (contract-invoke, fee-bump, horizon, mpp, passkey, sep10-auth, sep24-ramp, signing, soroban-rpc, tx-building, wallet-kit, wallet-provider, x402); unknown tags 400 with the valid list. Scan-derived semantics: an unscanned repo can never match — absence of a scan is NOT absence of the capability (the nightly scan-coverage detector + waves close that gap).",
	},
	{
		date: "2026-08-13",
		surfaces: ["api"],
		type: "added",
		summary:
			"Toolchain dimension on analyzeEcosystem + ciPresent/testsPresent on repo rows (openapi@1.8.56, code-truth track).",
		detail:
			"dimension=toolchain returns the Soroban-SDK version-status distribution across scanned repos (current/supported/deprecated/unknown, from the dated soroban-versions table), the deprecated-toolchain roster (capped 50, full count alongside), and engineering-practice counts. Repo rows gain ciPresent/testsPresent — tree-level presence facts from the code scan (a CI config exists / test files exist), presence only, never a claim CI passes or coverage is good; null until the repo's next scan records them. Population accrues via the weekly stale-first re-scan.",
	},
	{
		date: "2026-08-13",
		surfaces: ["api"],
		type: "added",
		summary:
			"codeInUse on repo rows — live mainnet usage joined to the code (openapi@1.8.55, code-truth track).",
		detail:
			"searchRepos rows gain codeInUse {contracts, events, eventsDelta, subinvocations, subinvocationsDelta, asOf}: the weekly stellar.expert pass now rolls per-contract activity up to the repo it is attributed to (scanner-verified mainnet contract ids + stellar.expert wasm validation). codeDepth is the static half (the code is serious); codeInUse is the dynamic half (the deployed contract is live, with activity deltas week over week). Deltas null until a second snapshot — never zero. null = no verified contract joined, never 'unused'.",
	},
	{
		date: "2026-08-13",
		surfaces: ["api"],
		type: "added",
		summary:
			"Audit-drift on project rows: audits.driftDays + audits.codeChangedSinceAudit (openapi@1.8.54, code-truth track).",
		detail:
			"'Audited' and 'audited 14 months and hundreds of commits ago' are different claims — the audits rollup on searchProjects rows now carries driftDays (whole days since the latest report) and codeChangedSinceAudit (whether any joined repo committed on a later day than that report; day-granular). Null when either side lacks a date — absence of evidence, never a freshness claim. Derived at serve time from the audits registry and the repos join the rows already carry; no new write path.",
	},
	{
		date: "2026-08-13",
		surfaces: ["api"],
		type: "added",
		summary:
			"Feedback→quality loop plumbing: vote kinds on POST /api/feedback + nightly-aggregated feedbackSignal on project rows (openapi@1.8.53).",
		detail:
			"POST /api/feedback now accepts kind 'worked' / 'did-not-work' with a required target {surface: projects|repos, slug} (message optional on votes; report kinds unchanged). Votes aggregate nightly per target — distinct voters only (one per hashed IP, latest vote wins) — into feedbackSignal {votes, worked, score, asOf} served on searchProjects rows. score stays null until ≥5 distinct voters (anti-gaming floor): sub-floor counts are visible but carry NO ranking influence, and nothing folds into confidence scores until real signal crosses the floor. Repos votes are accepted and stored; repo-row serving lands when any repo target accrues votes.",
	},
	{
		date: "2026-08-13",
		surfaces: ["api"],
		type: "added",
		summary:
			"projects: per-product deployment records — products[] with mandatory evidenceUrl + asOf (openapi@1.8.50, closes the #742 model; sls-023/029 root).",
		detail:
			"Provider-level status and product-on-network status are different statements: DTCC the org is Development while its tokenized-collateral product on Stellar is ANNOUNCED (H1 2027, per its own case study); an oracle provider being Live says nothing about which feed is live on which network. products[] records name/kind/network/status/contractId with a REQUIRED evidence URL and as-of date \u2014 citation-grade by construction, curated only (a record without verifiable evidence does not ship; Band/RedStone/DIA/WisdomTree/Figure rows are deferred pending verified mappings, which is honest where fabrication is not). Seeded with DTCC and Lightecho; rows accrue via curation.",
	},
	{
		date: "2026-08-12",
		surfaces: ["api"],
		type: "added",
		summary:
			"Fact confidence: statusConfidence, scfConfidence, codeVerified.codeConfidence, tomlConfidence \u2014 deterministic trust scores from provenance (openapi@1.8.49).",
		detail:
			"Every provenance-carrying fact family now serves a confidence object {score, label, ageDays}: the basis-class weight (human-verified > official-record/stellar-toml > onchain/code-scan > site-liveness > operator-announcement > source-inherited > unverified) \u00d7 a stepwise freshness decay (full \u226430d, floor 0.5 past a year; unknown age dampens to 0.6). Pure function of the basis/asOf the provenance trios ship \u2014 no model, no randomness; the same row serves the same score until its provenance changes, so consumers can cache and re-derive. Null = no recorded provenance: absence of evidence is never served as a low score. Computed at serve time \u2014 corpus-wide from day one. Distinct from retrieval `confidence` (does this row answer your query); this scores the FACT.",
	},
	{
		date: "2026-08-12",
		surfaces: ["api"],
		type: "added",
		summary:
			"GET /api/changes — the change feed: what moved since T, for memory-carrying consumers (openapi@1.8.48).",
		detail:
			'A consumer holding cached or remembered claims (an agent memory, an institutional cache) reconciles against /api/changes?since=<ISO> instead of re-reading the corpus. Rows come from stored per-row timestamps (no new write path), newest-first per surface (projects/repos/partners, filterable via surfaces=), each carrying changedAt plus facets naming which DATED fact families moved (status, scf-awards, code-facts, toml; ["row"] = undated change, re-read the row). Absence means nothing changed since T \u2014 not an existence claim; deletions surface as 404 on re-read. meta.truncated signals paging via a later since. Pairs with the provenance trios shipped today: the asOf timestamps this feed exposes are the ones award/code/toml facts now carry.',
	},
	{
		date: "2026-08-12",
		surfaces: ["api"],
		type: "added",
		summary:
			"partners: tomlSourceUrl + tomlFetchedAt — anchor-capability fields carry their stellar.toml provenance (openapi@1.8.47).",
		detail:
			"Provenance slice 3: getPartners, getPartner and the matchmaker rows now carry the exact stellar.toml URL the anchor-capability fields (assets, seps, rampTypes, jurisdiction) were last system-enriched from, and the date of that fetch — so a consumer can re-verify an anchor's SEP claims at the source instead of trusting the directory. Stamped on every successful toml parse (not delta-gated); null = never toml-enriched. Completes the citation trio across the three fact families: SCF awards (1.8.45), repo code facts (1.8.46), anchor capabilities (1.8.47).",
	},
	{
		date: "2026-08-12",
		surfaces: ["api"],
		type: "added",
		summary:
			"repos: codeVerified.scannedRef — every code fact pinned to the commit it was computed at (openapi@1.8.46).",
		detail:
			"Provenance slice 2 (after the SCF award trio): searchRepos and explainRepo codeVerified gains scannedRef, the default-branch commit SHA the scan fetched — so symbols, contractInterface, sdkCapabilities, stellarDeps and codeDepth are citable at github.com/<fullName>/tree/<scannedRef> instead of floating against a moving repo. Null on rows scanned before 2026-08-12; populates as waves re-reach repos.",
	},
	{
		date: "2026-08-12",
		surfaces: ["api"],
		type: "added",
		summary:
			"projects: SCF award provenance trio — scfBasis / scfAsOf / scfSourceUrl on every award-bearing row (openapi@1.8.45).",
		detail:
			"The sls-024 provenance pattern (basis / as-of / source URL), extended from lifecycle status to SCF award facts. Every award claim now says how we know (official-record = parsed from the communityfund.stellar.org submission cards; human-verified = curated correction), when it was last verified, and the exact official page to re-verify against \u2014 built for memory-carrying consumers that store claims and must later defend them. Same-day context: an 18-row award-poisoning incident (matcher substring bug, fixed + repaired) is the argument made flesh \u2014 a consumer holding an award claim with its sourceUrl can catch a lie without us. Populates as enrichment re-reaches rows; the full pass runs at ship time.",
	},
	{
		date: "2026-08-12",
		surfaces: ["api"],
		type: "fixed",
		summary:
			"repos: sdkCapabilities now actually persists — the write path had silently dropped it since the field shipped (openapi@1.8.44).",
		detail:
			"detectSdkCapabilities ran on every scan since 2026-07-09, but signalsToWrite (the scanner's write-path safety gate) never carried the key and the Repos collection never declared the field, so every wave computed capabilities and threw them away \u2014 the entire corpus served []. Found by the rozo-mpprouter x402 verification: symbols and stellarDeps from the same pass persisted while capabilities vanished. Fixed across write-shape + schema, guarded by a scan-write-shape test case and a pinned field-population probe (rozo x402). Existing rows populate as scan waves re-reach them; agent-stack repos re-scanned immediately.",
	},
	{
		date: "2026-08-12",
		surfaces: ["mcp"],
		version: "scout-mcp@1.2.0",
		type: "changed",
		summary:
			"scout-mcp 1.2.0 — tool schemas catch up to the 1.8.x API arc (activity filter, hackathons q, leaderboard type, repo-docs source, code-truth fields in descriptions).",
		detail:
			"The MCP layer had lagged the live contract since 1.1.12 (July 22): search_repos gains the `activity` filter and its description now names the code-truth layers (contractInterface ABI, targetProtocol+protocolCaps, stellarDeps dependents reverse-read, x402/mpp capability tags, activityState/activitySignals/knowledgeNotes); get_hackathons gains free-text `q` (named-event resolution); get_leaderboard gains the exact `type` filter + dataAsOf/metricDefinitions citation guidance; search_research's source enum adds `repo-docs`.",
	},
	{
		date: "2026-08-11",
		surfaces: ["api"],
		type: "added",
		summary:
			"repos: sdkCapabilities gains `x402` and `mpp` tags — the agent-payments era becomes filterable (openapi@1.8.43).",
		detail:
			"The capability tag set predated the agent-payments stack: rozo-mpprouter (a full x402 resource server + facilitator on Stellar mainnet) served sdkCapabilities []. Two new closed-set tags fire on concrete import/identifier patterns only (never prose mentions): x402 (@x402/* imports, X-PAYMENT header handling, x402 handler/route identifiers) and mpp (@stellar/mpp imports, mpp/charge + mpp/session paths, Mpp client identifiers). 'Which repos actually implement x402 payments' is now answerable from code truth. Populates as scan waves re-reach repos.",
	},
	{
		date: "2026-08-11",
		surfaces: ["api"],
		type: "changed",
		summary:
			"projects: lifecycle provenance populated corpus-wide — `statusSourceUrl` on inherited rows, explicit `unverified` basis, never bare nulls (openapi@1.8.42).",
		detail:
			"Closes the sls-024 population gap: the nightly lumenloop sync now stamps statusSourceUrl (the canonical lumenloop source file), statusBasis and statusAsOf on every row it maintains (stronger evidence bases are never overwritten); a backfill floor gives every remaining blank — including Inactive rows, previously un-qualified accusations — the explicit `unverified` basis with a date. New statusBasis enum value: `unverified` = the label is retained but its source is unknown; per the never-accuse discipline a Live or Inactive label with basis unverified must not be read as verified lifecycle truth. Regression fixtures pin slender, laina, k2-lend and orbitcdp in the daily field-population guard.",
	},
	{
		date: "2026-08-11",
		surfaces: ["api"],
		type: "added",
		summary:
			"hackathons: free-text `q` lookup — named-event resolution without paging the catalog; plus Protocol 27 in the versions table (openapi@1.8.41).",
		detail:
			"Raven's prior-art review flagged 'scout_hackathons ignores free-text q' as the capability gap blocking named-event eval questions — ?q= now matches event name/title/organizer (case-insensitive substring). Also: LATEST_PROTOCOL 26→27 (verified: Horizon current_protocol_version 27, sdk v27.0.x since 2026-07-21) — versionStatus judgments recalibrate (sdk 26 → supported), targetProtocol maps sdk 27 → P27, and the committed cap-registry re-verified (2 status movements). While probing: category/scfAwarded project filters and /api/hackathons/compare?slugs= were confirmed fully functional — earlier external notes calling them unwired/dormant are stale.",
	},
	{
		date: "2026-08-10",
		surfaces: ["api"],
		type: "added",
		summary:
			"research: `repo-docs` source — canonical in-repo documentation (per-protocol guides, kit docs) joins the research corpus (openapi@1.8.40).",
		detail:
			"Curated ingest of documentation that lives INSIDE canonical ecosystem repos and was invisible to retrieval — the motivating case: Stellar-Indexer-SDK ships per-protocol extension guides under src/protocols/*/README.md, so 'how do I index Blend state' had nothing to surface. Initial sources: Stellar-Indexer-SDK, Stellar-Wallets-Kit, colibri (+examples), passkey-kit. Chunked, hashed, embedded like SEPs/CAPs; filter with ?source=repo-docs. Curated allowlist, not a corpus-wide README sweep — extended as consumers ask.",
	},
	{
		date: "2026-08-10",
		surfaces: ["api"],
		type: "added",
		summary:
			"repos: `stellarDeps` — the dependency graph on searchRepos codeVerified; package-name queries surface dependents (openapi@1.8.39).",
		detail:
			"Stellar-ecosystem dependencies extracted from each repo's manifests (Cargo.toml dependency sections + package.json dep maps), allowlist-matched and stored verbatim. Forward read: a repo row lists the stack it builds on. Reverse read: searching a package name (passkey-kit, @stellar/stellar-sdk, blend-contract-sdk) surfaces its DEPENDENTS — adoption evidence from manifests, which no README mention can fake. Populates as scan waves reach repos (the daily unified wave + re-scan policy).",
	},
	{
		date: "2026-08-10",
		surfaces: ["api"],
		type: "added",
		summary:
			"repos: `targetProtocol` + `protocolCaps` on searchRepos codeVerified — the sdk⇄protocol⇄CAP join (openapi@1.8.38).",
		detail:
			"Answers 'which protocol does this repo's SDK pin target, and which CAPs define that protocol' directly on the repo row: targetProtocol is derived from the pinned soroban-sdk MAJOR via the maintained sdk→protocol table (advisory by doctrine — the mapping has documented irregularities like 23.x spanning P24→P25; null = unknown, never guessed), and protocolCaps joins the committed cap-registry rows declaring that protocolVersion ({cap, title, status, url}, ≤10). Pure serve-time derivation from already-scanned facts — no new scanning, populates immediately for every repo with a stored sorobanSdkVersion.",
	},
	{
		date: "2026-08-08",
		surfaces: ["api"],
		type: "added",
		summary:
			"repos: `contractInterface` — Soroban contract ABI (full pub fn signatures per #[contractimpl] block) on searchRepos codeSignals (openapi@1.8.37).",
		detail:
			"Symbols say WHAT a contract implements; the interface says HOW TO CALL IT. Each entry is `Contract.fn(arg: Type, …) -> Ret`, extracted from the scanned Rust sources' #[contractimpl] impl blocks (brace-matched, so neighbouring non-contract impls never leak in). The host-injected env: Env parameter is stripped, matching the SDK's own contractspec — what remains is what a caller passes. Multi-contract repos (soroban-examples) prefix each fn with its contract name. Empty for non-contract repos or repos scanned before 2026-08-08; populates as scan waves re-reach repos.",
	},
	{
		date: "2026-08-08",
		surfaces: ["api"],
		type: "changed",
		summary:
			"repos: repoScore now blends commit velocity — commits90d refines freshness within the fresh band (a tie-breaker of ≤ ~2 points, calibrated against the ranking fixture suite).",
		detail:
			"Two repos that both committed last week can differ 50x in how alive they are; date-based freshness alone could not tell them apart. repoScore's freshness component is now scaled by activitySignals.commits90d (1 commit ≈ 0.85x, 30+ per 90d = 1.0x). The swing is deliberately capped at roughly two score points — a tie-breaker among equally-fresh repos, never a rank-upheaver — and null commits90d applies no penalty (missing data is never punished). Every existing ranking invariant in the fixture suite holds unchanged; scores propagate with the next weekly enrich pass. No schema change.",
	},
	{
		date: "2026-08-05",
		surfaces: ["api"],
		type: "added",
		summary:
			"repos: `knowledgeNotes` — dated facts with named sources on searchRepos rows (curated + derived audit crosslinks) (openapi@1.8.36).",
		detail:
			"Repo rows now carry `knowledgeNotes`: an array of dated FACTS, each naming its source. Two sources at launch: curated (hand-verified packaging/doc-map/companion-repo facts, e.g. an SDK's per-protocol extension docs living in subdirectory READMEs) and derived:audit (the repo's owning project has verified security-audit reports in our registry — exact projectSlug join, never fuzzy matching). Notes are rebuilt wholesale on every enrich pass, so curation is self-healing and stale notes cannot linger. Facts, never summaries; empty array = nothing on record, never an unknown.",
	},
	{
		date: "2026-08-04",
		surfaces: ["api"],
		type: "added",
		summary:
			"research: CAP crosswalk facts — `capStatus` + `capProtocolVersion` on every source=cap result, parsed from each CAP's own preamble (openapi@1.8.35).",
		detail:
			"CAP prose has been searchable for a while; the structured preamble facts were not. Every source=cap research result now carries `capStatus` (Final/Implemented/Accepted/Draft/Rejected — the CAP's own declaration; cite it before treating a CAP as protocol truth) and `capProtocolVersion` (which protocol shipped it; null = not declared upstream, never guessed). This is the first leg of the code-truth crosswalk: protocol history ⇄ CAPs today, joining to soroban-sdk version status next. Existing rows backfill on the next corpus refresh; a committed cap-registry (86 CAPs as of 2026-08-04: 45 Final, 9 Implemented, 17 Draft) is the internal join table behind it.",
	},
	{
		date: "2026-08-04",
		surfaces: ["api"],
		type: "added",
		summary:
			"repos: `activitySignals` — commits-in-90d velocity, latest release, and open-PR count on every searchRepos row (openapi@1.8.34).",
		detail:
			"Repo rows now carry an `activitySignals` snapshot from the enrich pass: `commits90d` (default-branch commits in the 90 days before `asOf` — the velocity discriminator within an activityState: two 'active' repos can differ 50x here), `lastReleaseAt` + `releaseTag`, `openPRs`, and `asOf` dating the snapshot. Null means not-yet-captured (rows backfill on the weekly refresh), never zero activity. Ranking is deliberately unchanged in this release — repoScore does not yet consume these signals; that blend lands separately, gated by the answer-key eval, so ordering cannot silently regress while the data ships.",
	},
	{
		date: "2026-08-04",
		surfaces: ["api"],
		type: "added",
		summary:
			"repos: `activityState` on every searchRepos row + an `activity` filter — observable maintenance state (active/maintained/dormant/archived/unknown) with honest semantics (openapi@1.8.33).",
		detail:
			"Every repo row now carries `activityState`, derived at serve time from lastCommitAt + isArchived so it can never go stale: active = commit within 45 days; maintained = within 180; dormant = a KNOWN commit older than 180 days; archived = the owner's own declaration; unknown = no commit date held. The semantics are deliberately conservative: dormant is an observation (complete libraries go quiet), archived is the only death verdict, and unknown is absence of evidence — never read either as defunct. A strict `activity` query filter accompanies it (unknown values 400 with the valid list). Ranking is unchanged — the existing staleness demotion already handles ordering; this makes the state a first-class, filterable fact instead of something consumers reverse-engineer from timestamps.",
	},
	{
		date: "2026-08-03",
		surfaces: ["api"],
		type: "changed",
		summary:
			"spec: every served meta field is now documented — 69 previously-undocumented fields across 13 endpoints, plus the `warnings` unknown-param disclosure; bogus `winnersOnly` values now 400 (openapi@1.8.32).",
		detail:
			"Closes the served-but-unspecced class the contract-honesty sweep isolated: every meta field the API serves is now declared in the OpenAPI spec with honest semantics — including the shared `note`/`warnings` on the standard meta block, per-endpoint vocabularies (`validTypes`, `validRamps`, `validKinds`, `validSources`, `dimensions`, `quarters`, `categories`), retrieval provenance on research (`mode`, `model`, `scoreModel`), stablecoins snapshot provenance (`dataAsOf`, `methodology`, `upstream`), the analyze dimension payloads and funding rollup fields, the full hackathon winners row shape (with `voteCount` honestly documented as always 0 since the DoraHacks v1 hub migration), and `answerSource` on explainRepo. One behavior fix rides along: `winnersOnly` on hackathon builds now returns 400 with the accepted forms on a garbage value instead of silently ignoring it (the invalid-accepted class; same treatment as partners' `accepting`). Response data is unchanged — this release makes the contract say what the API already does.",
	},
	{
		date: "2026-08-03",
		surfaces: ["api"],
		type: "added",
		summary:
			"projects: `scfRoundAwards` — each awarded round's official submission record (published budget + award type), the reconciling basis sls-058 asked for (openapi@1.8.31).",
		detail:
			"Project rows now carry `scfRoundAwards`: one entry per awarded SCF round with the round number, the published submission budget in USD (null = award confirmed, budget not published — never guessed), and the official award type. This closes sls-058 defect 2: `scfTotalAwardedUSD` is the project's own SCF-page total and can exceed the sum of round budgets (top-ups SCF doesn't itemize per round) — previously nothing exposed reconciled the two, so an agent reading the aggregate next to `scfAwardedRounds` could misattribute it to a single round. The `scfCountBasis` meta note was also corrected: totals are scraped from SCF's own pages (SDF's figure), not in-house sums, and per-round amounts ARE published — the old text claimed otherwise.",
	},
	{
		date: "2026-08-03",
		surfaces: ["api"],
		type: "fixed",
		summary:
			"repos: a plain org-name query now floats that org's own repos first (searchRepos q=soroswap previously buried soroswap/core in 6th).",
		detail:
			"Single-word queries that exactly equal a repo owner's whole name gain the same exact-identity ranking as identifier-form lookups: the org's own repos outrank higher-authority repos that merely mention or tag the term. Guarded to single-token queries of 5+ characters matching the owner segment only, so vocabulary queries (wallet, oracle) and substring org names (Blockchain-Oracle) cannot ride it, and Stellar-evidence ordering still applies within everything else. Found by the golden retrieval eval (repos-soroswap was its only failing case, 47/48 → 48/48 expected).",
	},
	{
		date: "2026-08-03",
		surfaces: ["api"],
		type: "fixed",
		summary:
			"hackathons: live DoraHacks feed restored after an upstream API migration — getHackathons had served 0 rows since 2026-07-31.",
		detail:
			"DoraHacks retired its legacy endpoints (hard 404) in favor of a new v1 hub API with renamed paths, parameters, and response fields, which silently emptied every DoraHacks-backed surface: getHackathons, getHackathon, searchHackathonBuilds, compareHackathons, and the analyze hackathon dimensions. The integration now targets the new API and maps it back to the served shapes, so response contracts are unchanged. Winners are joined from the new winner-assignments endpoint (the per-submission winner_prizes field no longer exists upstream). One data-level regression to note: the upstream API no longer exposes vote counts, so the votes field on hackathon builds now reports 0; winner/placement data is unaffected. Detected by the daily grounded self-audit (issue #752).",
	},
	{
		date: "2026-07-31",
		surfaces: ["api"],
		type: "added",
		summary:
			"rfps: Q3 2026 quarter published — two new open briefs (LayerZero DVN, x402 Facilitator with Bazaar); Q2 briefs are now closed.",
		detail:
			"The active SCF quarter rolled to q3-2026. Two Delegate-selected briefs are open: a Stellar-compatible LayerZero DVN (for teams already operating production DVNs on LayerZero V2 — greenfield proposals out of scope) and an x402 facilitator for both Stellar networks with a Stellar-native Bazaar discovery layer (permissive OSI license required, discovery is the largest share of the budget). All q2-2026 briefs now report status closed. The quarter filter accepts q3-2026; the synthetic scf-round row follows the active quarter automatically.",
	},
	{
		date: "2026-07-29",
		surfaces: ["api", "api-client"],
		version: "openapi@1.8.30",
		type: "added",
		summary:
			"leaderboard: each row's github object now names the exact repos its stats aggregate over.",
		detail:
			"raven #742 residual 3 (sls-036): rows exposed repoCount but never the repository identities, so 'activity' could not be reconciled against a known set — a count you cannot audit is a number you have to take on faith. Each row's github object now carries repos (sorted owner/name strings, repoCount === repos.length), and the CSV export gains a ';'-joined repos column. The members are our index's attribution: a repo absent from the list may still exist on GitHub — coverage, never a negative claim. Additive, no shape change to existing fields.",
	},
	{
		date: "2026-07-28",
		surfaces: ["api"],
		version: "openapi@1.8.29",
		type: "fixed",
		summary:
			"getSkill routing metadata no longer names the retired soroban slug — its own example question 404'd.",
		detail:
			'sls-059 (upstream #746): the get-one-skill operation\'s x-routing exampleQuestions, keywords, and path-parameter description all still said "soroban", a slug the operation itself rejects with 404 — the SDF roster renamed the topic\'s skill to "smart-contracts" (the endpoint gate tracked the rename in sls-053; the routing metadata did not). Routing metadata is load-bearing: consumers score these examples to decide when to call the operation, so the showcase question steered callers directly into a miss. All three spots now say "smart-contracts". Descriptions-only change, no response-shape change.',
	},
	{
		date: "2026-07-26",
		surfaces: ["api"],
		type: "fixed",
		summary:
			"builders: a no-match query now names where the answer actually lives instead of ending the conversation.",
		detail:
			'The last-resort empty state returned a flat "none match these filters" with nowhere to go — which reads as "we don\'t know this" even though for the real queries landing there we usually hold the answer on another surface: a surname is in the SDF people index, a one-word query is very often a project or a GitHub org. The empty state now always carries tryInstead naming /api/people, /api/projects/search and /api/repos/search with the reason each might hold it. Separately, a partial match against a curated builder name (a bare first name or surname) surfaces that person as a didYouMean CANDIDATE — named, not returned as a row, and explicitly not to be reported as the answer unless the caller confirms. Refusing to guess and refusing to help are different things; the resolver still refuses to resolve one token to one person.',
	},
	{
		date: "2026-07-26",
		surfaces: ["api", "api-client"],
		version: "openapi@1.8.29",
		type: "added",
		summary:
			"Every list endpoint now serves meta.counts.{returned,total}, so a consumer can tell a complete read from a truncated one.",
		detail:
			"ADDITIVE — no field moved or changed meaning. The spec has long documented meta.counts.{returned,total} as the list-endpoint contract, but five endpoints drifted from it: /api/leaderboard served NO counts at all (a limit-truncated page was indistinguishable from a complete one), /api/changelog served returned/total FLAT on meta rather than nested under counts (so generic tooling reading meta.counts saw nothing — on the endpoint whose job is advertising artifacts), and /api/clusters, /api/skills and /api/hackathons served returned with no total. All five now carry meta.counts.total. /api/changelog ALSO keeps its flat meta.returned/meta.total for backward compatibility; those are DEPRECATED — read meta.counts. One deliberate exception: /api/research serves total: null plus totalBasis:'unbounded-similarity-ranking', because similarity ranking over a bounded candidate pool has no crisp matching set to count — a number there would falsely assert a complete read. Read a null total as 'unknowable by construction', never as zero or as 'no more rows'.",
	},
	{
		date: "2026-07-26",
		surfaces: ["api", "api-client"],
		version: "openapi@1.8.28",
		type: "fixed",
		summary:
			"projects/search: a one-character typo in a project name now finds the project instead of returning unrelated rows.",
		detail:
			"The keyword ladder is exact-token based, so a single wrong character dropped every tier at once, and the vector fallback could not rescue it either — the embedding of a misspelled proper noun sits near arbitrary short tokens rather than near the project meant. A search for a project whose name was mistyped returned unrelated directory entries even though we hold the project and answer it correctly when spelled right. On an empty candidate set the search now consults the project name registry and retries against the single project within a typo's distance, reporting the correction in the new optional meta.didYouMean {from, to, slug, note}. Deliberately refusal-heavy: short (≤2 token) queries only, names of 5+ characters only (never 3–4 character asset tickers, which sit one edit from each other), and a unique winner is required — a tie declines rather than guesses. Entities genuinely absent from the directory are NOT corrected; they keep falling through to the semantic advisory added in 1.8.27. The correction respects every caller filter, so a ?status-scoped search cannot widen through it.",
	},
	{
		date: "2026-07-26",
		surfaces: ["api", "api-client"],
		version: "openapi@1.8.27",
		type: "added",
		summary:
			"projects/search: meta.advisory now also fires on a semantic-only page — the rows are neighbours, not matches, and say so.",
		detail:
			'When matchMode is "semantic", no keyword tier matched and every row came from vector similarity. Previously only a fully EMPTY page carried an advisory, so a query for a project we do not hold returned three confidently-named neighbours with no structured signal that none of them is the thing asked for (a search for a project name we lack returned unrelated directory entries). The rows still ship — a neighbour is occasionally the right answer for a conceptual query — but the advisory now states plainly that no project matches the name, and routes to repo search (code-only entities), the research corpus (prose mentions), and /submit (genuine coverage gap). Additive: the advisory object is optional and absent whenever a keyword tier matched.',
	},
	{
		date: "2026-07-23",
		surfaces: ["api", "mcp"],
		version: "openapi@1.8.26",
		type: "added",
		summary:
			"searchProjects `onchain` now carries asset transaction-volume + active-address metrics: assetPayments (lifetime payment-operation count), assetTrades, assetPaymentsAmount (whole asset units, NOT USD), assetPaymentsDelta, and assetTrustlines (accounts that EVER opened a trustline = reach, distinct from assetHolders = active balances today). Contract-based protocols get a per-profile contract-activity rollup (events + subinvocations). All from the same dated stellar.expert snapshot; already in the DB and on project profiles — this projects them onto the API too.",
	},
	{
		date: "2026-07-23",
		surfaces: ["api", "mcp"],
		version: "openapi@1.8.25",
		type: "added",
		summary:
			"searchHackathonBuilds (GET /api/hackathons/builds; scout-mcp search_hackathon_builds) — topic search across EVERY Stellar hackathon submission (DoraHacks buidls), the prototype layer of prior art. Answers 'has anyone already built X at a hackathon?' with each build's event, placement/award, votes, and repo/demo links. Complements searchProjects (shipped products); an empty result is a real whitespace signal.",
	},
	{
		date: "2026-07-23",
		surfaces: ["api"],
		version: "openapi@1.8.24",
		type: "changed",
		summary:
			"searchProjects now describes itself as THE way to look up a specific project by name (not only prior-art/competitor discovery), so a plain project-name question routes to the directory instead of docs/skills.",
	},
	{
		date: "2026-07-21",
		surfaces: ["api"],
		version: "openapi@1.8.23",
		type: "added",
		summary:
			"analyzeEcosystem dimension=developers answers 'how many active developers build on Stellar?' with the current Electric Capital monthly-active-dev count (total + Stellar-exclusive), month/year trend, tenure, top countries, and peer-chain scale — commit-derived and as-of dated.",
		detail:
			"SDF/institution battery: 'how many developers' fell back to stale 2022/2023 EC PDFs in the research corpus even though a fresh EC snapshot (monthly-active devs, refreshed weekly) already lived in the repo with no queryable surface. The new dimension serves it structured and dated — 3,784 MAD (2,566 Stellar-exclusive) as of the snapshot, with vs-30d/90d/1y deltas, full-time/part-time tenure, top countries, and peer-chain MAD for scale. Basis spells out it's Electric Capital commit-derived methodology, not a headcount. Routing/keywords/exampleQuestions updated so agents discover it.",
	},
	{
		date: "2026-07-21",
		surfaces: ["api"],
		version: "openapi@1.8.22",
		type: "added",
		summary:
			"getBuilders by GitHub login now answers for indexed repo owners without a Passport profile: a handle query (e.g. kalepail) that matched no builder but owns indexed Stellar repos returns one CODE-DERIVED row (match.basis 'repo-owner', evidence in codeEvidence).",
		detail:
			"P2 from the improvement-loop triage: the builders collection is Stellar-Passport only, so a prolific GitHub contributor whose repos we DO index (kalepail — passkey-kit, kale-sc, smart-account-kit) returned a bare 0, and a single-token login didn't even trip the person-lookup steer. Now, only when Passport profiles matched none AND the query is handle-shaped (one login-charset token, not a skill/vocabulary term) AND it EXACTLY matches an indexed repo owner, we synthesize one builder row from repo OWNERSHIP: bio/roleTitle null (not a claimed profile), projects from the owner's linked repos, and codeEvidence carrying the repos. Skill/topic queries never reach this path. New match.basis value 'repo-owner' distinguishes it from Passport 'profile-text' rows. Names still route to /api/people (SDF roster) / /api/research as before.",
	},
	{
		date: "2026-07-21",
		surfaces: ["api"],
		version: "openapi@1.8.21",
		type: "changed",
		summary:
			"searchProjects now documents the accountability/diligence filter composition: `?scfAwarded=1&status=Inactive` is the roster of SCF-funded projects that later went inactive, and `meta.counts.total` is the count. The words 'inactive/defunct/abandoned' don't route from free-text `q` — they must be passed as `status=Inactive`.",
		detail:
			"Cross-cutting persona battery (SDF/institution view): a natural-language 'which SCF projects are now inactive' returned Live projects because status-intent words don't route from `q`. The capability already existed (status + scfAwarded filters compose server-side, 12 SCF-funded Inactive projects with amounts) but wasn't discoverable from the spec. Added the composition to the status param description, an exampleQuestion, and a useWhen entry so the discovery index teaches it. No behavior change — routing/description only.",
	},
	{
		date: "2026-07-21",
		surfaces: ["api"],
		version: "openapi@1.8.20",
		type: "fixed",
		summary:
			"analyzeEcosystem dimension=gaps no longer reports 'Oracle' as an absent vertical. Oracle isn't a `types` value (oracles are typed category=Infrastructure with types=[] by convention), so it was a permanent false-absent; removed from the measured vertical set.",
		detail:
			"Caught live within the hour: dimension=gaps returned absent:['Oracle'] even though Reflector/Band/RedStone are Live oracles — they carry types=[] and 'Oracle' isn't a projects `types` option at all, so a types-based tally can never see them. The gap vertical universe now contains only real `types` values, and the basis documents that category-conventioned verticals (oracles) aren't measurable on the types axis (use searchProjects/category for oracle discovery). No other vertical was affected.",
	},
	{
		date: "2026-07-21",
		surfaces: ["api"],
		version: "openapi@1.8.19",
		type: "added",
		summary:
			"compareHackathons now reports cohort DURABILITY: each event's snapshot carries stillActiveCount / liveCount / activeRatePct (how many of its projects are still alive in the directory today), and deltas flags which event's cohort survived best.",
		detail:
			"The endpoint compared prize/turnout but not OUTCOME durability — 'event A had 2× the submissions but half survived' wasn't answerable. Each curated snapshot now cross-references its projects against current directory status: stillActiveCount (status Live/Pre-Release/Development), liveCount (Live only), and activeRatePct (stillActive/submissions). deltas.activeRatePct names the most/least durable cohort. Curated hackathons only — a DoraHacks-sourced event has no directory project join, so the fields stay undefined (absence = not joinable, never 'zero survived').",
	},
	{
		date: "2026-07-21",
		surfaces: ["api"],
		version: "openapi@1.8.18",
		type: "added",
		summary:
			"analyzeEcosystem dimension=gaps: the 'what should I build / where's the whitespace' answer. Per-vertical coverage + three honest gap kinds — unproven (built, nothing Live), underbuilt (very few), absent (canonical vertical with zero) — flagged supply-side, NOT demand.",
		detail:
			"The Scout-skill question agents kept inferring from raw counts now has a direct field. dimension=gaps tallies the ACTIVE directory by product TYPE (the fine vertical taxonomy, not the coarse 7-category one): byType carries total/live/inProgress/scfFunded/hackathonWinners per vertical (thinnest-first), and signals splits the whitespace into unproven / underbuilt (total ≤ 3) / absent. Deliberately descriptive, never prescriptive: the basis field states this is SUPPLY-side coverage of our directory, not market demand — a thin vertical may be under-served OR low-demand, so validate demand (real asks, RFPs) before treating a gap as an opportunity. Signals restrict to canonical buildable verticals; broad catch-alls (Infrastructure/SDK/Tooling/Analytics) are excluded. Included in dimension=all.",
	},
	{
		date: "2026-07-21",
		surfaces: ["api"],
		version: "openapi@1.8.17",
		type: "added",
		summary:
			"New getStablecoins (/api/stablecoins): every Stellar stablecoin ranked by USD MARKET CAP — the comparable metric. Corrects the 'biggest stablecoin' answer that raw supply got wrong (yen/peso units aren't USD-comparable) and adds the issuers we were missing (USDY/Ondo, PYUSD, EURC, …).",
		detail:
			"Boxy review of getLeaderboard sort=supply: circulating supply is denominated in each asset's own peg, so ranking whole-asset units treated GYEN (100.87M yen ≈ $676K) and ARST (243M pesos ≈ $243K) as if comparable to USD stablecoins, and our ~19 on-chain seeds missed the actual largest — USDY/Ondo at $467.5M. getStablecoins proxies the authoritative stablecoin snapshot (stablecoin.stellarlight.xyz, 23 issuers, dated, refreshed continuously), normalizes its display values to raw numbers, and ranks by marketCapUSD (supply × USD price) by default. Rows carry the peg so denomination is explicit; supply is served but flagged within-peg-only. Params: sort=marketcap|supply|holders|volume, peg=USD|EUR|JPY|…, limit. getLeaderboard sort=supply stays (raw issued-asset units incl. governance tokens) with its metricDefinition now pointing here for USD-comparable stablecoin size. null = not tracked, never zero.",
	},
	{
		date: "2026-07-21",
		surfaces: ["api"],
		version: "openapi@1.8.16",
		type: "added",
		summary:
			"getLeaderboard sort=supply: rank asset issuers by circulating supply. Rows now carry assetCode + assetSupply + assetHolders (from stellar.expert; null = no verified issued asset, never 'zero supply').",
		detail:
			"Completes the metrics-sort family started by sort=tvl. 'What's the biggest stablecoin on Stellar by supply?' had no answer even though the directory already tracks per-issuer circulating supply (Circle USDC ~272M / 648K holders, Etherfuse CETES, Anclap PEN, all via projects.onchain from stellar.expert). Now: sort=supply orders issuers descending with untracked (assetSupply null) always below every tracked one; pair with type=Stablecoin for a stablecoin-only board. assetCode/assetSupply/assetHolders added as trailing CSV columns and to LeaderboardProject; meta.metricDefinitions.supply states the semantics. Covers verified asset ISSUERS (stablecoins, tokenized RWAs) in our on-chain seed set — not a full-ledger asset census.",
	},
	{
		date: "2026-07-21",
		surfaces: ["api"],
		version: "openapi@1.8.15",
		type: "added",
		summary:
			"getLeaderboard sort=tvl: rank projects by DefiLlama-verified TVL. Rows now carry tvlUSD + tvlAsOf (null = not tracked on DefiLlama, never 'zero TVL'; untracked rows sort last).",
		detail:
			"Found by persona-battery testing through the Raven gateway: an institution asking 'top Stellar DeFi by TVL' sent sort=tvl and got a 400 — the natural leaderboard ask had no sort, and rows carried no TVL at all even though the directory tracks DefiLlama-verified tvlUSD per project. Now: sort=tvl orders tracked projects descending with untracked (tvlUSD null) always below every tracked row; combine with type=DEX,Lending for a DeFi board. tvl_usd added as a trailing CSV column; meta.metricDefinitions.tvl states the semantics where the numbers appear.",
	},
	{
		date: "2026-07-20",
		surfaces: ["api"],
		version: "openapi@1.8.14",
		type: "added",
		summary:
			"SCF Public Goods Award as structured truth: searchProjects rows carry publicGoods {awardRounds, evidenceUrl} for CSV-confirmed recipients, and 'public goods' queries reach them via structured inclusion.",
		detail:
			"Asked in the ecosystem today ('do we have an eval for public goods projects? they're not really indexed in the stellar docs') — they're not in the docs because they live in the directory, but 'public goods' wasn't a structured concept anywhere. Now: 10 CSV-confirmed recipients (pg-atlas-frontend Airtable exports, Status=Awarded) carry publicGoods.awardRounds + evidence; the award itself drives keyword INCLUSION (recipients' prose rarely says 'public goods'); null = not a confirmed recipient at our source, never 'not a public good'. Deliberately excluded: merged-proposal inference (rejected proposals merge too) and Q2'26 outcomes (on Tansu, unreadable via REST). A golden-eval question now guards the recall.",
	},
	{
		date: "2026-07-20",
		surfaces: ["api"],
		version: "openapi@1.8.13",
		type: "fixed",
		summary:
			"getLeaderboard ranked an ARBITRARY 300 of ~850 eligible projects (unsorted capped fetch) — blend/phoenix/soroswap never entered the board. Population is now every eligible project. Plus agent-loop clarity fixes: chunk-level severity semantics, lastActivityAt null = index gap, TVL-rollup routing pointer, escrow vocabulary.",
		detail:
			"Found by agent-in-the-loop testing through the Raven gateway: a cold agent noticed the top-200 activity board contained 4 of 13 major DeFi names; probing confirmed the population fetch was limit:300 with no sort, so ranking ran over whichever 300 rows the DB returned first. The fetch now covers all eligible (Live/Development/Pre-Release) projects with a narrow 6-field select. Also from the same runs: searchResearch severity documented as CHUNK-level (an architecture chunk can carry 'high' while the findings table reads 'unknown'); searchProjects lastActivityAt null documented as an index gap (closed-source products), never 'no activity'; searchProjects routes TVL-complete rollups to analyzeEcosystem (the types taxonomy has no DeFi umbrella; RWA-typed Spiko carries most TVL); escrow/milestone added to the shared synonym registry and an escrow flagship float added so the audited canonical platform outranks name-luck demos.",
	},
	{
		date: "2026-07-20",
		surfaces: ["api"],
		version: "openapi@1.8.12",
		type: "added",
		summary:
			"searchProjects rows carry an `audits` rollup ({count, auditors, latestAt}) from the audit registry — 'is X audited' is now a closed-world row read, not a semantic sample.",
		detail:
			"Batched per-page join over /api/audits' hand-verified projectSlug links. Semantics match the registry: null = no audit on record at our source, NOT a claim the project is unaudited; full report rows stay on /api/audits, findings text via searchResearch source=audit. Surfaced by live agent-in-the-loop testing through the Raven gateway: a cold agent answering 'is Blend audited' found six reports in the corpus but flagged that the project row itself carried no audit signal, making the complete list unreachable as structured truth.",
	},
	{
		date: "2026-07-20",
		surfaces: ["api"],
		version: "openapi@1.8.11",
		type: "changed",
		summary:
			"Discovery-facing spec text: searchProjects documents its onchain metrics block (contract events/subinvocations, asset holders/supply, deltas); searchResearch documents the existing `query` alias of `q`.",
		detail:
			"Documentation-only; no serving behavior changed. searchProjects' operation description now names the on-chain vocabulary its rows already carry, so downstream operation catalogs (agent gateways rank ops by this text) surface it for on-chain activity questions. searchResearch's long-accepted `query` alias is now in the parameter schema, so spec-derived client validators stop rejecting natural `{query: ...}` calls that the live API accepts (q wins when both present; neither returns 400).",
	},
	{
		date: "2026-07-20",
		surfaces: ["api"],
		version: "openapi@1.8.10",
		type: "added",
		summary:
			"?fields= response projection on the five heaviest list endpoints (projects/search, repos/search, research, builders, partners) — agents can request only the row fields they need.",
		detail:
			"fields=name,slug,tvlUSD returns rows with just those keys (case-insensitive). Identity keys (id/slug/fullName/githubUsername/url/source, where present on a row) are always included so projected rows still join back to their records; unknown field names are ignored rather than rejected (additive-contract ethos — a renamed field must degrade, not break callers); meta blocks are never projected. Nested objects are whole-key selections (fields=onchain returns the whole onchain block; dot-paths unsupported). Absent fields= returns the exact previous full response — purely additive.",
	},
	{
		date: "2026-07-20",
		surfaces: ["api"],
		version: "openapi@1.8.9",
		type: "added",
		summary:
			"Full row schemas documented for builders, people, rfps, hackathons, skills, clusters, and leaderboard — every list endpoint's item shape is now a named component, guarded by the daily live⊆spec field-coverage check.",
		detail:
			"Previously only Project/Partner/Audit/ResearchResult rows had documented shapes; the other seven list operations served rows the spec typed as bare objects (the anchorProfile under-documentation class, unguarded on 7 of ~10 shapes). New components: Builder (incl. match/codeEvidence provenance semantics), Person, Rfp (rowType discriminator), Hackathon (absent prizePoolUSD/hackersCount = unknown, never zero), Skill (absent optional fields = not-applicable, never false), Cluster (size is a taxonomy count, not a competitor count), LeaderboardProject (github.* numbers are as-of meta.dataAsOf). Also documented: the /api/rfps top-level `funding` string and the /api/leaderboard `ecosystem` Electric-Capital block. No serving behavior changed — this is documentation of existing responses, now drift-guarded.",
	},
	{
		date: "2026-07-20",
		surfaces: ["api"],
		version: "openapi@1.8.8",
		type: "added",
		summary:
			"/api/status sources[] gains researchDocs and partners rows — the freshness guard now covers the research corpus and partner directory crons.",
		detail:
			"Two new rows in sources[]: researchDocs (the primary research corpus behind /api/research — previously the #2 endpoint by usage had no freshness row) and partners (partner directory profiles; counts ALL rows incl. unpublished drafts, populationId partner-accounts|status:all — /api/partners serves published-only, so its total can be smaller). The daily self-audit now applies staleness thresholds to audits/researchDocs/partners, so a stalled ingest cron surfaces as a tracked failure instead of silence.",
	},
	{
		date: "2026-07-20",
		surfaces: ["api"],
		version: "openapi@1.8.7",
		type: "added",
		summary:
			"On-chain deltas + partner-asset join: projects.onchain gains eventsDelta/subinvocationsDelta/assetHoldersDelta with prevAsOf/deltaDays; partner-linked issuer assets auto-join their projects.",
		detail:
			"Snapshot-over-snapshot activity: from the second enrichment run, each contract carries eventsDelta and subinvocationsDelta and assets carry assetHoldersDelta, with prevAsOf + deltaDays defining the comparison window — lifetime counts can't distinguish a dead contract from a busy one; deltas can. null delta = no prior snapshot, NOT zero activity. Coverage: partner records with a projectSlug and enrichment-verified on-chain assets now auto-join their canonical (top-holders) asset to the project row.",
	},
	{
		date: "2026-07-20",
		surfaces: ["api"],
		version: "openapi@1.8.6",
		type: "added",
		summary:
			"On-chain metrics on project rows: projects.onchain — per-contract activity (events, subinvocations, storage) + asset holders/supply from stellar.expert, hand-verified join keys.",
		detail:
			"searchProjects rows gain an `onchain` group for projects with verified on-chain join keys (contract addresses from the projects' own deployment manifests/READMEs; assets from canonical issuer accounts). Per contract: lifetime events + subinvocations + storageEntries + createdAt + the wasm-validation repo when available. Per asset: funded-trustline holders + supply in whole units. Semantics: onchain null = not tracked in our registry, never 'no activity'; stellar.expert's direct invocation counter is currently null service-wide, so events/subinvocations are the honest activity signals. Refreshed weekly.",
	},
	{
		date: "2026-07-19",
		surfaces: ["api"],
		version: "openapi@1.8.5",
		type: "added",
		summary:
			"findingsTotal/severityCounts now populate on /api/audits for auditor formats that parse deterministically — 20 of 58 reports carry verified counts (previously 100% null).",
		detail:
			"Per-auditor grammars (OtterSec, Veridise, Certora, Code4rena, Hacken) extract findings counts ONLY when the report round-trips an internal consistency check: enumerated finding IDs must equal the report's own stated total, and per-finding severity words must agree with their ID prefixes. One failed check → null (= not extracted, NOT zero — unchanged semantics). severityCounts populate where the format carries per-finding severity (Certora tables, Code4rena tier headings). Shattered formats (Halborn, Runtime Verification, Quarkslab...) deliberately stay null rather than guessed.",
	},
	{
		date: "2026-07-19",
		surfaces: ["api"],
		version: "openapi@1.8.4",
		type: "fixed",
		summary:
			"Audit filters now scope retrieval (no more silent false negatives); /api/audits gains real-date since validation, didYouMean on filtered empties, and a dateBasis honesty field.",
		detail:
			"Cold-audit fixes on the new surfaces: (1) /api/research auditor/protocol/severity filters previously post-filtered an unscoped pool — a query whose top-K lacked audit chunks returned 0 even when matching audit chunks existed; the filters now imply source=audit at retrieval, and a contradictory explicit source= is a 400. severity is case-insensitive. (2) /api/audits: since= rejects impossible YYYY-MM-DD dates (2026-13-01 previously passed and matched nothing); filtered empties return meta.didYouMean suggestions from the registry's own values; rows carry dateBasis (published | portal-record) so wall-clock portal timestamps aren't mistaken for publication recency.",
	},
	{
		date: "2026-07-19",
		surfaces: ["api", "mcp"],
		version: "openapi@1.8.3 / scout-mcp@1.1.11",
		type: "added",
		summary:
			"New `/api/people` (getPeople) + `get_people` MCP tool: the SDF team/people index — leadership, board of directors, and advisors (name → role → org), quoted from stellar.org/foundation/team with provenance. Answers 'who is <person>', 'what's their SDF role', 'who's on the board'. Deliberately distinct from getBuilders (GitHub-contributor profiles): a VP of Ecosystem or a board member is not a 'builder'. Filter by `q` (name/role/org) and `section` (Leadership/Board of directors/Advisors).",
		detail:
			"Closes the person-lookup gap where getBuilders returned 0 for well-known SDF people (Justin Rice = VP Ecosystem, Tomer Weller, board members) and searchResearch surfaced only tangential prose. The roster's roles + section grouping are extracted from the team page's __NEXT_DATA__ card blocks (reusing the sls-055 parser, now also capturing each card's section from its container title) into a committed registry (src/data/sdf-people.ts, regenerated by scripts/build-sdf-people.ts) — DB-independent and deterministic for the drift guard. getBuilders now cross-links: a name-shaped query that matches the SDF roster returns a concrete identification (name — role — section) plus a pointer to /api/people, instead of a misleading 'broaden your filter'.",
	},
	{
		date: "2026-07-19",
		surfaces: ["api"],
		version: "openapi@1.8.2",
		type: "changed",
		summary:
			"Audit and ResearchResult row schemas fully documented in the spec (previously generic objects); daily drift guard now field-covers both.",
		detail:
			"components.schemas.Audit and components.schemas.ResearchResult document every served field with null semantics (projectSlug null = no directory project, NOT unaudited; findingsTotal/severityCounts null = not extracted, NOT zero; severity is section-inferred). The daily api-drift field-coverage check now asserts live rows ⊆ spec for /api/audits and /api/research alongside projects/partners — a new field that ships undocumented turns the guard red.",
	},
	{
		date: "2026-07-19",
		surfaces: ["api"],
		version: "openapi@1.8.1",
		type: "added",
		summary:
			"New research source 'release' — stellar-core/stellar-cli/SDK GitHub release notes (protocol upgrade tags, dated); sdf-blog titles repaired for foundation-news posts.",
		detail:
			"The corpus was snapshot-shaped: Protocol 27 'Zipper' reached mainnet with no document saying what shipped when. /api/research?source=release now serves one dated doc per stable GitHub release of stellar/stellar-core, stellar-cli, js-stellar-sdk, and rs-soroban-sdk. Separately, ~50 stellar.org foundation-news posts (including the Protocol 27 and 26 upgrade guides) were ingested with their titles collapsed to 'Stellar' (brand-prefix og:title ordering) — titles now extract correctly, restoring their retrieval weight.",
	},
	{
		date: "2026-07-19",
		surfaces: ["api"],
		version: "openapi@1.8.0",
		type: "added",
		summary:
			"New GET /api/audits — enumerable security-audit registry (one row per report, hand-verified projectSlug links); /api/research now honors auditor/protocol/severity filters instead of silently ignoring them.",
		detail:
			"The audit corpus gains a structured half: /api/audits lists every stellarsecurityportal.com report with normalized auditor, publication date, and a verified directory-project link (project=, auditor=, q=, since= filters; unknown params 400). Agents can now answer 'list all audits for X' / 'what has firm Y audited' by enumeration instead of vector retrieval. On /api/research, the previously-ignored auditor/protocol/severity params now filter audit-chunk metadata (unknown severity values 400); severity remains section-inferred and mostly 'unknown' on PDF-derived chunks — /api/audits is the reliable report-level surface. /api/status gains an 'audits' source row. Registry rows carry findingsTotal/severityCounts as null until deterministic extraction lands (null = not extracted, NOT zero).",
	},
	{
		date: "2026-07-16",
		surfaces: ["api"],
		version: "spec 1.7.28",
		type: "fixed",
		summary:
			"searchResearch brand/lookup queries: a chunk containing EVERY query token verbatim is now fetched into the pool even when cosine retrieval missed it, and carries a relevance floor of 0.8. Live failures this fixes: bare q=Alchemy returned 0 results (the lone-word embedding's nearest neighbours were all low-value chunks), and 'Alchemy Stellar Data API transfers balances' ranked the official Indexers chunk that literally documents Alchemy's Data API below top-15, behind pages merely titled 'Balances'/'Token Transfers'.",
		detail:
			"Same fetch-not-rank root as the sls-019 identifier lookup and the recency supplement: the pool is supplemented with full-lexical-coverage chunks (AND-match over ≤8 de-pluralized query tokens; gated on the vector pool lacking any full-coverage chunk so the hot path pays the extra find only on a real miss), each carrying its REAL stored-embedding cosine. Ranking floors full-coverage relevance at 0.8 — under curated anchors (0.85) and exact CAP/SEP IDs (0.9), so genuinely-closer embeddings still win and raw cosine orders full-coverage peers. The floor applies only while coverage is DISCRIMINATING (at most 5 chunks in the pool carry it): the first deploy floored generic-vocabulary coverage and regressed 3 golden cases ('SCF handbook link' served seven uniform-floored pages containing scf/handbook/link over the actual handbook root) — widely-covered tokens are not a lookup key. scoreModel.note documents the floor and its gate.",
	},
	{
		date: "2026-07-15",
		surfaces: ["api"],
		version: "spec 1.7.27",
		type: "fixed",
		summary:
			"`/api/projects/search` result counts are now computed AFTER canonical deduplication (sls-056). `meta.counts.returned` and `total` previously counted the pre-fold page, so a query whose results included a lineage-shadow duplicate reported more rows than the payload carried — e.g. q=OrbitCDP served one canonical row while both counts said 2. Counts now hold the invariants returned === projects.length and total >= returned.",
		detail:
			"The shadow-fold (a merged-away duplicate whose canonicalSlug points at the surviving record is swapped for its canonical, or dropped if the canonical is already present) and the status/type belt-filters run AFTER the page is assembled, so counting `projects.length + semanticAdds.length` over-reported by exactly the rows those steps removed. `returned` is now the served array length; `total` subtracts the same per-page fold delta from the pre-slice match total (still ≥ returned). No response-shape change — only the count values are corrected.",
	},
	{
		date: "2026-07-14",
		surfaces: ["api"],
		version: "spec 1.7.26",
		type: "added",
		summary:
			"searchResearch now answers SDF leadership-role questions and stamps crawl-observation dates. The Team page's per-member ROLES ('Founder and Chief Scientist', 'VP of Ecosystem') live only in the page's embedded card data — a plain <main> scrape yielded a role-less name list — so ingestion now recovers the Name→Role roster from that embedded data. Every research chunk also carries a new `observedAt` (crawl-observation date: when ingest last observed the content live at the source), distinct from `publishedAt` (the source's own stated date).",
		detail:
			"Team-page extraction parses the embedded Sanity card blocks (fail-safe: if the structure changes the ingester's signature guard REFUSES the page rather than silently re-ingesting a role-less list); the leadership roles are now registered signatures. `observedAt` is stamped on every ingest run — re-written even when content is unchanged (metadata-only, no re-embed) — so it reflects last-observation, not last-change like Payload updatedAt. First lit on the sdf-org corpus.",
	},
	{
		date: "2026-07-14",
		surfaces: ["api"],
		version: "spec 1.7.25",
		type: "fixed",
		summary:
			"Leaderboard `type` filter correctness + documentation (#524): the `type` param added in 1.7.23 was served but (a) undocumented in the OpenAPI spec and (b) matched by SUBSTRING — so type=DEX false-included Indexer/Codex rows. It now uses exact whole-element membership, documents the `type` query parameter with its full enum and multi-value (repeatable + comma-separable, EITHER-membership) semantics, and echoes the applied scope at meta.filters.type.",
		detail:
			"Root cause: Payload's contains operator compiles to a case-insensitive substring regex, so as an array-membership filter it silently leaks partial matches (projects/search stayed correct only because it also post-filters in JS). The leaderboard now selects with the exact `in` operator and re-asserts membership with a JS backstop — the same belt-and-suspenders gate. Documenting the previously-undocumented `type` param also closes a served-but-undocumented drift. No response-schema field change: each row already carried `types`.",
	},
	{
		date: "2026-07-14",
		surfaces: ["api"],
		version: "spec 1.7.24",
		type: "changed",
		summary:
			"Golden-eval standing-miss fixes: searchResearch recency-intent queries now pool-supplement the corpus's newest publication-dated docs (fetch-stage fix — the Protocol 27 'Zipper' announcement never entered the vector pool for 'latest soroban release') and stop counting dev-docs 'Last updated' maintenance dates as publication evidence in the recency re-rank; a curated vertical-anchor registry floors relevance for the canonical docs of a recognized consumer intent (first vertical: bridge-assets — the CCTP cross-chain-transfers how-to and the Allbridge Soroban bridge audit); searchRepos gains a streaming-payments vertical flagship set (fluxity/sstream — canonical Stellar streaming repos whose descriptions carry no 'streaming payments' tokens).",
		detail:
			"Supplemented chunks are scored with their real stored-embedding cosine on the same scale as the vector pool — no invented relevance; anchor docs are direct-fetched into the pool when the vector stage missed them (the sls-019 inclusion-not-just-ranking principle). Also fixes a JSON-over-escaped regex in the scf-handbook-link golden lock (the expectation could never match any URL; retrieval was already serving stellar.gitbook.io/scf-handbook at rank 1).",
	},
	{
		date: "2026-07-14",
		surfaces: ["api"],
		version: "spec 1.7.23",
		type: "changed",
		summary:
			"Three consumer-reported contract fixes: projects rows gain optional productKind/availability wallet-taxonomy fields (sls-033/#519); /api/builders rejects unsupported query params with 400 + supportedParams, closing the Engine E invalid-accepted class (#521); /api/leaderboard gains a validated type filter (was silently ignored) + per-row types (#524).",
		detail:
			"Wallet productKind (hardware-wallet | mobile-app | browser-extension | web-app | protocol | sdk-kit) + availability serve where curated (null = not-yet-classified, never a negative claim). Unsupported-param rejection is additive-safe (only previously-ignored params now 400). Leaderboard type validates against the projects types enum, filters at the DB layer before ranking.",
	},
	{
		date: "2026-07-14",
		surfaces: ["api", "mcp"],
		version: "spec 1.7.22",
		type: "added",
		summary:
			"sls-055/#533: new 'sdf-org' research source — canonical non-blog stellar.org organizational pages, quotable. Covers the SDF Mandate (current + 2019/2017 historical, incl. the self-funded / pays-taxes structure wording), Terms of Service (incl. the Delaware non-profit corporation wording), Foundation, Team (leadership + board roster), Enterprise Fund (venture-style fund, portfolio totaling over $100m), and the Quarterly Reports index.",
		detail:
			"searchResearch's `source` enum gains 'sdf-org'. The page family is declared once in a CANONICAL_PAGES registry (URL + per-page verbatim signature phrases, verified live 2026-07-13) that drives BOTH the ingester (scripts/ingest-sdf-org.ts: rendered-page text scoped to the page's main element, publishedAt only when the page states a date, e.g. the Terms effective-date line) and a weekly corpus-coverage class guard that reds the health tracker if any family member's page or quotable wording goes missing — the sls-020 security-program pages are folded into the same registry, so the family is guarded as a class rather than patched per query. Corpus rows land with the next research-corpus refresh after deploy.",
	},
	{
		date: "2026-07-14",
		surfaces: ["api-client", "mcp"],
		type: "changed",
		summary:
			"@stellar-light/api-client 1.6.0 (major-minor: the never-populated builder `scfTier` property is REMOVED from generated types — matching the live contract — alongside six spec revisions of new fields: `identity`, `routes`, `venueRole`, status provenance, `llamaSlugs`/`tvlMethodUrl`, funding snapshot deltas, the `type`/`status` filters, and the `security-program` research source) and @stellar-light/scout-mcp 1.1.10 (terse tool descriptions per the sls-051 split, `cap` + `security-program` source enums, scfTier claim removal).",
		detail:
			"If you generated against api-client 1.5.3 (spec 1.7.15-era), regenerate once against 1.6.0 for the 1.7.16→1.7.21 union. The only removal is builder `scfTier` (was empty string on every row since introduction; the live API stopped emitting it in spec 1.7.19 per sls-040/#521).",
	},
	{
		date: "2026-07-13",
		surfaces: ["api", "mcp"],
		version: "spec 1.7.21",
		type: "added",
		summary:
			"sls-020: new `security-program` research source — SDF's bug-bounty / vulnerability-disclosure program status. Covers the 2026-05-07 consolidation into a single HackerOne program (general Stellar Immunefi program deprecated; the OpenZeppelin-on-Stellar Immunefi bounty remains active and separate) and labels the stale stellar.org bug-bounty landing page as superseded for program-status claims.",
		detail:
			"searchResearch's `source` enum gains 'security-program' (records ingested from the live HackerOne program policy via public GraphQL, publishedAt from the policy's own effective date, plus a curated dated supersession record). The scout-mcp source enum also gains the previously-missing 'cap' value — the MCP wrapper was rejecting a filter the live API serves; both MCP changes ride the next npm publish.",
	},
	{
		date: "2026-07-13",
		surfaces: ["api"],
		version: "spec 1.7.21",
		type: "fixed",
		summary:
			"sls-019: exact CAP/SEP identifier queries now retrieve their own document at rank 1 (q=CAP-0038 had ranked its target 23rd), and source-filtered pages no longer serve duplicate chunks of one document while distinct in-source documents exist (q=Asset+Clawback&source=cap had served cap-0035.md 9× in one page). sls-022: the YieldBlox incident record now carries verified facts — event 2026-02-22, completed drain of 61,249,278 XLM + ~1,000,197 USDC (≈$10.2M USD), pool-operator oracle misconfiguration (USTRY/Reflector), ~48M XLM later quarantined (quarantine ≠ recovery) — replacing the wrong 'May 2026, attempted & contained, $61M' row.",
		detail:
			"Identifier forms (CAP-38 / cap 0038 / sep#10 / SEP-0024 …) normalize to the canonical slug; the named document is pinned above vector order with relevance floored at 0.9 (the scoreModel note now states exact-identifier matches rank first). If the vector pool misses the named doc it is fetched directly by ID. Source-filtered $vectorSearch surveys a deeper candidate pool BEFORE the source $match and re-trims after it, so the best-chunk-per-document collapse has enough distinct documents to fill a page. Golden eval gains exact-ID rank-1 locks (cap-0021/0038/0058), a no-duplicate-URLs dedup lock, a security-program transition lock, and a YieldBlox incident-facts lock (forbids 'May 2026 attempted' and '$61M' renderings).",
	},
	{
		date: "2026-07-13",
		surfaces: ["api"],
		version: "spec 1.7.20",
		type: "added",
		summary:
			"sls schema wave (all additive): sls-032 #516 — project rows gain nullable `routes` (curated route-level bridge evidence: `fromChain`/`toChain`, `direction`, `assets`, `assetRepresentation` canonical|wrapped|bridged|interchain, `mechanism`, `sourceUrl`, `asOf`; null = not curated, NEVER 'no routes'; a Bridge project hit stays discovery-only). sls-035 #517 — rows gain nullable `venueRole` (amm | native-orderbook | aggregator-router | trading-ui | wallet-integrated) so a DEX cluster count stops reading as a competitor count. sls-036 #524 residual — getLeaderboard meta gains `dataAsOf` (the repo-index rollup timestamp the served github numbers are as-of; distinct from `generatedAt`). sls-039 #522 — rows gain `llamaSlugs` (the mapped DefiLlama identifiers `tvlMethod` refers to) + `tvlMethodUrl` (provider citation URL; the provider page carries the full TVL time series — this API serves the dated current point). sls-044 #520 — analyze funding gains `snapshotAsOf`, `previousSnapshot`, `snapshotDelta` (`addedProjects`/`removedProjects` slug lists + `removedReasons` with mechanical codes dedupe | eligibility-reclassification | source-correction | unknown), `deltaBasis`, and an explicit `deltaUnavailable` reason when no comparison exists yet.",
		detail:
			"Response-shape notes: `routes` and `venueRole` are curator-populated (grounded in provider docs with source URL + as-of date) — most records serve null, which means UNKNOWN/not-yet-curated, never a negative claim; do not answer canonical-USDC route questions from a bare Bridge project hit (that is the sls-032 finding — quote-time facts like fees/availability are intentionally not encoded). `llamaSlugs`/`tvlMethodUrl` serve the existing enricher mapping (null = not DefiLlama-tracked, matching `tvlUSD` semantics). Funding delta: snapshots persist server-side one-per-set-state (keyed by `projectSetHash`); the first read after this deploy serves `deltaUnavailable` honestly until a second, different set state is observed. First curated data rides the same wave: bridge routes for usdc-swap / allbridge / estrela / CCTP (rubic deliberately not route-encoded — its evidence is chain-level integration, and an aggregator's asset outcome is quote-time), and `venueRole` for the ten clearest DEX-landscape records (soroswap/aquarius/phoenix/sushi/comet = amm, stellarterm/stellarx = trading-ui, lobstr/scopuly = wallet-integrated, stellarbroker = aggregator-router).",
	},
	{
		date: "2026-07-13",
		surfaces: ["api", "mcp", "skill"],
		version: "spec 1.7.19",
		type: "removed",
		summary:
			"sls-040 (upstream #521): removed the always-blank `scfTier` field from /api/builders rows. The source field was never populated (116/116 live profiles empty), so the emitted empty string contradicted the documented contract that SCF-tier data is unsupported — an observable ambiguity a machine consumer could misread as a supported-but-empty signal. Builder rows no longer carry the key at all.",
		detail:
			"getBuilders response rows drop `scfTier` entirely (it was \"\" on every row; no consumer could ever have read a real value from it). The routing guidance is unchanged: SCF-tier/award-track filtering remains unsupported on /api/builders — a project's award history lives on /api/projects/search rows. If person-level SCF tier ever gains a real source it will return as a typed, documented field with provenance, per #521's option 2. The MCP get_builders tool description and the skill API reference now state the removal. Note: an unsupported scfTier QUERY parameter is still silently ignored (no 4xx) — explicit unknown-param rejection is tracked separately.",
	},
	{
		date: "2026-07-12",
		surfaces: ["api"],
		type: "added",
		summary:
			"sls-050: rename continuity as structured data. Project rows gain a nullable `identity` block ({currentName, aliases, renamedAt, sourceUrl}) served whenever a record carries former names; alias lookups now rank as exact-name matches in searchProjects (q=vibrant resolves to vesseo with the continuity disclosed, not via invisible synonyms). Additive.",
		detail:
			"Response shape (byte-aligned with the OpenAPI schema): project rows gain an optional nullable `identity` object — `identity.currentName`, `identity.aliases` (array), `identity.renamedAt`, `identity.sourceUrl` — served only when a record carries former names; NO new top-level fields. Search: aliases join the candidate query and name matching (exact alias = exact-name rank). First populated record: vesseo (formerly Vibrant). The general mechanism replaces per-case synonym patches for renames. (Detail corrected 2026-07-13 per consumer report sls-054: the original sentence described internal storage field names, not the served shape.)",
	},
	{
		date: "2026-07-12",
		surfaces: ["api"],
		type: "changed",
		summary:
			"sls-052 + sls-053: x-routing vocabulary curation (repo-health terms on getLeaderboard, SDF-organizational terms on searchResearch, stack+role terms on getBuilders — the three families measured as unrecovered at the 1.7.16 absorb) and the skills directory now derives the SDF catalog from skills.stellar.org/llms.txt (24h cache): superseded `soroban` is gone; `smart-contracts`, `setup-stellar-contracts`, and `agent-browser-webauthn` now listed.",
		detail:
			"x-routing additions are additive curation inside the 1.7.16 structure — descriptions unchanged, capture guards hold. The routing-surface CI check gains the inverse guard sls-052 recommends: each operation's x-routing must cover the vocabulary of the question families it is expected to win. Skills consumers should refresh: the soroban slug no longer appears; smart-contracts is the maintained successor.",
	},
	{
		date: "2026-07-11",
		surfaces: ["api"],
		version: "spec 1.7.16",
		type: "changed",
		summary:
			"sls-051 structural fix — operation descriptions rewritten as terse purpose statements (every one now ≤600 chars; searchProjects was 2,330, searchResearch 2,395), and the routing vocabulary they carried (category/product enumerations, synonym chains, question exemplars) MOVED — not deleted — to a new machine-readable `x-routing` extension on each operation: {purpose, keywords[], useWhen[], notFor[], exampleQuestions[]}. WHY: enumeration-heavy description prose was lexically capturing question families other operations answer (22/122 extended-lane docs-shaped questions ranked searchProjects top-1 at the 1.7.15 absorb), and each prose repair just moved the capture to a new family — 1.7.15 fixed editorial capture and created docs capture. Consumers that cached operation descriptions should re-baseline against 1.7.16; lexical/embedding routers should score `x-routing` as separately-weighted fields rather than concatenating it into the description (convention documented in info.description under 'Routing metadata').",
		detail:
			"17 operations shrank (before→after chars): searchResearch 2395→399, searchProjects 2330→362, getLeaderboard 1551→390, analyzeEcosystem 1510→390, searchRepos 1436→381, getBuilders 1321→353, getClusters 1241→382, getRfps 1174→385, getHackathon 1066→364, getHackathons 1061→384, compareHackathons 928→370, listSkills 890→398, explainRepo 826→370, getStatus 757→309, getPartners 738→393, getSkill 720→369, partnerAssistant 659→374. No parameter or response-shape changes — operation descriptions + the additive x-routing extension only. Guarded in contract CI by scripts/eval/routing-surface-check.ts: asserts every description ≤600 chars and that sls-051's docs-shaped probes ('which Wasm target does the current Stellar CLI build to?' et al.) never rank searchProjects' description as top token-coverage nor ≥0.35 absolute. scout-mcp tool descriptions received the same shrink and ride the next npm publish.",
	},
	{
		date: "2026-07-11",
		surfaces: ["api-client", "mcp"],
		type: "changed",
		summary:
			"@stellar-light/api-client 1.5.3 + @stellar-light/scout-mcp 1.1.9 published: client types regenerated for spec 1.7.15 (status + type filters, meta.warnings, provenance fields statusAsOf/statusSourceUrl/statusBasis + tvlSource/tvlMethod, builder match provenance, rfps rowType, analyze tvl dimension, population digests); MCP search_projects gains the status param and drops the false scfTier claim from get_builders.",
		detail:
			"If you generated against api-client 1.5.1 (spec 1.6.1-era) or 1.5.2, regenerate once — three spec revisions (1.7.13/1.7.14/1.7.15) landed between publishes. All changes additive.",
	},
	{
		date: "2026-07-11",
		surfaces: ["api"],
		version: "spec 1.7.15",
		type: "added",
		summary:
			"sls-041..050 wave (all additive): getBuilders rows carry `match` (matchedFields/matchedProjects/matchedTerms — WHY a skill query hit) + `codeEvidence` (indexed repos owned by the builder that match the query) + meta.matchBasis; getClusters no longer truncates its input at 500 active projects and both it and analyzeEcosystem carry a `meta.population` scope digest (id/totalAvailable/included/truncated — identical ids ⇒ comparable numbers); getStatus sources gain `populationId`; analyze funding gains `projectSetHash` (stable digest of the awarded-project SET — distinguishes amount corrections from membership changes across snapshots); getRfps rows carry a `rowType` discriminator ('rfp' vs synthetic 'scf-round') + counts.syntheticRounds + meta.countBasis (open counts briefs; returned counts rows); searchRepos rows carry `stellarEvidence` (code-verified/sdf-org/curated/mentioned/none — why a repo ranks), scanned-but-proof-'none' repos no longer rank as Stellar-proven, and `codeVerified.isDeployableContract` is pinned false for known platform/SDK/tooling repos (stellar-core, rs-soroban-env, CLI/SDKs — their cdylibs are runtime/fixtures, not deployable products); searchProjects anchorProfile gains `profileState` + meta.anchorProfileBasis (empty capability arrays = unknown, never a negative claim).",
		detail:
			"Data fixes riding the wave: Band award facts aligned to the official SCF record (SCF #16, $60K — the canonical row's unsourced #41/$100K corrected); Bitso anchor profile filled from Bitso's own sources (USDC on/off-ramp over Stellar); Vibrant→Vesseo rename mapped bidirectionally in search synonyms. Regression guards ship in the daily self-audit (band award lock, rfps row/count contract, clusters⇄analyze population parity, stellar-core classification, zero-knowledge ranking evidence, vibrant→vesseo recall).",
	},
	{
		date: "2026-07-11",
		surfaces: ["api"],
		type: "changed",
		summary:
			"Version disambiguation: spec bumped to 1.7.14 with no contract change. Two parallel additive changes (status/TVL provenance fields; type filter + leaderboard metricDefinitions + analyze tvl dimension + repo alias recall) both shipped labeled 1.7.13, so for a window that version string covered two different contracts. 1.7.14 marks the union state so drift CI re-baselines cleanly.",
		detail:
			"No fields or operations change in this bump. If your catalog was generated from 1.7.13, regenerate once against 1.7.14 to be certain you have the union (both changelog entries dated 2026-07-11 describe the two constituent changes).",
	},
	{
		date: "2026-07-11",
		surfaces: ["api"],
		version: "openapi@1.7.13",
		type: "added",
		summary:
			"Contract-honesty batch (sls-025/033/036/038/040): searchProjects gains a real `type` filter (?type=Wallet now filters server-side on types[] membership — it was silently ignored; unknown values 400 with validTypes; echoed in meta.filters.type). analyzeEcosystem gains `dimension=tvl` and serves the TVL rollup the description promised (totalTvlUSD + top10 by tvlUSD, DefiLlama-sourced, asOf-dated; also in dimension=all). getLeaderboard responses carry meta.metricDefinitions defining every served metric (issues = OPEN-issue backlog rollup, issue-only excluding PRs — a backlog snapshot, not activity; activity/lastActivityAt = latest default-branch commit across indexed repos; repoCount = indexed-repo coverage). searchRepos recall: owner-segment and separator-insensitive alias matching (q=progax01, q=stellar8004, q=subquery/stellar-subql-starter now resolve; erc/eip/src-NNNN standards tokens expand to their number), and zero-result pages carry meta.searched (tokens + expansions + fields searched) stating an empty page is NOT evidence of nonexistence. getBuilders descriptions no longer advertise SCF-tier/award-track recruiting (every live scfTier value is empty; the response field remains, explicitly labeled unpopulated).",
		detail:
			"All additive; nothing removed or renamed. New optional response members: searchProjects meta.filters.type; analyze `tvl` block (+ 'tvl' in meta.validDimensions); leaderboard meta.metricDefinitions; searchRepos meta.searched (zero-result responses only). searchRepos ranking: an exact owner/name/path alias match now outranks keyword/semantic neighbors (below curated canonical/flagship floats); other queries rank as before. Consumers that treated q=wallet keyword results as a Wallet-type roster should switch to ?type=Wallet.",
	},
	{
		date: "2026-07-11",
		surfaces: ["api"],
		type: "added",
		summary:
			"Provenance fields on searchProjects rows (sls-023/024/029/031, additive): `statusAsOf` (when the lifecycle label was last asserted, ISO 8601), `statusSourceUrl` (primary evidence URL), `statusBasis` (what KIND of evidence: operator-announcement | site-liveness | onchain-activity | human-verified | source-inherited), `tvlSource` (which source produced tvlUSD, e.g. 'defillama'), `tvlMethod` (how it was computed — inclusion scope for reconciling cross-source differences). Data: DTCC corrected Live → Development (its own announcement says DTC tokenization on Stellar is expected H1 2027 — an entity being live is not a live Stellar deployment); Band + Lightecho oracles gain supportedNetworks from primary evidence (Stellar-docs-listed mainnet contract + Band's own Soroban repo; Lightecho's README mainnet contract).",
		detail:
			"All five fields are optional/nullable and null on legacy rows — zero writes to existing data; curation and the TVL enricher populate them going forward. Semantic-fallback rows also now carry tvlUSD/tvlAsOf (they were silently null on that path). Consumers should read a bare status as source-relative and undated; statusBasis 'operator-announcement' can describe PLANS (like DTCC's H1-2027 target), so pair it with statusAsOf and the description before claiming a live deployment. Cite TVL as '<tvlSource> as of <tvlAsOf>' — concurrent sources legitimately differ by pricing time and inclusion scope.",
	},
	{
		date: "2026-07-11",
		surfaces: ["api"],
		type: "added",
		summary:
			"searchProjects intent upgrades (spec 1.7.12): new `status` filter (the 81-record Inactive corpus is now reachable: ?status=Inactive); unknown query params are no longer silently ignored (meta.warnings names them and points at the supported set); 'X vs Y' comparison queries guarantee BOTH named subjects in results; TVL-superlative queries ('highest tvl') admit and rank the actual tvlUSD leaders; negated prose ('non-custodial') no longer matches the positive intent ('custody'). Research: recency-intent queries ('latest/recent/current…') rank by dated freshness — evergreen-doc scoring no longer serves a 2024 protocol section for 'latest soroban release'.",
		detail:
			"All additive; nothing removed or renamed. meta.warnings is a new optional string[] on searchProjects responses; meta.filters gains `status` (echoed, null when absent). Ranking changes are query-intent-scoped: plain topical queries rank exactly as before; only vs/tvl/recency/negation intents change. Consumers that guessed unsupported params (country/sep/network) now get an explicit warning instead of silently-unfiltered results — put those terms in q (structured coverage is matched from query text).",
	},
	{
		date: "2026-07-10",
		surfaces: ["api"],
		type: "changed",
		summary:
			"Liveness wave: 38 provably-defunct projects flipped Live → Inactive (each individually researched with positive evidence — shutdown notices, parked/unregistered domains, abandoned footprints — recorded on the row as lifecycle.note, e.g. Whalestack wound down to a BTCPay redirect; nTokens discontinued the BRL anchor; Lumenaut's inflation pool ended with Protocol 12). 13 records whose PRODUCT is alive got their dead recorded URL repointed (stellarbeat → OBSRVR Radar, fastbuka → Choppaddi rebrand, afriex, xycloans, arst…). chainatlas merged into chainsatlas (duplicate).",
		detail:
			"Directory truth change only — no shape change. Live count 871 → 832. Inactive records stay name-searchable (heavily down-ranked) and now explain themselves via lifecycle.note; they drop out of active listings, leaderboard, clusters and funding aggregates. Methodology + full evidence table: the liveness triage in our changelog-linked improvements notes.",
	},
	{
		date: "2026-07-10",
		surfaces: ["api-client"],
		version: "api-client@1.5.1",
		type: "fixed",
		summary:
			"Types catch up to openapi 1.7.9-1.7.11: matchMode union gains 'semantic', meta.counts gains optional `semantic`. Consumers on 1.5.0 narrowing matchMode exhaustively hit an unknown value at runtime when the API serves a semantic-fallback page — update to 1.5.1.",
		detail:
			"Generated-types-only release; no runtime behavior change in the client.",
	},
	{
		date: "2026-07-10",
		surfaces: ["api"],
		type: "changed",
		summary:
			"Duplicate project records merged (12 pairs, e.g. stellar-expert/stellarexpert, soroban-pulse/sorobanpulse, coins-ph/coinsph): each pair was ONE project split across an SCF-funded record and a lumenloop-enriched record, splitting funding/description/repos between rows. The canonical record now carries the complete facts; the duplicate stays name-searchable as a lineage shadow (canonicalSlug → canonical, status Inactive, lifecycle.note explains). No records deleted; no shape change.",
		detail:
			"Consumers resolving a shadow should follow its canonicalSlug pointer for funding/status/repos. Aggregates (analyze funding, clusters, leaderboard) already exclude Inactive rows, so per-project stats stop double/under-counting. Repo enrichment now links repos only to canonical records.",
	},
	{
		date: "2026-07-10",
		surfaces: ["api"],
		version: "openapi@1.7.11",
		type: "changed",
		summary:
			"searchResearch title-match refinement: a query naming a record's protocol field exactly (q='hiyield audit') now counts as a FULL title match — previously the generic token 'audit' gave the named record and an off-protocol audit the same boost, and the wrong record kept #1 on a 0.01 cosine edge (1.7.10 live-verify residual).",
		detail:
			"Ranking-order change only; no shape change. Unit test pins the real-world case (both titles contain 'Audit Report', only the protocol field discriminates).",
	},
	{
		date: "2026-07-10",
		surfaces: ["api"],
		version: "openapi@1.7.10",
		type: "changed",
		summary:
			"searchResearch ranking overhaul (audit R2, worst cell at 12%): dated meeting recaps (developers.stellar.org/meetings/YYYY/MM/DD) no longer ride dev-docs' canonical authority + evergreen freshness — they now score as meeting-notes (authority 0.5) with their URL date as freshness, so a one-line recap can't outrank the CAP/doc it mentions. Crawl-artifact rows (author archives, pagination mirrors) are dropped at serve time and pruned from the corpus. Exact-duplicate content mirrored across URLs collapses to one row. A title-match signal now feeds relevance ('Install the CLI' ranks top for q=install stellar cli; named-protocol audit lookups match the protocol field). Deeper candidate pool (8×) so 'best chunk per document' actually yields distinct documents.",
		detail:
			"Also ingest-side (lands with the next corpus refresh): CAP/SEP titles read the preamble Title: field first (cap-0066/sep-0020 carried mid-document body fragments as titles); dev-docs rows get publishedAt from the pages' own 'Last updated on' footer (was null on 100% of rows). Ranking-order change only — response shape unchanged; meeting rows now serialize their URL-derived publishedAt instead of null.",
	},
	{
		date: "2026-07-09",
		surfaces: ["api"],
		version: "openapi@1.7.9",
		type: "changed",
		summary:
			'Semantic-fallback honesty on searchProjects (audit R1): when NO keyword tier matches and results come from the vector fallback, meta.matchMode now says `semantic` (new enum value) with an honest matchModeLabel — previously it claimed `strict`/`majority` ("all keywords matched") over pure similarity guesses. Semantic rows\' confidence is now computed from the ABSOLUTE cosine band and hard-capped below `high` (max 0.7 / medium) — the top fallback guess no longer reads 0.9+ "high". meta.counts gains `semantic` (rows on this page served by the fallback).',
		detail:
			"Why: an agent consuming a confident wrong answer is worse off than with an empty set. Keyword-matched rows are unchanged. Additive/labeling change — no rows removed, ranking order unchanged (semantic adds still append below keyword hits). Consumers pinning matchMode enums should add `semantic`.",
	},
	{
		date: "2026-07-09",
		surfaces: ["api"],
		version: "openapi@1.7.8",
		type: "added",
		summary:
			"F7+F8 (audit root #8): cross-lane hints — empty or weak-match responses on searchProjects/searchRepos/searchResearch/getPartners now carry meta.hints pointing at the lane that answers ('code → /api/repos/search', 'providers → /api/partners'…); superlative queries ('biggest dex') get meta.superlativeNote stating result order is NOT a size/usage ranking; Project rows gain tvlUSD/tvlAsOf (DefiLlama, weekly refresh; null = not tracked, never zero).",
		detail:
			"Also: single-word camelCase known-item queries fixed (q=DeRisk missed the record named DeRisk — the raw joined form now participates alongside the split tokens; Engine A run-1 catch). Hints appear ONLY on empty/relaxed-tier responses — healthy strict results are unchanged.",
	},
	{
		date: "2026-07-09",
		surfaces: ["api"],
		version: "openapi@1.7.7",
		type: "changed",
		summary:
			"searchRepos ranking: Stellar evidence now ranks ABOVE raw keyword score (3-tier: code-verified/SDF/canonical > stellar-mentioned incl. README > no evidence) — org-swept other-chain repos no longer beat code-verified Stellar repos on niche verticals. Repo owner is now searchable (q=allbridge reaches allbridge-io/*). explainRepo gains an honesty guard: an unmapped question whose best search hit shares no query token returns the no-route response with nearest candidates as alternateRepos, instead of confidently explaining a lexical-noise repo.",
		detail:
			"Ranking-order change only — response shapes unchanged; no operation description text changed. Values re-rank immediately; 3 unit tests pin the policy.",
	},
	{
		date: "2026-07-09",
		surfaces: ["api"],
		version: "openapi@1.7.6",
		type: "added",
		summary:
			"searchResearch gains the `cap` source — Core Advancement Proposals (stellar-protocol/core) join the corpus at SEP-tier authority, closing the audit's biggest protocol-lane gap (CAP-number queries previously fell through to meeting-notes junk). Dev-docs ingestion also extended: the page cap no longer truncates ~400 reference pages (tokens/asset-issuance, validators, learn), and author/pagination junk URLs are excluded at the source.",
		detail:
			"New corpus content lands with the next scheduled refresh-research-corpus run. cap chunks are evergreen (no freshness decay), authority 1.0, filterable via ?source=cap.",
	},
	{
		date: "2026-07-09",
		surfaces: ["api"],
		version: "openapi@1.7.5",
		type: "fixed",
		summary:
			"getRfps: an SCF round in Submission phase is now served as a first-class OPEN row (id scf-round-N, category scf, links to the handbook + application page) — previously the live open-round fact existed only in meta.scfRound while every idea row read closed, so row-reading agents concluded no funding was open (observed in a live Raven session, reported by Emir/SDF).",
		detail:
			"Additive row, appears under status=open and default listings while a round is accepting submissions; disappears when the window closes. Daily self-audit now asserts the phase⇔row contract in both directions.",
	},
	{
		date: "2026-07-09",
		surfaces: ["api"],
		version: "openapi@1.7.4",
		type: "fixed",
		summary:
			"searchProjects semantic lane (F3, audit root #3): semantic-augmented rows now serialize `types` and `prominence` (previously always []/null — a projection bug); zero-keyword-hit queries (misspellings, slug forms) get a semantic RESCUE pass at a lower similarity floor instead of a dead total:0; keyword confidence now discriminates by match completeness (was a uniform ~0.97 across a page).",
		detail:
			"Rescue results are flagged by the existing meta.semantic; the calibrated 0.68 floor still guards augmentation on top of keyword results. Confidence values shift for partial matches (2-of-3 tokens now reads lower than a full match) — consumers sorting by confidence get honest ordering.",
	},
	{
		date: "2026-07-09",
		surfaces: ["api"],
		version: "openapi@1.7.3",
		type: "fixed",
		summary:
			"Search lexical core (F2, audit root #2): iterative stemming (donations/donate, savings/save, charities/charity now co-retrieve), currency NAMES map to stored codes ('kenyan shilling' → KES rows), relaxed match tiers must keep the intent-bearing rare token (generic verbs like buy/get/send can no longer be the only match — 'peruvian sol' no longer floods on 'sol'), repo symbol search handles digit-boundary identifiers (groth16, secp256r1, ed25519, ScVal). Builders: 'south america'/'central america' location umbrellas.",
		detail:
			"Values/recall only, no shape changes. matchMode semantics unchanged except loose-1/majority additionally require an anchor-token hit; all-generic queries behave as before.",
	},
	{
		date: "2026-07-09",
		surfaces: ["api"],
		version: "openapi@1.7.2",
		type: "fixed",
		summary:
			"searchProjects recall (F1, full-surface audit root #1): a record's `types` and `coverage.seps` now drive candidate INCLUSION, not just ranking — type-browse queries ('social impact projects', 'education', 'decentralized exchange') and SEP queries ('sep-24 anchors') retrieve records whose prose never says those words. getBuilders: `q` now matches githubUsername, and location accepts common non-English spellings (brasil, méxico).",
		detail:
			"The audit measured type-name retrievability at 3/15 (Social Impact) to 63/141 (SDK) because select fields were excluded from the candidate query; they now join via exact-membership clauses driven by the intent-type map (new browse vocabulary: exchange, education, analytics, dashboard, security, impact, ai, infrastructure). Additive recall only — existing results keep their ranking.",
	},
	{
		date: "2026-07-09",
		surfaces: ["skill"],
		type: "fixed",
		summary:
			"Scout skill api-reference caught up to the OpenAPI 1.7.x surface (stellar-scout#8): getPartners now documents the `ramps` filter and the typed Partner row (rampTypes/seps/assets/freshness/trust/verified); explainRepo and searchRepos document the full codeVerified block (symbols, sdkCapabilities, mainnetContractId) and the code-depth term in repoScore.",
		detail:
			"Skill prose is bundled by downstream agents as runtime guidance, so it lagging the spec meant agents missed callable capabilities. Synced to the Stellar-Light/stellar-scout mirror in the same change.",
	},
	{
		date: "2026-07-09",
		surfaces: ["api"],
		version: "openapi@1.7.1",
		type: "changed",
		summary:
			"searchResearch results are now trust-ranked and deduplicated: one best chunk per document, ordered by the confidence signal (relevance + freshness + authority) instead of raw retrieval score. Duplicate chunks of a single post no longer crowd the top-K, and semantically-close but stale docs (e.g. a 2022 never-productionized research protocol) no longer outrank current sources on consumer-intent queries.",
		detail:
			"Motivating case: 'bridge assets from EVM to Stellar' returned Starbridge (2022) chunks twice while CCTP/Allbridge content sat below the fold; now the top-K carries the Allbridge/Spectra/Tricorn bridge audits + CCTP-bearing integration docs. Response shape unchanged (raw `score` still returned per row); only ordering and per-document dedupe changed. Golden eval: 21/21 pre-existing research questions unchanged, new bridge-evm-to-stellar case added.",
	},
	{
		date: "2026-07-09",
		surfaces: ["api"],
		version: "openapi@1.7.0",
		type: "changed",
		summary:
			"Spec info.version bumped 1.6.1 → 1.7.0, covering the 2026-07-08/09 contract additions that shipped under an unchanged version: codeVerified.symbols/sdkCapabilities/mainnetContractId, Project.canonicalSlug/lifecycle/anchorProfile, typed Partner/PartnersResponse, and the getPartners `ramps` filter.",
		detail:
			"Going forward info.version bumps with every observable contract change (including description-only changes), so downstream catalogs can use it as a staleness signal instead of diffing the whole document.",
	},
	{
		date: "2026-07-09",
		surfaces: ["api", "api-client"],
		type: "fixed",
		summary:
			"getPartners gains a real `ramps` filter (`on-ramp` / `off-ramp`, comma-separated to require both; unknown values 400 with `validRamps`). CORRECTION: a fix-verification note on the public tracker cited `?ramps=on-ramp` as a probe before this param existed — the endpoint silently ignored it and returned the unfiltered set. The advertised contract is now the implemented contract.",
		detail:
			"Filters on the structured Partners.rampTypes capability field (the same data the `q` relevance scorer already weighted). meta.filters echoes `ramps`; meta.validRamps lists accepted values. Corridor lookups compose: ramps=on-ramp&q=mexico.",
	},
	{
		date: "2026-07-09",
		surfaces: ["api-client"],
		version: "@stellar-light/api-client@1.5.0",
		type: "added",
		summary:
			"api-client 1.5.0 published: regenerated types for spec 1.6.1 — codeVerified gains `symbols`, `sdkCapabilities`, `mainnetContractId`; Project gains `canonicalSlug`, `lifecycle`, restored `anchorProfile`; partners responses are now fully typed (Partner/PartnersResponse schemas).",
		detail:
			"Registry-verified: the published d.ts carries the new codeVerified fields. Consumers on 1.4.x see the new response fields as untyped extras; upgrade for autocomplete/type-safety on code-facts data.",
	},
	{
		date: "2026-07-09",
		surfaces: ["api", "api-client"],
		type: "fixed",
		summary:
			"codeDepth accuracy: tiered Stellar-path file selection fixes monorepo dilution for JS/TS repos (multi-chain SDKs/wallets whose Stellar integration files were displaced by bigger non-Stellar files now score on their actual Stellar code), and Rust workspace breadth now scales with evidenced-deep crates instead of raw declared-crate count (stub Cargo.toml padding no longer inflates depth).",
		detail:
			"Affected JS repos re-score on their next scan wave (multi-chain SDK/wallet monorepos — previously under-scored). No shape changes; values only. Answer-key gate now 12 JS deep + 14 shallow labels, margin 0.110.",
	},
	{
		date: "2026-07-09",
		surfaces: ["api", "api-client"],
		type: "changed",
		summary:
			"codeDepth for JS/TS dapps is now the calibrated jsDepth, not a flat 0.3. A repo's `codeVerified.codeDepth` now separates real Stellar integration (wallets, dapps, SDKs — 0.5-1.0) from boilerplate/templates (≤0.3) for js-sdk repos, using the same 0-1 scale as Rust contracts. Grounded in a 29-label adversarially-verified answer key + CI gate.",
		detail:
			"Only js-sdk-proof repos with actual JS sources are re-scored; Rust contracts, other-language SDKs, and non-code repos are unchanged. sdkCapabilities carries the underlying evidence. Populated as scan waves reach non-Rust repos (was uniformly 0.3 before).",
	},
	{
		date: "2026-07-09",
		surfaces: ["api", "api-client"],
		type: "added",
		summary:
			"JS/TS code facts (gist gap 1, phase 1): searchRepos + explainRepo codeVerified gains `sdkCapabilities` — Stellar SDK capability tags detected in a repo's actual JS/TS sources (tx-building, signing, soroban-rpc, sep10-auth, sep24-ramp, wallet-kit, passkey, …), and `symbols` now covers JS/TS exported surfaces when a repo has no Rust.",
		detail:
			"The dapp-depth fact set: 'real wallet integration vs boilerplate' is legible from which SDK calls appear. Closed tag enum; [] = not yet scanned post-2026-07-09 or no JS sources (scan-dated, not a negative). Scoring for non-Rust repos deliberately stays flat until a JS answer key is mined — these are facts, not judgments. Populated by scan waves.",
	},
	{
		date: "2026-07-09",
		surfaces: ["api", "api-client"],
		type: "fixed",
		summary:
			"Spec correction: `codeVerified.mainnetContractId` was mis-nested in the explainRepo response (a stray property under `content` instead of inside the schema — caught by spectral) and MISSING from the Repo component entirely. Now correctly placed in both; snapshot + client types regenerated.",
		detail:
			"No behavioral change to the live API — the served field was always correct; only the spec's description of it was wrong. Downstream catalogs regenerating from the spec pick up Repo.codeVerified.mainnetContractId as documented.",
	},
	{
		date: "2026-07-08",
		surfaces: ["api", "api-client"],
		type: "added",
		summary:
			"searchRepos codeVerified gains `mainnetContractId` — a README-claimed contract id the scanner VERIFIED to exist on Stellar mainnet (stellar.expert echo-check). Unfakeable deployment evidence: an address string is cheap, a live contract isn't. Verified deployment also weighs ~3x a bare address mention in codeDepth.",
		detail:
			"Populated by scan waves (fail-open: network problems never penalize; the response must echo the requested id, so garbage/empty ids can't false-verify). Null = no verified address, NOT 'not deployed'. Also part of scorer v3: sampling-aware breadth gate + education/demo example markers; the ground-truth answer key grew 20 → 66 verified labels (57 gating + 9 frontier) via a 111-agent adversarially-verified label-mining pass.",
	},
	{
		date: "2026-07-08",
		surfaces: ["api", "api-client"],
		type: "added",
		summary:
			"searchRepos results gain `codeVerified.symbols` — the public code-symbol surface (pub fn/struct/enum/trait names) extracted from each repo's scanned Rust sources. Search also MATCHES on them: 'escrow' now retrieves a repo whose code defines release_escrow/EscrowContract even if its README never says the word (weighted between name/topic and description hits).",
		detail:
			"Closes the structure≠semantics gap: the index knew a repo HAS a deployable contract, not WHAT it implements. Symbols are extracted offline from the same fetched sources the codeDepth scan reads (pub items only, plumbing names filtered, capped 60/repo, top 20 exposed), populated by scan waves — repos scanned before 2026-07-08 carry [] until rescanned. Empty symbols on a scanned repo is 'not yet rescanned', NOT 'no public API'.",
	},
	{
		date: "2026-07-08",
		surfaces: ["api", "api-client"],
		type: "added",
		summary:
			"Contract-as-code guarantee: the OpenAPI spec is now a committed snapshot (specs/openapi.json) and @stellar-light/api-client types are GENERATED from it; CI blocks any contract change that isn't announced in this changelog. Consumers can rely on: every schema/param/op change appears here, same release.",
	},
	{
		date: "2026-07-08",
		surfaces: ["mcp"],
		version: "@stellar-light/scout-mcp@1.1.8",
		type: "changed",
		summary:
			"get_partners `q` param description corrected: q is relevance-ranked by structured capability fit (assets/ramps/SEPs/country/services/region), not a literal name+description keyword search — the old text under-sold capability queries like 'USDC off-ramp Mexico'.",
	},
	{
		date: "2026-07-08",
		surfaces: ["api", "api-client"],
		type: "fixed",
		summary:
			"OpenAPI spec under-documented the live contract — CORRECTION: `Project.anchorProfile` was wrongly removed from the spec as 'never-implemented' (it IS served on Anchor-typed searchProjects rows and is now load-bearing for ramp queries); re-documented, plus `Project.canonicalSlug`, `Project.lifecycle`, and a full `Partner` component for getPartners (previously spec'd as a bare untyped object).",
		detail:
			"anchorProfile is the integration-oriented ramp profile joined from the partner directory ({slug,country,regions,assets,seps,rampTypes,asOf,url}; seps [] + non-empty rampTypes = proprietary ramp API rather than SEP-6/24). canonicalSlug = duplicate-lineage pointer; lifecycle = historical-archive context. The new Partner component documents all 31 live row fields incl. the system-computed `verified`/`trust`/`freshness` objects. Downstream catalogs generated from the spec (e.g. schema-drift detectors) should see this as ADDITIVE schema drift only — no ops/params/routing text changed. Prevention: the daily api-drift guard now asserts live-response field coverage (every field a live row serves must be documented in its spec component), so under-documentation is caught by our CI before any consumer's drift detector.",
	},
	{
		date: "2026-07-08",
		surfaces: ["api", "mcp", "api-client"],
		type: "fixed",
		summary:
			"searchProjects now retrieves on STRUCTURED truth, not just prose. A record's `types` and curated `coverage` (countries/currencies/SEPs) are searchable + drive INCLUSION, so a generic 'Mexico on-ramp MXN' query surfaces Etherfuse (coverage MXN/Mexico; prose about Stablebonds) and 'DEX AMM swap liquidity pool' surfaces Sushi (type=DEX; desc says 'liquidity provision', not 'pool') (sls-018, sls-019).",
		detail:
			"Root cause: the candidate query + scoring read only name/description/category, so structured coverage — the exact fields built for corridor queries — was invisible to search, and a strict-AND near-miss dropped a category match for lacking one prose word. Fix (src/lib/project-search-match.ts, unit-tested): coverage values (+ implied anchor/ramp vocabulary for any covered record) and types/supportedNetworks fold into the searchable haystack; a project that IS the queried category or whose coverage serves a queried country/currency is admitted one match-tier looser (structured truth > one extra word); a corridor coverage hit under ramp intent bypasses the tier entirely. Precision-gated: the corridor bypass fires only on ramp/anchor intent + a literal coverage-value match, so topic queries don't over-recall. New known-item recall guard in the daily self-audit (scripts/self-audit.ts) asserts Etherfuse/Sushi/Soroswap stay retrievable — the class, not just the two instances.",
	},
	{
		date: "2026-07-08",
		surfaces: ["api", "api-client"],
		version: "@stellar-light/api-client@1.4.0",
		type: "added",
		summary:
			"searchProjects results now carry structured `coverage` {countries, currencies, seps, asOf} for Anchor-typed projects (sls-012) and `supportedNetworks` [] (sls-017) — corridor/chain questions become filterable + dated instead of prose-mined. getHackathon detail adds `prizeTiers` [] {place, rank, amountUSD, asset} parsed from the prize prose (sls-016).",
		detail:
			"coverage is synced from the matching partner record (SEPs/currencies/country), null for non-anchors; ~16 anchor projects populated (e.g. bitso → MXN/BRL/ARS/COP/USD, mykobo → SEP-6/24/31·EUR). supportedNetworks distinguishes a multichain wallet's omission from a negative (LOBSTR = [stellar, xrpl]). prizeTiers joins to winners via placementRank (empty when a hackathon has no itemized split). OpenAPI Project schema reconciled: the never-implemented `anchorProfile` field was removed in favor of the real `coverage`/`supportedNetworks`. api-client 1.4.0 regenerated from the live spec.",
	},
	{
		date: "2026-07-08",
		surfaces: ["api"],
		type: "fixed",
		summary:
			"getPartners and getBuilders free-text `q` are relevance-matched, not strict all-token substring. getPartners routes `q` through the shared matchmaker scorer (weighted by assets/ramps/SEPs/country/region) — 'USDC off-ramp' in LatAm went 1 → 6 results. getBuilders `q` gains synonym + singular/plural stem expansion (payments ↔ boleto/PIX/remittance) (sls-010).",
		detail:
			"Found by dogfooding our own MCP tools with natural questions: the list endpoints used tokens.every(hay.includes) so adding keywords returned FEWER results, and structured capability fields never counted. getPartners now reuses scorePartners (the concierge engine); a latent region bug where 'usd' inside 'USDC' mis-gated queries to North-America was fixed with word-boundary matching (regression-tested). getBuilders q=payments in Brazil went 1 → 2. Ranking-only change; no param/shape changes.",
	},
	{
		date: "2026-07-06",
		surfaces: ["api"],
		version: "openapi 1.6.1",
		type: "fixed",
		summary:
			"sls-014: getRfps meta.scfRound is now LIVE (6h revalidate from communityfund.stellar.org/awards' embedded award_rounds payload) — no more stale-at-birth round state. sls-015: searchProjects description scopes its product name-drops to directory facts (editorial/analysis content belongs to content platforms).",
		detail:
			"scfRound previously shipped as a hand-curated constant that asserted 'no round confirmed open' while the cited source showed SCF #45 in Submission (sls-014). It now parses the awards page's structured round data (roundNumber/phase/submission deadline) on a 6-hour revalidate, adds currentPhase + roundsInProgress + source:'live'|'unavailable', and enforces the invariant: on fetch failure the note says the live check failed and points at verifyAt — it never asserts a negative. sls-015: the searchProjects operation description's named-product mentions (Etherfuse Stablebonds, Soroswap, explorers) are now explicitly bounded to directory facts, per the finding that agents read them as routing claims for editorial questions. DESCRIPTION CHANGE — downstream routing catalogs should re-baseline after ingesting (the change was requested by the downstream eval itself).",
	},
	{
		date: "2026-07-06",
		surfaces: ["api"],
		version: "openapi 1.6.0",
		type: "changed",
		summary:
			"getPartners default results now pass a directory quality bar (tagline + contact path, non-archived) with the pilot cohort sorted first; new all=1 param returns the unfiltered set. New `pilot` boolean on partner entries.",
		detail:
			"The partner directory default view now shows only complete, non-archived profiles — most seeded rows were placeholder-thin (no tagline) and read as noise to consumers. Pass all=1 for every published partner (the previous behavior). Sort is pilot-first, then freshness. Additive param + response field; the getPartners operation DESCRIPTION is unchanged (routing-neutral for downstream catalogs — only the default result set is curated, a data-quality improvement). Archived (owner-confirmed dead) partners stay reachable at /api/partners/{slug} with freshness.status=archived.",
	},
	{
		date: "2026-07-06",
		surfaces: ["api"],
		version: "openapi 1.5.0",
		type: "added",
		summary:
			"codeVerified block on repos — code-truth from analyzing each repo's ACTUAL source (stellarProof, codeDepth, deployable-contract, soroban-sdk version status). The discriminator between a popular repo and real, current, deep Soroban code.",
		detail:
			"search_repos results and explain_repo now carry a codeVerified object: stellarProof (how we know it's Stellar — cargo-sdk/contract-macros/lang-sdk/js-sdk/stellar-toml), codeDepth (0-1 substance of the contract logic, not stars), isDeployableContract (Cargo cdylib), sorobanSdkVersion + versionStatus (current/supported/deprecated/unknown vs the latest protocol). Derived by scanning the repo's Cargo.toml + source through a shared, tested pipeline; codeDepth also feeds repoScore so code-verified deep contracts outrank starred-but-shallow ones. null until a repo is code-scanned (honest — we never claim verification we haven't done). ADDITIVE + routing-neutral: new response fields only, no operation added/removed, no operation-description changes.",
	},
	{
		date: "2026-07-05",
		surfaces: ["api"],
		version: "openapi 1.4.5",
		type: "fixed",
		summary:
			"Data-quality fixes from an adversarial recheck of the sls-* feedback items: hackathon winner ranking (i18n placement parsing), name-search over-fire, blog chunk hygiene, funding count basis, and JSON errors on the skill-detail route.",
		detail:
			"sls-005: placementRank now parses Spanish ordinals + emoji medals and reads the award title, so LatAm/emoji hackathons rank correctly and genuine flat-pool events honestly report winnersRanked=false (was wrong in both directions). sls-009: only an EXACT name/slug match dominates authority now — prefix/whole-word matches drop to a late tiebreaker, so a generic query like 'swap' no longer ranks a 0-prominence 'SwapX' above flagship Soroswap. sls-006: SDF-blog nav/footer boilerplate is stripped at ingest and metadata/related-post stubs are dropped, so retrieval returns article prose not chrome (re-crawl pending). sls-013: countBasis now states byRound[].count is per-round membership (non-additive). sls-011: /api/projects/search meta carries scfCountBasis where the SCF numbers appear. sls-004: /api/skills/{slug} is force-dynamic (GET still CDN-cached via headers) so non-GET returns JSON 405, not a plaintext Vercel error. Schema-only/additive + behavior fixes — no operation-description changes (routing-neutral).",
	},
	{
		date: "2026-07-04",
		surfaces: ["api"],
		version: "openapi 1.4.4",
		type: "changed",
		summary:
			"searchResearch description trim (routing hygiene): the 1.4.0 'Soroban security practice' phrasing ('vulnerability classes auditors find', 'audit findings') was lexically strong enough to capture how-to/checklist questions that belong to the ecosystem SKILLS lane in downstream routers. Reworded to 'Soroban security incidents — reentrancy, soroban-sdk advisories/CVEs, denial-of-service' — topical coverage kept, tutorial-shaped phrasing removed.",
		detail:
			"Measured on the lexical spec-routing eval before shipping: the stolen skills case routes back to its skill (skills lane restored to its floor) with ZERO scout top-1 losses — all 1.4.0 routing gains hold (legacy 232/338). Downstream catalogs that gate on routing baselines: after ingesting, the only remaining swing vs a 2026-07-03 baseline is the +10 legacy improvement — re-baseline upward.",
	},
	{
		date: "2026-07-03",
		surfaces: ["api"],
		version: "openapi 1.4.3",
		type: "added",
		summary:
			"Anchor corridor data goes structured (sls-012): Anchor-typed rows in `/api/projects/search` now carry `anchorProfile` — country, regions, asset codes, supported SEPs, ramp types, and an asOf date — joined from the partner directory's stellar.toml enrichment. 'Which anchors serve corridor X→Y' becomes filterable, dated evidence instead of prose-mining shortDescriptions.",
		detail:
			"Single source of truth: the data lives on partner records (already exposed at /api/partners) and is joined by normalized name at read time — null when no partner record matches. Cite anchorProfile.asOf as the coverage as-of date.",
	},
	{
		date: "2026-07-03",
		surfaces: ["api"],
		version: "openapi 1.4.2",
		type: "fixed",
		summary:
			"SCF funding data made reconcilable (sls-011/013): `/api/projects/search` rows gain `scfAwardedRounds` (e.g. [2, 17, 22] — rounds are authoritative; dollar totals are in-house reconstructions and can differ between aggregators, reconcile on rounds). `/api/analyze` funding dimension: `byRound` now actually populates (read the wrong field name since launch), amounts apportioned equally across a project's rounds instead of double-counted, `postHackathonStatusFunnel` scoped to hackathon-linked projects (was counting all 890 projects as Unknown via an unselected field), and the block gains `computedAt` + `methodologyVersion` + `countBasis` so metric swings are explainable.",
		detail:
			"countBasis states it explicitly: we count distinct PROJECTS (SDF's site counters count SUBMISSIONS — totals differ by design), and SCF doesn't publish per-award amounts for all rounds, so no cumulative dollar figure is official. Present computedAt alongside any quoted total.",
	},
	{
		date: "2026-07-03",
		surfaces: ["api"],
		version: "openapi 1.4.1",
		type: "changed",
		summary:
			"Four consumer-reported fixes (sls-007/009/010 + repo-search hygiene): `/api/projects/search` now ranks exact/prefix/whole-word NAME matches above all authority signals (q='Blend' returns Blend first, not a higher-authority keyword match); `/api/builders` `location` accepts region umbrellas (Latin America/LatAm, Africa, Asia, Europe → expanded to the country values profiles carry); `/api/rfps` meta gains `scfRound` (currentRound, lastConfirmedRound, submissionWindow, asOf, verifyAt — curated, null when unconfirmed rather than guessed); repo-search term matching moves to two-sided word boundaries (kills mid-word substring noise).",
		detail:
			"Name-lookup is the standard directory contract: exact=3/prefix=2/whole-word=1 dominates prominence/SCF authority in the keyword path. scfRound fields are curated because SCF publishes no machine-readable round feed — always present asOf with round answers. All changes additive or ranking-behavior only; no fields removed.",
	},
	{
		date: "2026-07-03",
		surfaces: ["api"],
		type: "changed",
		summary:
			"`/api/projects/search` region-umbrella synonyms: queries with 'LatAm' now also match records described with country vocabulary (Brazil, Mexico, Argentina, Colombia, Chile, Peru) — likewise 'Africa', 'Asia', 'Europe'. 'LatAm asset issuers' now surfaces PagFinance/CashAbroad-class projects whose records name countries, not regions.",
		detail:
			"Search behavior only — no paths, params, response shapes, or operation descriptions changed. Prompted by a live agent query that missed country-described projects on a region-worded question.",
	},
	{
		date: "2026-07-03",
		surfaces: ["api"],
		version: "openapi 1.4.0",
		type: "changed",
		summary:
			"Routing-guidance enrichment round 2 (info.version → 1.4.0): seven discovery operations' descriptions gained real-user topic vocabulary — searchResearch (SCF application process/Instawards/review timeline, Soroban security practice: reentrancy/CVEs/DoS classes, ecosystem history: Protocol 20 launch/XLM supply/UNHCR/Enterprise Fund, asset listing, contract verification), searchProjects (wallets/anchors/NFT marketplaces/perps/explorers/market map), searchRepos (streaming payments, ZK verifiers, passkey smart wallets, SDK/CLI versions, OZ RWA), getRfps (current-round + closed-RFP checks), getBuilders (by region/stack), getClusters (market-map/whitespace), analyzeEcosystem (TVL rollups).",
		detail:
			"Description text only — no paths, params, or response shapes changed. Measured on the lexical spec-routing eval: scout top-1 53.7%→66.3% (legacy lane) and 72%→84% (real-user lane, top-3 100%), overall +10 cases, zero hard per-case regressions (every strict flip is a case whose accepted-services set already includes scout). Downstream catalogs that gate on routing baselines should re-baseline after ingesting.",
	},
	{
		date: "2026-07-03",
		surfaces: ["api"],
		version: "openapi 1.3.3",
		type: "added",
		summary:
			"Three consumer-reported contract fixes: `/api/hackathons/{slug}` gains `winnersRanked` (true = winners array is placement-sorted; false = tier-labeled winners, array order meaningless — placementRank is the only ordering signal); `/api/projects/search` rows gain `scfAmountStatus` ('undisclosed' = award confirmed but amount unpublished, vs 'disclosed'/null — stop guessing on null amounts); and method misuse on every public endpoint now answers a JSON 405 with an Allow header instead of an empty non-JSON body.",
		detail:
			"Addresses downstream integration findings sls-002 (ambiguous null SCF amounts), sls-004 (non-JSON error responses), and sls-005 (tier winner arrays read as rankings). All additive.",
	},
	{
		date: "2026-07-03",
		surfaces: ["api", "mcp"],
		version: "openapi 1.3.2",
		type: "added",
		summary:
			"Dated freshness on answer surfaces: `/api/repos/explain` now returns `repoMeta` (lastCommitAt, stars, isArchived, repoScoreLabel of the routed repo) so grounded answers carry an as-of date; `/api/projects/search` rows gain `lastActivityAt` (most recent commit across the project's own repos) and each inline repo ref now includes `lastCommitAt`. Also: scout-mcp's search_research `source` enum adds the missing 'incident' value (MCP ⇄ API parity).",
		detail:
			"Attach repoMeta.lastCommitAt / lastActivityAt as the as-of date when citing answers instead of asserting undated facts. All changes additive — no field removed or renamed.",
	},
	{
		date: "2026-07-02",
		surfaces: ["api"],
		version: "openapi 1.3.1",
		type: "added",
		summary:
			"`/api/projects/search` results now carry `builtBy` — the organization/entity behind each project ('who built LOBSTR?' → Ultra Stellar; Soroswap → Paltalabs), null when no org is linked. Also: the `status` enum gains 'Inactive' (defunct/archived projects stay name-searchable but are heavily down-ranked and excluded from the leaderboard/directory — e.g. Keybase).",
		detail:
			"Attribution is resolved from the curated entities collection (one org per project). Sort/present with builtBy for 'who is behind X' questions instead of guessing from project descriptions.",
	},
	{
		date: "2026-07-02",
		surfaces: ["api"],
		version: "openapi 1.3.0",
		type: "changed",
		summary:
			"OpenAPI routing overhaul (info.version → 1.3.0): every discovery operation's description now enumerates its answerable topics with real ecosystem vocabulary — searchResearch (compliance/Travel Rule, bug bounties, incidents/post-mortems, SCF governance, SDF, SCP history, ambassador programs), searchProjects (NFT/RWA/lending/wallets/anchors + 'who built X'), searchRepos (OpenZeppelin, SEP-41, fuzz testing), getBuilders (recruit/hire), getRfps/getClusters/analyzeEcosystem. Write ops carry `x-side-effecting: true` so consumers classify them without parsing prose.",
		detail:
			"Measured against a lexical spec-routing eval: routing a corpus of real builder questions to the correct operation jumped from 31.6% to 50.5% top-1 and 67.4% to 85.3% top-5. `info.version` is bumped on ANY additive path/description change so drift consumers can diff the version string, not just paths.",
	},
	{
		date: "2026-07-02",
		surfaces: ["api"],
		type: "added",
		summary:
			"Partner pipeline is real: new `POST /api/partners/submit-listing` (creates a reviewed draft partner account — or a claim request when the company is already listed), and the previously undocumented `POST /api/partners/match`, `/assistant`, and `/onboard` are now in the OpenAPI spec with operationIds.",
		detail:
			"All partner AI endpoints degrade to 503 `unavailable:true` without an AI backend — fall back to GET /api/partners filters. Concierge-surfaced partners are logged as leads and delivered in a weekly partner digest.",
	},
	{
		date: "2026-07-02",
		surfaces: ["api"],
		type: "added",
		summary:
			"OpenAPI polish: every operation now carries an `operationId` (`getStatus`, `searchProjects`, `explainRepo`, `submitFeedback`, etc. — matches the api-client method names). Added the missing `Repos` global tag. Every path now has full 'Use when / Not for' routing text (4 remaining ops closed).",
		detail:
			"Result: Spectral (spectral:oas ruleset) lints the spec at 0 errors / 0 warnings, and codegen tools (openapi-typescript, orval, kiota) emit predictable method names that match `@stellar-light/api-client`.",
	},
	{
		date: "2026-07-01",
		surfaces: ["mcp"],
		version: "scout-mcp@1.1.5",
		type: "added",
		summary:
			"Two new MCP tools — `get_partners` (the ecosystem partner directory) and `get_changelog` (this feed) — so MCP-transport agents reach the same surface as the REST API + typed client. 18 tools total.",
	},
	{
		date: "2026-07-01",
		surfaces: ["api", "api-client"],
		type: "fixed",
		summary:
			"Response-shape drift reconciled with the OpenAPI spec: documented `/api/projects/search` item `confidence`/`repos`/`via`, `/api/repos/search` `meta.canonical`/`meta.note`, and `/api/repos/explain` `meta`. `/api/repos/explain` now always returns `answered`/`sources`/`alternateRepos` (even when nothing routes). `/api/status` adds `apiVersion` (tracks the OpenAPI `info.version`); the two no longer drift.",
	},
	{
		date: "2026-07-01",
		surfaces: ["api"],
		type: "fixed",
		summary:
			"Hackathon `placementRank` now parses word ordinals ('First/Second/Third Place'), so events like `build-on-stellar` return the real 1st-place winner as `winners[0]` (was scrambled). And source-unranked winners now carry `placementRank: null` instead of a leaked `9999` sentinel.",
		detail:
			"Corrects the 2026-06-30 placementRank entry: `winners[0]` is the 1st-place entry only when the event has ranked placements. For a flat 'Winners' bucket (many DoraHacks events), every winner is `placementRank: null` and order is not significant — check for null rather than assuming winners[0] is 1st.",
	},
	{
		date: "2026-06-30",
		surfaces: ["api"],
		type: "added",
		summary:
			"`GET /api/partners` is now populated — 24 curated ecosystem partners (5 audit firms + 19 anchors), filterable by `?type` / `?sector` / `?region` / `?q`. Was previously empty.",
		detail:
			"Curated seed data (`verified:false`); partners can claim + enrich via the portal. Use for 'who should audit my contract' / 'find an anchor' discovery. Audit firms: Veridise, OtterSec, Runtime Verification, Certora, Halborn.",
	},
	{
		date: "2026-06-30",
		surfaces: ["api"],
		type: "changed",
		summary:
			"Every public `/api` endpoint now returns `X-API-Version: 1` and permissive CORS (`Access-Control-Allow-Origin: *`) uniformly — cross-origin/browser agents can call any endpoint and version-pin consistently.",
	},
	{
		date: "2026-06-30",
		surfaces: ["api"],
		type: "fixed",
		summary:
			"`/api/analyze` `categories.totalProjects` reconciled to the active-project count (~888) with an explicit `scope` label — was a stale 500. Intentionally differs from `/api/status`, which counts the full collection.",
	},
	{
		date: "2026-06-27",
		surfaces: ["api", "skill"],
		type: "fixed",
		summary:
			'`/api/skills` no longer advertises a stale "14 tools" count for Scout MCP — reconciled with the shipped tool set (16 after `explain_repo`).',
	},
	{
		date: "2026-06-30",
		surfaces: ["api"],
		type: "fixed",
		summary:
			"Hackathon detail winners are now sorted by placement and carry a numeric `placementRank` (1 = best) where the source provides an ordinal, so `winners[0]` is the 1st-place entry. Previously the array was scrambled with only a string label, making winner-order claims ungroundable.",
		detail:
			"Applies to both the DoraHacks-feed and curated/DB winner paths. Sort/filter on `placementRank` instead of parsing the `hackathonPlacement` string. (See the 2026-07-01 entry: unranked winners carry `placementRank: null`.)",
	},
	{
		date: "2026-06-30",
		surfaces: ["api"],
		type: "fixed",
		summary:
			"`/api/repos/explain` degrades gracefully when DeepWiki hasn't indexed a repo — returns `answered:false` + the routed authoritative repo, instead of surfacing DeepWiki's \"Repository not found\" error as if it were an answer.",
	},
	{
		date: "2026-06-30",
		surfaces: ["api", "mcp"],
		version: "scout-mcp@1.1.4",
		type: "added",
		summary:
			"Repo intelligence — deep code answers. Infra/protocol questions now route to the authoritative repo (error/result codes, consensus/SCP, XDR → stellar-core; Horizon → stellar/go; RPC → stellar-rpc) and `explain_repo` / GET /api/repos/explain returns a source-grounded answer pulled from DeepWiki — the actual answer, not just a link.",
		detail:
			"search_repos now floats curated canonical SDF repos to the top for infra queries and adds a `deepWikiUrl` to every result. The new `explain_repo` MCP tool + /api/repos/explain endpoint pair our routing with DeepWiki's repo Q&A: our index picks WHICH repo is authoritative, DeepWiki explains WHAT'S INSIDE. 16 MCP tools total.",
	},
	{
		date: "2026-06-27",
		surfaces: ["api", "mcp", "skill"],
		version: "scout-mcp@1.1.3",
		type: "changed",
		summary:
			"Every tool/endpoint description rewritten to be use-case-driven — each states when to use it and which sibling tool to use instead — so agents pick the right tool instead of calling all of them. Added GET /api/changelog (this feed).",
		detail:
			"Disambiguates the confusable clusters (search_projects vs search_repos vs search_research; the three hackathon tools; clusters vs leaderboard vs analyze). Kept consistent across the MCP, OpenAPI, and skill docs.",
	},
	{
		date: "2026-06-23",
		surfaces: ["api", "mcp", "api-client"],
		version: "scout-mcp@1.1.2, api-client@1.2.1",
		type: "removed",
		summary:
			"Dropped the dead `scfTier` and `featured` builder filters — they were advertised but unseeded, so they could never match.",
		detail:
			"Removed from /api/builders, the filter-miss advisory, the OpenAPI spec, the MCP `get_builders` tool, and the typed client. The working builder filters are `q`, `location`, and `skill`. `scfTier` remains a response field on each builder.",
	},
	{
		date: "2026-06-22",
		surfaces: ["api", "skill"],
		version: "openapi 1.2.0",
		type: "fixed",
		summary:
			"Declared enums are now enforced: `projects/search.category`, `leaderboard.format`, and `clusters.dimension` return `400 + validX` on invalid values instead of silently accepting them.",
		detail:
			"Added matching drift-guard assertions so the daily CI check now also tests invalid-value rejection, not just spec⇄live⇄doc agreement.",
	},
	{
		date: "2026-06-20",
		surfaces: ["api", "mcp", "api-client", "skill"],
		version: "scout-mcp@1.1.0",
		type: "added",
		summary:
			"New `/api/repos/search` — an indexed-and-scored Stellar GitHub repo / code-reference index — plus the `search_repos` MCP tool (the 15th tool).",
		detail:
			"Searches ~1,900 Stellar ecosystem repos by tech/keyword, ranked by `repoScore` (freshness + traction + hackathon/SCF/builder authority). The same graded repos are injected inline into `/api/projects/search` as `codeReferences`.",
	},
	{
		date: "2026-06-19",
		surfaces: ["api"],
		type: "changed",
		summary:
			"`/api/clusters` accepts a value filter (e.g. `?category=RWA`); `/api/leaderboard` now reports real per-project GitHub stars; `/api/builders` enriched from GitHub (bio/location/website).",
	},
];
