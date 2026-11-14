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
 *   S3 tvlMethodUrl — a tvlUSD that sums several DefiLlama rows names the
 *      page that sums them (sls-102). A null is read against DefiLlama's own
 *      list: a parent that still sums exactly the rows means enrich-tvl has
 *      not stored it yet (run the TVL lane); none means the family changed
 *      (reconcile the map); an unread list is could-not-check.
 *   S4 venueRole: every row served as Live and DEX carries a venueRole or a
 *      dated reason in VENUE_ROLE_UNRESOLVED (sls-113); a row that is no
 *      venue leaves Live or DEX instead. A null role drops the row out of
 *      every venue count without a word. Search honours type=DEX with
 *      status=Live (2026-11-07: 38 of 47 DEX rows), and the check reads both
 *      fields again on every row.
 *   S5 deployment provenance: every mainnet or testnet deployment value
 *      carries its own sourceUrl, a known basis, an asOf, a source on the
 *      claimed network, and stellar in supportedNetworks (sls-024). An
 *      unknown with null fields is the documented unknown state, never a gap.
 *      (2026-11-11: 105 claims, 56 with no sourceUrl, 35 with no network list.)
 *   S6 wallet coverage: every Wallet row carries a productKind or a dated
 *      reason in PRODUCT_KIND_UNRESOLVED, and availability rows or a dated
 *      availabilityCheck (sls-033). Searching type=Wallet is exact (74 rows on
 *      2026-11-11), and the check reads the type again on every row.
 *      Availability sources: on every project row read (S2's category sweeps
 *      and the Wallet sweep, since 9 rows that serve availability are not
 *      typed Wallet), an availability row of any state with neither a
 *      storeUrl nor a sourceUrl is a claim with no source (2026-11-12: 9 of
 *      the 12 served unavailable rows).
 *
 *   SCOUT_BASE=https://stellarlight.xyz npx tsx scripts/check-record-completeness.ts
 *
 * Exits 1 on any undocumented residual OR a zero-row sweep (an empty sweep is
 * an outage, not a clean pass). Exits 2 when a page could not be read: an
 * HTTP error or an error in the body is could-not-check, never "no rows"
 * (src/lib/completeness-sweep.ts). The directory is read once, by category;
 * until 2026-11-13 S0 searched with no filter, got no_query and 0 rows, and
 * passed with nothing checked. No DB / auth / LLM: public API only. Wired
 * into nightly-health.yml.
 */

import {
	DIRECTORY_SWEEPS,
	SweepUnreadable,
	sweepRows,
} from "../src/lib/completeness-sweep";
import { deploymentGaps } from "../src/lib/project-deployment";
import { tvlCitationGaps } from "../src/lib/status-checks";
import { unclassifiedLiveDexRows } from "../src/lib/venue-role-coverage";
import {
	availabilitySourceFindings,
	walletCoverageGaps,
} from "../src/lib/wallet-coverage";
import {
	PRODUCT_KIND_UNRESOLVED,
	VENUE_ROLE_UNRESOLVED,
} from "./data/curation-maps";
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

async function page(path: string, offset: number, key: string): Promise<Row[]> {
	const url = `${path}&limit=100&offset=${offset}`;
	const res = await fetch(`${BASE}${url}`, {
		headers: { Accept: "application/json", ...UA },
	});
	// A body that is not JSON is unreadable too; sweepRows says so.
	const body = await res.json().catch(() => null);
	return sweepRows(url, res.status, body, key);
}

