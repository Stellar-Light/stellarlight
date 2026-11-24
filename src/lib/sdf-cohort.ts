/**
 * The SDF cohort: launch and retention data for the directory's projects,
 * served only to partners named in COHORT_PARTNERS (GET /api/cohort/* and the
 * dashboard at /partners/sdf/cohort).
 *
 * The data is a dated snapshot built by scripts/build-sdf-cohort.ts from
 * checked, private files. This repository is public, so the bundle is
 * committed encrypted (AES-256-GCM over gzipped JSON) and read with
 * COHORT_DATA_KEY. Every figure the endpoints serve is computed here from
 * the bundled rows, so the API and the dashboard always agree.
 */
import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
	timingSafeEqual,
} from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { type NextRequest, NextResponse } from "next/server";
import { apiError, rateLimited } from "./api-error";
import type { ProjectStatus } from "./project-status";
import { partnerOf, rateLimit, rateLimitHeaders } from "./rate-limit";

export const COHORT_FILE = "data/cohort/cohort.json.gz.enc";

// ---------------------------------------------------------------- types

/** SCF award kinds as SCF's own records name them (legacy = v1 to v5;
 * unknown = SCF records the award without a type). */
export const AWARD_TYPES = [
	"build",
	"legacy",
	"public-goods",
	"liquidity",
	"unknown",
] as const;
export const COHORT_STATUSES = ["Live", "Inactive"] as const;
/** Day 180 by SDF's plan definition (two independent signal kinds). */
export const DAY180_TWO_SIGNAL_READINGS = [
	"active",
	"one signal kind",
	"no activity seen",
	"could not check",
	"too early",
	"no launch date",
] as const;
export const SIGNAL_KINDS = ["on-chain", "code", "SCF", "hackathon"] as const;
export const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;
/** SDF's plan's project types, mapped from the directory category. */
export const PLAN_TYPES = [
	"application",
	"infrastructure",
	"developer tool",
	"asset issuer",
] as const;
const PLAN_TYPE_OF: Record<string, (typeof PLAN_TYPES)[number]> = {
	"User-Facing App": "application",
	"Protocol/Contract": "application",
	Infrastructure: "infrastructure",
	Anchor: "infrastructure",
	Tooling: "developer tool",
	Asset: "asset issuer",
};
export const planTypeOf = (category: string | null) =>
	(category && PLAN_TYPE_OF[category]) || null;
export const LAUNCH_EVIDENCE = ["on-chain", "product", "none"] as const;
export const LAUNCH_KNOWN_BASES = [
	"dated",
	"scf-mainnet-paid-by",
	"scf-mainnet-paid-undated",
] as const;

export interface BuildAward {
	/** SCF round number. */
	round: number;
	budgetUsd: number;
	/** thirds (rounds 30 to 40, inferred from paid shares) or four-tranche
	 * (rounds 41 on, the Handbook's schedule). */
	schedule: string | null;
	/** Share of this award SCF reports paid, split by the tranche schedule;
	 * null when the page's figures do not split exactly. */
	paidShare: number | null;
	/** The final (mainnet) tranche is paid; null when the page does not split. */
	mainnetTranchePaid: boolean | null;
}

export interface CohortProject {
	slug: string;
	name: string | null;
	inCohort: boolean;
	category: string | null;
	status: ProjectStatus | null;
	statusBasis: string | null;
	statusVerdictDate: string | null;
	scfAwarded: boolean;
	scfAwardKinds: (typeof AWARD_TYPES)[number][];
	scfAwardCount: number;
	firstScfRound: number | null;
	firstScfSubmission: string | null;
	firstScfAward: string | null;
	firstScfAwardDateBasis: string | null;
	firstAwardType: (typeof AWARD_TYPES)[number] | null;
	firstAwardUsd: number | null;
	firstAwardSize: string | null;
	scfPage: string | null;
	scfTotalAwardedUsd: number | null;
	scfTotalPaidUsd: number | null;
	scfPaidSplit: string | null;
	buildAwards: BuildAward[] | null;
	mainnetTranchePaid: boolean | null;
	mainnetPaidBy: string | null;
	mainnetNotYetPaidOn: string | null;
	scfBuildStageNow: string | null;
	scfTestnetTrancheBy: string | null;
	scfMainnetTrancheWindow: string | null;
	events: number;
	sourcesSeeingIt: number;
	firstSignal: string | null;
	firstSignalEvent: string | null;
	domainRegistered: string | null;
	siteFirstSeen: string | null;
	firstRepo: string | null;
	startedBuildingOnStellar: string | null;
	firstHackathon: string | null;
	mainnetContractCreated: string | null;
	firstContractEventInclSetup: string | null;
	appReleased: string | null;
	firstPackage: string | null;
	firstRelease: string | null;
	launchDate: string | null;
	launchBasis: string | null;
	launchEvidence: (typeof LAUNCH_EVIDENCE)[number] | null;
	launchBeforeFirstAward: boolean | null;
	daysAwardToLaunch: number | null;
	plannedMainnetBy: string | null;
	planReading: string | null;
	launchKnownDate: string | null;
	launchKnownBasis: (typeof LAUNCH_KNOWN_BASES)[number] | null;
	day180Date: string | null;
	day180Reading: string | null;
	day180Signals: string[] | null;
	day180SignalsChecked: string[] | null;
	day180Code: string | null;
	day180Onchain: string | null;
	day180TwoSignals: (typeof DAY180_TWO_SIGNAL_READINGS)[number] | null;
	day180SignalKinds: (typeof SIGNAL_KINDS)[number][] | null;
	confidence: (typeof CONFIDENCE_LEVELS)[number] | null;
	confidenceScore: number | null;
	confidenceBasis: string | null;
	planType: (typeof PLAN_TYPES)[number] | null;
	operatingNow: string | null;
	operatingEvidenceDate: string | null;
	observable: boolean | null;
	productProbe: string | null;
	productProbeDetail: string | null;
	contracts: number | null;
	deployersToExclude: number | null;
	accounts: number | null;
	assets: number | null;
	usedByProjects: number | null;
	contractUpgrades: number;
	lastUpgrade: string | null;
	tvlPeak: string | null;
	audits: number;
	tools: string[] | null;
	lastOnchainEvent: string | null;
	lastCommit: string | null;
	appLastUpdated: string | null;
	mainnetReading: string | null;
	reposScanned: number | null;
	idsInReposOnMainnet: number | null;
	idsInReposNotOnMainnet: number | null;
	idsInReposLiveOnTestnet: number | null;
	codeActivityNow: string | null;
	ghRepos: number | null;
	ghCommitsLast3Months: number | null;
	ghCommitsLast12Months: number | null;
	ghActiveMonthsOfLast12: number | null;
	ghReleasesAndPackageVersionsLast12Months: number | null;
	tomlOwnAccountCreated: string | null;
	tomlDeclaredAccountCreated: string | null;
	lastActivity: string | null;
	lastActivityEvent: string | null;
	stoppedOn: string | null;
	onchainIds: {
		contracts: string[];
		deployersToExclude: string[];
		accounts: string[];
		assets: string[];
	};
	usage: UsageReading[] | null;
	evidenceNotes: string[];
	gaps: string[];
}

