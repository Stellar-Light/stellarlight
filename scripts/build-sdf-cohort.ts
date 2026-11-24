/**
 * Build the SDF cohort bundle (data/cohort/cohort.json.gz.enc) from the
 * checked cohort snapshot files.
 *
 *   COHORT_DATA_KEY=<base64 32 bytes> pnpm exec tsx scripts/build-sdf-cohort.ts \
 *     --cohort <dir with the cohort CSVs, cohort_v2.json and facts-register.md> \
 *     --scf <dir with live_rows.json, scf_membership.json and scf_rounds.json>
 *
 * Read only: nothing is fetched and no database is touched. The SCF pages
 * and statuses come from one read of the live directory (live_rows.json),
 * and the build stops when its delivery-by-round totals differ from the
 * public /api/projects/scf-rounds totals read with it. The bundle is
 * encrypted because this repository is public and the cohort is served to
 * named partners only (src/lib/sdf-cohort.ts). Store data about people
 * (contributor counts, app developer names) is left out, and so is every
 * proposed status move: the bundle carries what was measured, not reviews.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	BANNED_IN_BUNDLE,
	COHORT_FILE,
	type CohortBundle,
	type CohortProject,
	cohortRetention,
	decryptBundle,
	encryptBundle,
	type JourneyTuple,
	parseRegister,
	planTypeOf,
	type ScfPage,
	servedText,
} from "../src/lib/sdf-cohort";

const arg = (name: string) => {
	const i = process.argv.indexOf(name);
	return i > 0 ? process.argv[i + 1] : undefined;
};
const COHORT = arg("--cohort");
const SCF = arg("--scf");
const KEY = process.env.COHORT_DATA_KEY?.trim();
if (!COHORT || !SCF || !KEY) {
	console.error(
		"usage: COHORT_DATA_KEY=... tsx scripts/build-sdf-cohort.ts --cohort <dir> --scf <dir>",
	);
	process.exit(2);
}

/** RFC 4180: quoted fields may hold commas, quotes and newlines. */
function parseCsv(text: string): Record<string, string>[] {
	const rows: string[][] = [];
	let row: string[] = [];
	let f = "";
	let q = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (q) {
			if (c !== '"') f += c;
			else if (text[i + 1] === '"') {
				f += '"';
				i++;
			} else q = false;
		} else if (c === '"') q = true;
		else if (c === ",") {
			row.push(f);
			f = "";
		} else if (c === "\n") {
			row.push(f);
			rows.push(row);
			row = [];
			f = "";
		} else if (c !== "\r") f += c;
	}
	if (f || row.length) rows.push([...row, f]);
	const [head, ...body] = rows;
	return body.map((r) =>
		Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])),
	);
}

const csv = (file: string) =>
	new Map(
		parseCsv(readFileSync(join(COHORT, file), "utf8")).map((r) => [r.slug, r]),
	);
const json = <T>(file: string) =>
	JSON.parse(readFileSync(join(SCF, file), "utf8")) as T;

const str = (v: string | undefined) => (v ? v : null);
const int = (v: string | undefined) => (v ? Number.parseInt(v, 10) : null);
const num = (v: string | undefined) => (v ? Number(v) : null);
const bool = (v: string | undefined) => (v ? v === "True" : null);
const list = (v: string | undefined) => (v ? v.split("; ") : null);
const usd = (v: number | null | undefined) =>
	typeof v === "number" ? Math.round(v * 100) / 100 : null;

// ------------------------------------------------------------ register

const register = parseRegister(
	readFileSync(join(COHORT, "facts-register.md"), "utf8"),
);
const asOfOf = (fact: string) => {
	const r = register.find((x) => x.fact.startsWith(fact));
	if (!r) throw new Error(`facts register has no row '${fact}'`);
	return r.asOf;
};
const ASOF = asOfOf("Projects in the cohort");
const RETENTION_ASOF = asOfOf("Retention after an SCF-confirmed launch");

// ------------------------------------------------- live rows, SCF pages

