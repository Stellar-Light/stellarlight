/** READ-ONLY by default. Targeted, owner-reviewed edits to project records —
 * the projects counterpart to curate-partners.ts. Only touches the exact slugs
 * listed below; never bulk-edits.
 *
 *   pnpm exec tsx scripts/data/curate-projects.ts            # dry run
 *   pnpm exec tsx scripts/data/curate-projects.ts --execute  # writes
 *
 * DESCRIPTION_FIXES — overwrite shortDescription for a specific slug. Used to
 * close directory-omission findings where a record's prose is stale/incomplete
 * (e.g. sls-017: LOBSTR's record omitted its XRP Ledger support, so a consumer
 * synthesizing from directory data alone concluded "Stellar-only" by omission).
 * Every value is grounded in the provider's own current site copy — no
 * fabrication.
 */
import "../load-env";
import { getPayload } from "payload";
import configPromise from "../../src/payload.config";
import {
	ALIAS_ADD,
	DESCRIPTION_FIXES,
	DOCS_LINKS,
	GITHUB_REPOS_ADD,
	NAME_FIXES,
	PROMINENCE_SET,
	SEEDS,
	STATUS_FIX,
	STATUS_SOURCE_BACKFILL,
	STATUS_SOURCE_RETRACT,
	TYPE_ADD,
	TYPES_ADD,
	TYPES_SET,
	WEBSITE_FIXES,
	WEBSITE_REMOVE,
} from "./curation-maps";

const EXECUTE = process.argv.includes("--execute");

/** links.github corrections — equality-guarded overwrites for records whose
 * repo link points at the WRONG place (org renames, project splits). */
const GITHUB_LINK_FIX: Record<string, string> = {
	// org renamed AquaToken→AquariusDeFi (old page is an empty shell)
	aquarius: "https://github.com/AquariusDeFi",
	// registry split out of scaffold-stellar into its own org 2026-05-19;
	// the old link now literally shows a different product's code
	"stellar-registry": "https://github.com/stellar-registry/contracts",
	// Row-facts 2026-09-05: SCF-seeded row (SCF #44 Build) with no links. The
	// SCF project page links the author (github.com/NibrasD); the author's
	// Stellar-VRF repo (BLS12-381 VRF + drand for Soroban, pushed 2026-08-21)
	// is the row's own subject ("ECVRF plus Drand verifiable randomness for
	// Soroban contracts"). The SCF-linked frontend
	// (soroban-vrf-frontend.onrender.com) answers 503 "Service Suspended".
	"vrf-soroban": "https://github.com/NibrasD/Stellar-VRF",
};

// raven#8 / sls-018 (data half): multi-product projects are indexable under
// EVERY capability they demonstrably have, not a single dominant category.
// ADDITIVE — merges into `types`, never removes. Grounded in the provider's
// own products (Etherfuse FX = a live Mexico on/off-ramp API).
/**
 * SCF Public Goods Award recipients — CSV-CONFIRMED rounds only (pg-atlas-
 * frontend Airtable exports, Status=Awarded). Merged proposal PRs are NOT
 * award proof (rejected proposals get merged too); Q2'26 outcomes live on
 * Tansu and are excluded until readable. Recon 2026-07-20: 17 proposal
 * projects, 12 CSV-confirmed awardees, 10 with CERTAIN directory slugs
 * (the Soneso Flutter base SDK has no directory record; Hardware Wallet
 * Support is a multi-repo workstream with no dedicated record).
 */
/**
 * SCF award-linkage repairs (raven sls-058 / our #744) — legacy-era awards the
 * automated pipeline structurally cannot see.
 *
 * Both projects are marked scfAwarded:false while their OFFICIAL submission
 * records say Awarded. Root cause isn't a scrape bug: neither project appears
 * on communityfund.stellar.org/projects AT ALL (verified 2026-07-28 — zero
 * hits for either name in the listing HTML), and that listing is the entire
 * comparison population for both the ingest and the scf-crosscheck detector.
 * A legacy award attached to a project absent from the listing is invisible
 * to every listing-derived check — the UNDERSTATED class exists and simply
 * never gets to run on these rows.
 *
 * So these are asserted here, each backed by its official submission record
 * (fetched and read 2026-07-28, award name + amount + round confirmed on the
 * page). scf-crosscheck carries the same entries as CURATED_LEGACY_AWARDS and
 * re-verifies BOTH sides on every run — the official page still says Awarded,
 * and our API actually serves it — so a silent revert or a source change
 * pages us instead of waiting for Raven's next eval round.
 *
 * DISCIPLINE for adding entries: only from a communityfund.stellar.org
 * submission record you have OPENED and READ (award name, amount, round).
 * Never from a project's own site, a tweet, or memory — this is money data,
 * the single most-cited SCF fact.
 */
const SCF_LEGACY_AWARDS: Record<
	string,
	{ round: number; usd: number; award: string; evidence: string }
> = {
	sstream: {
		round: 16,
		usd: 36_000,
		award: "Legacy v4.0 Award",
		evidence: "https://communityfund.stellar.org/submissions/recnfJhEt3t2QogUI",
	},
	wagelink: {
		round: 24,
		usd: 50_000,
		award: "Legacy v5.0 Activation Award",
		evidence:
			"https://communityfund.stellar.org/project/wagelink-sdp-integration-i2b",
	},
};

/** SCF submission linkage from the 2026-08-31 absence review
 * (docs/SCF-SEED-REVIEW-2026-08-31.md). Promote-only, rounds WITHOUT
 * amounts: every entry's evidence is its SCF project page, opened and read
 * during the review — the page proves the submission and its rounds, but
 * per-round dollar figures are the crosscheck lanes' job and are never
 * invented here. Merges awarded:true + rounds; never removes, never touches
 * totals. Rows listed with "?" rounds in the review are deliberately absent. */
const SCF_SUBMISSION_LINKS: Record<
	string,
	{ rounds: number[]; evidence: string }
> = {
	// the 19 approved creates (seeded this run — SEEDS runs first)
	loop: {
		rounds: [40],
		evidence:
			"https://communityfund.stellar.org/project/loop-cashback-everywhere-with-stellar-zom",
	},
	"crediolabs-ai": {
		rounds: [44],
		evidence: "https://communityfund.stellar.org/project/crediolabsai-ut9",
	},
	policywright: {
		rounds: [42, 44],
		evidence: "https://communityfund.stellar.org/project/policywright-j8x",
	},
	"vrf-soroban": {
		rounds: [44],
		evidence: "https://communityfund.stellar.org/project/vrf-soroban-8yl",
	},
	komet: {
		rounds: [28, 30],
		evidence:
			"https://communityfund.stellar.org/project/komet-formal-verification-o0s",
	},
	"roberto-sanz-criptomonedas": {
		rounds: [22, 24],
		evidence: "https://communityfund.stellar.org/project/social-podcast-ini",
	},
	janus: {
		rounds: [45],
		evidence: "https://communityfund.stellar.org/project/janus-m2t",
	},
	// kutana/sendana rounds corrected 2026-09-01 (crosscheck roundsOverstated,
	// verified by hand against the pages' per-submission verdicts): the review
	// read the top badge list, which includes NOT-awarded submission rounds —
	// the documented buildAwardRounds trap, entered through the manual lane.
	// kutana: #38/#39/#43/#44 submissions read "Not Awarded"/"Panel Review
	// Failed"; the #45 submission ($97k budget = the page's totalAwarded,
	// totalPaid $9.7k) is the award. Same shape for sendana ($100k/#45).
	kutana: {
		rounds: [45],
		evidence: "https://communityfund.stellar.org/project/kutana-9ti",
	},
	// sorted/crebit corrected 2026-09-01 (post-enrich sweep of the same
	// badge-inheritance class): crebit #44 is affirmatively "Not Awarded";
	// sorted #44 is neutral Pre-Screen but the page's own arithmetic proves
	// it contributed nothing (totalAwarded $150k equals the #45 budget
	// alone). Both awards are #45; enrich already wrote the rows — these
	// entries just stop the union-merge from resurrecting the dead rounds.
	sorted: {
		rounds: [45],
		evidence: "https://communityfund.stellar.org/project/sorted-jqh",
	},
	sendana: {
		rounds: [45],
		evidence: "https://communityfund.stellar.org/project/sendana-axa",
	},
	"account-demolisher": {
		rounds: [29, 41, 44],
		evidence:
			"https://communityfund.stellar.org/project/account-demolisher-bfe",
	},
	etesia: {
		rounds: [44],
		evidence: "https://communityfund.stellar.org/project/etesia-rgj",
	},
	"nouns-builder-protocol": {
		rounds: [44],
		evidence:
			"https://communityfund.stellar.org/project/nouns-builder-protocol-ae7",
	},
	yolat: {
		rounds: [44],
		evidence: "https://communityfund.stellar.org/project/yolat-bl5",
	},
	crebit: {
		rounds: [45],
		evidence: "https://communityfund.stellar.org/project/crebit-rate-locks-ril",
	},
	pagcrypto: {
		rounds: [42],
		evidence:
			"https://communityfund.stellar.org/project/regulated-brl-settlement-for-fx-and-institutional-payments-on-stellar-2vu",
	},
	// upesa/verseprop rounds corrected 2026-09-01 (same badge-inheritance
	// class as kutana/sendana, caught at slug-override verification): the
	// pages affirmatively verdict upesa #41 and verseprop #31/#32 "Not
	// Awarded"; the awards are #42 and #33 ("Awarded" cards, $86k / $112,020).
	upesa: {
		rounds: [42],
		evidence: "https://communityfund.stellar.org/project/liquid-by-upesa-dvq",
	},
	fxdao: {
		rounds: [13],
		evidence: "https://communityfund.stellar.org/project/fxdao-xov",
	},
	// the duplicates whose rounds the review read off their SCF pages
	verseprop: {
		rounds: [33],
		evidence:
			"https://communityfund.stellar.org/project/a-real-estate-tokenization-platform-ss1",
	},
	ctx: {
		rounds: [19, 41],
		evidence:
			"https://communityfund.stellar.org/project/prices-api-rfp-ctx-1vo",
	},
	inferera: {
		rounds: [41],
		evidence:
			"https://communityfund.stellar.org/project/soroban-disassembler-working-title-ply",
	},
	simbolik: {
		rounds: [41],
		evidence:
			"https://communityfund.stellar.org/project/advanced-debugging-for-soroban-contracts-5sr",
	},
	fairblock: {
		rounds: [40],
		evidence:
			"https://communityfund.stellar.org/project/confidential-transfers-and-balances-hdt",
	},
	tucambio: {
		rounds: [37, 43],
		evidence:
			"https://communityfund.stellar.org/project/seasonal-workers-payroll-lru",
	},
	womenbiz: {
		rounds: [29],
		evidence:
			"https://communityfund.stellar.org/project/stellar-women-bootcamp-r5v",
	},
	fastbuka: {
		rounds: [35, 38, 44],
		evidence: "https://communityfund.stellar.org/project/choppaddi-vmf",
	},
	untangled: {
		rounds: [41],
		evidence: "https://communityfund.stellar.org/project/octopos-g6i",
	},
	// coala-pay is MULTI-PAGE (2026-09-01 verification): r22 ($50k) verified
	// on anticipatory-aid-on-soroban-f7j, r35 ($60k) verified on
	// coala-pay-billy-wallet-9mi, r31 unverdicted on both pages (kept —
	// never accuse on silence). Deliberately NOT slug-joined; the union
	// merge below is what records the verified rounds.
	"coala-pay": {
		rounds: [22, 31, 35],
		evidence:
			"https://communityfund.stellar.org/project/anticipatory-aid-on-soroban-f7j",
	},
	// escala corrected 2026-09-01 (badge-inheritance class, caught at
	// linkage verification): the page marks #42/#43 "Not Awarded"; the award
	// is #44 ($70k Build).
	escala: {
		rounds: [44],
		evidence:
			"https://communityfund.stellar.org/project/embedded-collective-investment-via-soroban-syi",
	},
	lobster: {
		rounds: [42],
		evidence:
			"https://communityfund.stellar.org/project/institutional-liquidity-infrastructure-for-stellar-k5c",
	},
	"dfs-labs": {
		rounds: [24],
		evidence: "https://communityfund.stellar.org/project/stellar-surge-1gh",
	},
	ichi: {
		rounds: [26],
		evidence: "https://communityfund.stellar.org/project/solo-labs-iy1",
	},
	"the-aha-company": {
		rounds: [41],
		evidence:
			"https://communityfund.stellar.org/project/smart-account-onboarding-8yr",
	},
	"soroban-decompiler": {
		rounds: [41],
		evidence:
			"https://communityfund.stellar.org/project/rfp-soroban-wasm-specialized-reverse-engineering-tool-mxh",
	},
};

const PG_AWARDS: Record<string, { rounds: string[]; evidence: string }> = {
	"stellar-php-sdk": {
		rounds: ["2025Q4", "2026Q1"],
		evidence:
			"https://github.com/SCF-Public-Goods-Maintenance/pg-atlas-frontend/tree/main/data",
	},
	"ios-stellar-sdk": {
		rounds: ["2025Q4", "2026Q1"],
		evidence:
			"https://github.com/SCF-Public-Goods-Maintenance/pg-atlas-frontend/tree/main/data",
	},
	"java-stellar-sdk": {
		rounds: ["2025Q4", "2026Q1"],
		evidence:
			"https://github.com/SCF-Public-Goods-Maintenance/pg-atlas-frontend/tree/main/data",
	},
	"python-stellar-sdk": {
		rounds: ["2025Q4", "2026Q1"],
		evidence:
			"https://github.com/SCF-Public-Goods-Maintenance/pg-atlas-frontend/tree/main/data",
	},
	"net-stellar-sdk": {
		rounds: ["2025Q4", "2026Q1"],
		evidence:
			"https://github.com/SCF-Public-Goods-Maintenance/pg-atlas-frontend/tree/main/data",
	},
	opengrants: {
		rounds: ["2025Q4", "2026Q1"],
		evidence:
			"https://github.com/SCF-Public-Goods-Maintenance/pg-atlas-frontend/tree/main/data",
	},
	// CoinFabrik's audit tooling — distinct from our stellar-scout
	scout: {
		rounds: ["2025Q4", "2026Q1"],
		evidence:
			"https://github.com/SCF-Public-Goods-Maintenance/pg-atlas-frontend/tree/main/data",
	},
	"stellar-light": {
		rounds: ["2025Q4", "2026Q1"],
		evidence:
			"https://github.com/SCF-Public-Goods-Maintenance/pg-atlas-frontend/tree/main/data",
	},
	stellarchain: {
		rounds: ["2026Q1"],
		evidence:
			"https://github.com/SCF-Public-Goods-Maintenance/pg-atlas-frontend/tree/main/data",
	},
	// Seeded this run (see SEEDS) — Soneso's base Flutter SDK, CSV-confirmed
	// Q4'25+Q1'26 awardee; the PG loop runs after Seeds so it lands same-run.
	"flutter-stellar-sdk": {
		rounds: ["2025Q4", "2026Q1"],
		evidence:
			"https://github.com/SCF-Public-Goods-Maintenance/pg-atlas-frontend/tree/main/data",
	},
	"scaffold-stellar": {
		rounds: ["2026Q1"],
		evidence:
			"https://github.com/SCF-Public-Goods-Maintenance/pg-atlas-frontend/tree/main/data",
	},
};