/** Distinct non-team callers and events, one tier of the project's ids. */
export interface UsageReading {
	tier: string;
	distinctCallers30d: number | null;
	distinctCallers90d: number | null;
	events30d: number | null;
	events60d: number | null;
	events90d: number | null;
	lowerBound: boolean;
	readAt: string;
}

/** date, datePrecision, dateUpper, stage, event, detail, evidenceUrl, source, strength, basis */
export type JourneyTuple = [
	string,
	string,
	string | null,
	string,
	string,
	string | null,
	string | null,
	string,
	string,
	string,
];

export interface ScfPage {
	scfSlug: string;
	slug: string | null;
	/** "exact" when the paid figure split exactly into tranches, else why not
	 * (no-fit, budgets-differ, ambiguous); null with no paid figure. */
	split: string | null;
	buildAwards: BuildAward[];
}

export interface RegisterRow {
	section: string;
	fact: string;
	value: string;
	measuredFrom: string;
	asOf: string;
	cannotSee: string;
}

export interface CohortBundle {
	asOf: string;
	/** The date launch ages are counted to (the register's retention as-of). */
	retentionAsOf: string;
	/** When each kind of reading was made (the snapshot mixes dates). */
	asOfDates: Record<string, string>;
	builtAt: string;
	sources: string[];
	register: RegisterRow[];
	projects: CohortProject[];
	journey: Record<string, JourneyTuple[]>;
	scfPages: ScfPage[];
}

// ------------------------------------------------------------ the gate

/** Partners allowed to read the cohort: COHORT_PARTNERS="sdf,other". */
export function cohortPartner(req: NextRequest): string | null {
	const name = partnerOf(req);
	if (!name) return null;
	const allowed = (process.env.COHORT_PARTNERS ?? "")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	return allowed.includes(name) ? name : null;
}

/** Keyed data: never cached by a shared cache, never indexed. */
export const COHORT_PRIVATE_HEADERS = {
	"Cache-Control": "private, no-store",
	"X-Robots-Tag": "noindex, nofollow",
};

/**
 * Every cohort route starts here: the per-caller rate window, then the key
 * gate, then the bundle. A caller without an allowed key gets a 401 with one
 * line and nothing else, whatever the reason (no key, an unknown key, a
 * partner key not on COHORT_PARTNERS), so the answer says nothing about which.
 */
export function cohortRequest(
	req: NextRequest,
	endpoint: string,
):
	| { bundle: CohortBundle; headers: Record<string, string> }
	| { response: NextResponse } {
	const startedAt = Date.now();
	const limit = rateLimit(req, { endpoint, limit: 60, windowMs: 60_000 });
	if (!limit.allowed) return { response: rateLimited(limit, { startedAt }) };
	if (!cohortPartner(req))
		return {
			response: NextResponse.json(
				{
					error: "A cohort partner key is required.",
					hint: "Send it as Authorization: Bearer <key> or x-api-key.",
				},
				{
					status: 401,
					headers: {
						"WWW-Authenticate": 'Bearer realm="cohort"',
						...COHORT_PRIVATE_HEADERS,
					},
				},
			),
		};
	let bundle: CohortBundle | null = null;
	try {
		bundle = loadCohort();
	} catch {
		// a wrong key or a missing file: the same 503 below
	}
	if (!bundle)
		return {
			response: apiError({
				status: 503,
				error: "cohort data unavailable",
				advisory:
					"The cohort bundle could not be opened on this deployment (its data key is missing or does not match). This is a configuration fault, not a claim about any project.",
				startedAt,
				headers: COHORT_PRIVATE_HEADERS,
			}),
		};
	return {
		bundle,
		headers: { ...rateLimitHeaders(limit), ...COHORT_PRIVATE_HEADERS },
	};
}

