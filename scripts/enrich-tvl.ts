/**
 * DefiLlama TVL enrichment — the TVL truth axis (boxy, 2026-07-09).
 *
 *   pnpm exec tsx scripts/enrich-tvl.ts            # dry run (default)
 *   pnpm exec tsx scripts/enrich-tvl.ts --execute  # write tvlUSD/tvlAsOf (+ tvlSource/tvlMethod provenance, sls-031)
 *
 * Design rules (lesson classes baked in):
 *   - null = no figure, never "zero TVL" (class 3). Only records in
 *     LLAMA_MAP (src/lib/status-checks.ts) are ever written; every other row
 *     stays unlinked and null.
 *   - every value carries tvlAsOf (class 8: dated metrics).
 *   - trinary per mapped row (#1912, tvlFieldsFor): a figure is written; a
 *     row DefiLlama lists with no Stellar figure is written as tvlUSD null
 *     with a dated tvlUnavailable, never 0 and never the old figure; a row
 *     that could not be checked keeps what it holds, and a mapped slug
 *     missing from DefiLlama's list fails the run after every write, so a
 *     rename upstream reaches the exit code, not only the log (Sentora
 *     resolved no row in 13 green weekly runs).
 *   - TVL never penalizes: it is served as a fact and used as a positive
 *     tie-break only — a new protocol without a llama listing ranks exactly
 *     as before (boxy: "don't rely on it too heavily, it misses new ones").
 *   - CEX rows are excluded (Binance/Poloniex hold XLM reserves; they are
 *     not Stellar protocols).
 *
 * Each mapped row also gets llamaListing (lane DQ1, 2026-10-23): DefiLlama's
 * own verdict on its slugs (listed / deprecated / not-found), read from the
 * FULL protocol list, since a dead protocol can drop its chain list. The
 * status checks (src/lib/status-checks.ts) read it; not-found is a rename or
 * removal upstream, never a death. Its doublecounted (#1912 audit,
 * 2026-11-11) is DefiLlama's own verdict, from its lite list, that a mapped
 * protocol's Stellar TVL is also counted under another protocol (Upshift's
 * Stellar vaults hold Gami Labs' two and the Sentora USDC vault Stellar DeFi
 * Hub counts); the analyze total leaves such rows out.
 *
 * Beyond writes, the run REPORTS (never acts on):
 *   - LIVENESS candidates: llama-listed, TVL < $5k, our status still Live —
 *     feed for the owner-reviewed liveness wave (the Slender class).
 *   - DISCOVERY candidates: Stellar-chain llama protocols not in LLAMA_MAP —
 *     things the directory may be missing entirely.
 */

import "./load-env";
import { getPayload } from "payload";
import {
	doublecountedOf,
	LLAMA_MAP,
	llamaListingOf,
	llamaPageFor,
	llamaParentOf,
	llamaRowsFor,
	parseDate,
	protocolListProblem,
	stellarDoublecountedIds,
	stellarTvlOf,
	TVL_FRESH_DAYS,
	tvlFieldsFor,
	tvlReadOf,
} from "../src/lib/status-checks";
import {
	formatMismatches,
	type ReadBackMismatch,
	verifyWrites,
} from "../src/lib/utils/read-back";
import configPromise from "../src/payload.config";

const EXECUTE = process.argv.includes("--execute");

const LIVENESS_THRESHOLD_USD = 5_000;

// sls-031: TVL methodology provenance, written alongside every tvlUSD write so
// a consumer can reconcile our number with operator/Dune/DefiLlama readings
// (they legitimately differ by pricing time + inclusion scope) instead of
// treating ours as exact universal truth. ONE stable string — reruns no-op.
const TVL_SOURCE = "defillama";
const TVL_METHOD =
	"sum of the project's mapped DefiLlama protocol rows (see llamaSlugs; e.g. Blend = pools + backstops), STELLAR-chain slice (chainTvls.Stellar) where DefiLlama publishes a per-chain breakdown — a multichain protocol's cross-chain total is not its Stellar footprint — falling back to the protocol total only when no breakdown exists; USD at DefiLlama's pricing time; refreshed weekly (tvlAsOf)";

interface LlamaProtocol {
	/** DefiLlama's protocol id: the lite list's defillamaId. */
	id?: string;
	slug: string;
	name: string;
	category?: string;
	chains?: string[];
	tvl?: number | null;
	chainTvls?: Record<string, number | null>;
	deprecated?: boolean | null;
	deadFrom?: string | null;
	/** DefiLlama's family key (e.g. parent#allbridge): a retired listing with
	 * a live sibling was superseded, not killed (llamaListingOf). */
	parentProtocol?: string | null;
}

