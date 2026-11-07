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
	if (!slugs?.length) return null;
	const page =
		slugs.length === 1 ? slugs[0] : typeof parent === "string" ? parent : "";
	return page ? `https://defillama.com/protocol/${page}` : null;
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
		"reconcile LLAMA_MAP in scripts/enrich-tvl.ts with DefiLlama's family for these rows: no parent's children are exactly them now",
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
 * figure when no DefiLlama row resolves (tvlFieldsFor), and a missed weekly
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