/** A 400 for a parameter or value the route does not know. */
export const cohortBadRequest = (
	error: string,
	extra: Record<string, unknown>,
) =>
	NextResponse.json(
		{ error, ...extra },
		{ status: 400, headers: COHORT_PRIVATE_HEADERS },
	);

/** meta every cohort response carries. */
export function cohortMeta(b: CohortBundle, cannotSee: string[] = []) {
	return {
		partnerOnly: true,
		asOf: b.asOf,
		launchAgesCountedTo: b.retentionAsOf,
		asOfDates: b.asOfDates,
		builtAt: b.builtAt,
		sources: b.sources,
		cannotSee: [...COHORT_CANNOT_SEE, ...cannotSee],
	};
}

// --------------------------------------------------------- the bundle

function bundleKey(keyB64: string): Buffer {
	const key = Buffer.from(keyB64, "base64");
	if (key.length !== 32) throw new Error("COHORT_DATA_KEY is not 32 bytes");
	return key;
}

/** AES-256-GCM: 12-byte IV, 16-byte tag, then the ciphertext of gzipped JSON. */
export function encryptBundle(bundle: CohortBundle, keyB64: string): Buffer {
	const iv = randomBytes(12);
	const c = createCipheriv("aes-256-gcm", bundleKey(keyB64), iv);
	const body = Buffer.concat([
		c.update(gzipSync(JSON.stringify(bundle), { level: 9 })),
		c.final(),
	]);
	return Buffer.concat([iv, c.getAuthTag(), body]);
}

export function decryptBundle(buf: Buffer, keyB64: string): CohortBundle {
	const d = createDecipheriv(
		"aes-256-gcm",
		bundleKey(keyB64),
		buf.subarray(0, 12),
	);
	d.setAuthTag(buf.subarray(12, 28));
	const zipped = Buffer.concat([d.update(buf.subarray(28)), d.final()]);
	return JSON.parse(gunzipSync(zipped).toString("utf8")) as CohortBundle;
}

let cached: { digest: Buffer; bundle: CohortBundle } | null = null;

/** The bundle, or null when COHORT_DATA_KEY is not set. Throws when the file
 * cannot be read or the key does not open it. */
export function loadCohort(): CohortBundle | null {
	const keyB64 = process.env.COHORT_DATA_KEY?.trim();
	if (!keyB64) return null;
	const digest = createHash("sha256").update(keyB64).digest();
	if (cached && timingSafeEqual(cached.digest, digest)) return cached.bundle;
	const bundle = decryptBundle(
		readFileSync(join(process.cwd(), COHORT_FILE)),
		keyB64,
	);
	cached = { digest, bundle };
	return bundle;
}

// ------------------------------------------------------------ meaning

export const COHORT_CANNOT_SEE = [
	"Exact SCF tranche approval and payment dates: SDF holds them. We read SCF's paid amounts, and dates only through web archive captures of SCF pages since about March 2026, so a launch known from SCF's payment carries an upper bound, not a date.",
	"Contract callers are measured for the projects with ids in our map (usage on each row): distinct accounts outside the team in the 90 days to the read, from Stellar Index events and Horizon transactions. The team is excluded where our map, a contract's storage or its behaviour names it; a team bot no record names counts as one user, and samples or read caps make some counts a floor (usage[].lowerBound).",
	"SDF's plan's events bar (1,000 on-chain events in the 60 days around day 180, deployer excluded) is not computed for any project: free sources serve a contract's events only for recent windows and do not split events by caller. usage[].events60d is the latest 60 days with every caller counted, a current reading, never a day-180 one.",
	"Closed-source products: with no public code, silence in commits says little. Absence of a reading is never inactivity.",
	"Contract use through sub-calls only (no event is emitted), anything before Stellar Index's coverage (2024-02-20), and Horizon history before 2025-10-10.",
	"Projects never listed in the directory, rows listed after 2026-11-21 (8 Inactive, 6 of them SCF-funded; 2 in development; 140 drafts), and SCF awards SCF has not published.",
	"Builder-support funding beyond SCF: Instawards, other grants, RFP awards and hackathon prizes are not in our records per project (we hold hackathon entries, not prize outcomes), so SDF's plan's wider builder-support funded origin cannot be filled. SCF-funded here means SCF's own award records only.",
	"Whether a fully paid Build award's final deliverable was a mainnet launch or an allowed equivalent. Legacy, Public Goods and Liquidity awards were paid in full on award, so their payment says nothing about launch.",
	"Security incidents: one is recorded from the ledger (Comet's BLND:USDC pool, drained 2026-08-25; on the comet and blend journeys). Others are not read.",
	"Directory status history before 2026-10-02. Social posts and news are not read; composability is read from code (usedByProjects), not dated.",
];

