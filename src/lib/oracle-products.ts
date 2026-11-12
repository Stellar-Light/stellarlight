/**
 * Oracle product records as served on a project row's `products` (sls-029).
 *
 * Identity comes from the registry (src/data/oracle-registry.ts): provider,
 * product, network, contract, where the address was published and when it
 * was checked. What the chain showed comes from the oracle-readings
 * collection, which only scripts/refresh-oracle-feeds.ts writes, one row per
 * contract: whether the contract exists, every feed it serves and when each
 * was last written. The search route joins the two at serve time, so an
 * address claim and a freshness claim never share a writer.
 *
 * Raven's six evidence tiers read off two fields: `addressTier` (registry:
 * official-address or directory-only) and `observation.tier` (derived here
 * from the reading: observed-updating, observed-stale,
 * published-address-absent, or not-observable-pull-model). A contract that
 * merely exists never reads as updating: that tier needs a feed read this
 * check with a value written inside the bound.
 */
import {
	ORACLE_READ_METHODS,
	ORACLE_REGISTRY,
	type OracleAddressTier,
	type OracleReadMethod,
} from "@/data/oracle-registry";

export const ORACLE_CONTRACT_STATES = ["present", "absent"] as const;
export type OracleContractState = (typeof ORACLE_CONTRACT_STATES)[number];

/**
 * updating = the provider's own getter returned a value written within
 * maxAgeSeconds before checkedAt. stale = a value exists and is older, or the
 * contract's own check rejected it as stale. no-value = the contract answered
 * and holds no value for the feed. could-not-check = the read failed or is not
 * public; it says nothing about the feed.
 */
export const ORACLE_FEED_STATES = [
	"updating",
	"stale",
	"no-value",
	"could-not-check",
] as const;
export type OracleFeedState = (typeof ORACLE_FEED_STATES)[number];

export interface OracleFeedObservation {
	/** The key a consumer passes to read the feed. */
	feed: string;
	label: string | null;
	/** A per-feed contract (RedStone MultiFeed); null = read through the record's contract. */
	contractId: string | null;
	lastUpdateAt: string | null;
	state: OracleFeedState;
}

/** contract = the contract's own assets() (re-checkable at sourceUrl, a
 * Stellar Lab contract page); provider-list = the provider's published,
 * machine-readable list, read at asOf; seeded = a list copied into the
 * registry from sourceUrl on asOf, which does not follow later changes. */
export const ORACLE_FEED_LIST_BASES = [
	"contract",
	"provider-list",
	"seeded",
] as const;
export type OracleFeedListBasis = (typeof ORACLE_FEED_LIST_BASES)[number];

export interface OracleFeedList {
	basis: OracleFeedListBasis;
	sourceUrl: string;
	asOf: string;
}

/** What the lane stores per contract (the oracle-readings row). */
export interface OracleReading {
	checkedAt: string;
	contract: OracleContractState;
	method: OracleReadMethod;
	maxAgeSeconds: number | null;
	lastUpdateAt: string | null;
	feeds: OracleFeedObservation[] | null;
	feedList: OracleFeedList | null;
}

export const ORACLE_OBSERVATION_TIERS = [
	"observed-updating",
	"observed-stale",
	"published-address-absent",
	"not-observable-pull-model",
] as const;
export type OracleObservationTier = (typeof ORACLE_OBSERVATION_TIERS)[number];

/** The served observation: the reading plus its tier. */
export interface OracleObservation extends OracleReading {
	tier: OracleObservationTier | null;
}

/** The oracle lane runs every 6 hours; a reading older than 4 runs carries
 * no tier when served, and the lane exits non-zero for it. */
export const READING_MAX_AGE_SECONDS = 86_400;

/**
 * The evidence tier a reading supports, from its own fields only:
 * observed-updating needs at least one FEED read this check with a value
 * written inside maxAgeSeconds (a contract that exists, or was written, is
 * not enough); observed-stale needs a newest observed write older than the
 * bound with no feed updating and no feed unread; a pull-model verifier
 * stores no prices, so its freshness is not observable on chain. Null: this
 * check could not judge (a feed could not be read and none was updating), or
 * the check is older than READING_MAX_AGE_SECONDS when served.
 */
export function observationTier(
	r: OracleReading,
	now: Date = new Date(),
): OracleObservationTier | null {
	// A check older than 4 cadences is no tier at all: a contract the lane
	// stopped reading must not keep serving its last verdict.
	if (now.getTime() - Date.parse(r.checkedAt) > READING_MAX_AGE_SECONDS * 1000)
		return null;
	if (r.contract === "absent") return "published-address-absent";
	if (r.method === "pull-verifier") return "not-observable-pull-model";
	if (r.feeds?.some((f) => f.state === "updating")) return "observed-updating";
	// a feed that could not be read may be the one still being written
	if (r.feeds?.some((f) => f.state === "could-not-check")) return null;
	if (r.lastUpdateAt && r.maxAgeSeconds != null) {
		const age = (Date.parse(r.checkedAt) - Date.parse(r.lastUpdateAt)) / 1000;
		if (age > r.maxAgeSeconds) return "observed-stale";
	}
	if (r.feeds?.length && r.feeds.every((f) => f.state === "stale"))
		return "observed-stale";
	return null;
}