type LiveBuild = {
	round: number;
	budgetUSD: number;
	schedule: string | null;
	paidShare: number | null;
};
type Membership = {
	scfSlug: string | null;
	paid: { split: string | null; builds: LiveBuild[] } | null;
};
const live = json<{ rows: Record<string, { status: string | null }> }>(
	"live_rows.json",
).rows;
const membership = json<{ rows: Record<string, Membership> }>(
	"scf_membership.json",
).rows;
const scfRounds = json<{
	meta: { scfReadAt: string; scfPaidReadAt: string };
	totals: { buildSharesRead: number; buildFinalTranchePaid: number };
}>("scf_rounds.json");

// Every directory row except drafts, as /api/projects/scf-rounds counts them.
const scfPages: ScfPage[] = Object.entries(membership)
	.filter(([slug, m]) => m.paid && live[slug]?.status !== "Draft")
	.map(([slug, m]) => ({
		scfSlug: m.scfSlug ?? slug,
		slug,
		split: m.paid?.split ?? null,
		buildAwards: (m.paid?.builds ?? []).map((x) => ({
			round: x.round,
			budgetUsd: x.budgetUSD,
			schedule: x.schedule,
			paidShare: x.paidShare,
			mainnetTranchePaid: x.paidShare === null ? null : x.paidShare === 1,
		})),
	}))
	.sort((a, z) => a.slug.localeCompare(z.slug));

// -------------------------------------------------------------- projects

const fingerprint = csv("project_fingerprint.csv");
const cohort = csv("scf_cohort.csv");
const operating = csv("operating_after_award.csv");
type V2 = Pick<
	CohortProject,
	| "status"
	| "statusBasis"
	| "statusVerdictDate"
	| "scfAwarded"
	| "scfAwardKinds"
	| "scfAwardCount"
	| "firstScfAward"
	| "firstScfAwardDateBasis"
	| "firstScfRound"
	| "scfPage"
	| "scfTotalAwardedUsd"
	| "scfTotalPaidUsd"
	| "scfPaidSplit"
	| "buildAwards"
	| "mainnetTranchePaid"
	| "mainnetPaidBy"
	| "mainnetNotYetPaidOn"
	| "launchKnownDate"
	| "launchKnownBasis"
	| "day180TwoSignals"
	| "day180SignalKinds"
	| "confidence"
	| "confidenceScore"
	| "confidenceBasis"
	| "onchainIds"
	| "usage"
	| "evidenceNotes"
>;
const v2 = JSON.parse(readFileSync(join(COHORT, "cohort_v2.json"), "utf8")) as {
	asOfDates: Record<string, string>;
	rows: Record<string, V2>;
};
const AWARD_TYPE: Record<string, CohortProject["firstAwardType"]> = {
	Build: "build",
	"Legacy (v1 to v5)": "legacy",
	"Public Goods": "public-goods",
	Liquidity: "liquidity",
	unknown: "unknown",
};