export const COHORT_DEFINITIONS = {
	cohort:
		"Ours. Every directory project, of the 1,012 listed on 2026-11-21, with status Live or Inactive on the live read (meta.asOfDates.statuses). The directory's Live means the product answers (often: its site loads), not that it is on mainnet. SCF-funded rows that have not launched (Development, Pre-Release, Draft) are outside the cohort and counted apart (cohort.scfFundedOutsideCohort).",
	scfFunded:
		"SCF's own award records list at least one award for the project, of any type: Build, Public Goods, Liquidity, Legacy (v1 to v5), or unknown when SCF records no type (scfAwardKinds). Read from the live directory rows, which carry SCF's records. Not SDF's plan's wider builder-support funded origin (see cannotSee).",
	firstScfAward:
		"The first award's round decision date; an award with no round (quarterly Public Goods, Liquidity) is dated to the last day of its quarter, so the award is no later than that day (firstScfAwardDateBasis).",
	launchDate:
		"Ours, with SDF's plan's final-tranche fallback in launchKnown. The earliest dated evidence of the strongest kind: on chain (the project's own contract created on mainnet, proved in the ledger; its first Stellar TVL day; its own asset first held), else product (first store release, first package, first GitHub release). A planned date from an SCF proposal is never a launch. Where SDF's plan asks a developer tool for a public release with at least one downstream mainnet user, we count any first release or package and do not test for a user (usedByProjects is the nearest reading).",
	launchKnown:
		"A dated launch, or SCF's own record that it paid the mainnet tranche of a Build award (SDF's plan's fallback). For a launch known only from SCF's payment, the date is the first web archive capture showing it paid (an upper bound: the launch was no later), or the date launch ages are counted to when no capture bounds it. When our dated launch is later than SCF's paid-by bound, the bound is used and evidenceNotes says so.",
	launchBeforeFirstAward:
		"The launch we can see is more than 30 days older than the first SCF award: an existing product funded later, not a launch the grant produced. Figures that mix both are split by it (byLaunchTiming).",
	day180TwoSignals:
		"SDF's plan definition, the headline: active at day 180 needs at least two independent signal kinds in the window (day 150 to day 210 after a dated launch), and commits are never enough alone. Kinds we can read: on-chain (contract events, counted events or account operations, new trustlines), code (commits, releases and package versions are one kind, the repository), SCF (an award or new submission decided in the window, or a tranche paid inside it), hackathon (an entry dated in it). one signal kind: not active by this definition. Social posts, news and reported users are not read; composability is not dated. no activity seen, could not check, too early and no launch date are read as in day180.",
	day180:
		"Ours, shown beside SDF's plan definition: one signal is enough. The window is day 150 to day 210 after launch. activity seen: at least one signal showed activity in the window. no activity seen: a signal source held a value for the window and none showed activity (read it with day180SignalsChecked). could not check: nothing we hold has a value for that window. too early: day 210 is after the readings' date. A project that launched on chain is only called quiet by its contract events or its asset's trustlines.",
	operatingNow:
		"Ours, not in SDF's plan. For SCF projects whose first award is at least 180 days old on the readings' date: the strongest current evidence it operates. on-chain: an event on a contract proved to be the project's, or a movement of its own asset, in the last 90 days; any caller counts, the team's own and keeper calls included and no deployer excluded, so this is activity on chain, not use by others (usage measures that). product: the live product shows Stellar (product probe, 2026-11-23). person: a person's check recorded in the directory in the last 90 days. app: a store release in the last 180 days (a longer window). code: commits in the last 3 months, maintenance, counted apart. recorded inactive: the directory's status, served as recorded and read before any evidence; evidenceNotes says where our own data contradicts it. none: no reading, never inactive. null: first award under 180 days old or no SCF award, not read, and left out of every denominator.",
	observable:
		"The project has an on-chain id or an app store listing, so operating can be seen. A group with more of these looks healthier overall even when it is not: compare groups within the same column.",
	scfConfirmedRetention:
		"Ours. Of directory projects whose Build award SCF paid in full (the mainnet tranche), those whose known launch is at least 180 days old on the date launch ages are counted to, with their operating-now reading (windows as in operatingNow: 90 days for on-chain and a person's check, 180 days for a store release). Every launch is past day 180; operating now is today's evidence, one reading, not continuity since launch. Rows not read (first award under 180 days old) are counted apart.",
	deliveryByRound:
		"From SCF's own figures. Build awards whose paid share SCF's page figures give exactly, by round, and how many have the final (mainnet) tranche paid, over every directory row except drafts, as /api/projects/scf-rounds counts them. The tranche schedule: for rounds 41 on, the SCF Handbook's four tranches (10%, 20%, 30%, 40%, the last on mainnet launch); for rounds 30 to 40 it is inferred from the paid shares on single-award pages (one third, two thirds, all: three equal tranches, the third on mainnet), as the current Handbook does not state it. The latest rounds are still inside SCF's tranche deadlines.",
	confidence:
		"The confidence of a record's reading, by the cohort's rule: on-chain evidence weighs 2; SCF, hackathon and code (commits) weigh 1 each, summed over the evidence behind the reading (the day-180 kinds seen, or for no activity seen the kinds checked, or else the launch evidence). high: 3 or more; medium: 2; low: 1 or less. Always low when the launch is backfilled from SCF's payment bound, when our own data contradicts the record (evidenceNotes), or when no activity seen rests on code alone. SDF's plan rates any single signal low; under this rule on-chain alone reaches medium. confidenceBasis shows the sum.",
	planType:
		"SDF's plan's project types, mapped from the directory category: User-Facing App and Protocol/Contract to application, Infrastructure and Anchor to infrastructure, Tooling to developer tool, Asset to asset issuer (a type the plan leaves undecided). null without a category.",
	usedByProjects:
		"How many other directory projects name this one in their code: their repositories name its mainnet contracts or depend on its packages (repository scan 2026-11-21 and manifests). Named in code, not proved on chain; a contract or package several rows share is not counted. Undated.",
	usage:
		"Distinct accounts outside the team that called the project's contracts or paid into its accounts, per tier of ids (strong: proved; labelled: a third party's attribution), in the 30 and 90 days to readAt, with the events its contracts emitted in 30, 60 and 90 days (every caller counted). The team excluded: deployers, addresses a contract's storage names as admin or operator, every address our map ties to the project, and addresses that only call admin or price-feed functions; 12 infrastructure addresses calling more than 8 projects are never users. lowerBound: a sample or a read cap, so the count is a floor. null: not measured.",
	onchainIds:
		"The ids our on-chain map ties to the project: its contracts (proved or labelled), deployer accounts to leave out of usage, its own accounts and its own assets. An empty list means none in our map, not none on chain.",
	evidenceNotes:
		"Where our own data contradicts the recorded status or reading (for example a row recorded Inactive whose contracts outside callers still use), or a ledger-checked record adds context. Statuses are never moved here; the row keeps its recorded status.",
	stoppedOn:
		"The first day a daily directory snapshot recorded the project as Inactive (snapshots since 2026-10-02). It is the day we recorded the verdict, not the day the project stopped; statusVerdictDate is when the current status was set.",
	planReading:
		"The team's own planned mainnet date (its SCF proposal's mainnet deliverable) set against what we can see, once that date is more than 90 days past: on-chain launch seen; a product release seen, nothing on chain; live on testnet, nothing on mainnet; or no launch evidence of any kind. A plan is never a launch.",
	mainnetReading:
		"What the project's own repositories say about mainnet: the contract ids they name, each checked on a mainnet node. own contract on mainnet, proved; names mainnet contracts, none shown to be its own; names only ids that are not on mainnet (some live on testnet now, or none); repos read, no contract id named; no repos to read.",
} as const;

