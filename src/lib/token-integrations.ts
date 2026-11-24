/**
 * Token integrations: which projects support a token on Stellar, how, since
 * when. The pure half (tiers, the depth rule, aggregation into stored rows,
 * the write plan, the per-tier counts, the token parameter), plus the one
 * store read behind the `integrations` block on stablecoin and RWA rows. The
 * reads live in scripts/refresh-token-integrations.ts, the serving in
 * src/app/api/tokens/integrations/route.ts.
 *
 * Tiers (owner-approved definition, 2026-11-23), never one blended count:
 *   integrated  the project chose the token: a lending reserve, a vault or
 *               strategy asset, a bridge or oracle configuration, an anchor's
 *               own stellar.toml currency, the issuer's own token, the
 *               publisher's own SEP-42 list, an Aquarius pool its rewards
 *               config pays, or a holder contract that is the project's own
 *               lending pool or vault by its public directory label
 *   used        a permissionless pool (or holding) with priced depth of at
 *               least USD_FLOOR and at least EVENTS_FLOOR events in 90 days
 *   available   below either floor, where that floor was actually read
 *   unrated     neither could be decided: activity or a priced leg was not
 *               read. Could-not-check is never counted as available.
 * A wallet showing what an account holds ("displayable") has no edges by
 * design. Network venues (classic AMM pools) carry a tier and no project.
 */
import { Asset, Networks } from "@stellar/stellar-sdk";
import type { Payload } from "payload";

export const TOKEN_INTEGRATION_TIERS = [
	"integrated",
	"used",
	"available",
	"unrated",
] as const;
export type Tier = (typeof TOKEN_INTEGRATION_TIERS)[number];

export const TOKEN_INTEGRATION_KINDS = [
	"dex_pool",
	"lending_reserve",
	"vault",
	"bridge",
	"oracle_feed",
	"classic_amm_pool",
	"anchor_asset",
	"asset_list",
	"issuer",
	"holder",
	"holder_unattributed",
] as const;
export type Kind = (typeof TOKEN_INTEGRATION_KINDS)[number];

export const TOKEN_INTEGRATION_STATUSES = ["active", "ended"] as const;

/** A Stellar Asset Contract (a classic asset) or a custom contract token. */
export const TOKEN_CONTRACT_KINDS = ["sac", "custom"] as const;
export type Status = (typeof TOKEN_INTEGRATION_STATUSES)[number];

/** Events (Soroban) or operations (classic pool) in the 90 days before the
 * read. Set from the measured distribution of 735 DEX pools on 2026-11-23:
 * 1 to 9 events is the dormant mass (fewer than one a week). */
export const EVENTS_FLOOR = 10;
/** Priced depth of the whole pool in USD. Between $100 and $1,000 sat only
 * 53 of 735 pools, so this splits dust from markets. */
export const USD_FLOOR = 1000;

/** Best first: a project's or token's tier is its best row's. */
export const TIER_RANK: Record<Tier, number> = {
	integrated: 0,
	used: 1,
	unrated: 2,
	available: 3,
};

/** Kinds no project owns: never counted as a project's support. */
export const NETWORK_KINDS: ReadonlySet<Kind> = new Set(["classic_amm_pool"]);

/** Why a configured kind is integrated by definition. */
export const INTEGRATED_BASIS: Partial<Record<Kind, string>> = {
	lending_reserve:
		"reserve set by the pool admin (factory pool; the admin is not necessarily the protocol team)",
	vault: "asset configured in the vault, strategy or principal-token contract",
	bridge: "token configured in the bridge contract",
	oracle_feed: "asset in the oracle's own feed list",
	anchor_asset: "currency in the anchor's own stellar.toml",
	issuer: "the project issues the token",
	asset_list: "token in the publisher's own SEP-42 list",
};

export interface TierCall {
	tier: Tier;
	basis: string;
}

/** used / available / unrated for a permissionless pool or a holding. A floor
 * is failed only where it was read; an unread floor is never a pass or fail. */
