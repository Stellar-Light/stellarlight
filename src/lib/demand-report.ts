/**
 * Demand report: what each client class asks Scout, from the api-usage log.
 * Admin-only (GET /api/admin/demand-report). Built on aggregates so it never
 * hands back a stored query string: per client and operation it counts calls,
 * empty, partial and error outcomes, and lists single query terms asked at
 * least `minTermCount` times. A term shaped like a key, an address or a hash
 * is dropped before counting, since callers paste those into queries.
 */

import { isContentStopword } from "./repo-search";

/** One bucket of api-usage rows that share every key below; `n` rows. */
export interface UsageGroup {
	cfWorker?: string | null;
	uaBucket?: string | null;
	endpoint: string;
	query?: string | null;
	status?: number | null;
	/** resultCount === 0; null when the route logged no resultCount. */
	empty?: boolean | null;
	/** null when the route logged no partial flag. */
	partial?: boolean | null;
	n: number;
}

/** A Worker is named by its zone (the CF-Worker header); others by UA bucket. */
export function clientClass(row: {
	cfWorker?: string | null;
	uaBucket?: string | null;
}): string {
	return row.cfWorker ? `cf-worker:${row.cfWorker}` : row.uaBucket || "other";
}

/** Long, or mixing letters and digits at length 12+: a key, address or hash. */
const keyShaped = (t: string) =>
	t.length > 24 || (t.length >= 12 && /\d/.test(t) && /[a-z]/.test(t));

/**
 * A whitespace-separated word that may identify someone or something: an
 * email, a URL or path, non-ASCII text, any key-shaped piece, or a key once
 * its punctuation is removed (a UUID, `sl_live_k9f3h2`). Judged on the
 * whole word, so a key split by dashes or underscores cannot slip through
 * piece by piece. Random keys alternate letters and digits; four or more
 * switches at length 12+ reads as one, so `sep-10-challenge` survives.
 */
const identifying = (w: string) => {
	if (/[@/]|^www\./.test(w) || /[^\x20-\x7e]/.test(w)) return true;
	const pieces = w.split(/[^a-z0-9]+/);
	if (pieces.some(keyShaped)) return true;
	const joined = pieces.join("");
	const switches = joined.match(/[a-z](?=\d)|\d(?=[a-z])/g)?.length ?? 0;
	return joined.length > 24 || (joined.length >= 12 && switches >= 4);
};

/** Distinct content terms of a stored (already lowercased) query, in order. */
export function queryTerms(q: string): string[] {
	const terms = q
		.toLowerCase()
		.split(/\s+/)
		.filter((w) => w && !identifying(w))
		.flatMap((w) => w.split(/[^a-z0-9]+/))
		.filter((t) => t.length >= 2 && !isContentStopword(t));
	return [...new Set(terms)];
}

const rate = (k: number, basis: number) => (basis ? k / basis : null);

interface Tally {
	calls: number;
	statusBasis: number;
	errorCalls: number;
	rejectedCalls: number;
	emptyBasis: number;
	emptyCalls: number;
	partialBasis: number;
	partialCalls: number;
	/** Calls that carried a query; topTerms are drawn from them. */
	termBasis: number;
}

const blank = (): Tally => ({
	calls: 0,
	statusBasis: 0,
	errorCalls: 0,
	rejectedCalls: 0,
	emptyBasis: 0,
	emptyCalls: 0,
	partialBasis: 0,
	partialCalls: 0,
	termBasis: 0,
});

export function buildDemandReport(
	groups: UsageGroup[],
	opts: { minTermCount: number; topTerms: number },
) {
	// client -> operation -> tally and term counts, so a term stays attached
	// to the operation it was asked of.
	const clients = new Map<
		string,
		Map<string, { t: Tally; terms: Map<string, number> }>
	>();
	for (const g of groups) {
		const key = clientClass(g);
		const ops = clients.get(key) ?? new Map();
		clients.set(key, ops);
		const op = ops.get(g.endpoint) ?? { t: blank(), terms: new Map() };
		ops.set(g.endpoint, op);
		const t = op.t;
		t.calls += g.n;
		if (typeof g.status === "number") {
			t.statusBasis += g.n;
			if (g.status >= 500) t.errorCalls += g.n;
			else if (g.status >= 400) t.rejectedCalls += g.n;
		}
		if (typeof g.empty === "boolean") {
			t.emptyBasis += g.n;
			if (g.empty) t.emptyCalls += g.n;
		}
		if (typeof g.partial === "boolean") {
			t.partialBasis += g.n;
			if (g.partial) t.partialCalls += g.n;
		}
		if (g.query) {
			t.termBasis += g.n;
			for (const term of queryTerms(g.query))
				op.terms.set(term, (op.terms.get(term) ?? 0) + g.n);
		}
	}

	return {
		clients: [...clients.entries()]
			.map(([client, ops]) => {
				const operations = [...ops.entries()]
					.map(([endpoint, { t, terms }]) => ({
						endpoint,
						...t,
						errorRate: rate(t.errorCalls, t.statusBasis),
						rejectedRate: rate(t.rejectedCalls, t.statusBasis),
						emptyRate: rate(t.emptyCalls, t.emptyBasis),
						partialRate: rate(t.partialCalls, t.partialBasis),
						topTerms: [...terms.entries()]
							.filter(([, n]) => n >= opts.minTermCount)
							.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
							.slice(0, opts.topTerms)
							.map(([term, calls]) => ({ term, calls })),
					}))
					.sort((a, b) => b.calls - a.calls);
				return {
					client,
					calls: operations.reduce((s, o) => s + o.calls, 0),
					operations,
				};
			})
			.sort((a, b) => b.calls - a.calls),
	};
}
