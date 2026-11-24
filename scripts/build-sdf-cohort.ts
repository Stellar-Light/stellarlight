/**
 * Build the SDF cohort bundle (data/cohort/cohort.json.gz.enc) from the
 * checked cohort snapshot files.
 *
 *   COHORT_DATA_KEY=<base64 32 bytes> pnpm exec tsx scripts/build-sdf-cohort.ts \
 *     --cohort <dir with the cohort CSVs and facts-register.md> \
 *     --scf <dir with scf_tranches.json, tranche_by_project.json, tranche_dates_all.json>
 *
 * Read only: nothing is fetched and no database is touched. The bundle is
 * encrypted because this repository is public and the cohort is served to
 * named partners only (src/lib/sdf-cohort.ts). Store data about people
 * (contributor counts, app developer names) is left out, and so is every
 * proposed status move: the bundle carries what was measured, not reviews.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	type BuildAward,
	COHORT_FILE,
	type CohortBundle,
	type CohortProject,
	cohortRetention,
	decryptBundle,
	encryptBundle,
	type JourneyTuple,
	type RegisterRow,
	type ScfPage,
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
const ymd = (v: string | null | undefined) =>
	v ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : null;
const usd = (v: number | null | undefined) =>
	typeof v === "number" ? Math.round(v * 100) / 100 : null;

// ------------------------------------------------------------ register

/** Facts register sections served (by heading prefix). The rest are review
 * lists for the owner (status moves, labels, probes of named sites). */