export function marketTier(
	events90d: number | null,
	eventsBasis: string | null,
	depthUsd: number,
	unknownLegs: number,
): TierCall {
	const evKnown = events90d !== null;
	const evOk = evKnown && events90d >= EVENTS_FLOOR;
	const usdOk = depthUsd >= USD_FLOOR;
	if (evOk && usdOk)
		return {
			tier: "used",
			basis: `${events90d} events in 90d >= ${EVENTS_FLOOR} and priced depth $${depthUsd} >= $${USD_FLOOR}`,
		};
	if (evKnown && !evOk)
		return {
			tier: "available",
			basis: `${events90d} events in 90d < ${EVENTS_FLOOR} (${eventsBasis ?? "read"})`,
		};
	if (!usdOk && unknownLegs === 0)
		return {
			tier: "available",
			basis: `priced depth $${depthUsd} < $${USD_FLOOR} with every leg priced`,
		};
	return {
		tier: "unrated",
		basis: `activity or depth not read${unknownLegs ? `; ${unknownLegs} leg(s) unpriced or unread` : ""}`,
	};
}

/** A protocol pool edge's tier. Configured kinds are integrated by
 * definition; a DEX pool is integrated only when the protocol's own rewards
 * config pays it (Aquarius reward_tps > 0), else judged as a market. */
export function poolEdgeTier(
	kind: Kind,
	rewardTps: string | null,
	events90d: number | null,
	eventsBasis: string | null,
	depth: { usd: number; unknownLegs: number },
): TierCall {
	if (kind === "dex_pool" || kind === "classic_amm_pool") {
		if (kind === "dex_pool" && rewardTps !== null && Number(rewardTps) > 0)
			return {
				tier: "integrated",
				basis: `the protocol's rewards config pays this pool (reward_tps ${rewardTps})`,
			};
		return marketTier(events90d, eventsBasis, depth.usd, depth.unknownLegs);
	}
	return { tier: "integrated", basis: INTEGRATED_BASIS[kind] ?? kind };
}

/** A public directory label that names a project's own pool or vault. */
export const OWN_POOL_LABEL = /pool|vault|lend|reserve|hub|market/i;

/** A holding found by the holder sweep. Integrated when the holder is the
 * project's own lending pool or vault by its public directory label, tied to
 * the project directly (not through shared code), and the project is not a
 * DEX (a DEX's pools are permissionless: anyone can pool any token). Else the
 * market floors, on this holding's USD value and the holder's own events. */
export function holderTier(h: {
	projectSlug: string | null;
	direct: boolean;
	dexProject: boolean;
	label: string | null;
	events90d: number | null;
	eventsBasis: string | null;
	usd: number | null;
}): TierCall {
	if (
		h.projectSlug &&
		h.direct &&
		!h.dexProject &&
		h.label &&
		OWN_POOL_LABEL.test(h.label)
	)
		return {
			tier: "integrated",
			basis: `the project's own pool or vault by its public directory label ("${h.label.slice(0, 60)}")`,
		};
	return marketTier(
		h.events90d,
		h.eventsBasis,
		h.usd ?? 0,
		h.usd === null ? 1 : 0,
	);
}

/**
 * A holder's link to a project in the curated on-chain map, as
 * /api/contracts serves it (`attribution`) and as attributionsOf
 * (src/lib/contracts-registry.ts, the one reader) reads accounts off the
 * project rows. A strong link ranks with the protocol registry (1), a
 * labelled one with a public directory label (2); the basis names the tier
 * and the evidence. "ended": the weekly check read the address absent from
 * mainnet, so it attributes nothing. Null: no map link.
 */
