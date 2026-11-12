/**
 * Status checks: two signals that a Live label may describe a product that no
 * longer runs as listed (lane DQ1, 2026-10-23).
 *
 * Allbridge served `Live`, human-verified, statusConfidence 0.9, while the row
 * already stored TVL 0 from DefiLlama slug allbridge-core, zero events on both
 * tracked contracts, and DefiLlama marked allbridge-core deprecated (deadFrom
 * 2026-08-31, after the 2026-07-19 exploit). None of it reached the status.
 *
 * The two checks, each read from facts the enrich lanes store:
 *   defillama-listing        DefiLlama marks every mapped slug dead: a
 *                            deadFrom date, or deprecated with nothing locked
 *                            and no live listing in its parentProtocol family
 *                            (enrich-tvl writes llamaListing). Deprecated alone
 *                            is not a death: DefiLlama also retires listings a
 *                            successor replaced (909 deprecated rows on
 *                            2026-10-23, 63 still holding value).
 *   tvl-zero-onchain-quiet   an on-chain protocol type (ONCHAIN_USE_TYPES)
 *                            with a DefiLlama TVL of 0 read within
 *                            TVL_FRESH_DAYS and no event or sub-call on any
 *                            tracked contract for QUIET_DAYS of OBSERVED time
 *                            (enrich-onchain writes onchain.quietSince).
 *
 * Trinary, per check: hit, clear, or could-not-check. A read that failed,
 * never ran, or found a slug missing upstream is could-not-check, never a
 * death. A hit on a Live row adds a caveat and halves statusConfidence; the
 * status itself never moves here (a dead upstream listing can mean the product
 * moved, as Allbridge moved to Allbridge Next).
 *
 * Checks apply only to rows with a DefiLlama link; every other row is served
 * exactly as before, the same keys and values.
 */

import { type FactConfidence, factConfidence } from "./fact-confidence";

/** Days of observed contract silence the TVL check needs before it speaks. */
export const QUIET_DAYS = 60;

/** A TVL reading older than this cannot speak for today: enrich-tvl runs
 * weekly, so this allows one missed run (a renamed slug freezes the figure). */
export const TVL_FRESH_DAYS = 14;

/** Types whose product IS on-chain use: with no value locked and no contract
 * activity, such a protocol is not operating as listed. Derivatives joined
 * with the type (sls-113, 2026-11-07): a perpetuals or rate-swap protocol is
 * on-chain use too, and Zenex's market contract emits its orders on mainnet. */
export const ONCHAIN_USE_TYPES = [
	"DEX",
	"Lending",
	"Bridge",
	"Yield",
	"Derivatives",
] as const;

/** The types the liveness report (scripts/report-liveness.ts) holds to its
 * DefiLlama TVL floor: DeFi records, read as DefiLlama counts DeFi, which
 * tracks bridges apart. Its copy also listed DeFi, AMM and Protocol/Contract,
 * which are not types, so no row ever matched them (none served, 2026-11-07). */
export const TVL_FLOOR_TYPES = [
	"DEX",
	"Lending",
	"Yield",
	"Derivatives",
] as const;

export const LLAMA_LISTING_STATES = [
	"listed",
	"deprecated",
	"superseded",
	"partial",
	"not-found",
] as const;
export type LlamaListingState = (typeof LLAMA_LISTING_STATES)[number];

export const STATUS_CHECKS = [
	"defillama-listing",
	"tvl-zero-onchain-quiet",
] as const;
export const CHECK_RESULTS = ["hit", "clear", "could-not-check"] as const;

export interface StatusCheck {
	check: (typeof STATUS_CHECKS)[number];
	result: (typeof CHECK_RESULTS)[number];
	/** What was read, or why it could not be read, in plain words. */
	detail: string;
	/** Date of the reading the result rests on (YYYY-MM-DD), null when none. */
	asOf: string | null;
	/** The DefiLlama page that shows the linked rows (llamaPageFor, the
	 * row's tvlMethodUrl), else the first linked protocol's page. */
	sourceUrl: string;
}

// ── which DefiLlama page carries a row's TVL (sls-102) ─────────────────────

const familyKey = (slugs: readonly string[]) => [...slugs].sort().join(",");

/** The DefiLlama page that shows a row's whole tvlUSD: the protocol's own
 * page for one mapped row; for several, the parent page whose children are
 * exactly those rows, as enrich-tvl last read DefiLlama's list and stored
 * it (llamaListing.parent). Null when the row is not mapped, or when no
 * single page sums its rows or none was read yet; each llamaSlugs entry is
 * then one contributing page. Blend read 2026-11-04: parent#blend's children
 * are its four rows, and https://defillama.com/protocol/blend ("Blend
 * (Combined)") shows their TVL without pool2 and active loans, the same base
 * tvlUSD sums. */
