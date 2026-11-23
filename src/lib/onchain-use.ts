/**
 * On-chain use between two weekly readings, from the dated project
 * snapshots (data/snapshots/projects/). The weekly on-chain lane overwrites
 * each project's `onchain` block, so the snapshots are the only history of
 * it: a contract's lifetime count of ledgers with an event, read twice a week
 * apart, gives the ledgers with an event in between.
 *
 * What it cannot see: a contract used only through sub-calls emits no event
 * (13 of 68 tracked contracts in one week of 2026-11), so "no event seen" is
 * never "not used". Pure.
 */

/** A project's on-chain reading as one snapshot recorded it. */
export interface OnchainReading {
	/** When the weekly on-chain lane read it (ISO). */
	asOf: string;
	contracts: Array<{
		id: string;
		/** Newest event; null = the index holds none. */
		lastEventAt: string | null;
		/** Lifetime count of ledgers with an event; null = not read. */
		activeLedgers: number | null;
		ttl: string | null;
	}>;
	asset: {
		code: string;
		issuer: string;
		supply: number | null;
		trustlines: number | null;
		holders: number | null;
		lastMovedAt: string | null;
	} | null;
}

const num = (v: unknown) =>
	typeof v === "number" && Number.isFinite(v) ? v : null;
const str = (v: unknown) => (typeof v === "string" && v ? v : null);

/**
 * The compact reading of a project's served `onchain` block; null when the
 * project has none or it carries no read date.
 */
// biome-ignore lint/suspicious/noExplicitAny: the API's JSON
export function onchainReadingOf(block: any): OnchainReading | null {
	const asOf = str(block?.asOf);
	if (!asOf) return null;
	const contracts = (Array.isArray(block.contracts) ? block.contracts : [])
		// biome-ignore lint/suspicious/noExplicitAny: the API's JSON
		.filter((c: any) => str(c?.address))
		// biome-ignore lint/suspicious/noExplicitAny: the API's JSON
		.map((c: any) => ({
			id: c.address as string,
			lastEventAt: str(c.lastEventAt),
			activeLedgers: num(c.activeLedgers),
			ttl: str(c.ttlState),
		}));
	const code = str(block.assetCode);
	const issuer = str(block.issuer);
	return {
		asOf,
		contracts,
		asset:
			code && issuer
				? {
						code,
						issuer,
						supply: num(block.assetSupply),
						trustlines: num(block.assetTrustlines),
						holders: num(block.assetHolders),
						lastMovedAt: str(block.assetLastMovedAt),
					}
				: null,
	};
}

/** Readings of one week ago or less are not compared: the lane runs weekly. */
export const MIN_WINDOW_DAYS = 6;

export type UseVerdict =
	| "events in window"
	| "asset moved in window"
	| "no event or movement seen"
	| "could not check";

export interface ProjectUse {
	slug: string;
	from: string | null;
	to: string | null;
	days: number | null;
	/** Ledgers with an event between the readings, summed over the contracts
	 * read both times; null when no contract was. */
	ledgersWithEvents: number | null;
	contractsCompared: number;
	contractsTotal: number;
	assetMovedInWindow: boolean | null;
	holdersChange: number | null;
	trustlinesChange: number | null;
	verdict: UseVerdict;
}

export interface OnchainUseReport {
	/** Distinct on-chain read dates the snapshots hold, newest last. */
	readings: string[];
	minWindowDays: number;
	counts: Record<UseVerdict, number>;
	projects: ProjectUse[];
	note: string;
}

const DAY = 86_400_000;
const ms = (iso: string | null | undefined) => {
	const t = Date.parse(iso ?? "");
	return Number.isNaN(t) ? null : t;
};

/** Is `at` newer than everything the earlier reading had seen? The weekly
 * lane stamps `asOf` when its run starts and reads each project after, so a
 * reading can hold an event later than its own `asOf`: the earlier reading's
 * newest date for the same thing is the bound, and never the later
 * reading's `asOf` (a reading cannot see the future). Compared as instants,
 * not strings. */
const newSince = (
	at: string | null,
	earlierAsOf: string,
	earlierSeen: string | null | undefined,
) => {
	const t = ms(at);
	if (t === null) return false;
	return t > Math.max(ms(earlierAsOf) ?? 0, ms(earlierSeen) ?? 0);
};

/** One entry per contract id: the lane lists a contract once, but a reading
 * must not count one twice if it ever did not. */
const byId = (r: OnchainReading) => {
	const m = new Map<string, OnchainReading["contracts"][number]>();
	for (const c of r.contracts) if (!m.has(c.id)) m.set(c.id, c);
	return m;
};