/** EXACT-SYNC types for curated slugs — the corrective sibling of TYPES_ADD.
 * Use when a record carries a WRONG type (self-audit #414: 12 records typed
 * Bridge with empty supportedNetworks — most were mis-typed oracles/wallets/
 * security tools, so "Bridge" broke the bridge-corridor ground-truth check
 * and polluted Bridge browses). Each row = the record's full verified types. */
/** SCF fact corrections vs the OFFICIAL communityfund project pages (sls-027/
 * sls-030, dual-lane verified by our consumer 2026-07-10). Overwrites the scf
 * group for listed slugs — the official page is the source of truth. */
const SCF_FIX: Record<
	string,
	{
		awarded: boolean;
		/** null = the project's SCF-page total is undisclosed — preserve, never derive from round sums. */
		totalAwarded: number | null;
		awardedRounds: number[];
		/** sls-061: per-round official amounts for projects the SCF API cannot
		 * match (no API entry → the enricher can never populate roundAwards).
		 * Only with hand-verified per-round sources; amountUSD null = award
		 * confirmed, amount not verifiable — never guessed. */
		roundAwards?: Array<{
			round: number;
			amountUSD: number | null;
			awardType: string | null;
		}>;
		/** true = the stored join is a fossil of the pre-2026-08-12 substring
		 * matcher (another project's page written onto this row): drop the page
		 * linkage (slug / sourceUrl / lastAwardedRound) too, not just the facts. */
		unlink?: boolean;
	}
> = {
	// sls-027: official page shows 7 submissions, 4 AWARDED (#16 $150K, #20
	// $100K, #25 $94.5K + Q1-2024 Liquidity $50K); #18/#24 explicitly NOT
	// awarded. Total was right, membership wasn't.
	phoenix: { awarded: true, totalAwarded: 394500, awardedRounds: [16, 20, 25] },
	// 2026-09-06: fossil of the pre-2026-08-12 substring matcher — OpenGrants
	// ("opengrants" ⊃ "pen") was written onto PEN, Anclap's asset row. No SCF
	// page is titled PEN (listing + Wayback CDX checked); anclap-r4u is the
	// COMPANY page (r7/r17/r26) and no Anclap row exists — left unjoined, a
	// company award does not belong on an asset row. opengrants-fdb joins our
	// `opengrants` row via SCF_PAGES_BEYOND_CAP (enrich-from-scf.ts).
	pen: { awarded: false, totalAwarded: null, awardedRounds: [], unlink: true },
	// sls-026: live said $391K + rounds [17,23,27,30]; official = $291K PAID,
	// round 30 marked Ineligible. Paid awards only.
	aquarius: {
		awarded: true,
		totalAwarded: 291000,
		awardedRounds: [17, 23, 27],
	},
	// sls-030: official pages show $150K (r13) + $141K (r18); record said false.
	// sls-061: comet has NO entry in the SCF projects API (only the unrelated
	// "Komet"), so the enricher can never populate roundAwards — curated here
	// from the same sls-030 hand-verified official pages. awardType wasn't
	// captured in that verification → null, never guessed.
	// sls-063 (2026-08-11): 7 rows whose official pages are either absent from
	// the SCF listing (sstream/wagelink/unalivio/tucambio) or don't parse the
	// award under any candidate slug (stride/palremit/autoaction — stride-4uu
	// etc. exist but carry no parseable award verdict). Round + budget from the
	// finding's official-submission recheck, spot-verified; totals preserved
	// verbatim (null = undisclosed, never derived). awardType null — never
	// guessed. Digibank r44 deliberately NOT inferred, per the finding.
	sstream: {
		awarded: true,
		totalAwarded: 36000,
		awardedRounds: [16],
		roundAwards: [{ round: 16, amountUSD: 36000, awardType: null }],
	},
	wagelink: {
		awarded: true,
		totalAwarded: 50000,
		awardedRounds: [24],
		roundAwards: [{ round: 24, amountUSD: 50000, awardType: null }],
	},
	unalivio: {
		awarded: true,
		totalAwarded: null,
		awardedRounds: [32],
		roundAwards: [{ round: 32, amountUSD: 18475, awardType: null }],
	},
	tucambio: {
		awarded: true,
		totalAwarded: null,
		awardedRounds: [37],
		roundAwards: [{ round: 37, amountUSD: 75000, awardType: null }],
	},
	stride: {
		awarded: true,
		totalAwarded: 120000,
		awardedRounds: [33],
		roundAwards: [{ round: 33, amountUSD: 120000, awardType: null }],
	},
	palremit: {
		awarded: true,
		totalAwarded: 60000,
		awardedRounds: [32],
		roundAwards: [{ round: 32, amountUSD: 60000, awardType: null }],
	},
	autoaction: {
		awarded: true,
		totalAwarded: 50000,
		awardedRounds: [29],
		roundAwards: [{ round: 29, amountUSD: 50000, awardType: null }],
	},
	comet: {
		awarded: true,
		totalAwarded: 291000,
		awardedRounds: [13, 18],
		roundAwards: [
			{ round: 13, amountUSD: 150000, awardType: null },
			{ round: 18, amountUSD: 141000, awardType: null },
		],
	},
	// sls-043: the canonical band row claimed SCF #41 / $100K while the alias
	// row (band-protocol, merged 2026-07-10 S3b wave) carried the OFFICIAL
	// facts. communityfund.stellar.org/project/band-protocol-2ob (read
	// 2026-07-11): ONE awarded submission — "Band Protocol Oracle Solution,
	// SCF #16, $60.0K, Legacy v4.0 Award, Awarded"; Total awarded $60.0K.
	// No round-41 award exists on the official record, so the canonical row's
	// #41/$100K had no source and contradicted its own shadow.
	band: { awarded: true, totalAwarded: 60000, awardedRounds: [16] },
	// ── ambiguous-13 wave (2026-07-11, scf-membership-postwave
	// roundsOverstated) ── each record claimed rounds whose submissions the
	// official page marks with NEGATIVE verdicts the fix-wave parser doesn't
	// read ("Prescreen Failed" / "Rejected - timeout" / "Panel Review Failed"
	// / "Ineligible") — hand-verified per record against the page's RENDERED
	// submission cards AND the official SCF round recaps
	// (medium.com/stellar-community, full awardee lists). Every total below
	// equals the already-stored value AND reconciles exactly with the
	// per-round recap amounts — these rows change ROUNDS only.
	// page grantfox-4zq: #40 Awarded, #38 Not Awarded, #37 Prescreen Failed;
	// SCF #40 recap lists "Grant Fox — $60,000" = page total $60.0K; absent
	// from the #37 recap's full 19-project list.
	grantfox: { awarded: true, totalAwarded: 60000, awardedRounds: [40] },
	// page cartwey-aku: #38 Awarded, #35 Prescreen Failed, #34 Not Awarded;
	// #38 recap lists Cartwey $60,000 = page total $60.0K; absent from the
	// #35 recap's full 21-project list.
	cartwey: { awarded: true, totalAwarded: 60000, awardedRounds: [38] },
	// page freedom-pay-wallet-umi: #38 Awarded, #30/#31 Prescreen Failed,
	// #22 Not Awarded (Kickstart #9 card is non-numeric "Information
	// Collection"); #38 recap lists Freedom Pay Wallet $150,000 = page total;
	// absent from the #30 and #31 recaps' full 22-project lists.
	"freedom-pay-wallet": {
		awarded: true,
		totalAwarded: 150000,
		awardedRounds: [38],
	},
	// page alternun-16y: #27 Awarded (card: Legacy v5.0 Activation Award,
	// budget 32000 = page total $32.0K), #30 Prescreen Failed, #37 Not
	// Awarded, #40 "Rejected - timeout" (same verdict on its own
	// communityfund awards-record page); absent from the #30/#37/#40 recap
	// full lists.
	alternun: { awarded: true, totalAwarded: 32000, awardedRounds: [27] },
	// page nobak-ncp: #23 Awarded, #31 Not Awarded, and NO #8 card at all;
	// the official "Announcing the winners of SCF#8" post (11 winners) does
	// NOT include Nobak; #23 recap: "Nobak: Custodial Wallet Signer —
	// $34,500" = page total $34.5K.
	nobak: { awarded: true, totalAwarded: 34500, awardedRounds: [23] },
	// page sorobanhooks-slr: Awarded ONLY #33 ($25.0K) + #37 ($30.0K) = page
	// total $55.0K; #31(x2)/#32/#41/#42 Not Awarded or Prescreen Failed, #39
	// Prescreen Failed; recap amounts match (#33 $25,000 + #37 $30,000) and
	// it is absent from the #31/#32/#39/#41/#42 recap full lists.
	sorobanhooks: { awarded: true, totalAwarded: 55000, awardedRounds: [33, 37] },
	// identity: our surgepay (surgepay.tech) = page surgepay-e9w (site
	// www.surgepay.tech); the other listing match (surge-pay-jze) is a
	// different zero-award record (only a Kickstart #10 "Information
	// Collection" card). Page: #41 Awarded, #38/#40 Not Awarded, #36
	// Prescreen Failed; #41 recap lists SurgePay $115,000 = page total;
	// absent from the #36/#38/#40 recap full lists.
	surgepay: { awarded: true, totalAwarded: 115000, awardedRounds: [41] },
	// page joonapay-ego: #41 Awarded, #32/#35 Not Awarded, #30/#31 Prescreen
	// Failed; #41 recap lists JoonaPay $90,000 = page total $90.0K; absent
	// from the #30/#31/#32/#35 recap full lists.
	"joona-pay": { awarded: true, totalAwarded: 90000, awardedRounds: [41] },
	// page airgap-3ht: #35 Awarded, #34 Not Awarded, #44 Prescreen Failed
	// (no #44 recap published yet — the page verdict is the negative);
	// #35 recap lists AirGap $60,000 = page total $60.0K.
	airgap: { awarded: true, totalAwarded: 60000, awardedRounds: [35] },
	// page peerpesa-tjf: #33 Awarded only; #32 Not Awarded, #37/#39/#42/#44
	// Prescreen Failed, #43 Panel Review Failed; #33 recap lists PeerPesa
	// $45,000 = page total $45.0K; absent from the #37/#39/#42/#43 recap
	// full lists (no #44 recap published yet — page verdict).
	peerpesa: { awarded: true, totalAwarded: 45000, awardedRounds: [33] },
	// page sytemap-c7p: #29 Awarded only; #30/#31/#33/#39 Not Awarded,
	// #36/#37 Prescreen Failed; #29 recap lists "HouseAfrica's Sytemap"
	// $35,000 = page total $35.0K; absent from the #30/#31/#33/#36/#37/#39
	// recap full lists.
	sytemap: { awarded: true, totalAwarded: 35000, awardedRounds: [29] },
	// page venerez-bvc: #36 Awarded, #34/#35 Not Awarded, #30 Prescreen
	// Failed (Kickstart #9 card is non-numeric); #36 recap lists Venerez
	// $99,675 = page total $99.7K; absent from the #30/#35 recap full lists.
	venerez: { awarded: true, totalAwarded: 99675, awardedRounds: [36] },
	// page abroad-lxb: #32 + #35 Awarded, #31 Not Awarded, #40 Ineligible
	// (the aquarius paid-awards-only precedent); #32 recap $56,120 + #35
	// recap $93,700 = page total $149,820 EXACTLY; absent from the #40
	// recap's full 24-project list.
	abroad: { awarded: true, totalAwarded: 149820, awardedRounds: [32, 35] },
};

// sls-050: rename continuity — served as the `identity` block and matched as
// exact-name in search. Exact-sync per slug (source-verified renames only).
const IDENTITY_FIX: Record<
	string,
	{ aliases: string[]; renamedAt?: string; renameSourceUrl?: string }
> = {
	// Raven #39: row renamed Wirex Pay → Wirex (NAME_FIXES); the product
	// name stays searchable. Source: Wirex & Stellar dual-stablecoin Visa
	// settlement announcement (PR Newswire, 2025-11-18).
	"wirex-pay": {
		aliases: ["Wirex Pay"],
		renamedAt: "2025-11-18",
		renameSourceUrl:
			"https://lumenloop.com/news/wirex-stellar-go-live-dual-stablecoin-visa-settlement-usdc",
	},
	// Vesseo is SDF-subsidiary Sunship's consumer USDC wallet, formerly
	// Vibrant (the record's own description + vesseoapp.com; Tyler's P4 H3
	// primary-source extraction cites current material as "the Vesseo app").
	vesseo: {
		aliases: ["Vibrant"],
		// "Adiós Vibrant, hola Vesseo" — Vesseo's own announcement, dated
		// Apr 22 2025; corroborated by Wayback (vesseoapp.com's first 200
		// snapshot same day) and the vibrantapp.com 301. Q4 cold-agent run
		// flagged renamedAt null as asserted-but-absent provenance.
		renamedAt: "2025-04-22",
		renameSourceUrl:
			"https://vesseoapp.com/blog-ar/adi%C3%B3s-vibrant-hola-vesseo",
	},
};