const projects: CohortProject[] = [...fingerprint.values()]
	.map((f): CohortProject => {
		const c = cohort.get(f.slug) ?? {};
		const o = operating.get(f.slug) ?? {};
		const x = v2.rows[f.slug];
		if (!x) throw new Error(`cohort_v2.json has no row '${f.slug}'`);
		const firstAwardType = o.first_award_type
			? AWARD_TYPE[o.first_award_type]
			: null;
		if (firstAwardType === undefined)
			throw new Error(`unknown award type '${o.first_award_type}'`);
		const category = str(f.category) ?? str(c.category);
		return {
			slug: f.slug,
			name: str(c.name),
			inCohort: cohort.has(f.slug),
			category,
			status: x.status,
			statusBasis: x.statusBasis,
			statusVerdictDate: x.statusVerdictDate,
			scfAwarded: x.scfAwarded,
			scfAwardKinds: x.scfAwardKinds,
			scfAwardCount: x.scfAwardCount,
			firstScfRound: x.firstScfRound,
			firstScfSubmission: str(f.first_scf_submission),
			firstScfAward: x.firstScfAward,
			firstScfAwardDateBasis: x.firstScfAwardDateBasis,
			firstAwardType,
			firstAwardUsd: num(o.first_award_usd),
			firstAwardSize: str(o.first_award_size),
			scfPage: x.scfPage,
			scfTotalAwardedUsd: usd(x.scfTotalAwardedUsd),
			scfTotalPaidUsd: usd(x.scfTotalPaidUsd),
			scfPaidSplit: x.scfPaidSplit,
			buildAwards: x.buildAwards,
			mainnetTranchePaid: x.mainnetTranchePaid,
			mainnetPaidBy: x.mainnetPaidBy,
			mainnetNotYetPaidOn: x.mainnetNotYetPaidOn,
			scfBuildStageNow: str(f.scf_build_stage_now),
			scfTestnetTrancheBy: str(f.scf_testnet_tranche_by),
			scfMainnetTrancheWindow: str(f.scf_mainnet_tranche_window),
			events: Number(f.events),
			sourcesSeeingIt: Number(f.sources_seeing_it),
			firstSignal: str(f.first_signal),
			firstSignalEvent: str(f.first_signal_event),
			domainRegistered: str(f.domain_registered),
			siteFirstSeen: str(c.site_first_seen),
			firstRepo: str(f.first_repo),
			startedBuildingOnStellar: str(f.started_building_on_stellar),
			firstHackathon: str(f.first_hackathon),
			mainnetContractCreated: str(f.mainnet_contract_created),
			firstContractEventInclSetup: str(f.first_contract_event_incl_setup),
			appReleased: str(f.app_released),
			firstPackage: str(f.first_package),
			firstRelease: str(f.first_release),
			launchDate: str(f.launch_date),
			launchBasis: str(f.launch_basis),
			launchEvidence: str(c.launch_evidence) as CohortProject["launchEvidence"],
			launchBeforeFirstAward: bool(c.launch_before_first_award),
			daysAwardToLaunch: int(f.days_award_to_launch),
			plannedMainnetBy: str(c.planned_mainnet_by),
			planReading: str(c.plan_reading),
			launchKnownDate: x.launchKnownDate,
			launchKnownBasis: x.launchKnownBasis,
			day180Date: str(c.day180_date),
			day180Reading: str(f.day180_reading),
			day180Signals: list(c.day180_signals),
			day180SignalsChecked: list(c.day180_signals_checked),
			day180Code: str(c.day180_code),
			day180Onchain: str(c.day180_onchain),
			day180TwoSignals: x.day180TwoSignals,
			day180SignalKinds: x.day180SignalKinds,
			confidence: x.confidence,
			confidenceScore: x.confidenceScore,
			confidenceBasis: x.confidenceBasis,
			planType: planTypeOf(category),
			operatingNow: str(f.operating_now),
			operatingEvidenceDate: str(o.evidence_date),
			observable: bool(o.strong_channel),
			productProbe: str(o.product_probe),
			productProbeDetail: str(o.product_probe_detail),
			contracts: int(c.contracts),
			deployersToExclude: int(c.deployers_to_exclude),
			accounts: int(c.accounts),
			assets: int(c.assets),
			usedByProjects: int(c.used_by_projects),
			contractUpgrades: Number(f.contract_upgrades),
			lastUpgrade: str(f.last_upgrade),
			tvlPeak: str(f.tvl_peak),
			audits: Number(f.audits),
			tools: list(f.tools),
			lastOnchainEvent: str(c.last_onchain_event),
			lastCommit: str(c.last_commit),
			appLastUpdated: str(c.app_last_updated),
			mainnetReading: str(c.mainnet_reading),
			reposScanned: int(c.repos_scanned),
			idsInReposOnMainnet: int(c.ids_in_repos_on_mainnet),
			idsInReposNotOnMainnet: int(c.ids_in_repos_not_on_mainnet),
			idsInReposLiveOnTestnet: int(c.ids_in_repos_live_on_testnet),
			codeActivityNow: str(c.code_activity_now),
			ghRepos: int(c.gh_repos),
			ghCommitsLast3Months: int(c.gh_commits_last_3_months),
			ghCommitsLast12Months: int(c.gh_commits_last_12_months),
			ghActiveMonthsOfLast12: int(c.gh_active_months_of_last_12),
			ghReleasesAndPackageVersionsLast12Months: int(
				c.gh_releases_and_package_versions_last_12_months,
			),
			tomlOwnAccountCreated: str(c.toml_own_account_created),
			tomlDeclaredAccountCreated: str(c.toml_declared_account_created),
			lastActivity: str(f.last_activity),
			lastActivityEvent: str(f.last_activity_event),
			stoppedOn: str(f.stopped_on),
			onchainIds: x.onchainIds,
			usage: x.usage,
			evidenceNotes: x.evidenceNotes,
			gaps: list(f.gaps) ?? [],
		};
	})
	.sort((a, b) => a.slug.localeCompare(b.slug));