// ------------------------------------------------------------ register

/** Text that must never reach a partner: local paths and internal ids. */
export const BANNED_IN_BUNDLE = [
	/\/Users\/|\/home\/|~\//,
	/\bsls-\d+/i,
	/\bRaven\b/,
	/\br11\d\d-[a-z]/,
	/\blane\/|\bspec 1\.\d+\.\d+/i,
	/, developer |gh_contributors|ghContributors/,
];

/** The bundle's text as BANNED_IN_BUNDLE reads it: every field but project
 * names (a directory project may be called Raven). */
export const servedText = (b: CohortBundle) =>
	JSON.stringify({
		...b,
		projects: b.projects.map(({ name: _name, ...p }) => p),
	});

/** Facts register sections served (by heading prefix). The rest are review
 * lists for the owner (status moves, labels, probes of named sites) and the
 * register's own change log. */
export const REGISTER_SECTIONS: Record<string, string> = {
	"The cohort": "cohort",
	"Operating after the award": "operating",
	"Verifiable usage": "usage",
	"SCF's own payments": "scf-payments",
};

/** The served rows of the facts register's Markdown tables. */
export function parseRegister(md: string): RegisterRow[] {
	const out: RegisterRow[] = [];
	let section: string | null = null;
	for (const line of md.split("\n")) {
		if (line.startsWith("## ")) {
			const h = line.slice(3);
			section =
				Object.entries(REGISTER_SECTIONS).find(([k]) => h.startsWith(k))?.[1] ??
				null;
			continue;
		}
		if (!section || !line.startsWith("|")) continue;
		const cells = line
			.split("|")
			.slice(1, -1)
			.map((c) => c.trim());
		if (cells.length !== 5 || cells[0] === "Fact" || /^-+$/.test(cells[0]))
			continue;
		const [fact, value, measuredFrom, asOf, cannotSee] = cells;
		out.push({ section, fact, value, measuredFrom, asOf, cannotSee });
	}
	return out;
}

// ------------------------------------------------------------ projects

export interface ProjectFilters {
	scfAwarded?: boolean;
	firstAwardYear?: string;
	awardType?: (typeof AWARD_TYPES)[number];
	category?: string;
	status?: ProjectStatus;
}

export function filterProjects(
	b: CohortBundle,
	f: ProjectFilters,
): CohortProject[] {
	const cat = f.category?.toLowerCase();
	return b.projects.filter(
		(p) =>
			(f.scfAwarded === undefined || p.scfAwarded === f.scfAwarded) &&
			(!f.firstAwardYear ||
				p.firstScfAward?.slice(0, 4) === f.firstAwardYear) &&
			(!f.awardType || p.firstAwardType === f.awardType) &&
			(!cat || p.category?.toLowerCase() === cat) &&
			(!f.status || p.status === f.status),
	);
}