/** sls-033 (#519): productKind — WHAT KIND of wallet-landscape product each row
 * is, so a consumer can tell an end-user wallet from adjacent tooling (Tyler's
 * exact ask: distinguish hardware wallets, connectivity protocols, wallet SDKs,
 * integration kits, and passkey/smart-account tooling). Enum matches
 * Projects.ts productKind options EXACTLY. Fill-if-different (single value,
 * equality-guarded). Each row grounded in the project's OWN curated description
 * (which is itself primary-source-derived). A slug left OFF this map keeps
 * productKind null = "not yet classified" (NOT "not a wallet") — precision over
 * recall: DEX/DeFi-platform/portfolio-tool/pure-B2B-infra rows (swiftex,
 * hedgepay, equilibre, cobo, openxswitch, lumexo, pakananet, stellarfolio) and
 * the ambiguous hardware-card arculus are deliberately unclassified rather than
 * asserted. */
const PRODUCT_KIND: Record<string, string> = {
	// hardware-wallet — description literally says "hardware wallet"
	ledger: "hardware-wallet", // "Ledger is a hardware wallet designed to securely store…"
	trezor: "hardware-wallet", // "Trezor is a hardware wallet…"
	onekey: "hardware-wallet", // "Open-source hardware and software wallet with Stellar support"
	// wallet-sdk — a library/builder for BUILDING wallets
	spatium: "wallet-sdk", // "open-source Web3 Wallet Builder for businesses"
	// integration-kit — integrating existing wallets into dApps / host wallets
	"simple-signer": "integration-kit", // "in-browser transaction signer that supports different stellar wallets"
	"stellar-metamask": "integration-kit", // "Stellar Integration on MetaMask… MetaMask Snaps Platform" — a snap adding Stellar to an existing wallet
	// smart-account-tooling — passkey / smart-account infrastructure
	"stellar-passport": "smart-account-tooling", // "passkey-secured identity and participation layer"
	"volta-circuit": "smart-account-tooling", // "smart contract-based security protocol… automated asset protection, recovery"
	humantech: "smart-account-tooling", // "keys, wallets, and identity infrastructure for personhood, self-custody"
	// end-user-wallet — a consumer/institutional app users hold funds in
	lobstr: "end-user-wallet",
	xbull: "end-user-wallet",
	freighter: "end-user-wallet",
	hana: "end-user-wallet",
	beans: "end-user-wallet",
	albedo: "end-user-wallet",
	rabet: "end-user-wallet",
	vesseo: "end-user-wallet",
	"solar-wallet": "end-user-wallet",
	"hot-wallet": "end-user-wallet",
	"bitget-wallet": "end-user-wallet",
	klever: "end-user-wallet",
	mpcvault: "end-user-wallet",
	"unstoppable-wallet": "end-user-wallet",
	sollpay: "end-user-wallet",
	sentit: "end-user-wallet",
	freelii: "end-user-wallet",
	"freedom-pay-wallet": "end-user-wallet",
	coca: "end-user-wallet",
	bousol: "end-user-wallet",
	"ben-wallet": "end-user-wallet",
	peer: "end-user-wallet",
	meru: "end-user-wallet",
	lemon: "end-user-wallet",
	"kotani-pay": "end-user-wallet",
	bebop: "end-user-wallet",
	blaze: "end-user-wallet",
	cypher: "end-user-wallet",
	scopuly: "end-user-wallet",
	"neon-wallet": "end-user-wallet",
	bexo: "end-user-wallet",
	akuna: "end-user-wallet",
	stellarport: "end-user-wallet",
	interstellar: "end-user-wallet",
	empowch: "end-user-wallet",
	elsa: "end-user-wallet",
	"boss-revolution": "end-user-wallet",
	"tago-cash": "end-user-wallet",
	ripio: "end-user-wallet",
	emigro: "end-user-wallet",
	nemorixpay: "end-user-wallet",
	airgap: "end-user-wallet", // "turn a spare smartphone into a fully offline cold wallet" — end-user cold wallet app (software, not a hardware product)
	// sls-033 residual (2026-07-15, boxy): the 14 remaining null-productKind
	// type=Wallet rows, each web-verified via the directory-quality-verify
	// workflow. 10 live wallets classified here; 3 non-wallets get Wallet dropped
	// in TYPES_SET (pakananet/stellarfolio/equilibre); mxlet + equilibre are
	// dead-domain (NXDOMAIN) and were already Inactive from the earlier triage.
	decaf: "end-user-wallet", // App Store "Decaf Wallet", non-custodial Solana+Stellar, MoneyGram off-ramp
	"cactus-link": "end-user-wallet", // Cactus Link Chrome-extension wallet (Matrixport / Cactus Custody)
	lumexo: "end-user-wallet", // lumexo.io "Your Stellar Wallet & DEX" — self-custody accounts (in-app swap ≠ standalone DEX)
	swiftex: "end-user-wallet", // App Store "SwiftEx Wallet — Multi-Chain Wallet & Swaps", self-custody (wallet-first, swap is a feature)
	hedgepay: "end-user-wallet", // "Your Self-Custodial App" — stablecoin wallet on Stellar/Soroban (yield is an in-app feature)
	cobo: "wallet-sdk", // Wallet-as-a-Service: one API/SDK stack; institutional WaaS + custody infra (Cobo Guard is a companion)
	openxswitch: "wallet-sdk", // wallet-as-a-service / WaaS + custody infra for African fintechs (B2B, developer-facing)
	"hito-wallet": "hardware-wallet", // Hito HOLD — physical $150 NFC hardware wallet device
	arculus: "hardware-wallet", // Arculus Key Card — physical signing device + companion app
	keystone: "hardware-wallet", // Keystone 3 Pro — air-gapped cold hardware wallet
	// sls-033 recheck (2026-08-13): the agent-stack seed row — a library that
	// CREATES and operates Stellar wallets programmatically for AI agents
	// (signing, tx-building, x402/mpp caps verified by code scan). A wallet
	// built BY software from a library = wallet-sdk; mxlet stays null by the
	// documented dead-domain precision decision (cannot evidence-classify).
	"stellar-agent-wallet-skill": "wallet-sdk",
};

/** sls-033 (#519): per-platform app availability — DATED, store-checked facts,
 * deliberately separate from lifecycle `status` (a Live project can have a dead
 * store listing — Tyler's own xBull evidence). Shape matches Projects.ts
 * availability{platform,state,storeUrl,checkedAt,note}. EXACT-SYNC for listed
 * slugs. Every `available` row below was curl-verified live on 2026-07-14 (200
 * on the exact surface URL); the xBull ios/android `unavailable` rows carry
 * Tyler's own 2026-07-13 re-check date + note (the evidence the issue cited).
 * Seeded for the flagship set only — a wallet left off keeps availability empty
 * = "not yet curated", never "unavailable": each platform row is a claim we
 * only make once the surface is checked. checkedAt dates it; re-verify before
 * relying. */
interface AvailabilityRow {
	platform: string;
	state: string;
	storeUrl?: string;
	checkedAt: string;
	note?: string;
}
const AVAILABILITY_SET: Record<string, AvailabilityRow[]> = {
	xbull: [
		{
			platform: "web",
			state: "available",
			storeUrl: "https://xbull.app",
			checkedAt: "2026-07-14",
		},
		{
			platform: "browser-extension",
			state: "available",
			storeUrl:
				"https://chromewebstore.google.com/detail/xbull-wallet/omajpeaffjgmlpmhbfdjepdejoemifpe",
			checkedAt: "2026-07-14",
		},
		{
			platform: "ios",
			state: "unavailable",
			checkedAt: "2026-07-13",
			note: "formerly-listed iOS app not reachable (sls-033 #519 re-check) — web + Chrome extension remain live",
		},
		{
			platform: "android",
			state: "unavailable",
			checkedAt: "2026-07-13",
			note: "formerly-listed Play app not reachable (sls-033 #519 re-check) — web + Chrome extension remain live",
		},
	],
	freighter: [
		{
			platform: "browser-extension",
			state: "available",
			storeUrl:
				"https://chromewebstore.google.com/detail/freighter/bcacfldlkkdogcmkkibnjlakofdplcbk",
			checkedAt: "2026-07-14",
		},
	],
	ledger: [
		{
			platform: "hardware-device",
			state: "available",
			storeUrl: "https://shop.ledger.com",
			checkedAt: "2026-07-14",
		},
	],
	lobstr: [
		{
			platform: "web",
			state: "available",
			storeUrl: "https://lobstr.co",
			checkedAt: "2026-07-14",
		},
	],
	// sls-033 residual (2026-07-15): app availability for the newly-classified
	// wallets, each URL reached live via the directory-quality-verify workflow.
	decaf: [
		{
			platform: "ios",
			state: "available",
			storeUrl: "https://apps.apple.com/us/app/decaf-wallet/id1616564038",
			checkedAt: "2026-07-15",
		},
		{
			platform: "android",
			state: "available",
			storeUrl: "https://play.google.com/store/apps/details?id=so.decaf.wallet",
			checkedAt: "2026-07-15",
		},
	],
	"cactus-link": [
		{
			platform: "browser-extension",
			state: "available",
			storeUrl:
				"https://chromewebstore.google.com/detail/cactus-link/chiilpgkfmcopocdffapngjcbggdehmj",
			checkedAt: "2026-07-15",
			note: "Chrome Web Store, v2.1.30, offered by Matrixport (Cactus Custody)",
		},
	],
	lumexo: [
		{
			platform: "web",
			state: "available",
			storeUrl: "https://app.lumexo.io/",
			checkedAt: "2026-07-15",
		},
		{
			platform: "ios",
			state: "unavailable",
			checkedAt: "2026-07-15",
			note: "mobile app 'arriving soon' — no App Store listing yet",
		},
		{
			platform: "android",
			state: "unavailable",
			checkedAt: "2026-07-15",
			note: "mobile app 'arriving soon' — no Play listing yet",
		},
	],
	swiftex: [
		{
			platform: "ios",
			state: "available",
			storeUrl: "https://apps.apple.com/us/app/swiftex-wallet/id6759080930",
			checkedAt: "2026-07-15",
		},
		{
			platform: "android",
			state: "available",
			storeUrl:
				"https://play.google.com/store/apps/details?id=org.app.swiftEx.wallet",
			checkedAt: "2026-07-15",
		},
	],
	"hito-wallet": [
		{
			platform: "hardware-device",
			state: "available",
			storeUrl: "https://shop.hito.xyz/products/hold",
			checkedAt: "2026-07-15",
			note: "physical HOLD device ($150); listing live, currently sold out (limited edition)",
		},
	],
	hedgepay: [
		{
			platform: "android",
			state: "available",
			storeUrl:
				"https://play.google.com/store/apps/details?id=finance.nabla.hedgepay",
			checkedAt: "2026-07-15",
			note: "developer Nabla Finance OU",
		},
	],
	cobo: [
		{
			platform: "web",
			state: "available",
			storeUrl: "https://www.cobo.com/products/wallet/mpc",
			checkedAt: "2026-07-15",
			note: "Cobo Portal WaaS dashboard",
		},
		{
			platform: "ios",
			state: "available",
			storeUrl: "https://apps.apple.com/us/app/cobo-guard/id6450997458",
			checkedAt: "2026-07-15",
			note: "Cobo Guard — companion MPC key-share/signing app",
		},
	],
	arculus: [
		{
			platform: "ios",
			state: "available",
			storeUrl: "https://apps.apple.com/us/app/arculus-wallet/id1575425801",
			checkedAt: "2026-07-15",
			note: "companion app to the Arculus Key Card",
		},
		{
			platform: "android",
			state: "available",
			storeUrl:
				"https://play.google.com/store/apps/details?id=co.arculus.wallet.android",
			checkedAt: "2026-07-15",
		},
	],
	keystone: [
		{
			platform: "hardware-device",
			state: "available",
			storeUrl: "https://keyst.one/shop/products/keystone-3-pro",
			checkedAt: "2026-07-15",
			note: "Keystone 3 Pro air-gapped cold wallet ($149)",
		},
		{
			platform: "ios",
			state: "available",
			storeUrl: "https://apps.apple.com/us/app/keystone-nexus/id6742313403",
			checkedAt: "2026-07-15",
			note: "Keystone Nexus companion app",
		},
		{
			platform: "android",
			state: "available",
			storeUrl:
				"https://play.google.com/store/apps/details?id=com.keystone.wallet",
			checkedAt: "2026-07-15",
			note: "Keystone Nexus companion app",
		},
	],
};

/** Rebrands — name, website, and description move together so both the old
 * and new brand stay searchable. Equality no-ops keep reruns clean. */
const REBRANDS: Record<
	string,
	{ name: string; website: string; description: string }
> = {
	// boxy 2026-07-09: "tricorn is live (as) utexo" — human-confirmed live.
	// tricorn.network 301s → bridge.utexo.com → mint.utexo.com. Coinspect
	// audited the Stellar/Soroban integration (stellarsecurityportal.com/report/31).
	tricorn: {
		name: "Utexo",
		website: "https://mint.utexo.com",
		description:
			"Utexo (formerly Tricorn) is a live cross-chain bridge supporting EVM and non-EVM chains, moving assets to and from Stellar. Its Stellar/Soroban bridge integration was audited by Coinspect. Rebranded from tricorn.network to utexo.com.",
	},
};

/** Review finding 27 one-shot corrections — OVERWRITES coverage.countries for
 * rows the 2026-07-07 sync mis-wrote with the partner's incorporation country.
 * Grounding per row: [] = the corridor is regional/global (the partner record's
 * `regions` carries it; a wrong single country is worse than honest absence).
 * bitso's corridors are proven by its own CNBV/GFSC compliance currencies
 * (MXN/BRL/ARS/COP). Rows retire (no-op) once applied — equality-checked. */
/** #742 products model (sls-023/029 root): per-product deployment records.
 * EVERY row cites its evidence — a product without a verifiable evidenceUrl
 * does not ship (Band/RedStone/DIA/WisdomTree/Figure rows await verified
 * mappings; deferred is honest, fabricated is not). Exact-sync on the value
 * tuple; asOf = the date the evidence was last verified. */