export function llamaPageFor(
	slugs: readonly string[] | null | undefined,
	parent: unknown,
): string | null {
	const page = llamaPageSlugOf(slugs, parent);
	return page ? `https://defillama.com/protocol/${page}` : null;
}

/** llamaPageFor's page as a DefiLlama slug (its API reads
 * api.llama.fi/protocol/{slug}), or null. */
export function llamaPageSlugOf(
	slugs: readonly string[] | null | undefined,
	parent: unknown,
): string | null {
	if (!slugs?.length) return null;
	const page =
		slugs.length === 1 ? slugs[0] : typeof parent === "string" ? parent : "";
	return page || null;
}

/** Why a multi-row tvlUSD has no page to cite, and the repair for each:
 *   parent-not-read  DefiLlama's list still names a parent whose children are
 *                    exactly these rows, so the row has not stored it yet
 *                    (enrich-tvl has not run since): run the TVL lane.
 *   family-drift     no parent's children are exactly these rows any more:
 *                    the map must follow DefiLlama's family.
 *   could-not-check  DefiLlama's list was not read, so neither can be told.
 */
export const TVL_CITATION_GAP_ACTIONS = {
	"parent-not-read":
		"dispatch enrich-tvl.yml with execute=true: DefiLlama's parent page sums exactly these rows and the row has not stored it yet",
	"family-drift":
		"reconcile LLAMA_MAP in src/lib/status-checks.ts with DefiLlama's family for these rows: no parent's children are exactly them now",
	"could-not-check":
		"DefiLlama's protocol list could not be read, so a missing read and a changed family cannot be told apart: rerun",
} as const;
export type TvlCitationGapCause = keyof typeof TVL_CITATION_GAP_ACTIONS;

/** Rows whose tvlUSD sums several DefiLlama rows with no single page to cite
 * (tvlMethodUrl null), each with its cause, read against DefiLlama's own list
 * by the same rule the writer uses (llamaParentOf). protocols null = the list
 * could not be read. The nightly completeness sweep files each one. */
export function tvlCitationGaps(
	rows: readonly {
		slug: string;
		tvlUSD?: number | null;
		llamaSlugs?: string[] | null;
		tvlMethodUrl?: string | null;
	}[],
	protocols: readonly { slug: string; parentProtocol?: string | null }[] | null,
): {
	slug: string;
	family: string[];
	cause: TvlCitationGapCause;
	action: string;
}[] {
	return rows
		.filter(
			(r) =>
				typeof r.tvlUSD === "number" &&
				(r.llamaSlugs?.length ?? 0) > 1 &&
				!r.tvlMethodUrl,
		)
		.map((r) => {
			const family = r.llamaSlugs as string[];
			const cause: TvlCitationGapCause = !protocols
				? "could-not-check"
				: llamaParentOf(family, protocols)
					? "parent-not-read"
					: "family-drift";
			return {
				slug: r.slug,
				family,
				cause,
				action: TVL_CITATION_GAP_ACTIONS[cause],
			};
		});
}

/** Writer side: the DefiLlama parent (its page slug) whose children in the
 * /protocols list are exactly the mapped slugs. Null for one slug, for slugs
 * of different families or none, and for a parent with a child the mapping
 * lacks: its page would then show more than tvlUSD adds. */
export function llamaParentOf(
	slugs: readonly string[],
	protocols: readonly { slug: string; parentProtocol?: string | null }[],
): string | null {
	if (slugs.length < 2) return null;
	const bySlug = new Map(protocols.map((p) => [p.slug, p]));
	const parents = new Set(slugs.map((s) => bySlug.get(s)?.parentProtocol));
	const [parent] = parents;
	if (parents.size !== 1 || !parent?.startsWith("parent#")) return null;
	const children = protocols
		.filter((p) => p.parentProtocol === parent)
		.map((p) => p.slug);
	return familyKey(children) === familyKey(slugs)
		? parent.slice("parent#".length)
		: null;
}

// ── writer side: enrich-tvl ─────────────────────────────────────────────

/** Directory slug to the DefiLlama protocol slugs enrich-tvl reads for it
 * (several rows sum to one protocol, e.g. Blend). Only these rows are ever
 * written; every other row stays unlinked. One DefiLlama slug belongs to one
 * row: two rows on one slug would count its TVL twice in the analyze total. */