export function mapEvidence(
	a: unknown,
): { slug: string; basis: string; rank: 1 | 2 } | "ended" | null {
	const o = a && typeof a === "object" ? (a as Record<string, unknown>) : null;
	const p = o?.project as Record<string, unknown> | null | undefined;
	const slug = typeof p?.slug === "string" && p.slug ? p.slug : null;
	if (!o || !slug) return null;
	if (o.endedAt) return "ended";
	if (o.tier !== "strong" && o.tier !== "labelled") return null;
	const ev = Array.isArray(o.evidence)
		? o.evidence.filter((x): x is string => typeof x === "string")
		: [];
	const src = typeof o.sourceUrl === "string" && o.sourceUrl ? o.sourceUrl : "";
	return {
		slug,
		rank: o.tier === "strong" ? 1 : 2,
		basis: `on-chain map ${o.tier}: ${ev.join(", ") || "no evidence named"}${src ? ` (${src})` : ""}`,
	};
}

/** An account's holdings of the wanted classic assets ("CODE:ISSUER" to
 * token id) from Horizon's /accounts/{G} `balances`. XLM is never a holding
 * here: every account must hold it to exist. */
export function accountHoldings(
	account: unknown,
	wanted: ReadonlyMap<string, string>,
): Array<{ token: string; balance: string }> {
	const bs = (account as { balances?: unknown } | null)?.balances;
	const out: Array<{ token: string; balance: string }> = [];
	for (const b of Array.isArray(bs) ? bs : []) {
		const t = wanted.get(`${b?.asset_code}:${b?.asset_issuer}`);
		const v = b?.balance;
		if (!t || typeof v !== "string" || !(Number(v) > 0)) continue;
		out.push({
			token: t,
			balance: v.includes(".") ? v.replace(/\.?0+$/, "") : v,
		});
	}
	return out;
}

/** One token's balance in one pool, as read. balance null = not read. */
export interface Leg {
	balance: string | null;
	usd: number | null;
}

/** A pool's priced depth: its priced legs summed. In a two-leg
 * constant-product pool (x*y=k) both legs are worth the same at the pool's
 * own mid price, so one priced leg prices the pool at twice that leg; not
 * used for concentrated, weighted or stable pools. */
export function poolDepth(
	legs: Leg[],
	constantProduct: boolean,
): { usd: number; unknownLegs: number; basis: string } {
	let usd = 0;
	let priced = 0;
	let unknown = 0;
	let unread = 0;
	for (const l of legs) {
		if (l.usd !== null) {
			usd += l.usd;
			priced++;
		} else if (l.balance === null) {
			unknown++;
			unread++;
		} else if (Number(l.balance) !== 0) unknown++;
	}
	usd = Math.round(usd * 100) / 100;
	if (
		constantProduct &&
		legs.length === 2 &&
		priced === 1 &&
		unknown === 1 &&
		unread === 0
	)
		return {
			usd: Math.round(usd * 200) / 100,
			unknownLegs: 0,
			basis: "2 x the priced leg (constant-product pool at its own mid price)",
		};
	return { usd, unknownLegs: unknown, basis: "sum of priced legs" };
}

/** Exact sum of decimal strings (balances of 7 to 18 decimals overflow a
 * double long before they overflow this). */
export function addDecimals(values: string[]): string {
	let scale = 0;
	for (const v of values) scale = Math.max(scale, v.split(".")[1]?.length ?? 0);
	let total = 0n;
	for (const v of values) {
		const neg = v.startsWith("-");
		const [i, f = ""] = (neg ? v.slice(1) : v).split(".");
		const n =
			BigInt(i || "0") * 10n ** BigInt(scale) +
			BigInt(f.padEnd(scale, "0") || "0");
		total += neg ? -n : n;
	}
	const neg = total < 0n;
	const s = (neg ? -total : total).toString().padStart(scale + 1, "0");
	const out = scale ? `${s.slice(0, -scale)}.${s.slice(-scale)}` : s;
	const trimmed = scale ? out.replace(/\.?0+$/, "") : out;
	return (neg ? "-" : "") + trimmed;
}

