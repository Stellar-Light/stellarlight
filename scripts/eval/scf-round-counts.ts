/**
 * SCF round-level count check (sls-111): awards per round in our directory
 * versus SCF's own round pages. Public reads only (no DB, no secrets), so any
 * lane can run it; enrich-scf.yml runs it after every execute:
 *
 *   pnpm exec tsx scripts/eval/scf-round-counts.ts [--not-before <ISO time>]
 *
 * --not-before refuses any page of our API generated before that time, which
 * is the edge cache serving what it held before a sync (s-maxage 60 plus
 * stale-while-revalidate 300), so a stale read is could-not-check, never a
 * count of the sync.
 *
 * Every round is judged against the reviewed baseline of known shortfalls,
 * scripts/eval/scf-round-shortfalls.json (the ratchet): a short round it does
 * not list, a listed round whose shortfall grew, any round where ours is over
 * SCF (in a closed round, pending submissions allow nothing), a listed SCF
 * page no row carries that the baseline does not name (a swap inside an
 * unchanged total), and a listed round whose shortfall shrank or closed (a
 * stale entry to lower or remove) each fail.
 *
 * Exit 0 no finding, 1 a finding, 2 could-not-check (a side unread or
 * partial, or the baseline missing or unreadable). The basis of each count:
 * src/lib/scf-round-counts.ts.
 */
import { readFileSync } from "node:fs";
import {
	compareRoundCounts,
	judgeAgainstBaseline,
	type OurAwardedRow,
	ourPageProblem,
	parseShortfallBaseline,
	type ScfListingRow,
	type ScfRound,
} from "../../src/lib/scf-round-counts";
import { type JoinRow, matchListingRow } from "../data/scf-joins";
import {
	readAwardRounds,
	readRoundSubmissions,
	SCF,
	uniqueNames,
} from "./scf-official";