export const categoriesOf = (b: CohortBundle) =>
	[
		...new Set(b.projects.map((p) => p.category).filter((c) => c !== null)),
	].sort() as string[];

// ------------------------------------------------------------- journey

export interface JourneyEvent {
	date: string;
	datePrecision: string;
	dateUpper: string | null;
	stage: string;
	event: string;
	detail: string | null;
	evidenceUrl: string | null;
	source: string;
	strength: string;
	basis: string;
}

/** A project's events, oldest first; null for a slug the bundle lacks. */
export function journeyOf(
	b: CohortBundle,
	slug: string,
): JourneyEvent[] | null {
	if (!b.projects.some((p) => p.slug === slug)) return null;
	return (b.journey[slug] ?? [])
		.map(
			([
				date,
				datePrecision,
				dateUpper,
				stage,
				event,
				detail,
				evidenceUrl,
				source,
				strength,
				basis,
			]) => ({
				date,
				datePrecision,
				dateUpper,
				stage,
				event,
				detail,
				evidenceUrl,
				source,
				strength,
				basis,
			}),
		)
		.sort((x, y) => x.date.localeCompare(y.date));
}

// ----------------------------------------------------------- retention

const OPERATING = new Set(["on-chain", "product", "person", "app"]);
const count = <T>(xs: T[], f: (x: T) => boolean) => xs.filter(f).length;
const days = (from: string, to: string) =>
	Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
const tally = (xs: Array<string | null>, none = "not read") => {
	const out: Record<string, number> = {};
	for (const x of xs) {
		const k = x ?? none;
		out[k] = (out[k] ?? 0) + 1;
	}
	return out;
};
const operating = (p: CohortProject) => OPERATING.has(p.operatingNow ?? "");
/** Operating now was read: SCF, first award at least 180 days old. */
const read = (p: CohortProject) => p.operatingNow !== null;

function launchSplit(rows: CohortProject[]) {
	const two = (r: (typeof DAY180_TWO_SIGNAL_READINGS)[number]) =>
		count(rows, (p) => p.day180TwoSignals === r);
	return {
		projects: rows.length,
		launchBasis: {
			onChain: count(rows, (p) => p.launchEvidence === "on-chain"),
			product: count(rows, (p) => p.launchEvidence === "product"),
			plannedOnly: count(
				rows,
				(p) =>
					p.launchEvidence === "none" && p.launchBasis === "planned date only",
			),
			none: count(
				rows,
				(p) =>
					p.launchEvidence === "none" && p.launchBasis !== "planned date only",
			),
		},
		day180TwoSignals: {
			active: two("active"),
			oneSignalKind: two("one signal kind"),
			noActivitySeen: two("no activity seen"),
			couldNotCheck: two("could not check"),
			tooEarly: two("too early"),
			noLaunchDate: two("no launch date"),
		},
		day180: {
			activitySeen: count(rows, (p) => p.day180Reading === "activity seen"),
			noActivitySeen: count(
				rows,
				(p) => p.day180Reading === "no activity seen",
			),
			couldNotCheck: count(
				rows,
				(p) => !!p.day180Reading?.startsWith("could not check"),
			),
			tooEarly: count(rows, (p) => p.day180Reading === "too early"),
			noLaunchDate: count(rows, (p) => p.day180Reading === "no launch date"),
		},
		confidence: {
			high: count(rows, (p) => p.confidence === "high"),
			medium: count(rows, (p) => p.confidence === "medium"),
			low: count(rows, (p) => p.confidence === "low"),
		},
	};
}

function operatingGroup(label: string, rows: CohortProject[]) {
	const obs = rows.filter((p) => p.observable);
	const rest = rows.filter((p) => !p.observable);
	const op = (xs: CohortProject[]) => count(xs, operating);
	return {
		group: label,
		projects: rows.length,
		operating: op(rows),
		observable: { projects: obs.length, operating: op(obs) },
		notObservable: { projects: rest.length, operating: op(rest) },
	};
}

function groupBy(
	rows: CohortProject[],
	key: (p: CohortProject) => string,
	order?: readonly string[],
) {
	const m = new Map<string, CohortProject[]>();
	for (const p of rows) {
		const k = key(p);
		m.set(k, m.get(k) ?? []);
		m.get(k)?.push(p);
	}
	const keys = order ? order.filter((k) => m.has(k)) : [...m.keys()].sort();
	return keys.map((k) => [k, m.get(k) ?? []] as const);
}

const SIZE_ORDER = [
	"under $50K",
	"$50K to $100K",
	"$100K to $150K",
	"$150K and over",
	"undisclosed",
];

/** Past day 180 and read, split by when the launch came against the first
 * award: an older product funded later is not a launch the grant produced. */
function byLaunchTiming(past: CohortProject[]) {
	const before = (p: CohortProject) =>
		p.launchKnownBasis === "dated" && p.launchBeforeFirstAward === true;
	return (
		[
			[
				"launched more than 30 days before the first award",
				past.filter(before),
			],
			[
				"launched on or after the first award, or known only from SCF's payment",
				past.filter((p) => !before(p)),
			],
		] as const
	).map(([group, rows]) => ({
		group,
		pastDay180: rows.length,
		read: count(rows, read),
		operating: count(rows, operating),
	}));
}