/** One (token, pool or publisher or holder) edge, as the refresh reads it. */
export interface Edge {
	token: string;
	kind: Kind;
	/** Protocol name, publisher name, "stellar-classic-amm" or "holder". */
	venue: string;
	projectSlug: string | null;
	attributionBasis: string;
	/** Pool or holder contract, or the publisher's document URL. */
	pool: string;
	method: string;
	/** Scope id of the read that produced this edge (see planWrites). */
	source: string;
	firstAt: string | null;
	firstBasis: string;
	lastSeenAt: string | null;
	events90d: number | null;
	events90dBasis: string | null;
	balance: string | null;
	balanceUsd: number | null;
	balanceBasis: string | null;
	depthUsd: number | null;
	depthBasis: string | null;
	tier: Tier;
	tierBasis: string;
	evidenceUrl: string;
	readAt: string;
}

export interface TokenIdentity {
	tokenId: string;
	code: string | null;
	issuer: string | null;
	tokenKind: (typeof TOKEN_CONTRACT_KINDS)[number] | null;
	homeDomain: string | null;
	issuerLabel: string | null;
}

/** The stored row: one per (token, kind, venue, project). Every field here
 * is written by the refresh lane only. */
export interface IntegrationRow extends TokenIdentity {
	key: string;
	projectSlug: string | null;
	venue: string;
	kind: Kind;
	tier: Tier;
	tierBasis: string;
	pools: number;
	poolsByTier: Partial<Record<Tier, number>>;
	firstDate: string | null;
	firstDateBasis: string;
	lastSeenAt: string | null;
	events90d: number | null;
	events90dBasis: string | null;
	balance: string | null;
	balanceUsd: number | null;
	balanceBasis: string | null;
	depthUsd: number | null;
	depthBasis: string | null;
	bestPool: string;
	evidenceUrl: string;
	method: string;
	attributionBasis: string;
	source: string;
	holderSweep: Record<string, unknown> | null;
	readAt: string;
	status: Status;
	endedAt: string | null;
	endedReason: string | null;
}

export const rowKey = (
	token: string,
	kind: Kind,
	venue: string,
	projectSlug: string | null,
) => `${token}|${kind}|${venue}|${projectSlug ?? ""}`;

const maxStr = (xs: Array<string | null>) =>
	xs
		.filter((x): x is string => !!x)
		.sort()
		.at(-1) ?? null;

/** Edges into stored rows: one per (token, kind, venue, project). The row's
 * tier is its best pool's (best tier, then deepest); dates span its pools. */
export function aggregate(
	edges: Edge[],
	identity: Map<string, TokenIdentity>,
	sweeps: Map<string, Record<string, unknown>> = new Map(),
): IntegrationRow[] {
	const groups = new Map<string, Edge[]>();
	for (const e of edges) {
		const k = rowKey(e.token, e.kind, e.venue, e.projectSlug);
		const g = groups.get(k);
		if (g) g.push(e);
		else groups.set(k, [e]);
	}
	const out: IntegrationRow[] = [];
	for (const [key, es] of groups) {
		const best = [...es].sort(
			(a, b) =>
				TIER_RANK[a.tier] - TIER_RANK[b.tier] ||
				(b.depthUsd ?? 0) - (a.depthUsd ?? 0) ||
				a.pool.localeCompare(b.pool),
		)[0];
		const first = [...es].sort(
			(a, b) =>
				(a.firstAt ?? "9999").localeCompare(b.firstAt ?? "9999") ||
				a.pool.localeCompare(b.pool),
		)[0];
		const byTier: Partial<Record<Tier, number>> = {};
		for (const e of es) byTier[e.tier] = (byTier[e.tier] ?? 0) + 1;
		const bals = es
			.map((e) => e.balance)
			.filter((b): b is string => b !== null);
		const usds = es
			.map((e) => e.balanceUsd)
			.filter((u): u is number => u !== null);
		const evs = es
			.map((e) => e.events90d)
			.filter((n): n is number => n !== null);
		const id = identity.get(best.token) ?? {
			tokenId: best.token,
			code: null,
			issuer: null,
			tokenKind: null,
			homeDomain: null,
			issuerLabel: null,
		};
		out.push({
			...id,
			key,
			projectSlug: best.projectSlug,
			venue: best.venue,
			kind: best.kind,
			tier: best.tier,
			tierBasis: best.tierBasis,
			pools: es.length,
			poolsByTier: byTier,
			firstDate: first.firstAt ? first.firstAt.slice(0, 10) : null,
			firstDateBasis: first.firstBasis,
			lastSeenAt: maxStr(es.map((e) => e.lastSeenAt)),
			events90d: evs.length ? evs.reduce((a, b) => a + b, 0) : null,
			events90dBasis: best.events90dBasis,
			balance: bals.length ? addDecimals(bals) : null,
			balanceUsd: usds.length
				? Math.round(usds.reduce((a, b) => a + b, 0) * 100) / 100
				: null,
			balanceBasis: best.balanceBasis,
			depthUsd: best.depthUsd,
			depthBasis: best.depthBasis,
			bestPool: best.pool,
			evidenceUrl: best.evidenceUrl,
			method: best.method,
			attributionBasis: best.attributionBasis,
			source: best.source,
			// the contract sweep's completeness; an account holding is not swept
			holderSweep:
				best.venue === "holder" ? (sweeps.get(best.token) ?? null) : null,
			readAt: maxStr(es.map((e) => e.readAt)) ?? best.readAt,
			status: "active",
			endedAt: null,
			endedReason: null,
		});
	}
	return out.sort((a, b) => a.key.localeCompare(b.key));
}

