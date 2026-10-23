/**
 * DefiLlama TVL enrichment — the TVL truth axis (boxy, 2026-07-09).
 *
 *   pnpm exec tsx scripts/enrich-tvl.ts            # dry run (default)
 *   pnpm exec tsx scripts/enrich-tvl.ts --execute  # write tvlUSD/tvlAsOf (+ tvlSource/tvlMethod provenance, sls-031)
 *
 * Design rules (lesson classes baked in):
 *   - null = NOT TRACKED on DefiLlama, never "zero TVL" (class 3). Only
 *     records in LLAMA_MAP are ever written; everything else stays null.
 *   - every value carries tvlAsOf (class 8: dated metrics).
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
 * removal upstream, never a death.
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
	llamaListingOf,
	stellarTvlOf,
	tvlFieldsFor,
} from "../src/lib/status-checks";
import {
	formatMismatches,
	type ReadBackMismatch,
	verifyWrites,
} from "../src/lib/utils/read-back";
import configPromise from "../src/payload.config";

const EXECUTE = process.argv.includes("--execute");

/** ourSlug → DefiLlama slugs (several rows sum to one protocol, e.g. Blend). */
const LLAMA_MAP: Record<string, string[]> = {
	blend: [
		"blend-pools",
		"blend-pools-v2",
		"blend-backstop",
		"blend-backstop-v2",
	],
	aquarius: ["aquarius-stellar"],
	soroswap: ["soroswap"],
	"phoenix-protocol": ["phoenix-defi-hub"],
	slender: ["slender"],
	fxdao: ["fxdao"],
	// 2026-10-23 (DQ1): allbridge-core is deprecated on DefiLlama (deadFrom
	// 2026-08-31) after the 2026-07-19 exploit; Allbridge runs on as
	// Allbridge Next, listed as allbridge-next (a bridge aggregator with no
	// TVL and no chain list). The repoint clears the Core figure (tvlUSD
	// null, see tvlFieldsFor) and keeps the listing check on the live product.
	allbridge: ["allbridge-next"],
	defindex: ["defindex"],
	etherfuse: ["etherfuse"],
	spiko: ["spiko"],
	"templar-protocol": ["templar-protocol"],
	sushi: ["sushi-stellar"],
	excellar: ["excellar"],
	scopuly: ["scopuly"],
	"normal-stellar-amm": ["normal"],
	whalehub: ["whalehub"],
	upshift: ["upshift"],
	// Coverage-gap pass 2026-07-16: the two verified llama misses (seeded the
	// same day) + sentora (seeded 2026-07-15 without TVL wiring). All three
	// have llama chainTvls.Stellar — TVL rows fill from the Stellar slice.
	"gami-labs": ["gami-labs"],
	"defa-invoicemate": ["defa-by-invoicemate"],
	sentora: ["sentora"],
	// 2026-09-26: Spectra V2 lists Stellar among its chains (chainTvls.Stellar
	// $750k on 2026-09-26, the seven Stellar PT markets); the Stellar slice
	// is what lands, never the $18.9M multichain total.
	"spectra-finance": ["spectra-v2"],
};

const LIVENESS_THRESHOLD_USD = 5_000;

// sls-031: TVL methodology provenance, written alongside every tvlUSD write so
// a consumer can reconcile our number with operator/Dune/DefiLlama readings
// (they legitimately differ by pricing time + inclusion scope) instead of
// treating ours as exact universal truth. ONE stable string — reruns no-op.
const TVL_SOURCE = "defillama";
const TVL_METHOD =
	"sum of the project's mapped DefiLlama protocol rows (see llamaSlugs; e.g. Blend = pools + backstops), STELLAR-chain slice (chainTvls.Stellar) where DefiLlama publishes a per-chain breakdown — a multichain protocol's cross-chain total is not its Stellar footprint — falling back to the protocol total only when no breakdown exists; USD at DefiLlama's pricing time; refreshed weekly (tvlAsOf)";

interface LlamaProtocol {
	slug: string;
	name: string;
	category?: string;
	chains?: string[];
	tvl?: number | null;
	chainTvls?: Record<string, number | null>;
	deprecated?: boolean | null;
	deadFrom?: string | null;
}