export const LLAMA_MAP: Record<string, readonly string[]> = {
	blend: [
		"blend-pools",
		"blend-pools-v2",
		"blend-backstop",
		"blend-backstop-v2",
	],
	aquarius: ["aquarius-stellar"],
	// 2026-10-31: DefiLlama renamed soroswap to soroswap-amm ($1.16M on
	// Stellar); soroswap-aggregator lists no chain and no TVL. The old slug
	// read not-found and left the 10-19 figure in place.
	soroswap: ["soroswap-amm"],
	// The directory row is phoenix: the old key matched no row, so the TVL
	// was never written (the dry run's "no project" warning).
	phoenix: ["phoenix-defi-hub"],
	slender: ["slender"],
	fxdao: ["fxdao"],
	// 2026-10-23 (DQ1): allbridge-core is deprecated on DefiLlama (deadFrom
	// 2026-08-31) after the 2026-07-19 exploit; Allbridge runs on as
	// Allbridge Next, listed as allbridge-next (a bridge aggregator with no
	// TVL and no chain list). The repoint cleared the Core figure, and the
	// row now carries tvlUnavailable instead (see tvlFieldsFor).
	allbridge: ["allbridge-next"],
	defindex: ["defindex"],
	// 2026-11-11 (#1912): DefiLlama lists etherfuse and spiko with no TVL
	// figure and no chain. Neither resolved a Stellar row from the 2026-09-21
	// run on, which left their 2026-09-14 figures as stored for eight weeks;
	// each now carries tvlUnavailable instead of a figure.
	etherfuse: ["etherfuse"],
	spiko: ["spiko"],
	// 2026-11-11 (#1912): DefiLlama now serves templar-protocol as a parent
	// page over templar-lending, the listing this row read (the same Stellar
	// series, from 2025-12-04), and templar-precept (listed 2026-11-04:
	// lending markets by the same team, a Blend v2 fork, $39 on Stellar on
	// 2026-11-11). The old slug read not-found on 2026-11-09 and left the
	// 2026-11-02 figure in place.
	"templar-protocol": ["templar-lending"],
	sushi: ["sushi-stellar"],
	excellar: ["excellar"],
	scopuly: ["scopuly"],
	// The directory row is normal (the old key matched no row).
	normal: ["normal"],
	whalehub: ["whalehub"],
	upshift: ["upshift"],
	// Coverage-gap pass 2026-07-16: the two verified llama misses (seeded the
	// same day). Both have llama chainTvls.Stellar: TVL rows fill from the
	// Stellar slice.
	"gami-labs": ["gami-labs"],
	"defa-invoicemate": ["defa-by-invoicemate"],
	// 2026-11-11 (#1912): DefiLlama now serves sentora as a parent page over
	// sentora-curator, which lists no Stellar, and stellar-defi-hub (Stellar
	// DeFi Hub, listed 2026-08-14), which counts the Stellar vaults Sentora
	// curates: its Stellar series is the one this row read before ($1,348 on
	// 2026-07-16, $10,409,309 on 2026-08-10). The old slug resolved no row
	// from the 2026-08-17 run on and left the 2026-08-10 figure in place.
	// This directory also lists stellar-defi-hub (the vaults' front end,
	// stellardefihub.com) as its own row; it stays unlinked, so the vaults
	// are counted once.
	sentora: ["stellar-defi-hub"],
	// 2026-09-26: Spectra V2 lists Stellar among its chains (chainTvls.Stellar
	// $750k on 2026-09-26, the seven Stellar PT markets); the Stellar slice
	// is what lands, never the $18.9M multichain total.
	"spectra-finance": ["spectra-v2"],
};

export interface LlamaListingInput {
	slug: string;
	deprecated?: boolean | null;
	deadFrom?: string | null;
	tvl?: number | null;
	parentProtocol?: string | null;
}

const hasDeadFrom = (p: { deadFrom?: string | null }) =>
	typeof p.deadFrom === "string" && !!p.deadFrom;
const isRetired = (p: {
	deprecated?: boolean | null;
	deadFrom?: string | null;
}) => p.deprecated === true || hasDeadFrom(p);

/** DefiLlama's verdict on a project's mapped slugs, from its /protocols list.
 *   listed      a mapped slug is neither deprecated nor dated dead
 *   deprecated  every mapped slug is found and dead: a deadFrom date, or
 *               deprecated with nothing locked and no live listing in its
 *               parentProtocol family
 *   superseded  every slug is retired, but one is undated and still holds
 *               value or has a live family listing: a successor, not a death
 *   partial     the found slugs are retired and another is missing; the
 *               missing one may be the live one
 *   not-found   none is in the list (a rename or removal, never a death)
 * deadFrom stays the string DefiLlama publishes (one row says 2022-02-31). */