/** The fields the refresh owns and compares; Payload adds id and dates. */
export const ROW_FIELDS = [
	"key",
	"tokenId",
	"code",
	"issuer",
	"tokenKind",
	"homeDomain",
	"issuerLabel",
	"projectSlug",
	"venue",
	"kind",
	"tier",
	"tierBasis",
	"pools",
	"poolsByTier",
	"firstDate",
	"firstDateBasis",
	"lastSeenAt",
	"events90d",
	"events90dBasis",
	"balance",
	"balanceUsd",
	"balanceBasis",
	"depthUsd",
	"depthBasis",
	"bestPool",
	"evidenceUrl",
	"method",
	"attributionBasis",
	"source",
	"holderSweep",
	"readAt",
	"status",
	"endedAt",
	"endedReason",
] as const satisfies ReadonlyArray<keyof IntegrationRow>;

/** Stable JSON: object keys sorted, absent and null alike. */
function canon(v: unknown): string {
	if (v === undefined || v === null) return "null";
	if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
	if (typeof v === "object")
		return `{${Object.keys(v as object)
			.filter((k) => (v as Record<string, unknown>)[k] != null)
			.sort()
			.map(
				(k) =>
					`${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`,
			)
			.join(",")}}`;
	return JSON.stringify(v);
}

export function changedFields(
	desired: IntegrationRow,
	stored: Partial<IntegrationRow>,
): string[] {
	return ROW_FIELDS.filter(
		(f) => canon(desired[f]) !== canon(stored[f as keyof IntegrationRow]),
	);
}

export type StoredRow = Partial<IntegrationRow> & { id: string; key: string };

export interface WritePlan {
	create: IntegrationRow[];
	update: Array<{ id: string; row: IntegrationRow; changed: string[] }>;
	end: Array<{
		id: string;
		key: string;
		data: Pick<IntegrationRow, "status" | "endedAt" | "endedReason">;
	}>;
	/** Stored active rows this run could not judge: never ended. */
	keep: Array<{ key: string; reason: string }>;
	unchanged: number;
}

/**
 * The contract each live stored holder row was last read at (its bestPool),
 * by token. The holder sweep re-reads these every run, so a holder row ends
 * only after its own contract was read and found empty, never because the
 * contract fell out of the run's capped candidate lists (top contracts by
 * activity, a token's latest interactions). Account holders (G addresses)
 * are read from Horizon by the account sweep and are not listed here.
 */
export function priorHolderContracts(
	stored: StoredRow[],
): Map<string, Set<string>> {
	const out = new Map<string, Set<string>>();
	for (const s of stored) {
		if (s.status === "ended" || !String(s.kind).startsWith("holder")) continue;
		if (!s.tokenId || !/^C[A-Z2-7]{55}$/.test(s.bestPool ?? "")) continue;
		out.set(
			s.tokenId,
			(out.get(s.tokenId) ?? new Set()).add(s.bestPool as string),
		);
	}
	return out;
}

/**
 * The DB diff. A stored active row this run did not produce is ended (kept,
 * dated, with the reason) only when its source was read completely this run
 * and its token was in the run's scope; otherwise it is kept untouched:
 * could-not-check never removes. A row that comes back is reactivated.
 * Planning the same reads against the store a plan produced plans nothing.
 */
export function planWrites(
	desired: IntegrationRow[],
	stored: StoredRow[],
	judge: (row: StoredRow) => string | null,
	runAt: string,
): WritePlan {
	const plan: WritePlan = {
		create: [],
		update: [],
		end: [],
		keep: [],
		unchanged: 0,
	};
	const byKey = new Map(stored.map((s) => [s.key, s]));
	const want = new Set<string>();
	for (const row of desired) {
		want.add(row.key);
		const s = byKey.get(row.key);
		if (!s) {
			plan.create.push(row);
			continue;
		}
		const changed = changedFields(row, s);
		if (changed.length) plan.update.push({ id: s.id, row, changed });
		else plan.unchanged++;
	}
	for (const s of stored) {
		if (want.has(s.key) || s.status === "ended") continue;
		const cannot = judge(s);
		if (cannot) {
			plan.keep.push({ key: s.key, reason: cannot });
			continue;
		}
		plan.end.push({
			id: s.id,
			key: s.key,
			data: {
				status: "ended",
				endedAt: runAt,
				endedReason: `not found in ${s.source ?? "its source"} when read at ${runAt}; the last reading before that is kept on the row`,
			},
		});
	}
	return plan;
}

export const plannedWrites = (p: WritePlan) =>
	p.create.length + p.update.length + p.end.length;

export type TierCounts = Record<Tier, number>;
const zero = (): TierCounts => ({
	integrated: 0,
	used: 0,
	available: 0,
	unrated: 0,
});

export interface IntegrationSummary {
	/** Each project once, at its best tier over the matched rows. */
	projectsByTier: TierCounts;
	/** The same projects, only those whose project row says SCF awarded. */
	scfFundedByTier: TierCounts;
	/** Each token once, at its best tier over the matched project rows. */
	tokensByTier: TierCounts;
	/** Classic AMM pools (network-owned, no project), by their own tier. */
	networkVenuePoolsByTier: TierCounts;
	/** Contracts holding the token that no project could be tied to. */
	unattributedHolders: { contracts: number; balanceUsd: number | null };
}

/** Per-tier counts, never one blended number: a project counts once, at its
 * best tier; network venues and unattributed holders are counted apart. */
export function summarize(
	rows: Array<
		Pick<
			IntegrationRow,
			| "projectSlug"
			| "tokenId"
			| "kind"
			| "tier"
			| "pools"
			| "poolsByTier"
			| "balanceUsd"
		>
	>,
	scfAwarded: (slug: string) => boolean,
): IntegrationSummary {
	const bestProject = new Map<string, Tier>();
	const bestToken = new Map<string, Tier>();
	const network = zero();
	let unContracts = 0;
	let unUsd: number | null = null;
	const better = (m: Map<string, Tier>, k: string, t: Tier) => {
		const cur = m.get(k);
		if (!cur || TIER_RANK[t] < TIER_RANK[cur]) m.set(k, t);
	};
	for (const r of rows) {
		if (NETWORK_KINDS.has(r.kind)) {
			for (const t of TOKEN_INTEGRATION_TIERS)
				network[t] += r.poolsByTier?.[t] ?? 0;
			continue;
		}
		if (r.kind === "holder_unattributed") {
			unContracts += r.pools;
			if (r.balanceUsd !== null) unUsd = (unUsd ?? 0) + r.balanceUsd;
			continue;
		}
		if (!r.projectSlug) continue;
		better(bestProject, r.projectSlug, r.tier);
		better(bestToken, r.tokenId, r.tier);
	}
	const projectsByTier = zero();
	const scfFundedByTier = zero();
	for (const [slug, t] of bestProject) {
		projectsByTier[t]++;
		if (scfAwarded(slug)) scfFundedByTier[t]++;
	}
	const tokensByTier = zero();
	for (const t of bestToken.values()) tokensByTier[t]++;
	return {
		projectsByTier,
		scfFundedByTier,
		tokensByTier,
		networkVenuePoolsByTier: network,
		unattributedHolders: {
			contracts: unContracts,
			balanceUsd: unUsd === null ? null : Math.round(unUsd * 100) / 100,
		},
	};
}

/** The compact block a stablecoin or RWA row carries for its token. */
export interface TokenIntegrationsBrief {
	projectsByTier: TierCounts;
	scfFundedByTier: TierCounts;
	/** The newest reading among the token's rows. */
	asOf: string | null;
	/** Every edge, with its evidence. */
	url: string;
}
type BriefRow = Pick<
	IntegrationRow,
	| "tokenId"
	| "projectSlug"
	| "kind"
	| "tier"
	| "pools"
	| "poolsByTier"
	| "balanceUsd"
	| "readAt"
	| "status"
	| "endedAt"
>;

/** Per token: projects and SCF-funded projects per tier over its active
 * rows (summarize, never blended), its newest reading, and the full
 * endpoint. A token with no row at all gets no entry: the caller serves
 * null (the lane has not written it), never zeros. */
export function tokenBriefs(
	rows: BriefRow[],
	scfAwarded: (slug: string) => boolean,
): Map<string, TokenIntegrationsBrief> {
	const byToken = new Map<string, BriefRow[]>();
	for (const r of rows)
		byToken.set(r.tokenId, [...(byToken.get(r.tokenId) ?? []), r]);
	const out = new Map<string, TokenIntegrationsBrief>();
	for (const [t, rs] of byToken) {
		const s = summarize(
			rs.filter((r) => r.status !== "ended"),
			scfAwarded,
		);
		out.set(t, {
			projectsByTier: s.projectsByTier,
			scfFundedByTier: s.scfFundedByTier,
			asOf: maxStr(rs.flatMap((r) => [r.readAt, r.endedAt])),
			url: `https://stellarlight.xyz/api/tokens/integrations?token=${t}`,
		});
	}
	return out;
}

/** The briefs for these tokens from the store, SCF read from the project
 * rows (their own lane writes it). Null when the store could not be read:
 * every row then serves null, never zeros. */
export async function readTokenBriefs(
	payload: Pick<Payload, "find">,
	tokenIds: Array<string | null>,
): Promise<Map<string, TokenIntegrationsBrief> | null> {
	const ids = [...new Set(tokenIds.filter((t): t is string => !!t))];
	if (!ids.length) return new Map();
	try {
		const rows = (
			await payload.find({
				collection: "token-integrations",
				where: { tokenId: { in: ids } },
				limit: 0,
				pagination: false,
				depth: 0,
				select: {
					tokenId: true,
					projectSlug: true,
					kind: true,
					tier: true,
					pools: true,
					poolsByTier: true,
					balanceUsd: true,
					readAt: true,
					status: true,
					endedAt: true,
				},
			})
		).docs as unknown as BriefRow[];
		const slugs = [
			...new Set(
				rows.map((r) => r.projectSlug).filter((s): s is string => !!s),
			),
		];
		const awarded = new Set(
			slugs.length
				? (
						(
							await payload.find({
								collection: "projects",
								where: { slug: { in: slugs } },
								limit: slugs.length,
								depth: 0,
								pagination: false,
								select: { slug: true, scf: { awarded: true } },
							})
						).docs as unknown as Array<{
							slug: string;
							scf?: { awarded?: boolean | null };
						}>
					)
						.filter((p) => p.scf?.awarded)
						.map((p) => p.slug)
				: [],
		);
		return tokenBriefs(rows, (s) => awarded.has(s));
	} catch {
		return null;
	}
}

/** A registry row's token id: a classic asset's Stellar Asset Contract,
 * else its contract. The refresh and the stablecoin and RWA rows key on it. */
export function registryTokenId(
	code: string | null | undefined,
	issuer: string | null | undefined,
	contract: string | null | undefined,
): string | null {
	if (code && issuer?.startsWith("G"))
		try {
			return new Asset(code, issuer).contractId(Networks.PUBLIC);
		} catch {
			return null;
		}
	return contract && /^C[A-Z2-7]{55}$/.test(contract) ? contract : null;
}

/** XLM's Stellar Asset Contract on mainnet. A literal, not derived at load:
 * the spec imports this module, and hashing at import breaks every test that
 * loads the spec under jsdom (a test pins it to the derivation). */
export const XLM_SAC =
	"CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA";

export type TokenParam =
	| { type: "id"; tokenId: string }
	| { type: "code"; code: string }
	| { type: "invalid"; error: string };

/** `token` as a contract id, CODE:ISSUER (or CODE-ISSUER), XLM, or a bare
 * code. A bare code is not an identity: the caller resolves it against the
 * layer and gets candidates when more than one issuer carries it. */
export function parseTokenParam(raw: string): TokenParam {
	const v = raw.trim();
	if (/^C[A-Z2-7]{55}$/.test(v)) return { type: "id", tokenId: v };
	if (/^(xlm|native)$/i.test(v)) return { type: "id", tokenId: XLM_SAC };
	const m = /^([A-Za-z0-9]{1,12})[:-](G[A-Z2-7]{55})$/.exec(v);
	if (m) {
		try {
			return {
				type: "id",
				tokenId: new Asset(m[1], m[2]).contractId(Networks.PUBLIC),
			};
		} catch {
			return {
				type: "invalid",
				error: `'${v}' is not a valid Stellar asset (code:issuer).`,
			};
		}
	}
	if (/^[A-Za-z0-9]{1,12}$/.test(v)) return { type: "code", code: v };
	return {
		type: "invalid",
		error: `'${v}' is not a token: pass a contract id (C...), CODE:ISSUER, XLM, or an asset code.`,
	};
}

export interface CodeCandidate {
	tokenId: string;
	code: string | null;
	issuer: string | null;
	homeDomain: string | null;
	issuerLabel: string | null;
	projectsByTier: TierCounts;
}

/** The tokens a bare code names in the layer (codes compare case-blind, so
 * USDe finds USDE). One token resolves; several are candidates for the caller
 * to choose among by issuer: the layer never picks one silently. Candidates
 * come most integrated-plus-used projects first; that order is not a verdict
 * on which issuer is genuine. */
export function codeCandidates(
	code: string,
	rows: Array<
		Pick<
			IntegrationRow,
			| "tokenId"
			| "code"
			| "issuer"
			| "homeDomain"
			| "issuerLabel"
			| "projectSlug"
			| "kind"
			| "tier"
			| "pools"
			| "poolsByTier"
			| "balanceUsd"
		>
	>,
): CodeCandidate[] {
	const want = code.toUpperCase();
	const byToken = new Map<string, typeof rows>();
	for (const r of rows) {
		if ((r.code ?? "").toUpperCase() !== want) continue;
		const g = byToken.get(r.tokenId);
		if (g) g.push(r);
		else byToken.set(r.tokenId, [r]);
	}
	return [...byToken.entries()]
		.map(([tokenId, rs]) => ({
			tokenId,
			code: rs[0].code,
			issuer: rs[0].issuer,
			homeDomain: rs[0].homeDomain,
			issuerLabel: rs[0].issuerLabel,
			projectsByTier: summarize(rs, () => false).projectsByTier,
		}))
		.sort(
			(a, b) =>
				b.projectsByTier.integrated +
					b.projectsByTier.used -
					(a.projectsByTier.integrated + a.projectsByTier.used) ||
				a.tokenId.localeCompare(b.tokenId),
		);
}