const PRODUCTS_FIX: Record<
	string,
	Array<{
		name: string;
		kind: string;
		network: string;
		status: string;
		contractId?: string | null;
		evidenceUrl: string;
		asOf: string;
		note?: string;
	}>
> = {
	dtcc: [
		{
			name: "DTCC tokenized-collateral platform (Stellar availability)",
			kind: "rwa-asset",
			network: "mainnet",
			status: "announced",
			evidenceUrl: "https://stellar.org/case-studies/dtcc",
			asOf: "2026-08-13",
			note: "operator states Stellar availability expected H1 2027; provider row status Development covers the org, this row covers the product claim",
		},
	],
	lightecho: [
		{
			name: "Lightecho Stellar Oracle",
			kind: "oracle-feed",
			network: "mainnet",
			status: "live",
			contractId: null,
			evidenceUrl: "https://github.com/bp-ventures/lightecho-stellar-oracle",
			asOf: "2026-08-13",
			note: "contract IDs published in the operator repo; per-network ID labels pending verification, so none is asserted here. Consumer caution: price state observed stale in upstream checks",
		},
	],
};

const COVERAGE_COUNTRY_FIX: Record<string, string[]> = {
	"boss-pay": [], // HQ=US; corridors = Africa/LatAm remittance (regions field)
	"ripe-money": [], // HQ=Singapore; "off-ramp for Asia"
	"coca-wallet": [], // HQ=UAE; global wallet
	"blox-global": [], // HQ=US; "stablecoins globally"
	bitso: ["Mexico", "Brazil", "Argentina", "Colombia"],
};

// sls-017 (durable half): chains a project supports, lowercase. Fill-if-empty —
// so omission ≠ negation on wallet/multichain records.
const SUPPORTED_NETWORKS: Record<string, string[]> = {
	// Self-audit "bridge corridors" red (persistent since 2026-07-11): Bridge-
	// typed rows must carry non-empty verified networks. Each below asserted
	// from the project's OWN materials 2026-07-16 (precision over recall —
	// verified subset, never the marketing chain-count).
	proofbridge: ["stellar", "evm"], // pfbridge.xyz / its own description: "connecting Stellar and Ethereum" ZK bridge
	// Second wave (2026-07-16, same red): the check's q=bridge window surfaced
	// wowmax once the first four cleared — preempting every remaining Live
	// Bridge-typed row with empty networks in one pass (full type=Bridge sweep,
	// not the window).
	wowmax: ["evm"], // wowmax.exchange: multi-chain EVM DEX/bridge aggregator; its own description says "EXPANDING to Stellar" — stellar deliberately NOT asserted until the deployment is live
	usher: ["stellar"], // usher.so: "Enhancing Stellar's Anchors with the T Node" — Stellar-native anchor infrastructure
	"soroban-polygon-interop": ["stellar", "evm"], // EEA crosschain spec: Soroban ↔ Polygon (EVM) asset transfers
	"one-click": ["stellar"], // oneclick.fi: DeFi onboarding listed for its Stellar corridor; other chains not per-chain verified
	rango: ["stellar", "evm"], // rango.exchange aggregates 70+ chains; asserting the verified subset (Stellar routing is why it is listed; EVM is its core business)
	liquidsfi: ["stellar"], // liquids.fi (ex-ZKLiquid, Stellar-origin SCF-track project); cross-chain expansion claims not yet per-chain verified
	lobstr: ["stellar", "xrpl"],
	"ultra-stellar": ["stellar", "xrpl"],
	// Bridge corridor matrix (boxy 2026-07-09: "same issue for Solana?" — yes).
	// Every row below verified from PRIMARY sources on 2026-07-09 (vendor
	// docs/APIs, quotes in the PR): the original Beacon-Q3 seeds were
	// [stellar, evm] only, hiding real Solana/Tron/XRPL/... corridors.
	// "evm" is the umbrella users' chain-names map onto via the search
	// synonym layer (ethereum/polygon/base/bnb/arbitrum → evm).
	// This list is EXACT-SYNC for its slugs (see apply loop): the canonical
	// place to update a listed project's networks is HERE, not the admin.
	allbridge: ["stellar", "evm", "solana", "tron", "sui"], // docs-core.allbridge.io + live SRB USDC pool on core API
	"circle-cctp-cross-chain-transfer-protocol": [
		"stellar", // CCTP V2 domain 27 (standard transfer)
		"evm",
		"solana",
		"sui",
		"aptos",
		"noble",
		"starknet",
	], // developers.circle.com/cctp/concepts/supported-chains-and-domains
	axelar: ["stellar", "evm", "solana", "sui", "xrpl"], // axelar-chains-config mainnet.json: stellar mainnet contracts deployed
	rozo: ["stellar", "evm", "solana"], // rozo.ai/llms.txt: pay-in/out Ethereum/Arbitrum/Base/BSC/Polygon/Solana/Stellar; "Stellar CCTP V2 is live on ROZO"
	spacewalk: ["stellar", "polkadot", "kusama"], // pendulumchain.org: Pendulum (Polkadot) + Amplitude (Kusama), launched
	stronghold: ["stellar", "evm", "xrpl"], // gateway.stronghold.co/bridge (SHx-only: Stellar⇄Ethereum + XRPL leg live)
	"templar-protocol": ["stellar", "bitcoin", "evm", "near"], // templarfi.org/blog/stellar launch post; bridgeless (NEAR chain sigs)
	warpdrive: ["stellar", "evm"], // warp-drive.xyz targets Base/Ethereum/Optimism/BNB — NOT yet launched (see STATUS_FIX)
	tricorn: ["stellar", "evm"], // Coinspect-audited Stellar⇄EVM bridge; live as Utexo (boxy-confirmed 2026-07-09)
	helix: ["canton"], // helixlabs.org: "not live on any chain other than Canton"; Stellar = roadmap (see STATUS_FIX)
	zkcross: ["stellar", "evm"],
	// #414 real bridges (verified 2026-07-11):
	rubic: [
		"stellar",
		"evm",
		"solana",
		"bitcoin",
		"tron",
		"near",
		"polkadot",
		"cosmos",
		"sui",
		"aptos",
		"xrpl",
		"ton",
	], // Rubic's own chains API (api-v2.rubic.exchange/api/info/chains): 101 chains incl. STELLAR + dedicated rubic_stellar_api provider
	"via-labs": ["evm"], // docs.vialabs.io omnichain messaging/bridging; public chain registry is exclusively EVM chain IDs — only evm verifiable
	transfuse: ["stellar", "evm"], // github transfuselabs/transfuse-bridge: Stellar⇄Ethereum USDC/USDT bridge (testnet-only per README)
	"bim-exchange": ["evm"], // bim.finance: swap/bridge interface aggregating Kyberswap/Bungee — EVM aggregator stacks; no non-EVM chain named
	"usdc-swap": ["stellar", "evm", "solana"], // usdcswap.com sitemap: STE↔ETH/ARB/OPT/BASE/POL/AVA/SOL routes; Circle CCTP + horizon in app bundle
	houdiniswap: ["stellar", "evm", "solana", "bitcoin", "tron"], // app.houdiniswap.com token picker: XLM/USDC-on-Stellar verified live; BTC/ETH/SOL/TRON named
	estrela: ["stellar", "evm", "solana", "tron", "sui"], // Estrela = Allbridge Core (SCF #22; links → allbridge.io); docs-core.allbridge.io chain list
	rarible: ["evm"], // sls-037 precision fix: SCF award + Rarible STELLAR schema enum establish the RELATIONSHIP, but public Stellar support is not verifiable on Rarible's live API/UI (Tyler GT-19 blind lane + our recheck) — evm only until it is; the award/integration story lives in prose+statusSourceUrl, not the deployment field
	// sls-029 oracle network evidence (Live oracles with EMPTY networks made
	// materially different deployment claims look equivalent). Both rows below
	// verified from PRIMARY sources 2026-07-11:
	band: ["stellar", "evm", "xrpl", "cosmos"], // stellar: developers.stellar.org/docs/data/oracles/oracle-providers lists Band's deployed MAINNET contract CCQXWMZVM3KRTXTUPTN53YHL272QGKF32L7XEDNZ2S6OSUFK3NFBGG5M (+ bandprotocol/band-std-reference-contracts-soroban + Band's own integration post); evm/xrpl/cosmos: docs.bandchain.org supported-blockchains MAINNET table (Astar/Celo/Cronos/Harmony/Sonic/Xlayer/... → evm umbrella; XRPL named; Secret/Nibiru → cosmos). That Band table LAGS — Stellar is absent from it despite the deployed, actively-relaying mainnet contract (sls-029 live reads 2026-07-10).
	lightecho: ["stellar"], // github.com/bp-ventures/lightecho-stellar-oracle README: deployed MAINNET contract CDOR3QD27WAAF4TK4MO33TGQXR6RPNANNVLOY277W2XVV6ZVJ6X6X42T (+ testnet CA335...); Stellar-only Soroban oracle (BP Ventures). Deployment evidence, NOT freshness — sls-029's probe observed its mainnet price state ~4 months stale (2026-07-10).
};

/** sls-032 (#516): curated route-level bridge evidence — the first rows of
 * the `routes` field on Projects. EXACT-SYNC for listed slugs (the canonical
 * place to update a listed project's routes is HERE). Every row is grounded
 * in the provider's OWN docs/APIs, re-using the #414-wave primary-source
 * evidence recorded on SUPPORTED_NETWORKS above; chain names re-use the same
 * vocabulary ("evm" umbrella). Rules:
 *   - assetRepresentation states what the DESTINATION asset is (canonical =
 *     issuer-native, e.g. Circle-issued USDC via CCTP burn-mint).
 *   - Quote-time facts (fees, availability, current quotes) are NOT encoded.
 *   - rubic deliberately gets NO route rows: its verified #414 evidence is
 *     chain-level integration (its own chains API), not per-pair/per-asset
 *     route evidence — an aggregator's asset outcome is quote-time, which is
 *     exactly the sls-032 caveat. Its chain matrix stays on supportedNetworks.
 */
interface CuratedRoute {
	fromChain: string;
	toChain: string;
	direction: "one-way" | "bidirectional";
	assets: string[];
	assetRepresentation:
		| "canonical"
		| "wrapped"
		| "bridged"
		| "interchain"
		| null;
	mechanism: string;
	sourceUrl: string;
	asOf: string;
}
/** Fan a common route template out over destination chains (all rows here are
 * Stellar-anchored: fromChain stellar, direction covers the reverse leg). */
const stellarRoutes = (
	toChains: string[],
	base: Omit<CuratedRoute, "fromChain" | "toChain">,
): CuratedRoute[] =>
	toChains.map((toChain) => ({ fromChain: "stellar", toChain, ...base }));

const ROUTES_SET: Record<string, CuratedRoute[]> = {
	// usdcswap.com sitemap enumerates STE↔ETH/ARB/OPT/BASE/POL/AVA/SOL routes;
	// Circle CCTP + horizon shipped in the app bundle (verified 2026-07-11,
	// #414 wave). All seven destinations are CCTP domains → burn-mint canonical
	// Circle USDC, both directions.
	"usdc-swap": stellarRoutes(
		[
			"ethereum",
			"arbitrum",
			"optimism",
			"base",
			"polygon",
			"avalanche",
			"solana",
		],
		{
			direction: "bidirectional",
			assets: ["USDC"],
			assetRepresentation: "canonical",
			mechanism: "cctp-burn-mint",
			sourceUrl: "https://usdcswap.com",
			asOf: "2026-07-11",
		},
	),
	// docs-core.allbridge.io chain list + live SRB (Soroban) USDC pool on the
	// core API (verified 2026-07-09). Allbridge Core swaps between NATIVE-asset
	// liquidity pools on each chain — destination USDC is the chain's canonical
	// issue, which is also what the sls-032 quote-time audit observed.
	allbridge: stellarRoutes(["evm", "solana", "tron", "sui"], {
		direction: "bidirectional",
		assets: ["USDC"],
		assetRepresentation: "canonical",
		mechanism: "native-liquidity-pool",
		sourceUrl: "https://docs-core.allbridge.io",
		asOf: "2026-07-09",
	}),
	// Estrela = Allbridge Core (SCF #22; its links resolve to allbridge.io) —
	// same verified route matrix as allbridge above.
	estrela: stellarRoutes(["evm", "solana", "tron", "sui"], {
		direction: "bidirectional",
		assets: ["USDC"],
		assetRepresentation: "canonical",
		mechanism: "native-liquidity-pool",
		sourceUrl: "https://docs-core.allbridge.io",
		asOf: "2026-07-09",
	}),
	// developers.circle.com/cctp/concepts/supported-chains-and-domains: Stellar
	// is CCTP V2 domain 27 (verified 2026-07-09, #414 wave). CCTP is the RAIL
	// (see its description): burn-and-mint of Circle-issued canonical USDC —
	// the positive half of the sls-032 canonical-vs-USDC.axl regression.
	"circle-cctp-cross-chain-transfer-protocol": stellarRoutes(
		["evm", "solana", "sui", "aptos", "noble", "starknet"],
		{
			direction: "bidirectional",
			assets: ["USDC"],
			assetRepresentation: "canonical",
			mechanism: "cctp-burn-mint",
			sourceUrl:
				"https://developers.circle.com/cctp/concepts/supported-chains-and-domains",
			asOf: "2026-07-09",
		},
	),
};

/** sls-035 (#517): DEX-landscape role for the clearest records — makes the
 * venue/aggregator/UI distinction data instead of prose, so a DEX cluster
 * count stops reading as a competitor count. EXACT-SYNC for listed slugs.
 * Only unambiguous assignments (one-line evidence each); ambiguous records
 * (hoops, normal, lumenswap, multi-role platforms) stay null = unclassified. */
