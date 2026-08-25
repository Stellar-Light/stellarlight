/**
 * Record-completeness detector — full paginated sweeps asserting that
 * official-record fields are populated EVERYWHERE they're promised, not just
 * on pinned fixture rows.
 *
 * Adopted from stellar-raven's sls-063 method (their agent swept all 467
 * awarded rows and named 26 residuals we'd have found first with this): the
 * field-population guard pins known-item rows; THIS sweeps the whole corpus,
 * so a residual CLASS is caught the night it appears — by us, not by a
 * consumer's audit agent.
 *
 * Sweeps:
 *   S1 scfRoundAwards — every awarded project with awarded rounds must carry
 *      per-round records, or be in the documented KNOWN_EMPTY allowlist
 *      (rows whose official pages verifiably publish no submission record —
 *      each entry carries its reason + date; never a silent skip).
 *   S2 statusBasis — every project row carries a lifecycle basis (the
 *      sls-024 invariant, corpus-wide: bare-null provenance never returns).
 *
 *   SCOUT_BASE=https://stellarlight.xyz npx tsx scripts/check-record-completeness.ts
 *
 * Exits 1 on any undocumented residual OR a zero-row sweep (an empty sweep is
 * an outage, not a clean pass). No DB / auth / LLM — public API only. Wired
 * into nightly-health.yml.
 */

import { type NightlyFailure, writeNightlyFindings } from "./nightly-findings";

const BASE = process.env.SCOUT_BASE || "https://stellarlight.xyz";
const UA = { "User-Agent": "stellarlight-completeness-guard" };

/** Rows allowed to have awarded rounds without per-round records — each with
 * a dated, checkable reason. Grows only from verified page rechecks. */
const KNOWN_EMPTY_ROUND_AWARDS: Record<string, string> = {
	// sls-063's 467-row recheck (2026-08-11) verified official submissions for
	// 17 of 26 residuals; these 9 are the remainder — no exact official
	// submission record with a published budget is verifiable for their
	// awarded round(s). Our independent sweep reproduced exactly this set.
	// Never inferred; re-verify if the official pages gain records.
	// 2026-08-12: merkl/trak/trace/deb/usdc REMOVED — their awarded flags were
	// matcher poison (another project's page), cleared by fix-scf-rounds
	// POISON_CLEARS; they are no longer awarded rows, so no allowlist needed.
	trustswap:
		"no verifiable official submission record for r36 (sls-063 recheck 2026-08-11)",
	liqvidxyz:
		"no verifiable official submission record for r37 (sls-063 recheck 2026-08-11)",
	fastbuka:
		"no verifiable official submission record for r9 (sls-063 recheck 2026-08-11)",
	pen: "no verifiable official submission record for r43 (sls-063 recheck 2026-08-11)",
};

// biome-ignore lint/suspicious/noExplicitAny: API rows
type Row = Record<string, any>;

async function page(path: string, offset: number): Promise<Row[]> {
	const res = await fetch(`${BASE}${path}&limit=100&offset=${offset}`, {
		headers: { Accept: "application/json", ...UA },
	});
	const body = (await res.json()) as { projects?: Row[] };
	return body.projects ?? [];
}

async function sweep(path: string): Promise<Row[]> {
	const all: Row[] = [];
	for (let offset = 0; offset < 2000; offset += 100) {
		const rows = await page(path, offset);
		all.push(...rows);
		if (rows.length < 100) break;
	}
	return all;
}

