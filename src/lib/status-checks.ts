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
 *   tvl-zero-onchain-quiet   an on-chain protocol type (DEX, Lending, Bridge,
 *                            Yield) with a DefiLlama TVL of 0 read within
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
 * activity, such a protocol is not operating as listed. */
export const ONCHAIN_USE_TYPES = ["DEX", "Lending", "Bridge", "Yield"] as const;

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
	/** The first linked protocol's DefiLlama page. */
	sourceUrl: string;
}

// ── writer side: enrich-tvl ─────────────────────────────────────────────

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
	tvl?: number | null;
	chainTvls?: Record<string, number | null> | null;
	deprecated?: boolean | null;
	deadFrom?: string | null;
}

const rowTvl = (r: LlamaTvlInput): number | null =>
	typeof r.chainTvls?.Stellar === "number"
		? r.chainTvls.Stellar
		: typeof r.tvl === "number"
			? r.tvl
			: null;

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

/** The TVL fields enrich-tvl writes for one mapped project, or null to leave
 * the stored TVL alone. A sum is written only when every live row carries a
 * figure; a retired row (deprecated or dated dead) without one counts as
 * none, since DefiLlama stopped computing it. A live row without a figure is
 * a one-run gap upstream: under the same slugs the stored reading stays
 * (dated by tvlAsOf). Under slugs the map no longer names, the stored figure
 * is not this mapping's, so it is cleared. */
export function tvlFieldsFor(
	mapped: readonly string[],
	storedSlugs: unknown,
	stellarRows: readonly LlamaTvlInput[],
): { tvlUSD: number | null; llamaSlugs: string[] } | null {
	const gap = stellarRows.some((r) => rowTvl(r) === null && !isRetired(r));
	if (stellarRows.length && !gap) {
		const tvl = stellarTvlOf(stellarRows);
		return {
			tvlUSD: tvl === null ? null : Math.round(tvl),
			llamaSlugs: [...mapped],
		};
	}
	return sameSlugs(storedSlugs, mapped)
		? null
		: { tvlUSD: null, llamaSlugs: [...mapped] };
}

// ── writer side: enrich-onchain ─────────────────────────────────────────

interface ContractDelta {
	eventsDelta?: unknown;
	subinvocationsDelta?: unknown;
}

const str = (v: unknown) => (typeof v === "string" && v ? v : null);

/** "moved" when any measured delta is non-zero, "quiet" when every contract
 * has a measured delta and all are zero, null when that cannot be said. */
function windowState(contracts: unknown): "moved" | "quiet" | null {
	if (!Array.isArray(contracts) || !contracts.length) return null;
	const deltas = (contracts as ContractDelta[]).map((c) =>
		[c?.eventsDelta, c?.subinvocationsDelta].filter(
			(d): d is number => typeof d === "number",
		),
	);
	if (deltas.some((d) => d.some((v) => v !== 0))) return "moved";
	return deltas.every((d) => d.length > 0) ? "quiet" : null;
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

const day = (v: unknown) =>
	typeof v === "string" && v ? v.slice(0, 10) : null;

const daysBetween = (from: string, to: string) =>
	Math.floor((Date.parse(to) - Date.parse(from)) / 86_400_000);

const usd = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;

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
		sourceUrl: `https://defillama.com/protocol/${slugs[0]}`,
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
		sourceUrl: `https://defillama.com/protocol/${slugs[0]}`,
	});
	if (typeof p.tvlUSD !== "number")
		return result("could-not-check", "No DefiLlama TVL figure on record.");
	const tvlAge =
		typeof p.tvlAsOf === "string"
			? daysBetween(p.tvlAsOf, now.toISOString())
			: NaN;
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
	const asOf = typeof o?.asOf === "string" ? o.asOf : null;
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
		state === "quiet" ? o.quietSince || o.prevAsOf || null : null;
	const since = day(sinceAt);
	if (!sinceAt || !since)
		return result(
			"could-not-check",
			"TVL is $0; its contract activity has not been measured over a full window yet.",
			day(asOf),
		);
	const quiet = daysBetween(sinceAt, asOf);
	const n = contracts.length;
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