export function llamaListingOf(
	slugs: readonly string[],
	protocols: readonly LlamaListingInput[],
): { state: LlamaListingState; deadFrom: string | null } {
	const bySlug = new Map(protocols.map((p) => [p.slug, p]));
	const found = slugs
		.map((s) => bySlug.get(s))
		.filter((p): p is LlamaListingInput => !!p);
	if (found.some((p) => !isRetired(p)))
		return { state: "listed", deadFrom: null };
	if (!found.length) return { state: "not-found", deadFrom: null };
	if (found.length < slugs.length) return { state: "partial", deadFrom: null };
	const liveParents = new Set(
		protocols
			.filter((q) => q.parentProtocol && !isRetired(q))
			.map((q) => q.parentProtocol),
	);
	const dead = (p: LlamaListingInput) =>
		hasDeadFrom(p) ||
		(!(typeof p.tvl === "number" && p.tvl > 0) &&
			!(p.parentProtocol && liveParents.has(p.parentProtocol)));
	if (!found.every(dead)) return { state: "superseded", deadFrom: null };
	const dates = found
		.map((p) => p.deadFrom)
		.filter((d): d is string => typeof d === "string" && !!d)
		.sort();
	return { state: "deprecated", deadFrom: dates.at(-1) ?? null };
}

export interface LlamaTvlInput {
	/** The chains DefiLlama lists the protocol on: a row is read for Stellar
	 * only when Stellar is among them. */
	chains?: readonly string[] | null;
	tvl?: number | null;
	chainTvls?: Record<string, number | null> | null;
	deprecated?: boolean | null;
	deadFrom?: string | null;
}

/** A row's Stellar TVL: its Stellar slice, or its total when DefiLlama
 * publishes no per-chain breakdown at all. A breakdown without a Stellar
 * figure is no Stellar reading: its total is other chains' (review,
 * 2026-10-31). */
const rowTvl = (r: LlamaTvlInput): number | null => {
	const chains = r.chainTvls;
	if (typeof chains?.Stellar === "number") return chains.Stellar;
	if (chains && Object.keys(chains).length) return null;
	return typeof r.tvl === "number" ? r.tvl : null;
};

/** TVL on Stellar summed over mapped rows: each row's Stellar slice where
 * DefiLlama publishes one, else its protocol total. Null when no row carries
 * a number; DefiLlama serves tvl null for a protocol it stopped computing,
 * and that is not a reading of 0. */
export function stellarTvlOf(rows: readonly LlamaTvlInput[]): number | null {
	const values = rows.map(rowTvl).filter((v): v is number => v !== null);
	return values.length ? values.reduce((s, v) => s + v, 0) : null;
}

const sameSlugs = (stored: unknown, mapped: readonly string[]) =>
	Array.isArray(stored) &&
	stored.length === mapped.length &&
	mapped.every((s, i) => stored[i] === s);

/** Below this the /protocols body is not the real list (8,807 rows on
 * 2026-10-23): reading listings from it would mark every slug not-found. */
export const MIN_PROTOCOLS = 1_000;

/** Below this many Stellar rows (CEX left out) a /protocols body is not
 * DefiLlama's Stellar coverage. Every logged enrich-tvl run from 2026-07-11
 * to 2026-11-09 read 31 to 36 (35 on 2026-11-11); 20 leaves room for real
 * delistings and still stops a degraded answer whose chains came back
 * blank, which would read every mapped slug as listed with no Stellar
 * figure and clear every row (#1912 audit, 2026-11-11). */
export const MIN_STELLAR_PROTOCOLS = 20;

const onStellarChain = (p: { chains?: readonly string[] | null }) =>
	Array.isArray(p?.chains) && p.chains.includes("Stellar");

/** Why a /protocols answer cannot be read as DefiLlama's list, or null when
 * it can: too few rows, too few Stellar rows, or no Stellar figure above $0
 * among them. The run writes nothing on a non-null answer (could not
 * check). */
export function protocolListProblem(all: unknown): string | null {
	if (!Array.isArray(all) || all.length < MIN_PROTOCOLS)
		return `llama list has ${Array.isArray(all) ? all.length : "no"} protocols (< ${MIN_PROTOCOLS}): not the real list, nothing written`;
	const stellar = all.filter((p) => onStellarChain(p) && p?.category !== "CEX");
	if (stellar.length < MIN_STELLAR_PROTOCOLS)
		return `llama list has ${stellar.length} Stellar protocols (< ${MIN_STELLAR_PROTOCOLS}; every logged run read 31 to 36): not DefiLlama's Stellar coverage, nothing written`;
	// Every Stellar figure missing or zero is no reading either: it would
	// write $0 or no figure over every mapped row (#1912 audit re-check).
	const figures = stellar
		.map(rowTvl)
		.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
	if (!figures.some((v) => v > 0))
		return `llama list has ${stellar.length} Stellar protocols but no Stellar figure above $0 (${figures.length} figures read): not DefiLlama's Stellar coverage, nothing written`;
	return null;
}

/** The mapped slugs' rows in DefiLlama's full list, CEX rows left out (an
 * exchange's reserves are not a protocol's TVL, so a CEX slug is never
 * summed), and the mapped slugs not found there. */
export function llamaRowsFor<
	T extends { slug: string; category?: string | null },
