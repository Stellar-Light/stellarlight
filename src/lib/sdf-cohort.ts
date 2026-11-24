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
import { partnerOf, rateLimit, rateLimitHeaders } from "./rate-limit";

export const COHORT_FILE = "data/cohort/cohort.json.gz.enc";

// ---------------------------------------------------------------- types

export const AWARD_TYPES = ["build", "legacy", "unknown"] as const;
export const COHORT_STATUSES = ["Live", "Inactive"] as const;
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
	/** Share of this award SCF reports paid, split by the Handbook's
	 * tranches; null when the page's figures do not split exactly. */
	paidShare: number | null;
	/** The final (mainnet) tranche is paid; null when the page does not split. */
	mainnetTranchePaid: boolean | null;
}

export interface CohortProject {
	slug: string;
	name: string | null;
	inCohort: boolean;
	category: string | null;
	status: (typeof COHORT_STATUSES)[number] | null;
	statusBasis: string | null;
	statusVerdictDate: string | null;
	scfAwarded: boolean;
	firstScfRound: number | null;
	firstScfSubmission: string | null;
	firstScfAward: string | null;
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
	gaps: string[];
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
	/** "ok" when the paid figure split exactly into tranches, else why not. */
	split: string;
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
	"Contract callers and team account lists (deployer, keeper, oracle): only SDF's warehouse holds them, so a team's own activity is excluded only for the deployers we know.",
	"Closed-source products: with no public code, silence in commits says little. Absence of a reading is never inactivity.",
	"Contract use through sub-calls only (no event is emitted), anything before Stellar Index's coverage (2024-02-20), and Horizon history before 2025-10-10.",
	"Projects never listed in the directory, and SCF awards SCF has not published.",
	"Whether a fully paid Build award's final deliverable was a mainnet launch or an allowed equivalent. Legacy awards were paid in full on award, so their payment says nothing about launch.",
	"Directory status history before 2026-10-02. Social posts and news are not read.",
];

export const COHORT_DEFINITIONS = {
	cohort:
		"Every directory project with status Live or Inactive when the snapshot was built. The directory's Live means the product answers (often: its site loads), not that it is on mainnet.",
	launchDate:
		"The earliest dated evidence of the strongest kind: on chain (the project's own contract created on mainnet, proved in the ledger; its first Stellar TVL day; its own asset first held), else product (first store release, first package, first GitHub release). A planned date from an SCF proposal is never a launch.",
	launchKnown:
		"A dated launch, or SCF's own record that it paid the mainnet tranche of a Build award (totalPaid on the SCF project page, split by the Handbook's tranche schedule). For a launch known only from SCF's payment, the date is the first web archive capture showing it paid (an upper bound: the launch was no later), or the as-of date when no capture bounds it.",
	launchBeforeFirstAward:
		"The launch we can see is more than 30 days older than the first SCF award: an existing product funded later, not a launch the grant produced.",
	day180:
		"The window is day 150 to day 210 after launch. activity seen: at least one signal showed activity in the window. no activity seen: signals covered the window and none showed activity (read it with the signals checked). could not check: nothing we hold covers that window. too early: day 210 is in the future. A project that launched on chain is only called quiet by an on-chain signal.",
	operatingNow:
		"For SCF projects whose first award is at least 180 days old: the strongest current evidence it operates. on-chain (a proved contract or its own asset in use), product (the live product shows Stellar), person (a person's check recorded in the directory), app (a recent store update). code alone is maintenance and is counted apart. none means no reading, never inactive.",
	observable:
		"The project has an on-chain id or an app store listing, so operating can be seen. A group with more of these looks healthier overall even when it is not: compare groups within the same column.",
	scfConfirmedRetention:
		"Of directory projects whose Build award SCF paid in full (the mainnet tranche), those whose known launch is at least 180 days old on the as-of date, with their operating-now reading. Stricter than alive at day 180: every launch is past day 180, and operating now is evidence from the last 90 days.",
	deliveryByRound:
		"Build awards whose SCF page figures split exactly into tranche shares, by round, and how many have the final (mainnet) tranche paid. The latest rounds are still inside SCF's tranche deadlines.",
} as const;

// ------------------------------------------------------------ projects