// --------------------------------------------------------------- journey

const journey: Record<string, JourneyTuple[]> = {};
let events = 0;
for (const e of parseCsv(
	readFileSync(join(COHORT, "project_journey_v2.csv"), "utf8"),
)) {
	events++;
	// A store listing's developer can be a person: their name is left out.
	const detail = e.detail.replace(/, developer [^;]*/, "") || null;
	journey[e.slug] ??= [];
	journey[e.slug].push([
		e.date,
		e.date_precision,
		str(e.date_upper),
		e.stage,
		e.event,
		detail,
		str(e.evidence_url),
		e.source,
		e.strength,
		e.basis,
	]);
}

const bundle: CohortBundle = {
	asOf: ASOF,
	retentionAsOf: RETENTION_ASOF,
	asOfDates: {
		...v2.asOfDates,
		scfAwards: scfRounds.meta.scfReadAt.slice(0, 10),
		scfPaid: scfRounds.meta.scfPaidReadAt.slice(0, 10),
	},
	builtAt: new Date().toISOString(),
	sources: [
		`SCF's own award records and paid totals (totalAwarded and totalPaid on every SCF project page) as the live directory serves them, read by SCF ${scfRounds.meta.scfPaidReadAt.slice(0, 10)}; tranche shares by the SCF Handbook's schedule for rounds 41 on, inferred from paid shares for rounds 30 to 40.`,
		"The Stellar Light directory (every page of every status, statuses read live) and its daily status snapshots since 2026-10-02.",
		"Ledger facts: contract creation and upgrades proved in ledger metadata, close times from SDF's history archive; contract events, protocol registry and asset trustline history from Stellar Index (stellarindex.io); issued assets and accounts from Horizon.",
		"Address labels from stellar-expert/public-directory (MIT).",
		"Repositories, releases, manifests and commit counts from GitHub; packages from npm, crates.io and PyPI; app dates from the App Store and Google Play; domains from RDAP; captures from the Internet Archive; TVL from DefiLlama.",
		"Product checks: the directory's own product probe (no AI), run 2026-11-23; each operating project's own stellar.toml network, read 2026-11-24.",
		"Contract callers: Stellar Index events and Horizon transactions, read 2026-11-24.",
		"One incident record checked on the ledger (Comet's BLND:USDC pool, 2026-08-25): Horizon, archive ledger metadata and Soroban RPC.",
	],
	register,
	projects,
	journey,
	scfPages,
};

// Nothing private may ride along: no local paths and no internal ids
// (ledger rows, lanes, the routing gate) in served text.
const text = servedText(bundle);
for (const bad of BANNED_IN_BUNDLE)
	if (bad.test(text)) throw new Error(`bundle matches ${bad}`);

// The SCF figures must be the public API's, read together with the rows.
const check = cohortRetention(bundle).deliveryByRound;
if (
	check.awardsRead !== scfRounds.totals.buildSharesRead ||
	check.mainnetTranchePaid !== scfRounds.totals.buildFinalTranchePaid
)
	throw new Error(
		`delivery by round ${check.mainnetTranchePaid} of ${check.awardsRead} differs from scf-rounds ${scfRounds.totals.buildFinalTranchePaid} of ${scfRounds.totals.buildSharesRead}`,
	);

const out = encryptBundle(bundle, KEY);
writeFileSync(COHORT_FILE, out);
const back = decryptBundle(readFileSync(COHORT_FILE), KEY);
const r = cohortRetention(back);
console.log(
	`wrote ${COHORT_FILE}: ${out.length} bytes; ${back.projects.length} projects (${r.cohort.projects} in the cohort), ${events} journey events, ${back.scfPages.length} SCF pages, ${back.register.length} register rows; as of ${ASOF}, launch ages to ${RETENTION_ASOF}`,
);