// TVL on Stellar is stellarTvlOf (src/lib/status-checks.ts). Multichain rows
// (Gami Labs, Sentora…) carry a per-chain breakdown; summing the headline
// `tvl` wrote the CROSS-CHAIN total as "Stellar TVL" (Sentora: $2.06B total
// vs $1.3k actually on Stellar, caught 2026-07-16). A row with neither a
// Stellar slice nor a total is null there, never 0: DefiLlama serves tvl null
// for a protocol it stopped computing, and this lane wrote that as $0 for
// allbridge-core (found 2026-10-23).

/** Below this the /protocols body is not the real list (8,807 rows on
 * 2026-10-23): reading listings from it would mark every slug not-found. */
const MIN_PROTOCOLS = 1_000;

async function main() {
	console.log(
		`Mode: ${EXECUTE ? "EXECUTE (writes)" : "DRY RUN (read-only)"}\n`,
	);

	const res = await fetch("https://api.llama.fi/protocols", {
		headers: { "User-Agent": "stellarlight-scout-enrich" },
	});
	if (!res.ok) throw new Error(`llama fetch failed: ${res.status}`);
	const all = (await res.json()) as LlamaProtocol[];
	if (!Array.isArray(all) || all.length < MIN_PROTOCOLS)
		throw new Error(
			`llama list has ${Array.isArray(all) ? all.length : "no"} protocols (< ${MIN_PROTOCOLS}): not the real list, nothing written`,
		);
	const stellar = all.filter(
		(p) => p.chains?.includes("Stellar") && p.category !== "CEX",
	);
	const bySlug = new Map(stellar.map((p) => [p.slug, p]));
	console.log(
		`DefiLlama: ${stellar.length} Stellar-chain protocols (CEX excluded)\n`,
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
		// drop Stellar from its chains).
		const listing = { ...llamaListingOf(llamaSlugs, all), checkedAt: asOf };
		const rows = llamaSlugs
			.map((ls) => bySlug.get(ls))
			.filter((r): r is LlamaProtocol => Boolean(r));
		const tvl = tvlFieldsFor(llamaSlugs, d.llamaSlugs, rows);
		const data: Record<string, unknown> = tvl
			? {
					tvlUSD: tvl.tvlUSD,
					tvlAsOf: asOf,
					llamaSlugs: tvl.llamaSlugs,
					// sls-031: provenance rides every write (additive fields)
					tvlSource: TVL_SOURCE,
					tvlMethod: TVL_METHOD,
					llamaListing: listing,
				}
			: { llamaListing: listing };
		const deadNote = listing.deadFrom ? `, dead from ${listing.deadFrom}` : "";
		if (!tvl)
			console.log(
				`  ${ourSlug}: no Stellar llama row resolved (${llamaSlugs.join(",")}): TVL left as stored; listing ${listing.state}${deadNote}`,
			);
		else if (!rows.length)
			console.log(
				`  ${ourSlug}: mapping moved (${(d.llamaSlugs ?? []).join(",") || "none"} → ${llamaSlugs.join(",")}) and the new slugs carry no Stellar row, so tvlUSD ← null (was ${d.tvlUSD ?? "null"}); listing ${listing.state}${deadNote}`,
			);
		else
			console.log(
				`  ${ourSlug}: tvlUSD ← ${tvl.tvlUSD === null ? "null (no TVL figure upstream)" : `$${tvl.tvlUSD.toLocaleString()}`} (${llamaSlugs.length} row(s)); listing ${listing.state}${deadNote}`,
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
		const tvl =
			stellarTvlOf(
				llamaSlugs
					.map((ls) => bySlug.get(ls))
					.filter((r): r is LlamaProtocol => Boolean(r)),
			) ?? 0;
		if (tvl >= LIVENESS_THRESHOLD_USD) continue;
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

	console.log(
		`\nDONE: ${EXECUTE ? `${written} written, ${failed} failed, ${mismatches.length} did-not-persist` : "dry run — no writes"}.`,
	);
	if (failed) process.exitCode = 1;
	process.exit(process.exitCode ?? 0);
}

main().catch((e) => {
	console.error("FATAL", e);
	process.exit(1);
});