function compare(
	slug: string,
	a: OnchainReading | null,
	b: OnchainReading,
): ProjectUse {
	const now = byId(b);
	const base = {
		slug,
		contractsTotal: now.size,
	};
	if (!a)
		return {
			...base,
			from: null,
			to: b.asOf,
			days: null,
			ledgersWithEvents: null,
			contractsCompared: 0,
			assetMovedInWindow: null,
			holdersChange: null,
			trustlinesChange: null,
			verdict: "could not check",
		};
	const before = byId(a);
	let ledgers: number | null = null;
	let compared = 0;
	let eventSeen = false;
	for (const c of now.values()) {
		const p = before.get(c.id);
		if (newSince(c.lastEventAt, a.asOf, p?.lastEventAt)) eventSeen = true;
		if (!p || p.activeLedgers === null || c.activeLedgers === null) continue;
		const d = c.activeLedgers - p.activeLedgers;
		// A lifetime count that shrank is an index correction, not a reading.
		if (d < 0) continue;
		compared += 1;
		ledgers = (ledgers ?? 0) + d;
	}
	const sameAsset =
		!!a.asset &&
		!!b.asset &&
		a.asset.code === b.asset.code &&
		a.asset.issuer === b.asset.issuer;
	const diff = (x: number | null | undefined, y: number | null | undefined) =>
		sameAsset && typeof x === "number" && typeof y === "number" ? y - x : null;
	// Movement is read only against the same asset, and only when the later
	// reading found one among the asset's newest events: null there means
	// "none in that page", not "did not move".
	const movedAt = sameAsset ? (b.asset?.lastMovedAt ?? null) : null;
	const moved =
		ms(movedAt) !== null
			? newSince(movedAt, a.asOf, a.asset?.lastMovedAt)
			: null;
	// "Nothing seen" is said only of a project read whole: every contract it
	// lists compared, and its asset's movement known. A part not read leaves
	// the project unchecked, never quiet.
	const readWhole = compared === now.size && (b.asset ? moved !== null : true);
	const verdict: UseVerdict =
		eventSeen || (ledgers ?? 0) > 0
			? "events in window"
			: moved
				? "asset moved in window"
				: readWhole && (compared > 0 || moved === false)
					? "no event or movement seen"
					: "could not check";
	const span = (ms(b.asOf) ?? 0) - (ms(a.asOf) ?? 0);
	return {
		...base,
		from: a.asOf,
		to: b.asOf,
		days: Math.round((span / DAY) * 10) / 10,
		ledgersWithEvents: ledgers,
		contractsCompared: compared,
		assetMovedInWindow: moved,
		holdersChange: diff(a.asset?.holders, b.asset?.holders),
		trustlinesChange: diff(a.asset?.trustlines, b.asset?.trustlines),
		verdict,
	};
}

/**
 * Pure. For each project in the newest snapshot that carries an on-chain
 * reading, compares it with the newest earlier reading at least
 * MIN_WINDOW_DAYS older. `history` is any order of
 * `{ date, projects: [{ slug, onchain? }] }`; a snapshot written before the
 * field existed has no `onchain` key and is skipped, which is not a reading
 * of "none".
 */
export function onchainUse(
	history: Array<{
		date: string;
		projects: Array<{ slug: string; onchain?: OnchainReading | null }>;
	}>,
): OnchainUseReport {
	const snaps = [...history].sort((x, y) => x.date.localeCompare(y.date));
	// slug -> its readings, oldest first (a weekly reading repeats daily)
	const bySlug = new Map<string, OnchainReading[]>();
	const dates = new Set<string>();
	for (const s of snaps)
		for (const p of s.projects) {
			if (!p.onchain) continue;
			dates.add(p.onchain.asOf);
			bySlug.set(p.slug, [...(bySlug.get(p.slug) ?? []), p.onchain]);
		}
	const latest = snaps[snaps.length - 1];
	const projects: ProjectUse[] = [];
	for (const p of latest?.projects ?? []) {
		if (!p.onchain) continue;
		const list = bySlug.get(p.slug) ?? [];
		const b = list[list.length - 1];
		const a =
			[...list]
				.reverse()
				.find(
					(r) =>
						((ms(b.asOf) ?? 0) - (ms(r.asOf) ?? Number.POSITIVE_INFINITY)) /
							DAY >=
						MIN_WINDOW_DAYS,
				) ?? null;
		projects.push(compare(p.slug, a, b));
	}
	const counts: Record<UseVerdict, number> = {
		"events in window": 0,
		"asset moved in window": 0,
		"no event or movement seen": 0,
		"could not check": 0,
	};
	for (const u of projects) counts[u.verdict] += 1;
	return {
		readings: [...dates].sort(),
		minWindowDays: MIN_WINDOW_DAYS,
		counts,
		projects: projects.sort((x, y) => x.slug.localeCompare(y.slug)),
		note: "Ledgers with an event between two weekly on-chain readings, per project. A contract used only through sub-calls emits no event, so 'no event or movement seen' is not 'not used'. 'could not check' until a project has two readings at least six days apart, and for good on a project with a contract whose ledger count the index never reports (it can show use, never its absence).",
	};
}