const callersOf = (p: CohortProject) =>
	Math.max(-1, ...(p.usage ?? []).map((u) => u.distinctCallers90d ?? -1));
const CALLER_BANDS = [
	["0", 0, 0],
	["1 to 9", 1, 9],
	["10 to 49", 10, 49],
	["50 to 99", 50, 99],
	["100 or more", 100, Number.POSITIVE_INFINITY],
] as const;
function callerBands(rows: CohortProject[]) {
	const measured = rows.filter((p) => callersOf(p) >= 0);
	return {
		measured: measured.length,
		notMeasured: rows.length - measured.length,
		bands: CALLER_BANDS.map(([band, lo, hi]) => ({
			band,
			projects: count(
				measured,
				(p) => callersOf(p) >= lo && callersOf(p) <= hi,
			),
		})),
	};
}

/** Every aggregate the retention endpoint and the dashboard show. */
export function cohortRetention(b: CohortBundle) {
	const cohort = b.projects.filter((p) => p.inCohort);
	const scf = cohort.filter((p) => p.scfAwarded);
	const notScf = cohort.filter((p) => !p.scfAwarded);
	const asOf = b.retentionAsOf;
	const pastDay180 = (p: CohortProject) =>
		!!p.launchKnownDate && days(p.launchKnownDate, asOf) >= 180;

	// launch known -> past day 180 -> operating now (of those read), SCF-funded
	const known = scf.filter((p) => p.launchKnownBasis);
	const past = known.filter(pastDay180);
	const pastRead = past.filter(read);
	const funnel = [
		{
			stage: "SCF-funded",
			projects: scf.length,
			of: cohort.length,
			definition: "SCF-funded projects in the cohort (Live or Inactive).",
		},
		{
			stage: "Launch known",
			projects: known.length,
			of: scf.length,
			definition: COHORT_DEFINITIONS.launchKnown,
		},
		{
			stage: "Past day 180",
			projects: past.length,
			of: known.length,
			definition: `The known launch is at least 180 days before ${asOf}.`,
		},
		{
			stage: "Operating now",
			projects: count(pastRead, operating),
			of: pastRead.length,
			definition: `${COHORT_DEFINITIONS.operatingNow} The ${past.length - pastRead.length} past day 180 whose first award is under 180 days old were not read and are left out.`,
		},
	];

	// SCF-confirmed launches: the Build award SCF paid in full
	const paid = scf.filter((p) => p.mainnetTranchePaid);
	const paidPast = paid.filter(pastDay180);
	const paidRead = paidPast.filter(read);
	const noReading = paidRead.filter(
		(p) => p.operatingNow === null || p.operatingNow === "none",
	);
	const scfConfirmed = {
		paidInFull: paid.length,
		launchAtLeast180DaysOld: paidPast.length,
		read: paidRead.length,
		notRead: paidPast.length - paidRead.length,
		launchBasis: {
			dated: count(paidPast, (p) => p.launchKnownBasis === "dated"),
			scfPaidBy: count(paidPast, (p) => p.launchKnownBasis !== "dated"),
		},
		operatingNow: count(paidRead, operating),
		codeOnly: count(paidRead, (p) => p.operatingNow === "code"),
		noReading: noReading.length,
		noReadingByCode: tally(
			noReading.map((p) => p.codeActivityNow),
			"no public code read",
		),
		recordedInactive: count(
			paidRead,
			(p) => p.operatingNow === "recorded inactive",
		),
		byLaunchTiming: byLaunchTiming(paidPast),
	};

	const buildFunded = scf.filter((p) => p.buildAwards?.length);
	const eligible = scf.filter(read);
	const dated = scf.filter((p) => p.launchKnownBasis === "dated");
	const afterAward = dated.filter((p) => p.launchBeforeFirstAward === false);
	const verdict = afterAward.filter(
		(p) =>
			p.day180Reading === "activity seen" ||
			p.day180Reading === "no activity seen",
	);
	const twoVerdict = afterAward.filter((p) =>
		["active", "one signal kind", "no activity seen"].includes(
			p.day180TwoSignals ?? "",
		),
	);

	// delivery by round: every Build award whose paid share was read exactly
	const rounds = new Map<number, { read: number; mainnetPaid: number }>();
	let awardsRead = 0;
	let awardsPaid = 0;
	const paidPages = new Set<string>();
	for (const page of b.scfPages) {
		for (const a of page.buildAwards) {
			if (a.paidShare === null) continue;
			const r = rounds.get(a.round) ?? { read: 0, mainnetPaid: 0 };
			r.read++;
			awardsRead++;
			if (a.mainnetTranchePaid) {
				r.mainnetPaid++;
				awardsPaid++;
				paidPages.add(page.scfSlug);
			}
			rounds.set(a.round, r);
		}
	}

	const onchainOperating = eligible.filter(
		(p) => p.operatingNow === "on-chain",
	);
	const store = (p: CohortProject) => !!(p.appReleased || p.appLastUpdated);
	const anyId = (p: CohortProject) =>
		(p.contracts ?? 0) > 0 || (p.assets ?? 0) > 0 || (p.accounts ?? 0) > 0;
	const notes = cohort.filter((p) => p.evidenceNotes.length);

	return {
		cohort: {
			projects: cohort.length,
			scfFunded: scf.length,
			notScf: notScf.length,
			scfFundedOutsideCohort: tally(
				b.projects
					.filter((p) => !p.inCohort && p.scfAwarded)
					.map((p) => p.status),
				"no status",
			),
			withEvidenceNotes: notes.length,
		},
		scf: {
			...launchSplit(scf),
			byAwardKind: Object.fromEntries(
				AWARD_TYPES.map((k) => [
					k,
					count(scf, (p) => p.scfAwardKinds.includes(k)),
				]),
			) as Record<(typeof AWARD_TYPES)[number], number>,
			readable: {
				of: scf.length,
				contractIds: count(scf, (p) => (p.contracts ?? 0) > 0),
				asset: count(scf, (p) => (p.assets ?? 0) > 0),
				accounts: count(scf, (p) => (p.accounts ?? 0) > 0),
				storeData: count(scf, store),
				codeActive: count(
					scf,
					(p) => !!p.codeActivityNow?.startsWith("active"),
				),
				nothingReadable: count(
					scf,
					(p) =>
						!anyId(p) &&
						!store(p) &&
						!!p.codeActivityNow?.startsWith("no public code"),
				),
				anyOnchainId: count(scf, anyId),
			},
			launchBeforeFirstAward: count(scf, (p) => !!p.launchBeforeFirstAward),
			launchedOnOrAfterFirstAward: {
				projects: afterAward.length,
				withDay180Verdict: verdict.length,
				activeAtDay180: count(
					verdict,
					(p) => p.day180Reading === "activity seen",
				),
				withTwoSignalVerdict: twoVerdict.length,
				activeTwoSignals: count(
					twoVerdict,
					(p) => p.day180TwoSignals === "active",
				),
			},
			launchKnown: {
				projects: known.length,
				of: scf.length,
				dated: dated.length,
				bySCFPaymentOnly: known.length - dated.length,
			},
			buildFunded: {
				projects: buildFunded.length,
				mainnetTranchePaid: paid.length,
				mainnetPaidWithoutDatedLaunch: count(
					paid,
					(p) => p.launchKnownBasis !== "dated",
				),
				launchKnown: count(buildFunded, (p) => !!p.launchKnownBasis),
				launchDated: count(buildFunded, (p) => p.launchKnownBasis === "dated"),
			},
		},
		notScf: launchSplit(notScf),
		funnel,
		funnelPastDay180Evidence: tally(pastRead.map((p) => p.operatingNow)),
		funnelNotRead: past.length - pastRead.length,
		funnelByLaunchTiming: byLaunchTiming(past),
		operatingNow: {
			eligible: eligible.length,
			operating: count(eligible, operating),
			byEvidence: tally(eligible.map((p) => p.operatingNow)),
			onChainByCallers: callerBands(onchainOperating),
			withEvidenceNotes: count(
				eligible,
				(p) => operating(p) && p.evidenceNotes.length > 0,
			),
			byFirstAwardYear: groupBy(eligible, (p) =>
				(p.firstScfAward ?? "").slice(0, 4),
			).map(([k, rows]) => operatingGroup(k, rows)),
			byFirstAwardType: groupBy(
				eligible,
				(p) => p.firstAwardType ?? "unknown",
				AWARD_TYPES,
			).map(([k, rows]) => operatingGroup(k, rows)),
			byFirstAwardSize: groupBy(
				eligible,
				(p) => p.firstAwardSize ?? "undisclosed",
				SIZE_ORDER,
			).map(([k, rows]) => operatingGroup(k, rows)),
		},
		scfByFirstAwardYear: groupBy(scf, (p) =>
			(p.firstScfAward ?? "").slice(0, 4),
		).map(([year, rows]) => ({
			year,
			...launchSplit(rows),
			launchKnown: count(rows, (p) => !!p.launchKnownBasis),
			pastDay180: count(rows, pastDay180),
			pastDay180Read: count(rows, (p) => pastDay180(p) && read(p)),
			operatingNowPastDay180: count(rows, (p) => pastDay180(p) && operating(p)),
		})),
		scfByPlanType: groupBy(scf, (p) => p.planType ?? "no category", [
			...PLAN_TYPES,
			"no category",
		]).map(([type, rows]) => ({
			type,
			projects: rows.length,
			launchKnown: count(rows, (p) => !!p.launchKnownBasis),
			pastDay180: count(rows, pastDay180),
			pastDay180Read: count(rows, (p) => pastDay180(p) && read(p)),
			operatingNowPastDay180: count(rows, (p) => pastDay180(p) && operating(p)),
			withDownstreamUser: count(rows, (p) => (p.usedByProjects ?? 0) > 0),
		})),
		usage: {
			all: callerBands(b.projects),
			scf: callerBands(scf),
			eventsLatest60dAtLeast1000: count(b.projects, (p) =>
				(p.usage ?? []).some((u) => (u.events60d ?? 0) >= 1000),
			),
		},
		scfConfirmedRetention: scfConfirmed,
		deliveryByRound: {
			awardsRead,
			mainnetTranchePaid: awardsPaid,
			scfProjects: paidPages.size,
			rounds: [...rounds.entries()]
				.sort(([a], [z]) => a - z)
				.map(([round, r]) => ({ round, ...r })),
		},
	};
}

export type CohortRetention = ReturnType<typeof cohortRetention>;