const SECTIONS: Record<string, string> = {
	"The cohort": "cohort",
	"Operating after the award": "operating",
	"SCF's own payments": "scf-payments",
};
function parseRegister(md: string): RegisterRow[] {
	const out: RegisterRow[] = [];
	let section: string | null = null;
	for (const line of md.split("\n")) {
		if (line.startsWith("## ")) {
			const h = line.slice(3);
			section =
				Object.entries(SECTIONS).find(([k]) => h.startsWith(k))?.[1] ?? null;
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

// ------------------------------------------------------------- SCF pages

type RawBuild = {
	round: string;
	budget: number;
	paidShare: number | null;
	finalPaid: boolean | null;
};
const rawPages =
	json<
		Record<
			string,
			{
				ourSlug: string;
				note: string;
				builds: RawBuild[];
				totalAwarded: number | null;
				totalPaid: number | null;
			}
		>
	>("scf_tranches.json");
const dates = json<
	Record<string, { paidBy: string | null; notYetPaidOn: string | null }>
>("tranche_dates_all.json");

const awards = (bs: RawBuild[]): BuildAward[] =>
	bs.map((b) => ({
		round: Number.parseInt(b.round.replace(/\D+/g, ""), 10),
		budgetUsd: b.budget,
		paidShare: b.paidShare,
		mainnetTranchePaid: b.finalPaid,
	}));
const scfPages: ScfPage[] = Object.entries(rawPages).map(([scfSlug, p]) => ({
	scfSlug,
	slug: p.ourSlug || null,
	split: p.note,
	buildAwards: awards(p.builds),
}));
const pageOf = new Map(
	Object.entries(rawPages)
		.filter(([, p]) => p.ourSlug)
		.map(([scfSlug, p]) => [p.ourSlug, { scfSlug, ...p }]),
);

// -------------------------------------------------------------- projects

const fingerprint = csv("project_fingerprint.csv");
const cohort = csv("scf_cohort.csv");
const operating = csv("operating_after_award.csv");
const AWARD_TYPE: Record<string, CohortProject["firstAwardType"]> = {
	Build: "build",
	"Legacy (v1 to v5)": "legacy",
	unknown: "unknown",
};

const projects: CohortProject[] = [...fingerprint.values()]
	.map((f): CohortProject => {
		const c = cohort.get(f.slug) ?? {};
		const o = operating.get(f.slug) ?? {};
		const page = pageOf.get(f.slug);
		const builds = page ? awards(page.builds) : null;
		const mainnetTranchePaid =
			page && page.note === "ok" && builds?.length
				? builds.some((b) => b.mainnetTranchePaid)
				: null;
		const launchEvidence = str(
			c.launch_evidence,
		) as CohortProject["launchEvidence"];
		const dated = launchEvidence === "on-chain" || launchEvidence === "product";
		const paidBy = ymd(dates[f.slug]?.paidBy);
		const launchKnownBasis: CohortProject["launchKnownBasis"] = dated
			? "dated"
			: mainnetTranchePaid
				? paidBy
					? "scf-mainnet-paid-by"
					: "scf-mainnet-paid-undated"
				: null;
		return {
			slug: f.slug,
			name: str(c.name),
			inCohort: cohort.has(f.slug),
			category: str(f.category),
			status: str(f.status_now) as CohortProject["status"],
			statusBasis: str(f.status_basis),
			statusVerdictDate: str(c.status_verdict_date),
			scfAwarded: !!f.first_scf_award,
			firstScfRound: int(c.first_scf_round),
			firstScfSubmission: str(f.first_scf_submission),
			firstScfAward: str(f.first_scf_award),
			firstAwardType: o.first_award_type
				? AWARD_TYPE[o.first_award_type]
				: null,
			firstAwardUsd: num(o.first_award_usd),
			firstAwardSize: str(o.first_award_size),
			scfPage: page
				? `https://communityfund.stellar.org/project/${page.scfSlug}`
				: null,
			scfTotalAwardedUsd: usd(page?.totalAwarded),
			scfTotalPaidUsd: usd(page?.totalPaid),
			scfPaidSplit: page ? page.note : null,
			buildAwards: builds,
			mainnetTranchePaid,
			mainnetPaidBy: paidBy,
			mainnetNotYetPaidOn: ymd(dates[f.slug]?.notYetPaidOn),
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
			launchEvidence,
			launchBeforeFirstAward: bool(c.launch_before_first_award),
			daysAwardToLaunch: int(f.days_award_to_launch),
			plannedMainnetBy: str(c.planned_mainnet_by),
			planReading: str(c.plan_reading),
			launchKnownDate: dated
				? str(f.launch_date)
				: launchKnownBasis
					? (paidBy ?? RETENTION_ASOF)
					: null,
			launchKnownBasis,
			day180Date: str(c.day180_date),
			day180Reading: str(f.day180_reading),
			day180Signals: list(c.day180_signals),
			day180SignalsChecked: list(c.day180_signals_checked),
			day180Code: str(c.day180_code),
			day180Onchain: str(c.day180_onchain),
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
	builtAt: new Date().toISOString(),
	sources: [
		"SCF public award records and every public SCF project page (totalAwarded and totalPaid), read 2026-11-23; tranche shares from the SCF Handbook's Budget and Deliverable Guidelines.",
		"The Stellar Light directory (every page of every status) and its daily status snapshots since 2026-10-02.",
		"Ledger facts: contract creation and upgrades proved in ledger metadata, close times from SDF's history archive; contract events, protocol registry and asset trustline history from Stellar Index (stellarindex.io); issued assets and accounts from Horizon.",
		"Address labels from stellar-expert/public-directory (MIT).",
		"Repositories, releases, manifests and commit counts from GitHub; packages from npm, crates.io and PyPI; app dates from the App Store and Google Play; domains from RDAP; captures from the Internet Archive; TVL from DefiLlama.",
		"Product checks: the directory's own product probe (no AI), run 2026-11-23.",
	],
	register,
	projects,
	journey,
	scfPages,
};

// Nothing private may ride along: no local paths in served text.
const text = JSON.stringify(bundle);
for (const bad of ["/Users/", "/home/", "~/"])
	if (text.includes(bad)) throw new Error(`bundle contains '${bad}'`);

const out = encryptBundle(bundle, KEY);
writeFileSync(COHORT_FILE, out);
const back = decryptBundle(readFileSync(COHORT_FILE), KEY);
const r = cohortRetention(back);
console.log(
	`wrote ${COHORT_FILE}: ${out.length} bytes; ${back.projects.length} projects (${r.cohort.projects} in the cohort), ${events} journey events, ${back.scfPages.length} SCF pages, ${back.register.length} register rows; as of ${ASOF}, launch ages to ${RETENTION_ASOF}`,
);
