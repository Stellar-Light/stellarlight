/**
 * Opt-in compact rows (?view=compact, spec 1.9.98).
 *
 * Agents calling Scout from a sandboxed script often have their result cut
 * at about 24,000 characters, front kept. A default projects/search page was
 * about 87,000 characters and repos/search about 77,000 (2026-10-23), mostly
 * detail blocks (repos, onchain, codeVerified, knowledgeNotes) a routing
 * question never reads, so even limit=5 overflowed.
 *
 * view=compact rebuilds each row from a fixed key list: identity, rank and
 * score, and the fields that answer the usual question. Dropped list fields
 * come back as counts. Every compact row carries the same keys, null where
 * the full row had no value; meta.view (first in meta) says the page is
 * compact and how to read the full rows. Without view, or with view=full, the
 * body is returned as the same object: the default response is unchanged.
 */

export const VIEW_VALUES = ["full", "compact"] as const;

export type CompactPlan = {
	/** Kept row keys in output order. A string list keeps only those keys of
	 * an object value (null stays null). */
	keep: Record<string, true | readonly string[]>;
	/** Count keys appended to each row: count key to the dotted path of the
	 * dropped list it counts: its length, or null when the list is absent or
	 * null (not known). */
	counts: Record<string, string>;
	/** Where the dropped detail of these rows is read. */
	detail: string;
};

const REPO_KEEP = {
	fullName: true,
	url: true,
	description: true,
	primaryLanguage: true,
	stars: true,
	lastCommitAt: true,
	isArchived: true,
	activityState: true,
	project: true,
	hackathonWinner: true,
	scfAwarded: true,
	repoScore: true,
	repoScoreLabel: true,
	tier: true,
	kind: true,
	stellarEvidence: true,
	score: true,
} as const;

export const REPO_COMPACT: CompactPlan = {
	keep: REPO_KEEP,
	counts: { knowledgeNotesCount: "knowledgeNotes" },
	detail:
		"Repeat this request without view for full rows, or without view and with fields=<names> (e.g. fields=codeVerified,knowledgeNotes,activitySignals) for just those fields; fullName always comes back.",
};

/** codeReferences on a projects page: the repo rows, read in full from
 * repos search. */
export const CODE_REFERENCE_COMPACT: CompactPlan = {
	...REPO_COMPACT,
	detail:
		"GET /api/repos/search?q=<fullName>&limit=1 returns the full repo row.",
};

export const PROJECT_COMPACT: CompactPlan = {
	keep: {
		id: true,
		name: true,
		slug: true,
		canonicalSlug: true,
		url: true,
		category: true,
		types: true,
		shortDescription: true,
		status: true,
		statusAsOf: true,
		deployment: ["network"],
		tvlUSD: true,
		tvlAsOf: true,
		scfAwarded: true,
		scfTotalAwardedUSD: true,
		audits: true,
		score: true,
		confidence: ["score", "label"],
	},
	counts: { reposCount: "repos", onchainContractsCount: "onchain.contracts" },
	detail:
		"Repeat this request without view for full rows, or without view and with fields=<names> (e.g. fields=repos,onchain,links) for just those fields; id and slug always come back.",
};

const norm = (view: string | null) => (view ?? "").trim().toLowerCase();

/** The 400 body for a view value outside VIEW_VALUES, or for view=compact
 * with fields (two projections of one row); null when the request is fine.
 * A body, not a response, so the spec can import this module without
 * next/server. */
export function viewParamError(
	raw: string | null,
	fields: string | null,
): { error: string; validValues: typeof VIEW_VALUES } | null {
	const view = norm(raw);
	if (view && !(VIEW_VALUES as readonly string[]).includes(view))
		return {
			error: `Invalid view '${raw}'.`,
			validValues: VIEW_VALUES,
		};
	if (view === "compact" && fields)
		return {
			error:
				"view=compact and fields cannot be combined: each picks the row keys. Send one of them.",
			validValues: VIEW_VALUES,
		};
	return null;
}

function at(row: unknown, path: string): unknown {
	let v = row;
	for (const k of path.split(".")) {
		if (!v || typeof v !== "object") return undefined;
		v = (v as Record<string, unknown>)[k];
	}
	return v;
}

function compactRow(row: Record<string, unknown>, plan: CompactPlan) {
	const out: Record<string, unknown> = {};
	for (const [k, pick] of Object.entries(plan.keep)) {
		const v = row[k] ?? null;
		out[k] =
			pick === true || v === null || typeof v !== "object"
				? v
				: Object.fromEntries(
						pick.map((s) => [s, (v as Record<string, unknown>)[s] ?? null]),
					);
	}
	for (const [k, path] of Object.entries(plan.counts)) {
		const v = at(row, path);
		out[k] = Array.isArray(v) ? v.length : null;
	}
	return out;
}

/**
 * A function giving the body as served for this request: the body itself
 * unless view=compact, else the same body with each planned row array
 * compacted and meta.view first in meta. Arrays without a plan pass through.
 * Curried so a route wraps its literal as view({...}) without re-indenting.
 */
export function withView(
	view: string | null,
	plans: Record<string, CompactPlan>,
) {
	const compact = norm(view) === "compact";
	return <T extends { meta: object }>(body: T): T | Record<string, unknown> =>
		compact ? compactBody(body, plans) : body;
}

function compactBody(
	body: { meta: object },
	plans: Record<string, CompactPlan>,
) {
	const out: Record<string, unknown> = {
		meta: {
			view: {
				mode: "compact",
				rows: Object.fromEntries(
					Object.entries(plans).map(([k, p]) => [
						k,
						{ counts: p.counts, detail: p.detail },
					]),
				),
				note: "Compact rows: each carries the same keys, null where there is no value; every other field of the full row was left out, not found empty. For full rows repeat this request without view=compact.",
			},
			...body.meta,
		},
	};
	for (const [k, v] of Object.entries(body)) {
		if (k === "meta") continue;
		const plan = plans[k];
		out[k] =
			plan && Array.isArray(v)
				? v.map((r) => compactRow(r as Record<string, unknown>, plan))
				: v;
	}
	return out;
}