// TVL on Stellar is stellarTvlOf (src/lib/status-checks.ts). Multichain rows
// (Gami Labs, Sentora…) carry a per-chain breakdown; summing the headline
// `tvl` wrote the CROSS-CHAIN total as "Stellar TVL" (Sentora: $2.06B total
// vs $1.3k actually on Stellar, caught 2026-07-16). A row with neither a
// Stellar slice nor a total is null there, never 0: DefiLlama serves tvl null
// for a protocol it stopped computing, and this lane wrote that as $0 for
// allbridge-core (found 2026-10-23).

async function main() {
	console.log(
		`Mode: ${EXECUTE ? "EXECUTE (writes)" : "DRY RUN (read-only)"}\n`,
	);

	const res = await fetch("https://api.llama.fi/protocols", {
		headers: { "User-Agent": "stellarlight-scout-enrich" },
	});
	if (!res.ok) throw new Error(`llama fetch failed: ${res.status}`);
	const all = (await res.json()) as LlamaProtocol[];
	// Too few rows, or too few on Stellar (a degraded answer with its chains
	// blank), is not DefiLlama's list: nothing is written (#1912 audit).
	const problem = protocolListProblem(all);
	if (problem) throw new Error(problem);
	const stellar = all.filter(
		(p) => p.chains?.includes("Stellar") && p.category !== "CEX",
	);
	const bySlug = new Map(stellar.map((p) => [p.slug, p]));
	console.log(
		`DefiLlama: ${stellar.length} Stellar-chain protocols (CEX excluded)\n`,
	);
	// DefiLlama's own double-count verdict on Stellar (its lite list), so the
	// analyze total sums each deposit once. Unread: each row keeps its stored
	// verdict, and the run says so.
	let doublecountedIds: Set<string> | null = null;
	try {
		const lite = await fetch("https://api.llama.fi/lite/protocols2", {
			headers: { "User-Agent": "stellarlight-scout-enrich" },
			signal: AbortSignal.timeout(60_000),
		});
		doublecountedIds = lite.ok
			? stellarDoublecountedIds(await lite.json())
			: null;
	} catch {
		doublecountedIds = null;
	}
	console.log(
		doublecountedIds
			? `DefiLlama files ${doublecountedIds.size} protocol(s) as double counted on Stellar\n`
			: "⚠ DefiLlama's lite list could not be read: every row keeps its stored double-count verdict\n",
	);

	const payload = await getPayload({ config: await configPromise });
	const asOf = new Date().toISOString();
	let written = 0;
	let failed = 0;
	/** Fields this writer is responsible for — the read-back verifies exactly
	 * these. `payload.update()` silently DROPS keys with no schema field at that
	 * path (#615): it resolves, `written` increments, and nothing persisted. */
	const VERIFIED_FIELDS = [
		"tvlUSD",
		"tvlAsOf",
		"llamaSlugs",
		"tvlUnavailable",
		"tvlSource",
		"tvlMethod",
		"llamaListing",
	] as const;
	/** slug → the exact payload sent, kept so the read-back compares against what
	 * was claimed rather than recomputing it (a recompute would hide a bug in the
	 * computation itself). */
	const sentBySlug = new Map<
		string,
		{ id: string; data: Record<string, unknown> }
	>();
	/** Mapped rows not checked: a slug missing from DefiLlama's list. */
	const unresolved: string[] = [];

	console.log("── TVL and listing writes (mapped protocols only) ──");
	for (const [ourSlug, llamaSlugs] of Object.entries(LLAMA_MAP)) {
		const found = await payload.find({
			collection: "projects",
			where: { slug: { equals: ourSlug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = found.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project "${ourSlug}" — skipped`);
			continue;
		}
		// DefiLlama's verdict, read from the FULL list (a dead protocol can
		// drop Stellar from its chains). parent (sls-102): the page that sums
		// exactly these rows, which the route cites as tvlMethodUrl; null
		// when one row is mapped or the family no longer matches the map.
		const parent = llamaParentOf(llamaSlugs, all);
		// Each mapped slug is read from the FULL list (#1912), CEX rows left
		// out (llamaRowsFor): a slug listed without Stellar among its chains is
		// DefiLlama's answer (no Stellar figure), where the Stellar-only list
		// read it as missing and left Spiko's and Etherfuse's figures in place
		// for eight weeks. Only a slug the list does not hold is missing.
		const { listed, missing } = llamaRowsFor(llamaSlugs, all);
		const read = tvlReadOf(llamaSlugs, listed);
		const listing = {
			...llamaListingOf(llamaSlugs, all),
			parent,
			doublecounted: doublecountedOf(
				listed,
				missing,
				doublecountedIds,
				d.llamaListing?.doublecounted,
			),
			checkedAt: asOf,
		};
		if (llamaSlugs.length > 1) {
			const was = d.llamaListing?.parent ?? null;
			if (parent)
				console.log(
					`  ${ourSlug}: cites ${llamaPageFor(llamaSlugs, parent)}, parent of exactly [${llamaSlugs.join(",")}]`,
				);
			// A finding, not a failed run: the row's tvlMethodUrl serves null
			// from this write on, and the nightly completeness sweep files it
			// (tvlCitationGaps) so it reaches the improvement ledger.
			else
				console.warn(
					`  ⚠ ${ourSlug}: no DefiLlama parent's children are exactly [${llamaSlugs.join(",")}]${was ? ` (was ${was})` : ""}: tvlMethodUrl serves null until LLAMA_MAP matches the family again`,
				);
		}
		if (missing.length)
			unresolved.push(`${ourSlug} (${missing.join(", ")} not listed)`);
		else if (read.outcome === "partial")
			unresolved.push(`${ourSlug} (a Stellar figure for only some slugs)`);
		const tvl = tvlFieldsFor(llamaSlugs, d.llamaSlugs, listed, asOf);
		const data: Record<string, unknown> = tvl
			? {
					tvlUSD: tvl.tvlUSD,
					tvlAsOf: asOf,
					llamaSlugs: tvl.llamaSlugs,
					// #1912: why tvlUSD holds no figure, dated; null beside a figure
					tvlUnavailable: tvl.tvlUnavailable,
					// sls-031: provenance rides every write (additive fields)
					tvlSource: TVL_SOURCE,
					tvlMethod: TVL_METHOD,
					llamaListing: listing,
				}
			: { llamaListing: listing };
		const deadNote = listing.deadFrom ? `, dead from ${listing.deadFrom}` : "";
		const was = `${typeof d.tvlUSD === "number" ? `$${d.tvlUSD.toLocaleString()}` : "null"} of ${parseDate(d.tvlAsOf)?.slice(0, 10) ?? "no date"}`;
		const stored = (d.llamaSlugs ?? []).join(",");
		const moved =
			stored !== llamaSlugs.join(",")
				? `; llamaSlugs [${stored}] → [${llamaSlugs.join(",")}]`
				: "";
		const dc = listing.doublecounted ? "; double counted on Stellar" : "";
		if (!tvl)
			console.log(
				missing.length
					? `  ✗ ${ourSlug}: ${missing.join(",")} not in DefiLlama's protocol list (renamed or removed upstream, or a CEX listing): could not check, TVL left as stored (${was}); listing ${listing.state}`
					: read.outcome === "partial"
						? `  ✗ ${ourSlug}: DefiLlama publishes a Stellar figure for only some of ${llamaSlugs.join(",")}: their sum is not the row's figure, TVL left as stored (${was})`
						: `  ${ourSlug}: a live llama row on Stellar came back without a TVL figure (a one-run gap upstream): TVL left as stored (${was}); listing ${listing.state}${deadNote}`,
			);
		else
			console.log(
				`  ${ourSlug}: tvlUSD ← ${tvl.tvlUSD === null ? "null" : `$${tvl.tvlUSD.toLocaleString()}`} (was ${was})${moved}${tvl.tvlUnavailable ? `; tvlUnavailable ← ${tvl.tvlUnavailable}` : ""}; listing ${listing.state}${deadNote}${dc}`,
			);
		if (EXECUTE) {
			try {
				await payload.update({
					collection: "projects",
					id: d.id,
					data,
					overrideAccess: true,
				});
				written++;
				sentBySlug.set(ourSlug, { id: d.id, data });
			} catch (err) {
				failed++;
				console.error(`  FAILED: ${ourSlug} — ${String(err)}`);
			}
		}
	}

	// ── liveness report (never acts) ──
	console.log(
		"\n── LIVENESS candidates (llama-listed, TVL < $5k, status Live) ──",
	);
	for (const [ourSlug, llamaSlugs] of Object.entries(LLAMA_MAP)) {
		const tvl = stellarTvlOf(
			llamaSlugs
				.map((ls) => bySlug.get(ls))
				.filter((r): r is LlamaProtocol => Boolean(r)),
		);
		// No Stellar figure is no reading, never $0: this report printed
		// "TVL $0" for Spiko, Etherfuse and Sentora while DefiLlama published
		// none for them (#1912).
		if (tvl === null || tvl >= LIVENESS_THRESHOLD_USD) continue;
		const found = await payload.find({
			collection: "projects",
			where: { slug: { equals: ourSlug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = found.docs[0] as any;
		if (d && d.status === "Live")
			console.log(
				`  ⚠ ${ourSlug}: TVL $${Math.round(tvl)} but status=Live — owner review (never auto-flip)`,
			);
	}

	// ── discovery report (never acts) ──
	const mapped = new Set(Object.values(LLAMA_MAP).flat());
	const unmapped = stellar.filter((p) => !mapped.has(p.slug));
	console.log(
		`\n── DISCOVERY candidates (${unmapped.length} unmapped Stellar-chain llama protocols) ──`,
	);
	for (const p of unmapped.sort((a, b) => (b.tvl ?? 0) - (a.tvl ?? 0)))
		console.log(
			`  ${p.slug.padEnd(26)} $${Math.round(p.tvl ?? 0)
				.toLocaleString()
				.padStart(14)}  (${p.category ?? "?"})`,
		);

	// ── read-back: prove the writes PERSISTED (lessons class 20/32, #615) ──
	// "N written" is a statement about the update calls, not about the data.
	// payload.update() resolves and drops keys with no schema field at that path,
	// so a run can report success having persisted nothing. Re-read every row we
	// claimed to write and compare it to what we sent.
	let mismatches: ReadBackMismatch[] = [];
	if (EXECUTE && sentBySlug.size) {
		console.log(`\n── Read-back (${sentBySlug.size} written row(s)) ──`);
		const idBySlug = new Map(
			[...sentBySlug].map(([slug, v]) => [slug, v.id] as const),
		);
		const sentData = new Map(
			[...sentBySlug].map(([slug, v]) => [slug, v.data] as const),
		);
		mismatches = await verifyWrites(
			sentData,
			async (slugs) => {
				const ids = slugs.map((s) => idBySlug.get(s)).filter(Boolean);
				const back = await payload.find({
					collection: "projects",
					where: { id: { in: ids } },
					limit: ids.length,
					depth: 0,
					overrideAccess: true,
				});
				// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
				const byId = new Map(back.docs.map((r: any) => [String(r.id), r]));
				return new Map(
					slugs
						.map((s) => [s, byId.get(String(idBySlug.get(s)))] as const)
						.filter((e): e is [string, Record<string, unknown>] =>
							Boolean(e[1]),
						),
				);
			},
			VERIFIED_FIELDS,
		);
		if (mismatches.length) {
			console.error(
				`  ✗ ${mismatches.length} field(s) did NOT persist as sent — the write reported success:\n${formatMismatches(mismatches)}`,
			);
			process.exitCode = 1;
		} else {
			console.log(
				`  ✓ all ${sentBySlug.size} row(s) hold the values written (${VERIFIED_FIELDS.join(", ")})`,
			);
		}
	}

	// A mapped slug missing from DefiLlama's list, or a family DefiLlama now
	// publishes a Stellar figure for only in part, is could-not-check: its row
	// kept its stored figure, which only ages from here, until the map is
	// reconciled. So it fails the run, after every write, and reaches the exit
	// code, not only a log line: sentora resolved no row in 13 green weekly
	// runs (#1912).
	if (unresolved.length) {
		console.error(
			`\n✗ ${unresolved.length} mapped row(s) could not be checked: ${unresolved.join("; ")}. A row under unchanged slugs keeps its stored TVL, dated by tvlAsOf (served stale after ${TVL_FRESH_DAYS} days); a row whose slugs just changed serves no figure, with the reason. Reconcile LLAMA_MAP in src/lib/status-checks.ts with DefiLlama's list.`,
		);
		process.exitCode = 1;
	}

	console.log(
		`\nDONE: ${EXECUTE ? `${written} written, ${failed} failed, ${mismatches.length} did-not-persist` : "dry run, no writes"}, ${unresolved.length} could not be checked.`,
	);
	if (failed) process.exitCode = 1;
	process.exit(process.exitCode ?? 0);
}

main().catch((e) => {
	console.error("FATAL", e);
	process.exit(1);
});
