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
 * Awards outside SCF's listing (sls-116) are judged too: each record id a
 * round page names and the listing lacks is read off its own page
 * (/project/<record id>) for its slug, and joined the way the enrich joins it.
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
import {
	countedRows,
	type JoinRow,
	joinOffListing,
	matchListingRow,
	SCF_SHARED_CLAIMS,
} from "../data/scf-joins";
import {
	offListingAwardees,
	readOffListingPages,
	readScfRounds,
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
async function text(url: string): Promise<string | null> {
	try {
		const res = await fetch(url, { headers: UA });
		return res.ok ? await res.text() : null;
	} catch {
		return null;
	}
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
	const [rounds, listing, ours]: [
		ScfRound[] | null,
		ScfListingRow[] | null,
		Awaited<ReturnType<typeof readOurs>>,
	] = await Promise.all([readScfRounds(text, 1000), readListing(), readOurs()]);
	// Each record outside the listing, read off its own page so its award is
	// named and judged by slug; one not read stays named by its record id.
	const off = await readOffListingPages(
		offListingAwardees(
			rounds ?? [],
			new Set((listing ?? []).map((p) => String(p.id))),
		),
		text,
		300,
	);
	const offPages = new Map(off.pages.map((p) => [p.slug, p.page]));
	if ("reason" in ours) {
		console.log(`COULD NOT CHECK: our awarded rows: ${ours.reason}`);
		process.exit(2);
	}
	// A reviewed shared claim counts once only while the row stores the
	// claim's page; search serves no stored page slug, so read it from the
	// row itself.
	for (const row of ours.rows as Array<
		OurAwardedRow & { scf?: { slug?: string | null } }
	>) {
		const slug = String(row.slug ?? "");
		if (!(slug in SCF_SHARED_CLAIMS)) continue;
		const url = `${BASE}/api/projects?where[slug][equals]=${encodeURIComponent(slug)}&depth=0&select[scf]=true`;
		const body = await text(url);
		const doc = body === null ? null : JSON.parse(body)?.docs?.[0];
		if (!doc) {
			console.log(`COULD NOT CHECK: the stored SCF page of ${slug} (${url})`);
			process.exit(2);
		}
		row.scf = { slug: doc.scf?.slug ?? null };
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
		// a reviewed shared claim (peer's copy of honey-coin's page) is the same
		// award, counted once on the row the page joins
		ours: countedRows(ours.rows),
		joinedRow: (page) => {
			const detail = offPages.get(page.slug);
			const row = detail
				? joinOffListing(
						{ ...page, website: detail.website, github: detail.github },
						index,
					).row
				: matchListingRow(page, index);
			return row ? String(identityOf(row)) : undefined;
		},
		expectRounds: baseline.rounds.map((e) => e.round),
		offListing: off.pages.map((p) => ({
			id: p.id,
			slug: p.slug,
			title: p.title,
			lastAwardedRound: p.lastAwardedRound ?? 0,
		})),
	});
	if (report.status === "could-not-check") {
		console.log(`COULD NOT CHECK: ${report.reason}`);
		process.exit(2);
	}
	console.log(
		`SCF: ${rounds?.length} numbered rounds read from ${SCF}/awards, listing ${listing?.length} rows, ${off.pages.length} records outside it read off their own pages (${off.unread.length} not read, named by record id). Ours: ${ours.rows.length} awarded rows from ${BASE} (${ours.rows.length - countedRows(ours.rows).length} counted once as a reviewed shared claim), ${report.roundsUnread} with no rounds and no SCF page cited (rounds unknown).`,
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