async function sweep(path: string, key = "projects"): Promise<Row[]> {
	const all: Row[] = [];
	for (let offset = 0; offset < 2000; offset += 100) {
		const rows = await page(path, offset, key);
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
	//
	// The directory is read once, one sweep per category, and shared by S0,
	// S2, S3, S5 and S6. Zero rows is an outage: nothing below could be
	// checked, so the run stops here instead of passing S0 on an empty set.
	const swept: Row[] = [];
	for (const path of DIRECTORY_SWEEPS) swept.push(...(await sweep(path)));
	if (swept.length === 0) {
		console.error("✗ directory sweep read 0 rows: an outage, not a clean pass");
		writeNightlyFindings("record-completeness", [
			{ probe: "S2 sweep outage", note: "0 project rows returned" },
		]);
		process.exit(1);
	}
	{
		const all = swept;
		const slugSet = new Set(all.map((p) => String(p.slug)));
		const dangling: string[] = [];
		const builtBySlugs = new Set<string>();
		// Counted so the line below shows what each check had to read: a
		// category sweep served no canonicalSlug on 2026-11-14 (shadows are
		// swapped for their canonical or left out), so that check is empty
		// through this API and the line says so.
		let pointers = 0;
		for (const p of all) {
			const bb = (p as { builtBy?: { slug?: string } }).builtBy;
			if (bb?.slug) builtBySlugs.add(bb.slug);
			const cs = (p as { canonicalSlug?: string | null }).canonicalSlug;
			if (cs) pointers++;
			if (cs && !slugSet.has(cs))
				dangling.push(`${p.slug}: canonicalSlug → "${cs}" (no such slug)`);
		}
		for (const slug of builtBySlugs) {
			const res = await fetch(`${BASE}/entities/${encodeURIComponent(slug)}`, {
				method: "HEAD",
			});
			// 404 is the page saying no such entity. Any other failure (a 429,
			// a 5xx) is a page that could not be read, not a dangling reference.
			if (res.status === 404)
				dangling.push(
					`builtBy → "${slug}" (/entities/${slug} returned ${res.status})`,
				);
			else if (!res.ok)
				throw new SweepUnreadable(
					`/entities/${slug} answered HTTP ${res.status}`,
				);
		}
		const audits = await sweep("/api/audits?limit=100", "audits");
		if (audits.length === 0)
			dangling.push("audits sweep read 0 audits: an outage, not a clean pass");
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
				`✓ S0 referential integrity: ${all.length} projects (${builtBySlugs.size} builtBy targets, ${pointers} canonicalSlug pointers) + ${audits.length} audits (${audits.filter((a) => (a as { supersededByReportId?: number | null }).supersededByReportId != null).length} superseded), 0 dangling references`,
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
	const scanned = swept.length;
	let blank = 0;
	const blanks: string[] = [];
	for (const p of swept)
		if (!p.statusBasis) {
			blank++;
			if (blanks.length < 12) blanks.push(p.slug);
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

	// ── S3: a multi-row tvlUSD cites the page that sums it (sls-102) ──
	// Reuses S2's sweep. enrich-tvl stores the parent it read from DefiLlama
	// each run; a null here is either a parent not stored yet (right after a
	// deploy, before the TVL lane runs) or a family that changed upstream.
	// DefiLlama's list tells them apart, so it is read only when a gap exists.
	const tvlRows = swept.map((p) => ({
		slug: String(p.slug),
		tvlUSD: p.tvlUSD,
		llamaSlugs: p.llamaSlugs,
		tvlMethodUrl: p.tvlMethodUrl,
	}));
	const anyGap = tvlRows.some(
		(r) =>
			typeof r.tvlUSD === "number" &&
			(r.llamaSlugs?.length ?? 0) > 1 &&
			!r.tvlMethodUrl,
	);
	let protocols: { slug: string; parentProtocol?: string | null }[] | null =
		null;
	if (anyGap) {
		try {
			const res = await fetch("https://api.llama.fi/protocols", {
				headers: UA,
			});
			const body = res.ok ? await res.json() : null;
			// Below 1,000 rows the body is not the real list (enrich-tvl's guard).
			protocols = Array.isArray(body) && body.length >= 1000 ? body : null;
		} catch {
			protocols = null;
		}
	}
	const gaps = tvlCitationGaps(tvlRows, protocols);
	console.log(
		`S3 tvlMethodUrl: ${swept.filter((p) => (p.llamaSlugs?.length ?? 0) > 1).length} multi-row TVL row(s) · ${gaps.length} with no page that sums them`,
	);
	for (const g of gaps) {
		console.log(`  ✗ ${g.slug}: [${g.family.join(",")}] ${g.cause}`);
		failRows.push({
			probe: `tvlMethodUrl null: ${g.slug}`,
			note: `${g.cause}: tvlUSD sums [${g.family.join(", ")}] with no page cited. ${g.action}`,
		});
	}
	if (gaps.length) failures++;

	// ── S4: every Live DEX row has a recorded state (sls-113, #1905) ──
	// A role (VENUE_ROLE), a type that is not DEX or a status that is not Live
	// takes a row out of this list; VENUE_ROLE_UNRESOLVED excuses one with a
	// dated reason. Each other row is a residual, named.
	const liveDex = await sweep("/api/projects/search?type=DEX&status=Live");
	if (liveDex.length === 0) {
		console.error("✗ S4 swept 0 Live DEX rows: an outage, not a clean pass");
		failRows.push({
			probe: "S4 sweep outage",
			note: "0 Live DEX rows returned",
		});
		failures++;
	} else {
		const unclassified = unclassifiedLiveDexRows(
			liveDex.map((p) => ({
				slug: String(p.slug),
				status: p.status,
				types: p.types,
				venueRole: p.venueRole,
			})),
			VENUE_ROLE_UNRESOLVED,
		);
		console.log(
			`S4 venueRole: ${liveDex.length} Live DEX rows · ${unclassified.length} with no role and no documented reason`,
		);
		for (const p of unclassified) {
			console.log(`  ✗ ${p.slug}: venueRole null`);
			failRows.push({
				probe: `venueRole null: ${p.slug}`,
				note: "Live DEX row with no venueRole: classify it in VENUE_ROLE, correct its type or status, or give a dated reason in VENUE_ROLE_UNRESOLVED (scripts/data/curation-maps.ts)",
			});
		}
		if (unclassified.length) failures++;
	}

	// ── S5: every positive deployment claim carries its provenance (sls-024) ──
	// Reuses S2's sweep of all seven categories. The rule is deploymentGaps,
	// unit-tested in src/lib/__tests__/project-deployment.test.ts.
	const claims = swept.filter(
		(p) =>
			p.deployment?.network === "mainnet" ||
			p.deployment?.network === "testnet",
	);
	if (claims.length === 0) {
		console.error(
			"✗ S5 found 0 mainnet or testnet claims in the sweep: an outage or a dropped field, not a clean pass",
		);
		failRows.push({
			probe: "S5 sweep outage",
			note: "0 mainnet or testnet deployment claims in the sweep",
		});
		failures++;
	} else {
		const gaps = claims
			.map((p) => ({ slug: String(p.slug), gaps: deploymentGaps(p) }))
			.filter((g) => g.gaps.length);
		console.log(
			`S5 deployment provenance: ${claims.length} mainnet or testnet claim(s) · ${gaps.length} missing provenance`,
		);
		for (const g of gaps) {
			console.log(`  ✗ ${g.slug}: ${g.gaps.join("; ")}`);
			failRows.push({
				probe: `deployment provenance: ${g.slug}`,
				note: `${g.gaps.join("; ")}. Record the evidence (scripts/data/backfill-deployment.ts) or retract the claim with a dated reason in DEPLOYMENT_VERIFIED (scripts/data/curation-maps.ts)`,
			});
		}
		if (gaps.length) failures++;
	}

	// ── S6: every Wallet row has a recorded state for both wallet facts (sls-033) ──
	// productKind (PRODUCT_KIND) or a dated reason (PRODUCT_KIND_UNRESOLVED);
	// availability rows or a dated availabilityCheck. A null with neither was
	// 39 of 72 rows on 2026-11-06, read by consumers as unknown at best.
	const wallets = await sweep("/api/projects/search?type=Wallet");
	if (wallets.length === 0) {
		console.error("✗ S6 swept 0 Wallet rows: an outage, not a clean pass");
		failRows.push({ probe: "S6 sweep outage", note: "0 Wallet rows returned" });
		failures++;
	} else {
		const gaps = walletCoverageGaps(
			wallets.map((p) => ({
				slug: String(p.slug),
				types: p.types,
				productKind: p.productKind,
				availability: p.availability,
				availabilityCheck: p.availabilityCheck,
			})),
			PRODUCT_KIND_UNRESOLVED,
		);
		console.log(
			`S6 wallet coverage: ${wallets.length} Wallet rows · ${gaps.length} with no recorded productKind or availability state`,
		);
		for (const g of gaps) {
			console.log(`  ✗ ${g.slug}: ${g.missing.join(" and ")} not recorded`);
			failRows.push({
				probe: `wallet coverage: ${g.slug}`,
				note: `Wallet row with no recorded ${g.missing.join(" or ")}: classify it in PRODUCT_KIND or give a dated reason in PRODUCT_KIND_UNRESOLVED; add dated rows to WALLET_AVAILABILITY or a dated check to AVAILABILITY_CHECKED (scripts/data/curation-maps.ts)`,
			});
		}
		if (gaps.length) failures++;
	}

	// Every availability row names a URL, whatever its state and whatever the
	// project's type: the directory sweep plus the Wallet sweep (9 rows that
	// serve availability are typed Payments, not Wallet). A row with neither
	// a storeUrl nor a sourceUrl is a claim with no source, and a sweep in
	// which no row serves availability checked nothing.
	{
		const src = availabilitySourceFindings(
			[...swept, ...wallets].map((p) => ({
				slug: String(p.slug),
				availability: Array.isArray(p.availability) ? p.availability : null,
			})),
		);
		console.log(
			`S6 availability sources: ${src.serving} project rows serve availability · ${src.serving ? `${src.findings.length} with a row that names no URL` : "nothing was checked"}`,
		);
		for (const f of src.findings) console.log(`  ✗ ${f.probe}: ${f.note}`);
		failRows.push(...src.findings);
		if (src.findings.length) failures++;
	}

	writeNightlyFindings("record-completeness", failRows);
	console.log(failures ? "\nFAILING" : "\nall sweeps clean");
	process.exit(failures ? 1 : 0);
}

/**
 * A crash is NOT a finding. Exit 1 is this guard's declared signal — "I looked
 * and something is wrong with the data" — and a database that would not
 * connect used to exit 1 too, so an outage was indistinguishable from a
 * defect: the same red, chased the same way, for a problem that is not in the
 * data at all. Exit 2 is "I could not look", which every other guard here
 * already uses.
 */
main().catch((e) => {
	const msg = String((e as Error)?.message ?? e);
	const cannotReach =
		/bad auth|authentication failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|connect ECONN|MongoServerSelectionError|getaddrinfo/i.test(
			msg,
		);
	console.error(
		cannotReach
			? `INCONCLUSIVE: could not reach the store — ${msg.slice(0, 160)}. No verdict.`
			: `INCONCLUSIVE (did not complete): ${msg.slice(0, 200)}`,
	);
	process.exit(2);
});