async function main() {
	console.log(`Record-completeness sweeps — ${BASE}\n`);
	let failures = 0;
	const failRows: NightlyFailure[] = [];

	// ── S0 (sls-064 class-killer): stored cross-references must RESOLVE ──
	// A relation that dangles serves confidently and lies quietly (the
	// peer→"honeycoin"-vs-"honey-coin" case). Sweep the directory once,
	// build the slug set, and assert every builtBy/canonicalSlug target
	// exists; assert every audits supersededByReportId targets a real
	// reportId. New relation fields join this lane as they ship.
	// NAMESPACES MATTER: builtBy.slug resolves in the ENTITY namespace
	// (the spec says "browse at /entities/{slug}" — org slugs like
	// "honeycoin" are NOT project slugs like "honey-coin"), so it is
	// checked against the live /entities/{slug} pages. canonicalSlug is a
	// project-namespace field and stays checked against the project set.
	{
		const all = await sweep("/api/projects/search?limit=100");
		const slugSet = new Set(all.map((p) => String(p.slug)));
		const dangling: string[] = [];
		const builtBySlugs = new Set<string>();
		for (const p of all) {
			const bb = (p as { builtBy?: { slug?: string } }).builtBy;
			if (bb?.slug) builtBySlugs.add(bb.slug);
			const cs = (p as { canonicalSlug?: string | null }).canonicalSlug;
			if (cs && !slugSet.has(cs))
				dangling.push(`${p.slug}: canonicalSlug → "${cs}" (no such slug)`);
		}
		for (const slug of builtBySlugs) {
			const res = await fetch(`${BASE}/entities/${encodeURIComponent(slug)}`, {
				method: "HEAD",
			});
			if (!res.ok)
				dangling.push(
					`builtBy → "${slug}" (/entities/${slug} returned ${res.status})`,
				);
		}
		const audits = await sweep("/api/audits?limit=100");
		const reportIds = new Set(
			audits.map((a) => Number((a as { reportId?: number }).reportId)),
		);
		for (const a of audits) {
			const sup = (a as { supersededByReportId?: number | null })
				.supersededByReportId;
			if (sup != null && !reportIds.has(Number(sup)))
				dangling.push(
					`audit ${(a as { reportId?: number }).reportId}: supersededByReportId → ${sup} (no such report)`,
				);
		}
		if (dangling.length) {
			failures += dangling.length;
			for (const d of dangling) console.error(`✗ S0 dangling reference: ${d}`);
			failRows.push(
				...dangling.map((d) => ({
					probe: "S0 referential integrity",
					note: d,
				})),
			);
		} else {
			console.log(
				`✓ S0 referential integrity: ${all.length} projects + ${audits.length} audits, 0 dangling references`,
			);
		}
	}

	// ── S1: scfRoundAwards on every awarded row with rounds ──
	const awarded = await sweep("/api/projects/search?scfAwarded=true");
	if (awarded.length === 0) {
		console.error("✗ S1 swept 0 awarded rows — outage, not a clean pass");
		writeNightlyFindings("record-completeness", [
			{ probe: "S1 sweep outage", note: "0 awarded rows returned" },
		]);
		process.exit(1);
	}
	const withRounds = awarded.filter(
		(p) => Array.isArray(p.scfAwardedRounds) && p.scfAwardedRounds.length > 0,
	);
	const residuals = withRounds.filter(
		(p) =>
			(!Array.isArray(p.scfRoundAwards) || p.scfRoundAwards.length === 0) &&
			!KNOWN_EMPTY_ROUND_AWARDS[p.slug],
	);
	const excused = withRounds.filter((p) => KNOWN_EMPTY_ROUND_AWARDS[p.slug]);
	console.log(
		`S1 scfRoundAwards: ${awarded.length} awarded · ${withRounds.length} with rounds · ${withRounds.length - residuals.length - excused.length} populated · ${excused.length} documented-empty · ${residuals.length} RESIDUAL`,
	);
	for (const p of residuals) {
		console.log(
			`  ✗ ${p.slug} rounds=[${p.scfAwardedRounds.join(",")}] roundAwards empty`,
		);
		failRows.push({
			probe: `scfRoundAwards empty: ${p.slug}`,
			note: `rounds=[${p.scfAwardedRounds.join(",")}]`,
		});
	}
	if (residuals.length) failures++;

	// ── S2: statusBasis on every project row (sls-024 corpus invariant) ──
	let scanned = 0;
	let blank = 0;
	const blanks: string[] = [];
	for (const cat of [
		"Anchor",
		"Asset",
		"Infrastructure",
		"Protocol%2FContract",
		"Tooling",
		"User-Facing%20App",
	]) {
		const rows = await sweep(`/api/projects/search?category=${cat}`);
		scanned += rows.length;
		for (const p of rows)
			if (!p.statusBasis) {
				blank++;
				if (blanks.length < 12) blanks.push(p.slug);
			}
	}
	if (scanned === 0) {
		console.error("✗ S2 swept 0 rows — outage, not a clean pass");
		writeNightlyFindings("record-completeness", [
			{ probe: "S2 sweep outage", note: "0 project rows returned" },
		]);
		process.exit(1);
	}
	console.log(
		`S2 statusBasis: ${scanned} rows swept · ${blank} blank${blank ? ` (${blanks.join(", ")}${blank > 12 ? ", …" : ""})` : ""}`,
	);
	if (blank) {
		failures++;
		for (const slug of blanks)
			failRows.push({ probe: `statusBasis blank: ${slug}` });
		if (blank > blanks.length)
			failRows.push({
				probe: "statusBasis blanks beyond sample",
				note: `${blank - blanks.length} more rows blank beyond the ${blanks.length} listed`,
			});
	}

	writeNightlyFindings("record-completeness", failRows);
	console.log(failures ? "\nFAILING" : "\nall sweeps clean");
	process.exit(failures ? 1 : 0);
}

main().catch((e) => {
	console.error("Fatal:", e);
	process.exit(1);
});