const VENUE_ROLE: Record<string, string> = {
	soroswap: "amm", // soroswap.finance: AMM protocol on Soroban running its own pools; DefiLlama `soroswap` TVL row
	aquarius: "amm", // aqua.network: AMM pools + liquidity-incentive voting on Stellar; DefiLlama `aquarius-stellar` TVL row
	phoenix: "amm", // Phoenix DeFi Hub: constant-product + stableswap pools (PHO) on Soroban — runs its own liquidity
	sushi: "amm", // Sushi's Stellar deployment runs its own AMM pools; DefiLlama `sushi-stellar` TVL row
	comet: "amm", // WAS a Balancer-style weighted-pool AMM on Soroban (record Inactive — status carries liveness; role is the taxonomy fact)
	stellarterm: "trading-ui", // stellarterm.com: open-source trading client for the native Stellar DEX — hosts no liquidity of its own
	stellarx: "trading-ui", // stellarx.com: trading interface over Stellar's native orderbook — no own pools
	lobstr: "wallet-integrated", // lobstr.co: wallet with in-app swap/SDEX trading — venue access inside a wallet, not an independent venue
	scopuly: "wallet-integrated", // scopuly.com: wallet + SDEX trading app (typed Wallet/DEX)
	stellarbroker: "aggregator-router", // stellar.broker: "multi-source liquidity swap router … access to AMMs and Stellar DEX" — routes across venues, runs none
};

/** Duplicate-record merges (lessons class 10; Engine B S3's 12 groups,
 * identity-verified 2026-07-10 — every pair shares the same website, so these
 * are the same entity twice, not name collisions (class 21 check done).
 * Recurring shape: an SCF-derived record (funding, empty desc) + a
 * lumenloop-enriched record (desc/GitHub, no funding) split one project's
 * facts across two rows.
 *
 * Per merge: the CANONICAL record absorbs the dupe's complementary facts
 * (fill-if-empty only — desc/github verbatim from the dupe's own record);
 * the DUPE gets canonicalSlug → canonical + status Draft (hidden, the same
 * end state the dedup lane writes — a duplicate is hidden, NEVER dead, and
 * Inactive is a death verdict) + a lifecycle note. Nothing is deleted, and a
 * shadow that already carries a human death verdict keeps it. `copyScf` is for the rename case (ultra-swap → usdc-swap) where
 * the award sits on the stale-named record: awarded/rounds copy to the
 * canonical only when the canonical carries no award of its own. */
const DUPE_MERGES: Array<{
	dupe: string;
	canonical: string;
	fill?: { shortDescription?: string; github?: string };
	copyScf?: boolean;
}> = [
	// ── Weakest-queue triage 2026-08-28: the dashboard's 40%-score rows were
	// mostly no-basis DUPLICATES of already-triaged rows. Folding removes them
	// from every serving surface and from the queue.
	// same thebluemarble.io; canonical already Inactive human-verified (the
	// lapsed domain now serves a Vietnamese gambling site - noted 2026-08-28)
	{ dupe: "blue-marble", canonical: "the-blue-marble" },
	// the OLD domain-move row (sorobansecurity.com) of the project that now
	// lives at stellarsecurityportal.com (see WEBSITE_FIXES)
	{ dupe: "soroban-security-portal", canonical: "stellar-security-portal" },
	// same ortege.ai, with CONFLICTING statuses across the pair (Live vs
	// Inactive) - the canonical keeps Live pending a deeper look (site
	// currently TLS-broken, 2026-08-28)
	{ dupe: "ortege-ai", canonical: "ortege" },
	// lumosdao.io 308s to lumoscore.com - same project, rebranded. Both rows
	// Draft; owner assessment 2026-08-28: "not a good project at all" - keep
	// Draft, do NOT promote in future passes.
	{ dupe: "lumos-dao", canonical: "lumosdao" },
	// Raven #39 sweep: coca-wallet is an empty Inactive shadow of coca
	// (same coca.xyz site, no description, no basis).
	{ dupe: "coca-wallet", canonical: "coca" },
	{ dupe: "stellarexpert", canonical: "stellar-expert" },
	{
		dupe: "sorobanpulse",
		canonical: "soroban-pulse",
		fill: {
			shortDescription:
				"SorobanPulse showcases Soroban's true potential through data and metrics from real world problem-solving dApps.",
			github: "https://github.com/crosschainlabs-stellar/sorobanpulse-webapp",
		},
	},
	{
		dupe: "sorobanhub",
		canonical: "soroban-hub",
		fill: {
			shortDescription:
				"Manage, monitor and interact with your deployed contracts from a single and free to use desktop app.",
		},
	},
	{ dupe: "passport", canonical: "stellar-passport" },
	{
		dupe: "givecredit",
		canonical: "give-credit",
		fill: {
			shortDescription:
				"Offset carbon emissions with tax-deductible XLM donations - automated by Soroban.",
			github: "https://github.com/collaborativeeconomics/give-credit",
		},
	},
	{
		dupe: "stellarcarbon",
		canonical: "stellar-carbon",
		fill: {
			shortDescription:
				"Stellarcarbon offers transparent, nature-based carbon offsetting by registering offsets on both the Stellar blockchain and the Verra Registry, enabling users to voluntarily offset their carbon footprint through on-chain and off-chain records.",
			github: "https://github.com/stellarcarbon",
		},
	},
	{ dupe: "ultra-swap", canonical: "usdc-swap", copyScf: true },
	{ dupe: "honeycoin", canonical: "honey-coin" },
	{ dupe: "coinsph", canonical: "coins-ph" },
	{ dupe: "cashabroad", canonical: "cash-abroad" },
	{ dupe: "arka-fund", canonical: "arkafund" },
	// Liveness triage 2026-07-10: 13th pair — same project, different
	// spellings ("ChainsAtlas"/"ChainAtlas"), missed by the S3 name
	// normalization. Canonical = chainsatlas (SCF-funded, gh org).
	{ dupe: "chainatlas", canonical: "chainsatlas" },
	// ── S3b domain-keyed dupes wave (boxy "run it" 2026-07-10): 26 pairs
	// found by the new same-website-apex sweep, identity verified per pair
	// (shared apex = shared entity; canonical = SCF-funded record, else the
	// richer one; org product-families went to the sweep ALLOWLIST instead,
	// never merged). Decision matrix in scratchpad s3b-triage.json. ──
	{ dupe: "band-protocol", canonical: "band" }, // sls-043: the "$100k/#41" on the canonical was unsourced — official record (project/band-protocol-2ob) shows ONE award, SCF #16 $60K; SCF_FIX aligns the canonical to it, shadow already agreed
	{ dupe: "gateway", canonical: "gatewayfm" },
	{ dupe: "reclaim-protocol", canonical: "reclaim" },
	{ dupe: "volta", canonical: "volta-circuit" },
	{ dupe: "diameter", canonical: "diameter-pay" },
	{ dupe: "baf-nework", canonical: "baf" }, // typo'd slug ("nework")
	{ dupe: "blockeden", canonical: "blockedenxyz" },
	{ dupe: "ortege-ai", canonical: "ortege" },
	{ dupe: "aha-labs", canonical: "the-aha-company" }, // same org, two namings; canonical = the richer record (5 repos)
	// The sorobansecurity.com → stellarsecurityportal.com rebrand (sls-003
	// URL migration): current brand = canonical, absorbs the SCF award —
	// the ultra-swap→usdc-swap pattern.
	{
		dupe: "soroban-security-portal",
		canonical: "stellar-security-portal",
		copyScf: true,
	},
	{
		dupe: "expand",
		canonical: "expand-network",
		fill: {
			shortDescription:
				"Expand.network offers a unified API that connects developers to over 100 decentralized finance (DeFi) endpoints across more than 40 blockchains and protocols, including both EVM and non-EVM platforms.",
			github: "https://github.com/expand-network",
		},
	},
	{ dupe: "digibank-sdp", canonical: "digibank" }, // the SDP row is a submission-title variant of the same company (award amount None — no numeric loss)
	{ dupe: "trace-finance", canonical: "trace" },
	{ dupe: "ripe-money", canonical: "ripe" },
	{ dupe: "pakana", canonical: "pakananet" }, // pakananet carries the $45.2k SCF award
	{ dupe: "meria", canonical: "meria-defi" },
	{ dupe: "coca-wallet", canonical: "coca" },
	{ dupe: "alfred-pay", canonical: "alfred" },
	{ dupe: "blue-marble", canonical: "the-blue-marble" },
	{ dupe: "mica-rent", canonical: "mica" },
	{ dupe: "elroy-app", canonical: "elroy" },
	{ dupe: "blox-global", canonical: "blox" },
	{ dupe: "huma-finance", canonical: "huma" },
	{ dupe: "bim", canonical: "bim-exchange" },
	{ dupe: "normal-finance", canonical: "normal" }, // shadow has 5 linked repos vs canonical's 1 — repos.projectSlug repoint is a known follow-up
	{ dupe: "liqvid", canonical: "liqvidxyz" },
	{
		dupe: "balanced",
		canonical: "balanced-network",
		fill: {
			shortDescription:
				"Balanced is a cross-chain DEX and stablecoin that enables native cross-chain DeFi primitives for any ecosystem.",
			github: "https://github.com/balancednetwork",
		},
	},
	// zkliquid rebranded to LiquidsFi — zkliquid's OWN description says so
	// ("ZKLiquid has rebranded to LiquidsFi (liquids.fi)") and both records
	// carry the same website + github. Held-queue item from the 2026-07-15
	// tag pass, closed 2026-07-16; also clears half the self-audit
	// bridge-corridors red (the shadow stops serving as an empty-networks
	// Bridge row). No SCF on either record — plain lineage merge.
	{ dupe: "zkliquid", canonical: "liquidsfi" },
];

const ASOF = new Date().toISOString().slice(0, 10);
const csv = (s?: string | null): string[] =>
	s
		? String(s)
				.split(",")
				.map((x) => x.trim())
				.filter(Boolean)
		: [];