export interface ProjectFilters {
	scfAwarded?: boolean;
	firstAwardYear?: string;
	awardType?: (typeof AWARD_TYPES)[number];
	category?: string;
	status?: (typeof COHORT_STATUSES)[number];
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
const tally = (xs: Array<string | null>) => {
	const out: Record<string, number> = {};
	for (const x of xs) {
		const k = x ?? "not eligible";
		out[k] = (out[k] ?? 0) + 1;
	}
	return out;
};

function launchSplit(rows: CohortProject[]) {
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
	};
}

function operatingGroup(label: string, rows: CohortProject[]) {
	const obs = rows.filter((p) => p.observable);
	const rest = rows.filter((p) => !p.observable);
	const op = (xs: CohortProject[]) =>
		count(xs, (p) => OPERATING.has(p.operatingNow ?? ""));
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

/** Every aggregate the retention endpoint and the dashboard show. */
export function cohortRetention(b: CohortBundle) {
	const cohort = b.projects.filter((p) => p.inCohort);
	const scf = cohort.filter((p) => p.scfAwarded);
	const notScf = cohort.filter((p) => !p.scfAwarded);
	const asOf = b.retentionAsOf;
	const pastDay180 = (p: CohortProject) =>
		!!p.launchKnownDate && days(p.launchKnownDate, asOf) >= 180;

	// launch known -> past day 180 -> operating now, SCF-funded
	const known = scf.filter((p) => p.launchKnownBasis);
	const past = known.filter(pastDay180);
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
			projects: count(past, (p) => OPERATING.has(p.operatingNow ?? "")),
			of: past.length,
			definition: COHORT_DEFINITIONS.operatingNow,
		},
	];
	const pastBreakdown = tally(past.map((p) => p.operatingNow));

	// SCF-confirmed launches: the Build award SCF paid in full
	const paid = scf.filter((p) => p.mainnetTranchePaid);
	const paidPast = paid.filter(pastDay180);
	const scfConfirmed = {
		paidInFull: paid.length,
		launchAtLeast180DaysOld: paidPast.length,
		launchBasis: {
			dated: count(paidPast, (p) => p.launchKnownBasis === "dated"),
			scfPaidBy: count(paidPast, (p) => p.launchKnownBasis !== "dated"),
		},
		operatingNow: count(paidPast, (p) => OPERATING.has(p.operatingNow ?? "")),
		codeOnly: count(paidPast, (p) => p.operatingNow === "code"),
		noReading: count(
			paidPast,
			(p) => p.operatingNow === null || p.operatingNow === "none",
		),
		recordedInactive: count(
			paidPast,
			(p) => p.operatingNow === "recorded inactive",
		),
	};

	const buildFunded = scf.filter((p) => p.buildAwards?.length);
	const eligible = scf.filter((p) => p.operatingNow !== null);
	const dated = scf.filter((p) => p.launchKnownBasis === "dated");
	const afterAward = dated.filter((p) => p.launchBeforeFirstAward === false);
	const verdict = afterAward.filter(
		(p) =>
			p.day180Reading === "activity seen" ||
			p.day180Reading === "no activity seen",
	);

	// delivery by round, from every SCF page whose figures split exactly
	const rounds = new Map<number, { read: number; mainnetPaid: number }>();
	let awardsRead = 0;
	let awardsPaid = 0;
	const paidPages = new Set<string>();
	for (const page of b.scfPages) {
		if (page.split !== "ok") continue;
		for (const a of page.buildAwards) {
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

	return {
		cohort: {
			projects: cohort.length,
			scfFunded: scf.length,
			notScf: notScf.length,
		},
		scf: {
			...launchSplit(scf),
			launchBeforeFirstAward: count(scf, (p) => !!p.launchBeforeFirstAward),
			launchedOnOrAfterFirstAward: {
				projects: afterAward.length,
				withDay180Verdict: verdict.length,
				activeAtDay180: count(
					verdict,
					(p) => p.day180Reading === "activity seen",
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
		funnelPastDay180Evidence: pastBreakdown,
		operatingNow: {
			eligible: eligible.length,
			operating: count(eligible, (p) => OPERATING.has(p.operatingNow ?? "")),
			byEvidence: tally(eligible.map((p) => p.operatingNow)),
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
			operatingNowPastDay180: count(
				rows,
				(p) => pastDay180(p) && OPERATING.has(p.operatingNow ?? ""),
			),
		})),
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