/** Registry keys whose stored reading this run did not refresh and whose
 * check is older than READING_MAX_AGE_SECONDS: the lane exits non-zero for
 * them (their tier is already withheld when served). */
export function agedOutReadings(
	keys: string[],
	stored: Map<string, { checkedAt: string }>,
	refreshed: Set<string>,
	now: Date,
): Array<{ key: string; checkedAt: string }> {
	return keys.flatMap((key) => {
		const prev = stored.get(key);
		return prev &&
			!refreshed.has(key) &&
			now.getTime() - Date.parse(prev.checkedAt) >
				READING_MAX_AGE_SECONDS * 1000
			? [{ key, checkedAt: prev.checkedAt }]
			: [];
	});
}

export const readingKey = (network: string, contractId: string) =>
	`${network}:${contractId}`;

/** True when the registry is the one writer of this provider's oracle-feed records. */
export const hasOracleProducts = (slug: string | null | undefined) =>
	!!slug && ORACLE_REGISTRY.some((r) => r.slug === slug);

/** The registry's records for one provider, observation null until joined. */
export function oracleProducts(slug: string | null | undefined) {
	return ORACLE_REGISTRY.filter((r) => r.slug === slug).map((r) => ({
		name: r.name,
		kind: "oracle-feed",
		network: r.network,
		status: r.status,
		contractId: r.contractId,
		evidenceUrl: r.evidenceUrl,
		asOf: r.asOf,
		note: r.note,
		addressTier: r.addressTier as OracleAddressTier,
		observation: null as OracleObservation | null,
	}));
}

const str = (v: unknown) => (typeof v === "string" && v ? v : null);
const oneOf = <T extends string>(xs: readonly T[], v: unknown): T | null =>
	(xs as readonly unknown[]).includes(v) ? (v as T) : null;

/** A stored oracle-readings row as the served observation; null when the row
 * is missing or malformed, never a guessed half. */
export function pickObservation(doc: unknown): OracleObservation | null {
	if (!doc || typeof doc !== "object") return null;
	const d = doc as Record<string, unknown>;
	const checkedAt = str(d.checkedAt);
	const contract = oneOf(ORACLE_CONTRACT_STATES, d.contract);
	const method = oneOf(ORACLE_READ_METHODS, d.method);
	if (!checkedAt || !contract || !method) return null;
	let feeds: OracleFeedObservation[] | null = null;
	if (Array.isArray(d.feeds)) {
		feeds = [];
		for (const f of d.feeds as Array<Record<string, unknown>>) {
			const feed = str(f?.feed);
			const state = oneOf(ORACLE_FEED_STATES, f?.state);
			if (!feed || !state) return null;
			feeds.push({
				feed,
				label: str(f.label),
				contractId: str(f.contractId),
				lastUpdateAt: str(f.lastUpdateAt),
				state,
			});
		}
	}
	let feedList: OracleFeedList | null = null;
	if (d.feedList && typeof d.feedList === "object") {
		const l = d.feedList as Record<string, unknown>;
		const basis = oneOf(ORACLE_FEED_LIST_BASES, l.basis);
		const sourceUrl = str(l.sourceUrl);
		const asOf = str(l.asOf);
		// a list without its source and date is served as no list
		if (!basis || !sourceUrl || !asOf) return null;
		feedList = { basis, sourceUrl, asOf };
	}
	if (feeds && !feedList) return null;
	const reading: OracleReading = {
		checkedAt,
		contract,
		method,
		maxAgeSeconds: typeof d.maxAgeSeconds === "number" ? d.maxAgeSeconds : null,
		lastUpdateAt: str(d.lastUpdateAt),
		feeds,
		feedList,
	};
	return { ...reading, tier: observationTier(reading) };
}

/** Join each registry oracle record to its latest reading. Records without a
 * reading keep observation null: not observed, never "not updating". */
export function withOracleObservations<
	T extends { contractId?: string | null; network?: string },
>(products: T[] | null, readings: Map<string, unknown>): T[] | null {
	if (!products) return products;
	return products.map((p) =>
		"observation" in p && p.contractId && p.network
			? {
					...p,
					observation: pickObservation(
						readings.get(readingKey(p.network, p.contractId)),
					),
				}
			: p,
	);
}