>(
	mapped: readonly string[],
	protocols: readonly T[],
): { listed: T[]; missing: string[] } {
	const bySlug = new Map(
		protocols.filter((p) => p.category !== "CEX").map((p) => [p.slug, p]),
	);
	return {
		listed: mapped.flatMap((s) => {
			const p = bySlug.get(s);
			return p ? [p] : [];
		}),
		missing: mapped.filter((s) => !bySlug.has(s)),
	};
}

/** What DefiLlama's list says about one mapped row's Stellar TVL (#1912):
 *   figure     every mapped slug is listed and every live one carries a
 *              Stellar figure: their sum (a retired slug without one adds
 *              nothing, since DefiLlama stopped computing it).
 *   no-figure  every mapped slug is listed and none carries a Stellar
 *              figure: Stellar is not among its chains, or it was retired
 *              without one. DefiLlama answered.
 *   missing    a mapped slug is not in the list (renamed or removed
 *              upstream, or a CEX listing): could not check.
 *   gap        a live slug on Stellar came back without a figure (a one-run
 *              gap upstream): could not check.
 *   partial    some live slugs carry a Stellar figure and another carries
 *              none: their sum is part of the row's figure, never all of it
 *              (#1912 audit: blend-pools-v2 off Stellar would have left
 *              $39,517 of $115.7M): could not check. */
export type TvlRead =
	| { outcome: "figure"; tvlUSD: number }
	| { outcome: "no-figure" | "missing" | "gap" | "partial" };

export function tvlReadOf(
	mapped: readonly string[],
	listed: readonly LlamaTvlInput[],
): TvlRead {
	if (listed.length < mapped.length) return { outcome: "missing" };
	const stellarRows = listed.filter(onStellarChain);
	if (stellarRows.some((r) => rowTvl(r) === null && !isRetired(r)))
		return { outcome: "gap" };
	const tvl = stellarTvlOf(stellarRows);
	if (tvl === null) return { outcome: "no-figure" };
	if (listed.some((r) => !isRetired(r) && !onStellarChain(r)))
		return { outcome: "partial" };
	return { outcome: "figure", tvlUSD: Math.round(tvl) };
}

/** The TVL fields enrich-tvl writes for one mapped project, or null to leave
 * the stored ones alone. `listed` holds the mapped slugs' rows as DefiLlama's
 * full /protocols list serves them (llamaRowsFor), on any chain or none,
 * read at `checkedAt`. By tvlReadOf's outcome:
 *   figure     the Stellar sum, and no reason.
 *   no-figure  DefiLlama answered, so the stored figure is cleared and
 *              tvlUnavailable says why, dated: an old figure is not today's,
 *              and no figure is never $0.
 *   otherwise  could not check. Under the same slugs the stored fields stay,
 *              dated by tvlAsOf, and age into tvlStale. Under slugs the map
 *              no longer names, the stored figure is another mapping's, so
 *              it is cleared, with the reason. */
export function tvlFieldsFor(
	mapped: readonly string[],
	storedSlugs: unknown,
	listed: readonly LlamaTvlInput[],
	checkedAt: string,
): {
	tvlUSD: number | null;
	llamaSlugs: string[];
	tvlUnavailable: string | null;
} | null {
	const on = `(checked ${checkedAt.slice(0, 10)})`;
	const names = mapped.join(", ");
	const one = mapped.length === 1;
	const fields = (tvlUSD: number | null, tvlUnavailable: string | null) => ({
		tvlUSD,
		llamaSlugs: [...mapped],
		tvlUnavailable,
	});
	const read = tvlReadOf(mapped, listed);
	if (read.outcome === "figure") return fields(read.tvlUSD, null);
	if (read.outcome === "no-figure")
		return fields(
			null,
			`DefiLlama lists ${names} but publishes no Stellar TVL figure for ${one ? "it" : "them"} ${on}.`,
		);
	if (sameSlugs(storedSlugs, mapped)) return null;
	const why = {
		missing: `DefiLlama's protocol list does not hold ${one ? "it" : "all of them"}`,
		gap: "a live listing on Stellar came back without a figure this run",
		partial: "DefiLlama publishes a Stellar figure for only some of them",
	}[read.outcome];
	return fields(
		null,
		`No Stellar TVL could be read for ${names}: ${why} ${on}.`,
	);
}

/** DefiLlama's own double-count verdict on Stellar, from its
 * /lite/protocols2 list: the ids (the /protocols `id`) of the protocols
 * whose Stellar TVL it also files as Stellar-doublecounted, because the
 * same deposits are counted under another protocol too; its Stellar chain
 * total leaves them out ($210.4M on 2026-11-11 against $432.1M summed).
 * Null when the body is not the real list, or files nothing as double
 * counted: each row then keeps its stored verdict. */