const BASE = (process.env.SCOUT_BASE || "https://stellarlight.xyz").replace(
	/\/$/,
	"",
);
const UA = { "User-Agent": "stellarlight-scf-round-counts" };
const BASELINE = "scripts/eval/scf-round-shortfalls.json";
const flag = process.argv.indexOf("--not-before");
const notBeforeArg = flag >= 0 ? process.argv[flag + 1] : undefined;
const notBefore = notBeforeArg ? new Date(notBeforeArg) : null;
if (notBefore && Number.isNaN(notBefore.getTime())) {
	console.log(`COULD NOT CHECK: --not-before ${notBeforeArg} is not a time`);
	process.exit(2);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function text(url: string): Promise<string | null> {
	try {
		const res = await fetch(url, { headers: UA });
		return res.ok ? await res.text() : null;
	} catch {
		return null;
	}
}

/** The round index and every numbered round's own page. A page that could not
 * be read stays in the list with submissions null, so the comparison names it
 * instead of counting around it. */
async function readRounds(): Promise<ScfRound[] | null> {
	const index = await text(`${SCF}/awards`);
	if (index === null) return null;
	const listed = readAwardRounds(index);
	if (listed === null) return null;
	const rounds: ScfRound[] = [];
	for (const r of listed) {
		const page = await text(`${SCF}/awards/${r.id}`);
		rounds.push({
			round: r.round,
			phase: r.phase,
			submissions: page === null ? null : readRoundSubmissions(page, r.round),
		});
		await sleep(1000);
	}
	return rounds;
}

async function readListing(): Promise<ScfListingRow[] | null> {
	const body = await text(`${SCF}/backend/projects`);
	try {
		const rows: unknown = body === null ? null : JSON.parse(body);
		return Array.isArray(rows) ? rows : null;
	} catch {
		return null;
	}
}

/** Every awarded row, paged to the API's own total; the reason when any page
 * cannot be counted (ourPageProblem) or the pages do not add up. */
async function readOurs(): Promise<
	{ rows: OurAwardedRow[] } | { reason: string }
> {
	const rows: OurAwardedRow[] = [];
	for (let offset = 0; ; offset += 100) {
		const url = `${BASE}/api/projects/search?scfAwarded=true&limit=100&offset=${offset}`;
		let body: unknown = null;
		try {
			const res = await fetch(url, {
				headers: { Accept: "application/json", ...UA },
			});
			if (!res.ok) return { reason: `${url} answered HTTP ${res.status}` };
			body = await res.json();
		} catch (err) {
			return { reason: `${url}: ${err instanceof Error ? err.message : err}` };
		}
		const problem = ourPageProblem(body, notBefore);
		if (problem) return { reason: `${url}: ${problem}` };
		const page = body as {
			projects: OurAwardedRow[];
			meta: { counts: { total: number } };
		};
		rows.push(...page.projects);
		const total = page.meta.counts.total;
		if (rows.length >= total || page.projects.length === 0)
			return rows.length === total
				? { rows }
				: { reason: `read ${rows.length} awarded rows of a total ${total}` };
	}
}

async function main() {
	let baseline: ReturnType<typeof parseShortfallBaseline>;
	try {
		baseline = parseShortfallBaseline(
			JSON.parse(readFileSync(BASELINE, "utf8")),
		);
	} catch (err) {
		baseline = { error: err instanceof Error ? err.message : String(err) };
	}
	if ("error" in baseline) {
		console.log(`COULD NOT CHECK: ${BASELINE}: ${baseline.error}`);
		process.exit(2);
	}
	const [rounds, listing, ours] = await Promise.all([
		readRounds(),
		readListing(),
		readOurs(),
	]);
	if ("reason" in ours) {
		console.log(`COULD NOT CHECK: our awarded rows: ${ours.reason}`);
		process.exit(2);
	}
	// The enrich's own join over our awarded rows: a page a row folds without
	// citing it (a second SCF page, an SCF_SLUG_OVERRIDES entry) is carried.
	const joinRows: JoinRow[] = ours.rows.map((r) => {
		const row = r as OurAwardedRow & {
			name?: unknown;
			canonicalSlug?: unknown;
			links?: JoinRow["links"];
		};
		return {
			slug: String(row.slug ?? ""),
			name: String(row.name ?? ""),
			canonicalSlug:
				typeof row.canonicalSlug === "string" ? row.canonicalSlug : null,
			links: row.links ?? null,
		};
	});
	const bySlug = new Map(joinRows.map((r) => [r.slug, r]));
	const identityOf = (r: JoinRow) =>
		r.canonicalSlug && bySlug.has(r.canonicalSlug) ? r.canonicalSlug : r.slug;
	const index = {
		rows: joinRows,
		bySlug,
		identityOf,
		byNormName: uniqueNames(joinRows, identityOf),
	};
	const report = compareRoundCounts({
		rounds,
		listing,
		ours: ours.rows,
		joinedRow: (page) => {
			const row = matchListingRow(page, index);
			return row ? String(identityOf(row)) : undefined;
		},
		expectRounds: baseline.rounds.map((e) => e.round),
	});
	if (report.status === "could-not-check") {
		console.log(`COULD NOT CHECK: ${report.reason}`);
		process.exit(2);
	}
	console.log(
		`SCF: ${rounds?.length} numbered rounds read from ${SCF}/awards, listing ${listing?.length} rows. Ours: ${ours.rows.length} awarded rows from ${BASE}, ${report.roundsUnread} with no rounds and no SCF page cited (rounds unknown).`,
	);
	const { findings, notes } = judgeAgainstBaseline(report.rounds, baseline);
	const failing = new Set(
		findings.filter((f) => f.kind !== "stale").map((f) => f.round),
	);
	const allowed = new Map(
		baseline.rounds.map((e) => [e.round, e.scf - e.ours]),
	);
	const label = {
		agrees: "",
		short: "  SHORT",
		over: "  OVER",
		unconfirmed: "  above SCF by no more than its undecided, unconfirmed",
	};
	for (const r of report.rounds) {
		const listed = allowed.get(r.round);
		console.log(
			`SCF #${r.round}: SCF ${r.scf}${r.undecided ? ` (+${r.undecided} undecided)` : ""}, ours ${r.ours}${label[r.verdict]}${listed === undefined ? "" : ` (baseline allows ${listed})`}`,
		);
		// the page leads only where something changed: the baseline already
		// names the pages behind every known shortfall
		if (failing.has(r.round))
			for (const s of r.uncited)
				console.log(`    no row claiming it cites ${s}`);
	}
	for (const f of findings) console.log(`FAIL ${f.kind}: ${f.detail}`);
	for (const n of notes) console.log(`NOTE: ${n}`);
	const by = (v: string) => report.rounds.filter((r) => r.verdict === v);
	const raw = `${by("agrees").length} rounds agree, ${by("short").length} short by ${by("short").reduce((n, r) => n + r.scf - r.ours, 0)}, ${by("over").length} over, ${by("unconfirmed").length} unconfirmed`;
	console.log(
		findings.length
			? `VERDICT: fail, ${findings.length} finding(s) against the baseline of ${baseline.asOf} (${raw})`
			: `VERDICT: pass, every round agrees or holds its baseline entry of ${baseline.asOf} (${raw})`,
	);
	process.exit(findings.length ? 1 : 0);
}

main().catch((err) => {
	console.log(`COULD NOT CHECK: ${err instanceof Error ? err.message : err}`);
	process.exit(2);
});