async function main() {
	if (
		Object.keys(DESCRIPTION_FIXES).length === 0 &&
		Object.keys(SUPPORTED_NETWORKS).length === 0
	) {
		console.error("Nothing to do — no fixes configured.");
		process.exit(1);
	}
	const payload = await getPayload({ config: await configPromise });
	console.log(
		`Mode: ${EXECUTE ? "EXECUTE (writes)" : "DRY RUN (read-only)"}\n`,
	);

	const writes: Array<{
		id: string;
		slug: string;
		data: Record<string, unknown>;
	}> = [];

	// builtBy is NOT curated here: it isn't a Projects field — a lane that
	// wrote it (2026-08-14) was a silent-drop no-op (payload drops unknown
	// keys, reports success). Served builtBy derives from the ENTITIES
	// collection; fix the entity record/links instead. S0 guards the serve.

	console.log("── Description fixes (overwrite shortDescription) ──");
	for (const [slug, desc] of Object.entries(DESCRIPTION_FIXES)) {
		const res = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = res.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project with slug "${slug}" — skipped`);
			continue;
		}
		if (d.shortDescription === desc) {
			console.log(`  ${slug}: already up to date, skip`);
			continue;
		}
		console.log(`  ${slug}:`);
		console.log(`    old: ${d.shortDescription ?? "(none)"}`);
		console.log(`    new: ${desc}`);
		writes.push({ id: d.id, slug, data: { shortDescription: desc } });
	}

	// ── sls-012: structured anchor coverage, synced from the partner record ──
	// The partner directory already carries structured seps / currencies /
	// country; project rows (searchProjects category=Anchor) only had prose.
	// Copy them onto the matching project (fill-if-empty), dated with asOf.
	console.log("\n── Coverage from partner records (fill-if-empty) ──");
	const partnersRes = await payload.find({
		collection: "partner-accounts",
		where: { status: { equals: "published" } },
		limit: 300,
		depth: 0,
		overrideAccess: true,
	});
	// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
	for (const pt of partnersRes.docs as any[]) {
		const seps: string[] = pt.seps ?? [];
		const currencies = csv(pt.compliance?.currencies);
		// Review 2026-07-08 finding 27: pt.country is the partner's primary
		// JURISDICTION (incorporation/HQ), NOT its fiat corridor — copying it
		// wrote "United States" as boss-pay's corridor (its corridors are
		// Africa/LatAm) and "Singapore" for ripe-money (Asia off-ramp). Corridor
		// countries now come ONLY from the explicit grounded map below; the sync
		// carries currencies (compliance-grounded) + SEPs (toml-grounded), which
		// ARE corridor facts.
		const countries: string[] = [];
		if (!seps.length && !currencies.length && !countries.length) continue;
		// Partner slug is often `anchor-<name>`; the project slug is `<name>`.
		const candidates = [pt.slug, String(pt.slug).replace(/^anchor-/, "")];
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		let proj: any = null;
		for (const slug of candidates) {
			const r = await payload.find({
				collection: "projects",
				where: { slug: { equals: slug } },
				limit: 1,
				depth: 0,
				overrideAccess: true,
			});
			if (r.docs[0]) {
				proj = r.docs[0];
				break;
			}
		}
		if (!proj) continue;
		const ex = proj.coverage ?? {};
		if (ex.countries?.length || ex.currencies?.length || ex.seps?.length) {
			console.log(`  ${proj.slug}: coverage already set, skip`);
			continue;
		}
		console.log(
			`  ${proj.slug} ← ${pt.slug}: seps=${seps.join("/") || "-"} ccy=${currencies.join("/") || "-"} countries=${countries.join("/") || "-"}`,
		);
		writes.push({
			id: proj.id,
			slug: proj.slug,
			data: { coverage: { countries, currencies, seps, asOf: ASOF } },
		});
	}

	// ── statusSourceUrl retract: null EXACTLY the mangled/contradicted value ──
	console.log("\n── Status source retract (audit C2) ──");
	for (const [slug, badUrl] of Object.entries(STATUS_SOURCE_RETRACT)) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = r.docs[0] as any;
		if (!d) continue;
		if (d.statusSourceUrl !== badUrl) {
			console.log(`  ${slug}: current source is not the retracted value, skip`);
			continue;
		}
		console.log(`  ${slug}: statusSourceUrl NULLED (was ${badUrl})`);
		if (EXECUTE) {
			await payload.update({
				collection: "projects",
				id: d.id,
				data: { statusSourceUrl: null },
				context: { internal: true },
				overrideAccess: true,
			});
		}
	}

	// ── statusSourceUrl backfill: fill-only-if-empty, verdict untouched ──
	console.log("\n── Status source backfill (fill-only-if-empty) ──");
	for (const [slug, srcUrl] of Object.entries(STATUS_SOURCE_BACKFILL)) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = r.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project "${slug}" — skipped`);
			continue;
		}
		if (d.statusSourceUrl) {
			console.log(`  ${slug}: already sourced, skip`);
			continue;
		}
		// Audit C5: the map is FOR human-verified Inactive rows — a row that has
		// since flipped to Live must never get a dead-site URL stamped as its
		// status receipt.
		if (d.status !== "Inactive") {
			console.log(`  ${slug}: status is ${d.status}, not Inactive — skip`);
			continue;
		}
		console.log(`  ${slug}: statusSourceUrl ← ${srcUrl}`);
		if (EXECUTE) {
			await payload.update({
				collection: "projects",
				id: d.id,
				data: { statusSourceUrl: srcUrl },
				context: { internal: true },
				overrideAccess: true,
			});
		}
	}

	// ── raven#8 / sls-018: additive types for multi-product projects ──
	console.log("\n── Types add (merge, never remove) ──");
	for (const [slug, addTypes] of Object.entries(TYPES_ADD)) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = r.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project "${slug}" — skipped`);
			continue;
		}
		const existing: string[] = Array.isArray(d.types) ? d.types : [];
		const missing = addTypes.filter((t) => !existing.includes(t));
		if (!missing.length) {
			console.log(
				`  ${slug}: types already include ${addTypes.join("/")}, skip`,
			);
			continue;
		}
		const next = [...existing, ...missing];
		console.log(
			`  ${slug}: types [${existing.join(", ")}] → [${next.join(", ")}]`,
		);
		writes.push({ id: d.id, slug, data: { types: next } });
	}

	// ── sls-025: additive github.repos rows (merge, never remove) ──
	console.log("\n── GitHub repos add (merge, never remove) ──");
	for (const [slug, addRepos] of Object.entries(GITHUB_REPOS_ADD)) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = r.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project "${slug}" — skipped`);
			continue;
		}
		const existing: Array<{ owner?: string; name?: string }> =
			d.github?.repos ?? [];
		const key = (o?: string, n?: string) =>
			`${(o ?? "").toLowerCase()}/${(n ?? "").toLowerCase()}`;
		const have = new Set(existing.map((e) => key(e.owner, e.name)));
		const missing = addRepos.filter((a) => !have.has(key(a.owner, a.name)));
		if (!missing.length) {
			console.log(`  ${slug}: github.repos already include all rows, skip`);
			continue;
		}
		console.log(
			`  ${slug}: github.repos +${missing.map((m) => `${m.owner}/${m.name}`).join(", ")}`,
		);
		writes.push({
			id: d.id,
			slug,
			data: {
				github: {
					...(d.github ?? {}),
					repos: [
						...existing.map((e) => ({ owner: e.owner, name: e.name })),
						...missing,
					],
				},
			},
		});
	}

	// ── raven#8 sweep (REPORT-ONLY): capability-mismatch axes ──
	// Generalizes the dual-identity ramp sweep (the pattern that hid
	// Etherfuse) to a table of axes: partner capability evidence → the
	// project type that evidence implies. A CANDIDATE fires when the linked
	// project carries NONE of the implied types (and its category doesn't
	// already cover it). Prints for owner review; confirmed rows are
	// hand-promoted into TYPES_ADD above. Never writes.
	// (idea: capability-mismatch-sweep.md — raven#8 asked to "audit for
	// other multi-product projects"; audd is the proving candidate.)
	console.log("\n── Capability-mismatch sweep (report-only, no writes) ──");
	{
		// Narrow on purpose: only sectors whose implied type is unambiguous.
		// defi→DEX/Lending, identity, data→Indexer/Analytics are too loose —
		// a "defi"-sector wallet is not thereby a DEX (report noise, not truth).
		const SECTOR_TYPE: Record<string, string> = {
			payments: "Payments",
			rwa: "RWA",
			stablecoins: "Stablecoin",
			ai: "AI",
			gaming: "Gaming",
		};
		const CAP_AXES: Array<{
			id: string;
			// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
			implied: (pt: any) => string[];
			coveredByCategory?: (cat: string) => boolean;
		}> = [
			{
				id: "anchor",
				implied: (pt) =>
					pt.partnerType === "anchor" ||
					pt.partnerType === "on-off-ramp" ||
					(Array.isArray(pt.rampTypes) && pt.rampTypes.length > 0)
						? ["Anchor"]
						: [],
				coveredByCategory: (c) => c === "Anchor",
			},
			{
				id: "sectors",
				implied: (pt) =>
					(Array.isArray(pt.sectors) ? pt.sectors : [])
						.map((s: string) => SECTOR_TYPE[s])
						.filter(Boolean),
			},
			{
				// Keyed on onchain[] (domain-matched PROVEN issuance from
				// stellar.expert), never on assets[] — that field conflates
				// "issues" with "supports" (Bitso supports USDC; Circle
				// issues it). The issues-vs-supports cousin of the
				// contains-substring trap.
				id: "issued-asset",
				implied: (pt) =>
					Array.isArray(pt.onchain) && pt.onchain.length > 0
						? ["Stablecoin", "RWA"]
						: [],
				coveredByCategory: (c) => c === "Asset",
			},
		];

		const anchorsRes = await payload.find({
			collection: "partner-accounts",
			where: { status: { equals: "published" } },
			limit: 300,
			depth: 0,
			overrideAccess: true,
		});
		let candidates = 0;
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		for (const pt of anchorsRes.docs as any[]) {
			// Resolve the project once per partner: the verified projectSlug
			// join first (covers franklin-templeton→benji, gmo-zcom-trust→gyen
			// etc., where the strip heuristic fails), heuristic as fallback.
			const slugCands = [
				pt.projectSlug,
				pt.slug,
				String(pt.slug).replace(/^anchor-/, ""),
			].filter(Boolean);
			// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
			let proj: any = null;
			for (const slug of slugCands) {
				const r = await payload.find({
					collection: "projects",
					where: { slug: { equals: slug } },
					limit: 1,
					depth: 0,
					overrideAccess: true,
				});
				if (r.docs[0]) {
					proj = r.docs[0];
					break;
				}
			}
			if (!proj) continue;
			const types: string[] = Array.isArray(proj.types) ? proj.types : [];
			for (const axis of CAP_AXES) {
				const implied = axis.implied(pt);
				if (!implied.length) continue;
				if (axis.coveredByCategory?.(proj.category)) continue;
				const missing = implied.filter((t) => !types.includes(t));
				if (!missing.length) continue;
				candidates++;
				console.log(
					`  CANDIDATE [${axis.id}] ${proj.slug}: category=${proj.category} types=[${types.join(", ")}] → add [${missing.join("/")}] ← partner ${pt.slug} (type=${pt.partnerType}, sectors=${(Array.isArray(pt.sectors) ? pt.sectors : []).join("/") || "-"})`,
				);
			}
		}

		// Axis D (project-internal): curated bridge-route evidence without the
		// Bridge type. No partner-side bridge signal exists (partnerType has no
		// bridge value; supportedNetworks is project-only) — and multichain ≠
		// bridge (LOBSTR spans stellar+xrpl and is a Wallet), so this keys on
		// routes[], never supportedNetworks.
		// NO where clause at all: `{ routes: { exists: true } }` on the array
		// field crashes in the mongo adapter's Query cast (first live run,
		// 2026-07-20). Fetch the narrow projection of the whole collection
		// and JS-filter — the `in` + post-filter discipline from the
		// contains-substring lesson, taken to its safe extreme.
		const routed = await payload.find({
			collection: "projects",
			limit: 2000,
			depth: 0,
			overrideAccess: true,
			select: { slug: true, category: true, types: true, routes: true },
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		for (const proj of routed.docs as any[]) {
			if (!Array.isArray(proj.routes) || proj.routes.length === 0) continue;
			const types: string[] = Array.isArray(proj.types) ? proj.types : [];
			if (types.includes("Bridge")) continue;
			candidates++;
			console.log(
				`  CANDIDATE [routes] ${proj.slug}: category=${proj.category} types=[${types.join(", ")}] → add [Bridge] ← ${proj.routes.length} curated route(s) on the row itself`,
			);
		}

		if (!candidates)
			console.log("  (none — every capability axis agrees with its project)");
	}

	// ── finding 27: corridor-country corrections (OVERWRITE, equality-guarded) ──
	console.log("\n── Coverage country corrections (finding 27) ──");
	for (const [slug, fix] of Object.entries(COVERAGE_COUNTRY_FIX)) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = r.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project "${slug}" — skipped`);
			continue;
		}
		const cur: string[] = d.coverage?.countries ?? [];
		if (JSON.stringify(cur) === JSON.stringify(fix)) {
			console.log(`  ${slug}: already corrected, skip`);
			continue;
		}
		console.log(
			`  ${slug}: countries [${cur.join(", ")}] → [${fix.join(", ")}]`,
		);
		writes.push({
			id: d.id,
			slug,
			data: { coverage: { ...(d.coverage ?? {}), countries: fix, asOf: ASOF } },
		});
	}

	// ── sls-017 (durable): supportedNetworks (fill-if-empty) ──
	// ── curated seeds (create-if-missing, never update) ──
	console.log("\n── Seeds (create-if-missing) ──");
	for (const seed of SEEDS) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: seed.slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		if (r.docs[0]) {
			// Diagnostic (2026-08-31): fxdao and enerdao "existed" while the
			// public API served neither — a bare skip hides WHAT exists. Print
			// the blocking row's status and name, so a hidden Draft (the dedup
			// lane's hiding mechanism) is visible in the log instead of reading
			// as an already-served project.
			// biome-ignore lint/suspicious/noExplicitAny: diagnostic read
			const blocking = r.docs[0] as any;
			console.log(
				`  ${seed.slug}: exists, skip (status=${blocking?.status}, name=${blocking?.name})`,
			);
			continue;
		}
		console.log(
			`  ${seed.slug}: CREATE (${seed.status}, ${seed.types.join("/")})`,
		);
		if (EXECUTE) {
			try {
				await payload.create({
					collection: "projects",
					// biome-ignore lint/suspicious/noExplicitAny: the seed literals'
					// inferred union produced a types-ratchet signature that CHURNED
					// on every map edit (the baselined message is length-truncated,
					// so upstream string-length changes moved its tail) — closed with
					// the site cast the sibling prod writers already use.
					data: seed as any,
					overrideAccess: true,
				});
				console.log(`  created: ${seed.slug}`);
			} catch (err) {
				console.error(`  CREATE FAILED: ${seed.slug} — ${String(err)}`);
				process.exitCode = 1;
			}
		}
	}

	// ── rebrands (name + website + description together) ──
	console.log("\n── Rebrands ──");
	for (const [slug, rb] of Object.entries(REBRANDS)) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = r.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project "${slug}" — skipped`);
			continue;
		}
		// biome-ignore lint/suspicious/noExplicitAny: partial update payload
		const data: any = {};
		if (d.name !== rb.name) data.name = rb.name;
		if (d.shortDescription !== rb.description)
			data.shortDescription = rb.description;
		const normUrl = (u: string) => u.replace(/\/+$/, "");
		if (normUrl(d.links?.website ?? "") !== normUrl(rb.website))
			data.links = { ...(d.links ?? {}), website: rb.website };
		if (!Object.keys(data).length) {
			console.log(`  ${slug}: already rebranded, skip`);
			continue;
		}
		console.log(
			`  ${slug}: ${d.name} → ${rb.name} (${Object.keys(data).join(", ")})`,
		);
		writes.push({ id: d.id, slug, data });
	}

	// ── launch-status corrections (from-guarded, retire once applied) ──
	// ── PG Award truth (merge rounds, never remove; CSV-confirmed only) ──
	console.log("\n── Public Goods Award rounds (merge, never remove) ──");
	for (const [slug, pg] of Object.entries(PG_AWARDS)) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = r.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project "${slug}" — skipped`);
			continue;
		}
		const existing: string[] = Array.isArray(d.publicGoods?.awardRounds)
			? d.publicGoods.awardRounds
			: [];
		const missing = pg.rounds.filter((x) => !existing.includes(x));
		if (!missing.length && d.publicGoods?.evidenceUrl === pg.evidence) {
			console.log(`  ${slug}: rounds already [${existing.join(", ")}], skip`);
			continue;
		}
		const next = [...existing, ...missing];
		console.log(
			`  ${slug}: pgAwardRounds [${existing.join(", ")}] → [${next.join(", ")}]`,
		);
		writes.push({
			id: d.id,
			slug,
			data: { publicGoods: { awardRounds: next, evidenceUrl: pg.evidence } },
		});
	}

	// PROMOTE-ONLY: this section can mark a project awarded and merge rounds in;
	// it can never un-award, remove a round, or overwrite a nonzero total. An
	// existing nonzero totalAwarded that disagrees with our figure is a
	// reconciliation question for a human, not something a script should settle
	// by overwriting — so it logs and leaves it.
	console.log("\n── SCF legacy award linkage (promote-only, #744) ──");
	for (const [slug, a] of Object.entries(SCF_LEGACY_AWARDS)) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = r.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project "${slug}" — skipped`);
			continue;
		}
		const scf = d.scf ?? {};
		const rounds: number[] = Array.isArray(scf.awardedRounds)
			? scf.awardedRounds.map(Number)
			: [];
		const hasRound = rounds.includes(a.round);
		if (scf.awarded && hasRound) {
			console.log(`  ${slug}: already awarded w/ round ${a.round}, skip`);
			continue;
		}
		const nextRounds = hasRound
			? rounds
			: [...rounds, a.round].sort((x, y) => x - y);
		const existingTotal = Number(scf.totalAwarded) || 0;
		if (existingTotal > 0 && existingTotal !== a.usd) {
			console.log(
				`  ${slug}: totalAwarded already ${existingTotal} ≠ ${a.usd} — merging round only, total left for human reconciliation`,
			);
		}
		console.log(
			`  ${slug}: scfAwarded ${!!scf.awarded} → true, rounds [${rounds.join(", ")}] → [${nextRounds.join(", ")}]${existingTotal === 0 ? `, totalAwarded → ${a.usd}` : ""} (${a.award}, ${a.evidence})`,
		);
		writes.push({
			id: d.id,
			slug,
			data: {
				scf: {
					awarded: true,
					awardedRounds: nextRounds,
					lastAwardedRound: Math.max(
						Number(scf.lastAwardedRound) || 0,
						a.round,
					),
					...(existingTotal === 0 ? { totalAwarded: a.usd } : {}),
				},
			},
		});
	}

	console.log("\n── Status fixes (from-guarded) ──");
	// ── The curator gate (2026-08-29, the hoops confession) ────────────────
	// The automated path already enforces "a 200 is not a business": the
	// weekly link-check reads what a 2xx SERVED and the basis upgrader
	// refuses non-product pages. Manual curation BYPASSED that whole layer —
	// a hand-written site-liveness Live stamp shipped off a 200 whose page
	// literally said TESTNET and "JOIN THE WAITLIST". Per the closure rule,
	// the fix is not "read more carefully": it is making this path unable to
	// repeat it. Any STATUS_FIX asserting Live on a machine basis
	// (site-liveness) has its sourceUrl FETCHED and scanned for pre-launch
	// markers at apply time; a hit refuses the entry loudly, in dry-run and
	// execute alike. human-verified entries still pass — that basis is a
	// person taking responsibility for having actually read the page — but
	// the marker scan warns on them too, so the diff shows the contradiction.
	const PRELAUNCH_MARKERS =
		/\b(testnet[- ]?only|available on testnet|on testnet|TESTNET|join the waitlist|joins? our waitlist|coming soon|mainnet (opens|soon|launch)|funds are not real|not yet (live|launched)|pre-?launch)\b/i;
	const prelaunchScan = async (
		url: string,
	): Promise<{ hit: string | null; ok: boolean }> => {
		try {
			const res = await fetch(url, {
				headers: { "User-Agent": "stellarlight-curator-gate" },
				redirect: "follow",
			});
			if (!res.ok) return { hit: null, ok: false };
			const text = (await res.text())
				.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
				.replace(/<[^>]+>/g, " ")
				.replace(/\s+/g, " ");
			const m = PRELAUNCH_MARKERS.exec(text);
			return { hit: m ? m[0] : null, ok: true };
		} catch {
			return { hit: null, ok: false };
		}
	};

	for (const [slug, fix] of Object.entries(STATUS_FIX)) {
		if (fix.to === "Live" && fix.sourceUrl && fix.basis !== "human-verified") {
			const scan = await prelaunchScan(fix.sourceUrl);
			if (scan.hit) {
				console.error(
					`  REFUSED ${slug}: Live stamp on ${fix.basis}, but ${fix.sourceUrl} carries pre-launch marker "${scan.hit}" — a 200 is not a business. Read the page; if Live is still right, use basis human-verified and own it.`,
				);
				process.exitCode = 1;
				continue;
			}
			if (!scan.ok)
				console.log(
					`  WARN ${slug}: could not verify ${fix.sourceUrl} for the Live stamp (fetch failed) — entry proceeds, but the evidence is unconfirmed`,
				);
		} else if (fix.to === "Live" && fix.sourceUrl) {
			const scan = await prelaunchScan(fix.sourceUrl);
			if (scan.hit)
				console.log(
					`  WARN ${slug}: human-verified Live, but the page carries "${scan.hit}" — the human owns this contradiction`,
				);
		}

		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = r.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project "${slug}" — skipped`);
			continue;
		}
		// A lineage shadow is owned by the fold (Draft + canonicalSlug). A
		// status entry naming one would overwrite that — the third writer the
		// 2026-09-05 audit warned about. Fix the canonical row instead.
		if (d.canonicalSlug) {
			console.log(
				`  ${slug}: is a shadow of ${d.canonicalSlug} — skip (fix the canonical row)`,
			);
			continue;
		}
		// A lineage shadow is not a record: its status is the fold's (Draft +
		// canonicalSlug, #1337) and no curated entry may write onto it — a
		// STATUS_FIX keyed by a shadow slug would silently re-open a hidden
		// duplicate (audit 2026-09-05, "one field, one writer").
		if (d.canonicalSlug) {
			console.log(
				`  ${slug}: shadow of ${d.canonicalSlug} — curated status entry skipped; re-key it to the canonical row`,
			);
			continue;
		}
		if (d.status !== fix.from) {
			// An entry that already moved the row keeps owning its lifecycle note:
			// when the stored note lags the verdict (fill-if-empty left the earlier
			// Live packet note on five rows retired or downgraded on 2026-09-06),
			// refresh the note alone. Status, basis and dates are not touched.
			if (
				fix.from !== fix.to &&
				d.status === fix.to &&
				fix.note &&
				d.lifecycle?.note !== fix.note
			) {
				console.log(
					`  ${slug}: already ${fix.to} — lifecycle note refreshed to the verdict`,
				);
				writes.push({
					id: d.id,
					slug,
					data: { lifecycle: { ...(d.lifecycle ?? {}), note: fix.note } },
				});
				continue;
			}
			console.log(
				`  ${slug}: status '${d.status}' ≠ '${fix.from}', skip (retired or manually set)`,
			);
			continue;
		}
		// A weak curated basis never overwrites a strong one a lane earned. The
		// July entry for blend (from Live, to Live, basis site-liveness) re-stamped
		// site-liveness on every execute, erasing the onchain-activity the basis
		// lane keeps awarding (1,682 subinvocations in the window, 2026-09-05) —
		// 16 STATUS_FIX entries carry a weak basis and could do the same. When
		// the status is unchanged, the stored strong provenance IS the better
		// evidence; there is nothing to write. A status MOVE is a verdict and
		// still writes as the entry says.
		const STRONG_STATUS_BASES = new Set([
			"human-verified",
			"onchain-activity",
			"product-integration",
			"repo-activity",
		]);
		if (
			fix.from === fix.to &&
			fix.basis &&
			!fix.withdraw &&
			!STRONG_STATUS_BASES.has(fix.basis) &&
			STRONG_STATUS_BASES.has(String(d.statusBasis ?? ""))
		) {
			console.log(
				`  ${slug}: keeps ${d.statusBasis} — the curated ${fix.basis} entry is weaker than the basis a lane earned; nothing written`,
			);
			continue;
		}
		console.log(`  ${slug}: status ${fix.from} → ${fix.to}`);
		// biome-ignore lint/suspicious/noExplicitAny: partial update payload
		const data: any = { status: fix.to };
		// Inactive flips carry their evidence as ecosystem memory (fill-if-
		// empty): "X WAS a live Y that shut down" beats silence for consumers.
		// A status MOVE is a verdict: its note replaces whatever was there. A
		// stamp (from === to) only fills an empty note, as before.
		if (fix.note && (fix.from !== fix.to || !d.lifecycle?.note))
			data.lifecycle = { ...(d.lifecycle ?? {}), note: fix.note };
		// sls-024: date + source + kind-of-evidence ride the same write, so the
		// served label stops being an unprovenanced bare string.
		if (fix.asOf) data.statusAsOf = fix.asOf;
		if (fix.sourceUrl) data.statusSourceUrl = fix.sourceUrl;
		if (fix.basis) data.statusBasis = fix.basis;
		writes.push({ id: d.id, slug, data });
	}

	console.log("\n── Website fixes (dead recorded URL → verified live URL) ──");
	// ── PROMINENCE_SET: editorial rank boost, exact-sync ──
	for (const [slug, prominence] of Object.entries(PROMINENCE_SET)) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = r.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project "${slug}" — skipped`);
			continue;
		}
		if ((d.prominence ?? 0) === prominence) {
			console.log(`  ${slug}: prominence already ${prominence}, skip`);
			continue;
		}
		console.log(`  ${slug}: prominence ${d.prominence ?? 0} → ${prominence}`);
		writes.push({ id: d.id, slug, data: { prominence } });
	}

	// ── SCF submission linkage (2026-08-31 review) — promote-only, no amounts ──
	console.log("\n── SCF submission linkage (absence review, promote-only) ──");
	for (const [slug, a] of Object.entries(SCF_SUBMISSION_LINKS)) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = r.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project "${slug}" — skipped (seed missing?)`);
			continue;
		}
		const scf = d.scf ?? {};
		const rounds: number[] = Array.isArray(scf.awardedRounds)
			? scf.awardedRounds.map(Number)
			: [];
		const nextRounds = [...new Set([...rounds, ...a.rounds])].sort(
			(x, y) => x - y,
		);
		if (scf.awarded && nextRounds.length === rounds.length) {
			console.log(`  ${slug}: already awarded w/ all rounds, skip`);
			continue;
		}
		console.log(
			`  ${slug}: scfAwarded ${!!scf.awarded} → true, rounds [${rounds.join(", ")}] → [${nextRounds.join(", ")}] (${a.evidence})`,
		);
		writes.push({
			id: d.id,
			slug,
			data: {
				scf: {
					awarded: true,
					awardedRounds: nextRounds,
					lastAwardedRound: Math.max(
						Number(scf.lastAwardedRound) || 0,
						...a.rounds,
					),
				},
			},
		});
	}

	// ── ALIAS_ADD: rename-continuity aliases (sls-050 as data) ──
	for (const [slug, addAliases] of Object.entries(ALIAS_ADD)) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = r.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project "${slug}" — skipped`);
			continue;
		}
		// aliases is hasMany TEXT — an array of plain strings (write the same
		// shape back; an object shape would be silently dropped, the
		// payload-silent-drop trap).
		const current: string[] = Array.isArray(d.aliases)
			? d.aliases.filter((a: unknown): a is string => typeof a === "string")
			: [];
		const missing = addAliases.filter((a) => !current.includes(a));
		if (!missing.length) {
			console.log(
				`  ${slug}: aliases already carry ${addAliases.join(",")}, skip`,
			);
			continue;
		}
		console.log(
			`  ${slug}: aliases [${current.join(",")}] +${missing.join(",")}`,
		);
		writes.push({
			id: d.id,
			slug,
			data: { aliases: [...current, ...missing] },
		});
	}

	// ── TYPE_ADD: additive type tags (Oracle vertical, guard D 2026-08-27) ──
	for (const [slug, addTypes] of Object.entries(TYPE_ADD)) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = r.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project "${slug}" — skipped`);
			continue;
		}
		const current: string[] = Array.isArray(d.types) ? d.types : [];
		const missing = addTypes.filter((t) => !current.includes(t));
		if (!missing.length) {
			console.log(`  ${slug}: types already carry ${addTypes.join(",")}, skip`);
			continue;
		}
		// ADD-only merge — write the full array (hasMany), never a partial.
		console.log(
			`  ${slug}: types [${current.join(",")}] +${missing.join(",")}`,
		);
		writes.push({ id: d.id, slug, data: { types: [...current, ...missing] } });
	}

	// ── NAME_FIXES: registered renames (sync-protected via curatedFieldsFor) ──
	for (const [slug, name] of Object.entries(NAME_FIXES)) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = r.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project "${slug}" — skipped`);
			continue;
		}
		if (d.name === name) {
			console.log(`  ${slug}: name already "${name}", skip`);
			continue;
		}
		console.log(`  ${slug}: name "${d.name}" → "${name}"`);
		writes.push({ id: d.id, slug, data: { name } });
	}

	for (const [slug, website] of Object.entries(WEBSITE_FIXES)) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = r.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project "${slug}" — skipped`);
			continue;
		}
		// Payload normalizes stored URLs (strips www.) — compare both sides
		// normalized or these rows re-plan forever (caught on the S3b dry-run:
		// 7 already-applied website fixes re-planned as writes).
		const norm = (u: string) =>
			(u ?? "").replace(/^(https?:\/\/)www\./, "$1").replace(/\/+$/, "");
		if (norm(d.links?.website) === norm(website)) {
			console.log(`  ${slug}: website already current, skip`);
			continue;
		}
		console.log(
			`  ${slug}: website ${d.links?.website ?? "(none)"} → ${website}`,
		);
		writes.push({
			id: d.id,
			slug,
			data: { links: { ...(d.links ?? {}), website } },
		});
	}

	console.log("\n── Website removals (hijacked domains, value-keyed) ──");
	for (const [slug, hijacked] of Object.entries(WEBSITE_REMOVE)) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = r.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project "${slug}" — skipped`);
			continue;
		}
		const norm = (u: string) =>
			(u ?? "").replace(/^(https?:\/\/)www\./, "$1").replace(/\/+$/, "");
		if (!d.links?.website) {
			console.log(`  ${slug}: website already empty, skip`);
			continue;
		}
		if (norm(d.links.website) !== norm(hijacked)) {
			console.log(
				`  ${slug}: website is ${d.links.website}, not the recorded hijacked value — skip (relinked since)`,
			);
			continue;
		}
		console.log(
			`  ${slug}: website REMOVED (was ${d.links.website} — hijacked)`,
		);
		writes.push({
			id: d.id,
			slug,
			data: { links: { ...(d.links ?? {}), website: null } },
		});
	}

	console.log("\n── GitHub link fixes (equality-guarded) ──");
	for (const [slug, github] of Object.entries(GITHUB_LINK_FIX)) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = r.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project "${slug}" — skipped`);
			continue;
		}
		if ((d.links?.github ?? "").replace(/\/+$/, "") === github) {
			console.log(`  ${slug}: github link already current, skip`);
			continue;
		}
		console.log(`  ${slug}: github ${d.links?.github ?? "(none)"} → ${github}`);
		writes.push({
			id: d.id,
			slug,
			data: { links: { ...(d.links ?? {}), github } },
		});
	}

	console.log("\n── Supported networks (fill-if-empty) ──");
	for (const [slug, fix] of Object.entries(IDENTITY_FIX)) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: raw Payload doc
		const d = r.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project "${slug}" for IDENTITY_FIX — skipped`);
			continue;
		}
		const cur: string[] = Array.isArray(d.aliases) ? d.aliases : [];
		if (
			cur.join(",") === fix.aliases.join(",") &&
			(d.renameSourceUrl ?? undefined) === fix.renameSourceUrl &&
			(d.renamedAt ?? undefined) === fix.renamedAt
		) {
			console.log(`  ${slug}: identity already in sync, skip`);
			continue;
		}
		console.log(
			`  ${slug}: identity aliases=[${cur.join(", ")}] → [${fix.aliases.join(", ")}]`,
		);
		writes.push({
			id: d.id,
			slug,
			data: {
				aliases: fix.aliases,
				...(fix.renamedAt ? { renamedAt: fix.renamedAt } : {}),
				...(fix.renameSourceUrl
					? { renameSourceUrl: fix.renameSourceUrl }
					: {}),
			},
		});
	}

	for (const [slug, fix] of Object.entries(SCF_FIX)) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = r.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project "${slug}" — skipped`);
			continue;
		}
		const cur = d.scf ?? {};
		const wantRA = fix.roundAwards ?? null;
		const raInSync =
			!wantRA ||
			JSON.stringify(
				// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
				(cur.roundAwards ?? []).map((r: any) => [
					r.round,
					r.amountUSD ?? null,
					r.awardType ?? null,
				]),
			) ===
				JSON.stringify(wantRA.map((r) => [r.round, r.amountUSD, r.awardType]));
		if (
			cur.awarded === fix.awarded &&
			cur.totalAwarded === fix.totalAwarded &&
			(cur.awardedRounds ?? []).join(",") === fix.awardedRounds.join(",") &&
			raInSync &&
			(!fix.unlink || cur.slug == null) &&
			// provenance first-stamp (same gap enrich had, #828): a curated row
			// whose values are in sync but whose basis is missing still needs
			// the human-verified stamp — in-sync is not stamped.
			cur.basis === "human-verified"
		) {
			console.log(`  ${slug}: scf already in sync, skip`);
			continue;
		}
		console.log(
			`  ${slug}: scf awarded=${cur.awarded}→${fix.awarded} total=${cur.totalAwarded}→${fix.totalAwarded} rounds=[${(cur.awardedRounds ?? []).join(",")}]→[${fix.awardedRounds.join(",")}]`,
		);
		const { unlink, ...scfFix } = fix;
		writes.push({
			id: d.id,
			slug,
			data: {
				scf: {
					...cur,
					...scfFix,
					...(unlink
						? { slug: null, sourceUrl: null, lastAwardedRound: null }
						: {}),
					// curated corrections are page-verified by a human where the
					// official record is ambiguous — the strongest basis we serve
					basis: "human-verified",
					asOf: new Date().toISOString().slice(0, 10),
				},
			},
		});
	}

	for (const [slug, want] of Object.entries(PRODUCTS_FIX)) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = r.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project "${slug}" — skipped`);
			continue;
		}
		// exact-sync on the value tuple (ignore Payload array-row ids)
		const tup = (rows: unknown) =>
			JSON.stringify(
				// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
				((rows as any[]) ?? []).map((x) => [
					x.name,
					x.kind,
					x.network,
					x.status,
					x.contractId ?? null,
					x.evidenceUrl,
					x.asOf,
					x.note ?? null,
				]),
			);
		if (tup(d.products) === tup(want)) {
			console.log(`  ${slug}: products already in sync, skip`);
			continue;
		}
		console.log(`  ${slug}: products → ${want.length} record(s)`);
		writes.push({ id: d.id, slug, data: { products: want } });
	}

	for (const [slug, want] of Object.entries(TYPES_SET)) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = r.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project "${slug}" — skipped`);
			continue;
		}
		const cur: string[] = Array.isArray(d.types) ? d.types : [];
		if (cur.join(",") === want.join(",")) {
			console.log(`  ${slug}: types already in sync, skip`);
			continue;
		}
		console.log(`  ${slug}: types [${cur.join(", ")}] → [${want.join(", ")}]`);
		writes.push({ id: d.id, slug, data: { types: want } });
	}

	for (const [slug, nets] of Object.entries(SUPPORTED_NETWORKS)) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = r.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project "${slug}" — skipped`);
			continue;
		}
		const cur: string[] = Array.isArray(d.supportedNetworks)
			? d.supportedNetworks
			: [];
		// EXACT-SYNC for curated slugs: the matrix above is the source of
		// truth (primary-source-verified). Equality no-ops keep reruns clean.
		if (cur.join(",") === nets.join(",")) {
			console.log(`  ${slug}: already in sync, skip`);
			continue;
		}
		console.log(`  ${slug}: [${cur.join(", ")}] → [${nets.join(", ")}]`);
		writes.push({ id: d.id, slug, data: { supportedNetworks: nets } });
	}

	console.log("\n── Wallet productKind (sls-033 #519, fill-if-different) ──");
	for (const [slug, want] of Object.entries(PRODUCT_KIND)) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = r.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project "${slug}" — skipped`);
			continue;
		}
		if (d.productKind === want) {
			console.log(`  ${slug}: productKind already ${want}, skip`);
			continue;
		}
		console.log(`  ${slug}: productKind ${d.productKind ?? "null"} → ${want}`);
		writes.push({ id: d.id, slug, data: { productKind: want } });
	}

	console.log("\n── Wallet availability (sls-033 #519, EXACT-SYNC) ──");
	// Normalize to the curated shape (drop Payload row ids) so reruns no-op.
	// biome-ignore lint/suspicious/noExplicitAny: Payload array-field row shape
	const normAvail = (rows: any): string =>
		JSON.stringify(
			(Array.isArray(rows) ? rows : []).map((r) => ({
				platform: r.platform ?? null,
				state: r.state ?? null,
				storeUrl: r.storeUrl ?? null,
				checkedAt: r.checkedAt ?? null,
				note: r.note ?? null,
			})),
		);
	for (const [slug, avail] of Object.entries(AVAILABILITY_SET)) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = r.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project "${slug}" — skipped`);
			continue;
		}
		const want = avail.map((a) => ({
			platform: a.platform,
			state: a.state,
			storeUrl: a.storeUrl ?? null,
			checkedAt: a.checkedAt,
			note: a.note ?? null,
		}));
		if (normAvail(d.availability) === normAvail(want)) {
			console.log(`  ${slug}: availability already in sync, skip`);
			continue;
		}
		console.log(`  ${slug}: availability → ${want.length} platform row(s)`);
		writes.push({ id: d.id, slug, data: { availability: want } });
	}

	console.log("\n── Bridge routes (sls-032 #516, EXACT-SYNC) ──");
	// Normalize to the curated shape (drop Payload row ids) so reruns no-op.
	// biome-ignore lint/suspicious/noExplicitAny: Payload array-field row shape
	const normRoutes = (rows: any): string =>
		JSON.stringify(
			(Array.isArray(rows) ? rows : []).map((r) => ({
				fromChain: r.fromChain ?? null,
				toChain: r.toChain ?? null,
				direction: r.direction ?? null,
				assets: Array.isArray(r.assets) ? r.assets : [],
				assetRepresentation: r.assetRepresentation ?? null,
				mechanism: r.mechanism ?? null,
				sourceUrl: r.sourceUrl ?? null,
				asOf: r.asOf ?? null,
			})),
		);
	for (const [slug, routes] of Object.entries(ROUTES_SET)) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = r.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project "${slug}" — skipped`);
			continue;
		}
		if (normRoutes(d.routes) === normRoutes(routes)) {
			console.log(`  ${slug}: routes already in sync, skip`);
			continue;
		}
		console.log(
			`  ${slug}: routes ← ${routes.length} row(s) (${routes
				.map((rt) => `${rt.fromChain}↔${rt.toChain}`)
				.join(", ")})`,
		);
		writes.push({ id: d.id, slug, data: { routes } });
	}

	console.log("\n── DEX venue roles (sls-035 #517, EXACT-SYNC) ──");
	for (const [slug, role] of Object.entries(VENUE_ROLE)) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = r.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project "${slug}" — skipped`);
			continue;
		}
		if (d.venueRole === role) {
			console.log(`  ${slug}: venueRole already '${role}', skip`);
			continue;
		}
		console.log(`  ${slug}: venueRole ${d.venueRole ?? "null"} → ${role}`);
		writes.push({ id: d.id, slug, data: { venueRole: role } });
	}

	console.log("\n── Duplicate merges (canonicalSlug lineage, class 10) ──");
	for (const m of DUPE_MERGES) {
		const [rc, rd] = await Promise.all(
			[m.canonical, m.dupe].map((slug) =>
				payload.find({
					collection: "projects",
					where: { slug: { equals: slug } },
					limit: 1,
					depth: 0,
					overrideAccess: true,
				}),
			),
		);
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const canon = rc.docs[0] as any;
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const dupe = rd.docs[0] as any;
		if (!canon || !dupe) {
			console.log(`  WARN: ${m.canonical}/${m.dupe} — record missing, skipped`);
			continue;
		}
		if (canon.canonicalSlug) {
			console.log(
				`  WARN: canonical ${m.canonical} itself points at '${canon.canonicalSlug}' — review, skipped`,
			);
			continue;
		}

		// canonical absorbs complementary facts (fill-if-empty only)
		// biome-ignore lint/suspicious/noExplicitAny: partial update payload
		const cData: any = {};
		if (m.fill?.shortDescription && !canon.shortDescription?.trim())
			cData.shortDescription = m.fill.shortDescription;
		if (m.fill?.github && !canon.links?.github)
			cData.links = { ...(canon.links ?? {}), github: m.fill.github };
		if (m.copyScf && !canon.scf?.awarded && dupe.scf?.awarded) {
			cData.scf = {
				...(canon.scf ?? {}),
				awarded: true,
				totalAwarded: dupe.scf.totalAwarded ?? null,
				awardedRounds: dupe.scf.awardedRounds ?? [],
			};
		}
		if (Object.keys(cData).length) {
			console.log(
				`  ${m.canonical}: absorb from ${m.dupe} (${Object.keys(cData).join(", ")})`,
			);
			writes.push({ id: canon.id, slug: m.canonical, data: cData });
		}

		// dupe becomes a lineage shadow (guarded; never deleted)
		// biome-ignore lint/suspicious/noExplicitAny: partial update payload
		const dData: any = {};
		if (!dupe.canonicalSlug) dData.canonicalSlug = m.canonical;
		else if (dupe.canonicalSlug !== m.canonical) {
			console.log(
				`  WARN: ${m.dupe} already points at '${dupe.canonicalSlug}' ≠ '${m.canonical}' — review, skipped`,
			);
			continue;
		}
		// ONE OWNER, ONE STATUS FOR A DUPLICATE (2026-09-05). This wrote
		// Inactive — a DEATH VERDICT ("defunct/abandoned") on a row that is
		// merely a duplicate — and it fought the dedup lane, which parks the
		// lower-ranked twin at Draft: on 2026-09-05 detect-duplicate-projects
		// hid 11 rows as Draft and this step re-marked them Inactive 30 minutes
		// later, leaving 29+ duplicates served through the raw API as dead
		// projects. A duplicate is HIDDEN, never dead: park it at Draft, the
		// same end state the dedup lane writes. Name continuity survives —
		// statusAdmissionWhere() admits a shadow as a fold candidate at ANY
		// status, so a lookup of the old name still folds to the canonical.
		//
		// EXCEPT a human death verdict: a genuinely dead project that also
		// happens to be a duplicate keeps the status a human gave it. No lane
		// overwrites that.
		const humanDeathVerdict =
			dupe.status === "Inactive" &&
			dupe.statusBasis === "human-verified" &&
			!!dupe.statusSourceUrl;
		if (humanDeathVerdict) {
			console.log(
				`  ${m.dupe}: human death verdict kept, not re-parked (Inactive, human-verified, ${dupe.statusSourceUrl})`,
			);
		} else if (dupe.status !== "Draft") {
			dData.status = "Draft";
		}
		if (!dupe.lifecycle?.note)
			dData.lifecycle = {
				...(dupe.lifecycle ?? {}),
				note: `Duplicate record of '${m.canonical}' (same project, split entry) — funding, status and repos live on the canonical record. Merged ${ASOF}.`,
			};
		if (Object.keys(dData).length) {
			// Name the status TRANSITION, not just the key: this line is the dry
			// run's only evidence of what the pass would do to a duplicate, and
			// "status was 'Inactive'" reads identically whether the pass parks the
			// row at Draft or re-marks it dead.
			console.log(
				`  ${m.dupe}: → shadow of ${m.canonical} (${Object.keys(dData).join(", ")}; status '${dupe.status}' ${dData.status ? `→ '${dData.status}'` : "kept"})`,
			);
			writes.push({ id: dupe.id, slug: m.dupe, data: dData });
		} else {
			console.log(
				`  ${m.dupe}: already linked + parked (${dupe.status}), skip`,
			);
		}
	}

	console.log("\n── Docs links (fill-if-empty) ──");
	for (const [slug, docsUrl] of Object.entries(DOCS_LINKS)) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = r.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project "${slug}" — skipped`);
			continue;
		}
		if (d.links?.docs) {
			console.log(`  ${slug}: links.docs already set, skip`);
			continue;
		}
		console.log(`  ${slug}: links.docs → ${docsUrl}`);
		writes.push({
			id: d.id,
			slug,
			data: { links: { ...(d.links ?? {}), docs: docsUrl } },
		});
	}

	console.log(`\n${writes.length} write(s) planned.`);
	if (!EXECUTE) {
		console.log("DRY RUN — none applied.");
		// honor exitCode set by failed writes/creates (a bare exit(0) was
		// stomping it — the 2026-07-09 seed failure ran green).
		process.exit(process.exitCode ?? 0);
	}
	// Per-write isolation (2026-07-09 incident: one ValidationError — an
	// enum value missing from the Types options — aborted the whole batch,
	// losing 12 valid writes). A bad row fails loudly; the rest still land.
	let failed = 0;
	for (const w of writes) {
		try {
			await payload.update({
				collection: "projects",
				id: w.id,
				data: w.data,
				overrideAccess: true,
			});
			console.log(`  wrote: ${w.slug}`);
		} catch (err) {
			failed++;
			console.error(`  FAILED: ${w.slug} — ${String(err)}`);
		}
	}
	if (failed) {
		console.error(`\n${failed} write(s) FAILED — fix and re-run.`);
		process.exitCode = 1;
	}
	console.log(`\nDONE: ${writes.length} write(s) applied.`);
	// exit(0) STOMPED the exitCode set above (same bug enrich-repos fixed):
	// failed writes exited green. Honor the failure code.
	process.exit(process.exitCode ?? 0);
}

main().catch((e) => {
	console.error("Fatal:", e);
	process.exit(1);
});