export function stellarDoublecountedIds(lite: unknown): Set<string> | null {
	const rows = (lite as { protocols?: unknown } | null)?.protocols;
	if (!Array.isArray(rows) || rows.length < MIN_PROTOCOLS) return null;
	const onStellar = rows.filter((p) => p?.chainTvls?.Stellar != null);
	if (onStellar.length < MIN_STELLAR_PROTOCOLS) return null;
	const ids = new Set(
		onStellar
			.filter((p) => p.chainTvls["Stellar-doublecounted"] != null)
			.map((p) => String(p.defillamaId)),
	);
	if (ids.size) return ids;
	// No Stellar double-count key: either the list left the keys out, which
	// read as none would re-sum about $213M on a green run (7 listings on
	// 2026-11-11), or DefiLlama files nothing on Stellar as double counted.
	// The keys on other chains tell them apart: with none anywhere it is no
	// verdict and each row keeps its own; with some, Stellar is clear.
	const keysElsewhere = rows.some((p) =>
		Object.keys(p?.chainTvls ?? {}).some((k) => k.endsWith("-doublecounted")),
	);
	return keysElsewhere ? ids : null;
}

/** A mapped row's llamaListing.doublecounted: true when DefiLlama files any
 * of its listed slugs as double counted on Stellar, false when none. When
 * the lite list could not be read, or a mapped slug is missing (the row
 * could not be checked), the stored verdict stays. */
export function doublecountedOf(
	listed: readonly { id?: string | number | null }[],
	missing: readonly string[],
	ids: ReadonlySet<string> | null,
	stored: unknown,
): boolean | null {
	if (!ids || missing.length)
		return typeof stored === "boolean" ? stored : null;
	return listed.some((r) => r.id != null && ids.has(String(r.id)));
}

// ── writer side: enrich-onchain ─────────────────────────────────────────

interface ContractDelta {
	eventsDelta?: unknown;
	subinvocationsDelta?: unknown;
}

const str = (v: unknown) => (typeof v === "string" && v ? v : null);

/** "moved" when any measured delta is non-zero, "quiet" when every contract
 * has both deltas measured (events and sub-calls) and all are zero, null
 * when that cannot be said: a counter that was not read is not a zero
 * (review, 2026-10-31). */
function windowState(contracts: unknown): "moved" | "quiet" | null {
	if (!Array.isArray(contracts) || !contracts.length) return null;
	const deltas = (contracts as ContractDelta[]).map((c) =>
		[c?.eventsDelta, c?.subinvocationsDelta].filter(
			(d): d is number => typeof d === "number",
		),
	);
	if (deltas.some((d) => d.some((v) => v !== 0))) return "moved";
	return deltas.every((d) => d.length === 2) ? "quiet" : null;
}

/** Start of the unbroken run of readings in which no tracked contract moved,
 * or null (moved in the latest window, or not measured). Silence is only
 * what two readings showed: with the prior window quiet too, the run reaches
 * back to that window's start. */
export function quietSinceFor(
	contracts: readonly ContractDelta[],
	prior:
		| {
				asOf?: unknown;
				prevAsOf?: unknown;
				quietSince?: unknown;
				contracts?: unknown;
		  }
		| null
		| undefined,
): string | null {
	const priorAsOf = str(prior?.asOf);
	if (!priorAsOf || windowState(contracts) !== "quiet") return null;
	const carried = str(prior?.quietSince);
	if (carried) return carried;
	const prevAsOf = str(prior?.prevAsOf);
	return windowState(prior?.contracts) === "quiet" && prevAsOf
		? prevAsOf
		: priorAsOf;
}

// ── serve side ──────────────────────────────────────────────────────────

/** A stored date as an ISO string. Payload hands strings, but the semantic
 * search rows come from a raw aggregate, where a date field is a Date: read
 * as no date, every DefiLlama check on those rows said "not yet checked"
 * (review, 2026-10-31). */
const iso = (v: unknown): string | null =>
	v instanceof Date
		? Number.isNaN(v.getTime())
			? null
			: v.toISOString()
		: typeof v === "string" && v
			? v
			: null;

const day = (v: unknown) => iso(v)?.slice(0, 10) ?? null;

const daysBetween = (from: string, to: string) =>
	Math.floor((Date.parse(to) - Date.parse(from)) / 86_400_000);

const usd = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;

/** A citation that must name a page (a status check, a basis upgrade's
 * evidence): the page that shows the linked rows, else the first row's own
 * page. slugs is non-empty. */
export const llamaCitationFor = (slugs: readonly string[], parent: unknown) =>
	llamaPageFor(slugs, parent) ?? `https://defillama.com/protocol/${slugs[0]}`;

/** A stored date as ISO 8601, or null when it is missing or unparseable. */
export function parseDate(v: unknown): string | null {
	const s = iso(v);
	const t = s ? Date.parse(s) : Number.NaN;
	return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** One parse for a served TVL reading. `at` is its date when that date can
 * date a reading now: parseable and not after `now`. `stale` is true when
 * `at` is missing or more than TVL_FRESH_DAYS old, null with no reading.
 * Only the date is checked, not why it is old: enrich-tvl keeps the stored
 * figure when it could not check a row (tvlFieldsFor), and a missed weekly
 * run leaves every figure as it was (#1912: Sentora's sat from 2026-08-10). */
export function tvlReadingOf(
	tvlUSD: unknown,
	tvlAsOf: unknown,
	now: Date = new Date(),
): { at: string | null; stale: boolean | null } {
	const parsed = parseDate(tvlAsOf);
	const at = parsed && Date.parse(parsed) <= now.getTime() ? parsed : null;
	if (typeof tvlUSD !== "number") return { at, stale: null };
	const fresh = at && daysBetween(at, now.toISOString()) <= TVL_FRESH_DAYS;
	return { at, stale: !fresh };
}

/** tvlReadingOf's stale flag, for the row builders. */
export function tvlStaleOf(
	tvlUSD: unknown,
	tvlAsOf: unknown,
	now: Date = new Date(),
): boolean | null {
	return tvlReadingOf(tvlUSD, tvlAsOf, now).stale;
}

/** Why a row serves no tvlUSD although DefiLlama was read for it: the
 * reason enrich-tvl stored (tvlFieldsFor, dated in its text and by tvlAsOf),
 * served only while tvlUSD holds no figure; null otherwise. For the row
 * builders and the analyze rollup alike. */
export function tvlUnavailableOf(p: {
	tvlUSD?: unknown;
	tvlUnavailable?: unknown;
}): string | null {
	return typeof p.tvlUSD !== "number" &&
		typeof p.tvlUnavailable === "string" &&
		p.tvlUnavailable
		? p.tvlUnavailable
		: null;
}

function linkedSlugs(v: unknown): string[] | null {
	const slugs = Array.isArray(v)
		? v.filter((s): s is string => typeof s === "string" && s.length > 0)
		: [];
	return slugs.length ? slugs : null;
}

// biome-ignore lint/suspicious/noExplicitAny: raw Payload doc
function listingCheck(p: any, slugs: string[]): StatusCheck {
	const l = p.llamaListing;
	const checkedAt = day(l?.checkedAt);
	const names = slugs.join(", ");
	const base = {
		check: "defillama-listing" as const,
		asOf: checkedAt,
		sourceUrl: llamaCitationFor(slugs, p.llamaListing?.parent),
	};
	if (!checkedAt || !l?.state)
		return {
			...base,
			result: "could-not-check",
			detail: `Not yet checked against DefiLlama's protocol list (${names}).`,
		};
	if (l.state === "deprecated")
		return {
			...base,
			result: "hit",
			detail: `DefiLlama marks ${names} deprecated${l.deadFrom ? `, dead from ${l.deadFrom}` : ", with nothing locked and no live listing in its family"} (checked ${checkedAt})`,
		};
	if (l.state === "listed")
		return {
			...base,
			result: "clear",
			detail: `DefiLlama lists ${names} as active (checked ${checkedAt}).`,
		};
	if (l.state === "superseded")
		return {
			...base,
			result: "could-not-check",
			detail: `DefiLlama deprecated ${names} without a dead-from date while value is still locked or a listing in its family is live (checked ${checkedAt}): read as a retired or superseded listing, not a death.`,
		};
	if (l.state === "partial")
		return {
			...base,
			result: "could-not-check",
			detail: `DefiLlama retired part of ${names} and does not list the rest (checked ${checkedAt}): a missing listing is never read as support for a death.`,
		};
	return {
		...base,
		result: "could-not-check",
		detail: `${names} not in DefiLlama's protocol list on ${checkedAt}: renamed or removed upstream, which is not a death signal.`,
	};
}

// biome-ignore lint/suspicious/noExplicitAny: raw Payload doc
function tvlQuietCheck(p: any, slugs: string[], now: Date): StatusCheck {
	const tvlAsOf = day(p.tvlAsOf);
	const o = p.onchain;
	const contracts = Array.isArray(o?.contracts) ? o.contracts : [];
	const result = (
		r: StatusCheck["result"],
		detail: string,
		asOf: string | null = tvlAsOf,
	): StatusCheck => ({
		check: "tvl-zero-onchain-quiet",
		result: r,
		detail,
		asOf,
		// where the TVL figure is read; the contract readings are on the row
		sourceUrl: llamaCitationFor(slugs, p.llamaListing?.parent),
	});
	if (typeof p.tvlUSD !== "number")
		return result("could-not-check", "No DefiLlama TVL figure on record.");
	// A negative or non-finite figure is not a reading of $0.
	if (!Number.isFinite(p.tvlUSD) || p.tvlUSD < 0)
		return result(
			"could-not-check",
			"The DefiLlama TVL on record is not a usable figure.",
		);
	const tvlIso = iso(p.tvlAsOf);
	const tvlAge = tvlIso ? daysBetween(tvlIso, now.toISOString()) : NaN;
	if (!(tvlAge <= TVL_FRESH_DAYS))
		return result(
			"could-not-check",
			`The DefiLlama TVL on record is ${tvlAsOf ? `from ${tvlAsOf}` : "undated"}, older than ${TVL_FRESH_DAYS} days, so it cannot speak for today.`,
		);
	if (p.tvlUSD > 0)
		return result(
			"clear",
			`DefiLlama TVL ${usd(p.tvlUSD)}${tvlAsOf ? ` on ${tvlAsOf}` : ""}.`,
		);
	// A listing with a mapped slug DefiLlama no longer lists does not sum the
	// whole TVL: the missing slug may be where the value is.
	if (["partial", "not-found"].includes(p.llamaListing?.state))
		return result(
			"could-not-check",
			"TVL is $0, but DefiLlama's listing of the mapped protocols was not read whole, so the figure may leave value out.",
		);
	const asOf = iso(o?.asOf);
	if (!asOf || !contracts.length)
		return result(
			"could-not-check",
			"TVL is $0, but no contract of this project is tracked, so its on-chain use could not be read.",
		);
	const state = windowState(contracts);
	if (state === "moved")
		return result(
			"clear",
			`TVL is $0, but its tracked contracts moved in the window ending ${day(asOf)}.`,
			day(asOf),
		);
	const sinceAt: string | null =
		state === "quiet" ? iso(o.quietSince) || iso(o.prevAsOf) : null;
	const since = day(sinceAt);
	if (!sinceAt || !since)
		return result(
			"could-not-check",
			"TVL is $0; its contract activity has not been measured over a full window yet.",
			day(asOf),
		);
	const quiet = daysBetween(sinceAt, asOf);
	const n = contracts.length;
	// An unparseable date is no window: NaN < 60 is false and fell to a hit.
	if (!Number.isFinite(quiet))
		return result(
			"could-not-check",
			"TVL is $0, but the dates of its contract readings could not be read.",
			day(asOf),
		);
	if (quiet < QUIET_DAYS)
		return result(
			"could-not-check",
			`TVL is $0 and its ${n} tracked contract${n === 1 ? " has" : "s have"} been quiet since ${since} (${quiet} days on record ${day(asOf)}); ${QUIET_DAYS} days of observed silence are needed.`,
			day(asOf),
		);
	return result(
		"hit",
		`its DefiLlama TVL is $0${tvlAsOf ? ` (${tvlAsOf})` : ""} and its ${n} tracked contract${n === 1 ? " shows" : "s show"} no events or sub-calls since ${since} (${quiet} days, on record ${day(asOf)})`,
		day(asOf),
	);
}

function halved(c: FactConfidence | null): FactConfidence | null {
	if (!c) return null;
	const score = Math.round(c.score * 50) / 100;
	const label = score >= 0.75 ? "high" : score >= 0.5 ? "medium" : "low";
	return { score, label, ageDays: c.ageDays };
}

/** The served status fields a row's own facts decide: statusConfidence on
 * every row, and on a row with a DefiLlama link its statusChecks and
 * statusCaveat. A row without a link gets exactly the confidence it got
 * before, and no other key. */
export function statusChecksFor(
	// biome-ignore lint/suspicious/noExplicitAny: raw Payload doc
	p: any,
	now: Date = new Date(),
): {
	statusConfidence: FactConfidence | null;
	statusChecks?: StatusCheck[];
	statusCaveat?: string | null;
} {
	const statusConfidence = factConfidence(p.statusBasis, p.statusAsOf, now);
	const slugs = linkedSlugs(p.llamaSlugs);
	if (!slugs) return { statusConfidence };
	const types: unknown[] = Array.isArray(p.types) ? p.types : [];
	const statusChecks = [
		listingCheck(p, slugs),
		...(types.some((t) => (ONCHAIN_USE_TYPES as readonly unknown[]).includes(t))
			? [tvlQuietCheck(p, slugs, now)]
			: []),
	];
	const hits = statusChecks.filter((c) => c.result === "hit");
	if (p.status !== "Live" || !hits.length)
		return { statusConfidence, statusChecks, statusCaveat: null };
	return {
		statusConfidence: halved(statusConfidence),
		statusChecks,
		statusCaveat: `Live on record, but ${hits.map((h) => h.detail).join("; and ")}. Treat the Live label as unconfirmed: the product may have stopped or moved. Check the project's own channels before relying on it.`,
	};
}
