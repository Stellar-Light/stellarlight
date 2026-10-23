/**
 * Counts, trends and comparisons over hackathon submissions, in one place.
 *
 * Every analytics question is a facet over a filtered set of builds:
 *   which SDKs winners use           facet=package over the winners
 *   payments share, event by event   facet=category, value=Payments, by=event
 *   what the winners did differently any facet, winners against the rest
 * so a new question is one more entry in FACETS, not an endpoint with its own
 * arithmetic. Search (meta.stack), analyze and compare all read these.
 *
 * A facet reads one fact off a build. null means the fact is unknown for that
 * build (not read, not linked, not categorized yet): unknown builds are counted
 * apart and left out of every share's denominator, so "not read" never reads
 * as "none".
 */
import { CURATED_WINNERS_NOTES } from "@/data/curated-hackathons";
import { CURATED_BUILD_ID } from "@/lib/hackathon-build-links";
import type { IndexedBuild } from "@/lib/hackathon-builds";

const DAY = 86_400_000;
/** How long after its event a repo has to see a commit to count as built on. */
export const KEPT_BUILDING_DAYS = 90;

interface Facet {
	/** What a value counts, said in responses. */
	label: string;
	/** Why a build's value can be unknown; empty when it never is. */
	unknown: string;
	/** null = unknown for this build; [] = known to have no value. */
	values: (b: IndexedBuild, now: number) => string[] | null;
}

/** What a submitted repo did after its event: the activity facet's values
 * and a served row's afterEvent, one list so the spec cannot drift. */
export const AFTER_EVENT_VALUES = [
	`commits ${KEPT_BUILDING_DAYS}+ days after`,
	`no commits ${KEPT_BUILDING_DAYS}+ days after`,
	"archived",
	"repo not found",
] as const;
const [KEPT, QUIET, ARCHIVED, GONE] = AFTER_EVENT_VALUES;

/** What a submission's repo did after its event, or null when that cannot be
 * told yet. */
function activityAfter(b: IndexedBuild, now: number): string[] | null {
	if (b.repoMissing) return [GONE];
	if (!b.activity) return null;
	if (b.activity.archived) return [ARCHIVED];
	const end = Date.parse(b.hackathon.endedAt ?? "");
	if (!Number.isFinite(end)) return null;
	const mark = end + KEPT_BUILDING_DAYS * DAY;
	const last = Date.parse(b.activity.lastCommitAt ?? "");
	if (Number.isFinite(last) && last >= mark) return [KEPT];
	// The event ended too recently to say the team stopped.
	if (now < mark) return null;
	return [QUIET];
}

/** What a submission's repo did after its event, for a served row: the
 * activity facet's value (absent when it cannot be told yet) and the repo's
 * last commit (absent when the repo was not read). It describes the
 * submitted repo, not the project: work can move to another repo, and a
 * live product can sit still in code. */
export function afterEventFields(b: IndexedBuild, now = Date.now()) {
	const afterEvent = activityAfter(b, now)?.[0];
	return {
		...(afterEvent ? { afterEvent } : {}),
		...(b.activity ? { lastCommitAt: b.activity.lastCommitAt } : {}),
	};
}

/** Package names that are one library: renamed scopes, legacy names and a
 * project's several packages. A package not listed is its own library. */
const LIBRARY_EXACT: Record<string, string> = {
	"@stellar/stellar-sdk": "Stellar JS SDK",
	"stellar-sdk": "Stellar JS SDK",
	"soroban-client": "Stellar JS SDK",
	"@stellar/stellar-base": "Stellar JS SDK",
	"stellar-base": "Stellar JS SDK",
	"@creit.tech/stellar-wallets-kit": "Stellar Wallets Kit",
	"@creit-tech/stellar-wallets-kit": "Stellar Wallets Kit",
	"stellar-wallets-kit": "Stellar Wallets Kit",
	"@stellar/freighter-api": "Freighter API",
	"passkey-kit": "Passkey Kit",
	"passkey-kit-sdk": "Passkey Kit",
	"soroban-sdk": "Soroban Rust SDK",
	"soroban-token-sdk": "Soroban Rust SDK",
};
const LIBRARY_SCOPES: Array<[string, string]> = [
	["@x402/", "x402"],
	["@blend-capital/", "Blend SDK"],
	["@defindex/", "DeFindex SDK"],
	["@soroswap/", "Soroswap SDK"],
	["@reflector-network/", "Reflector"],
	["soroban-env-", "Soroban Rust SDK"],
	["soroban-spec", "Soroban Rust SDK"],
];

/** The library a declared package belongs to. */
/** One event's submissions profiled by the engine: what they were about,
 * what they built with, and what became of them. compareHackathons and
 * getHackathon serve this same shape. On a winners-only event it says so
 * and serves no submission count: it describes the winners only. Over
 * incomplete rows (incompleteRows) it counts and serves no share. */
export function eventProfile(builds: IndexedBuild[]) {
	const coverage = eventCoverage(builds);
	const winnersOnly = coverage === "winners-only";
	const noShares =
		!!builds.length && !!incompleteRows(builds[0].hackathon.slug, coverage);
	const d: typeof distribution = (...args) => {
		const out = distribution(...args);
		return noShares ? withoutShares(out) : out;
	};
	return {
		...(winnersOnly ? { coverage: COVERAGE_VALUES[0] } : {}),
		submissions: winnersOnly ? null : builds.length,
		winners: builds.filter((b) => b.isWinner).length,
		category: d(builds, "category", { top: 5 }),
		library: d(builds, "library", { top: 5 }),
		package: d(builds, "package", { top: 5 }),
		activity: d(builds, "activity", { top: 4 }),
		project: d(builds, "project"),
		projectStatus: d(builds, "projectStatus", { top: 4 }),
		scf: d(builds, "scf"),
	};
}
export type EventProfile = ReturnType<typeof eventProfile>;

/** Why no ratio may be computed over an event's stored rows, or null when
 * one may. The one rule for every ratio served over stored rows (a share, a
 * winner share, a rate, a prize per winner): its denominator never comes
 * from incomplete rows. Incomplete: only the winners are stored (coverage
 * winners-only), or the winners are published only in part or not at all,
 * which today only a curated event's dated winners note records. */
export function incompleteRows(
	slug: string,
	coverage: ReturnType<typeof eventCoverage> | undefined,
): string | null {
	const note = CURATED_WINNERS_NOTES[slug];
	const why = [
		...(coverage === "winners-only"
			? ["only its winners are stored (coverage winners-only)"]
			: []),
		// Each note's own kind: a test keeps "Not announced upstream" the
		// prefix of every note that says so.
		...(note
			? [
					note.startsWith("Not announced upstream")
						? "its winners are not announced upstream (getHackathon stats.winnersNote)"
						: "its winners are published only in part (getHackathon stats.winnersNote)",
				]
			: []),
	];
	return why.length ? why.join(", and ") : null;
}

/** The events in an index whose rows no rate may count (incompleteRows). */
export function incompleteEvents(builds: IndexedBuild[]): Set<string> {
	const winnersOnly = winnersOnlyEvents(builds);
	return new Set(
		[...new Set(builds.map((b) => b.hackathon.slug))].filter((slug) =>
			incompleteRows(slug, winnersOnly.has(slug) ? "winners-only" : "full"),
		),
	);
}

/** The same counts with every share withheld: their rows are incomplete. */
export function withoutShares<T extends Distribution>(d: T): T {
	return { ...d, values: d.values.map((v) => ({ ...v, share: null })) } as T;
}

/** The `coverage` values served. Absent means the stored rows are the
 * event's listing, so "full" is never served. The spec spreads this list. */
export const COVERAGE_VALUES = ["winners-only"] as const;

/** What one event's stored rows cover, decided from the rows alone; every
 * reader of an event's counts asks this. full: the event's listing as the
 * DoraHacks sync stores it. winners-only: every row is a curated winner
 * (scripts/import-curated-builds.ts), so only the winners are on record and
 * the size and mix of the field are unknown. null: none stored.
 * ponytail: a curated row that is not a winner makes its event full; a
 * partial curated listing needs its own value (a test keeps every curated
 * row a winner until then). */
export function eventCoverage(
	builds: IndexedBuild[],
): "full" | (typeof COVERAGE_VALUES)[number] | null {
	if (!builds.length) return null;
	return builds.every((b) => b.isWinner && CURATED_BUILD_ID.test(b.id))
		? "winners-only"
		: "full";
}

/** Each winners-only event in the index, in index order, with its winners. */
export function winnersOnlyEvents(builds: IndexedBuild[]): Map<string, number> {
	const byEvent = new Map<string, IndexedBuild[]>();
	for (const b of builds) {
		const rows = byEvent.get(b.hackathon.slug);
		if (rows) rows.push(b);
		else byEvent.set(b.hackathon.slug, [b]);
	}
	return new Map(
		[...byEvent]
			.filter(([, rows]) => eventCoverage(rows) === "winners-only")
			.map(([slug, rows]) => [slug, rows.length]),
	);
}

/** getHackathon's stats.coverageNote on a winners-only event. */
export function winnersOnlyNote(winners: number): string {
	const rows =
		winners === 1
			? "1 row, with the page that names the win as url"
			: `${winners} rows, with the page that names each win as url`;
	return `Only this event's winners are on record here (${rows}); its other submissions are not stored. The size and mix of its field are unknown, so totalSubmissions, each track's submissionCount and outcomes are null, never the winner count, and profile counts the winners only, with every share null.`;
}

/** "a (6), b (5) and c (1)" */
const listEvents = (events: Array<[string, number]>) => {
	const named = events.map(([slug, n]) => `${slug} (${n})`);
	return `${named.slice(0, -1).join(", ")} and ${named.at(-1)}`;
};

/** The meta.warnings line for winners-only events a request names or
 * leaves alone: their rows are their winners, never their fields. */
export function winnersOnlyWarning(events: Array<[string, number]>): string {
	if (events.length === 1) {
		const [slug, n] = events[0];
		return `only the winners of ${slug} are stored (${n} ${n === 1 ? "row" : "rows"}, coverage winners-only); its other submissions are not, so its rows are its winners, not its field, whose size and mix are unknown, and no share is computed over them`;
	}
	return `only the winners of ${listEvents(events)} are stored (coverage winners-only); their other submissions are not, so their rows are their winners, not their fields, whose size and mix are unknown, and no share is computed over them`;
}

/** The meta.warnings line for winners-only rows analyze left out of a set
 * that also holds full listings, with the rows left out per event. */
export function leftOutWarning(events: Array<[string, number]>): string {
	if (events.length === 1) {
		const [slug, n] = events[0];
		return `left out of every count and share: the ${n} ${n === 1 ? "row" : "rows"} of ${slug}, whose stored rows are its winners only; the rest covers events whose full listing is stored`;
	}
	const rows = events.reduce((a, [, n]) => a + n, 0);
	return `left out of every count and share: ${rows} rows of ${listEvents(events)}, whose stored rows are their winners only; the rest covers events whose full listing is stored`;
}

/** Each assigned type's measured precision and recall, as the lane stamped
 * them on the builds that carry it. */
export function categoryMeasures(
	builds: IndexedBuild[],
): Map<string, { precision: number; recall: number }> {
	const out = new Map<string, { precision: number; recall: number }>();
	for (const b of builds)
		for (const c of b.categories ?? [])
			if (!out.has(c.type) && c.precision != null && c.recall != null)
				out.set(c.type, { precision: c.precision, recall: c.recall });
	return out;
}

export function libraryOf(pkg: string): string {
	return (
		LIBRARY_EXACT[pkg] ??
		LIBRARY_SCOPES.find(([p]) => pkg.startsWith(p))?.[1] ??
		pkg
	);
}

export const FACETS = {
	category: {
		label:
			"the directory project type the submission was sorted into (up to three per build). Counts are confident assignments: each value carries its type's measured precision and recall on the hand-typed directory, so a type with low recall undercounts and one with balanced precision and recall tracks its true share. A submission whose types are all uncertain carries none and still counts in `known`. Security includes zero-knowledge and privacy projects, as the directory types them.",
		unknown: "not categorized yet",
		values: (b) => b.categories?.map((c) => c.type) ?? null,
	},
	package: {
		label: "a Stellar package its repo declares in package.json or Cargo.toml",
		unknown: "no repo link, a repo that is not public, or not read yet",
		values: (b) => b.stack ?? null,
	},
	library: {
		label:
			"a Stellar library its repo builds on: declared packages folded into the library they belong to (both Stellar Wallets Kit scopes, the legacy and current JS SDK names, every @x402 package)",
		unknown: "no repo link, a repo that is not public, or not read yet",
		values: (b) => (b.stack ? [...new Set(b.stack.map(libraryOf))] : null),
	},
	activity: {
		label: `whether the submitted repo saw commits on its default branch ${KEPT_BUILDING_DAYS}+ days after the event ended (work that moved to another repo counts as none here)`,
		unknown: `no repo link, activity not read yet, or the event ended under ${KEPT_BUILDING_DAYS} days ago`,
		values: activityAfter,
	},
	project: {
		label:
			"became a directory project: a project lists the submission's exact repo, or the submission's demo site is the project's own website. A submission we could not link counts as none here, so this is a floor.",
		unknown: "link not checked",
		values: (b) =>
			b.project === undefined ? null : b.project ? ["directory project"] : [],
	},
	projectStatus: {
		label:
			"the directory status today of the project the submission became (Live, Pre-Release, Development, Inactive)",
		unknown:
			"not linked to a directory project, or the project's status could not be read",
		values: (b) => (b.project?.status ? [b.project.status] : null),
	},
	scf: {
		label: "whether the project the submission became has SCF funding",
		unknown:
			"not linked to a directory project, or its funding could not be read",
		values: (b) =>
			b.project && b.project.scfAwarded !== undefined
				? b.project.scfAwarded
					? ["SCF funded"]
					: []
				: null,
	},
	placement: {
		label: "placed in its event or not",
		unknown: "",
		values: (b) => [b.isWinner ? "winner" : "not placed"],
	},
	track: {
		label: "hackathon track",
		unknown: "",
		values: (b) => (b.track ? [b.track] : []),
	},
	event: {
		label: "hackathon (event slug)",
		unknown: "",
		values: (b) => [b.hackathon.slug],
	},
	year: {
		label: "year the hackathon ended",
		unknown: "no end date",
		values: (b) =>
			b.hackathon.endedAt ? [b.hackathon.endedAt.slice(0, 4)] : null,
	},
} satisfies Record<string, Facet>;

export type FacetId = keyof typeof FACETS;
export const FACET_IDS = Object.keys(FACETS) as FacetId[];
/** Facets a set can be split by: exactly one value per build. */
export const GROUP_FACETS = [
	"event",
	"year",
	"placement",
	"track",
] as const satisfies readonly FacetId[];
export type GroupFacetId = (typeof GROUP_FACETS)[number];
/** Facets compareHackathons reports shifts for between events. */
export const SHIFT_FACETS = [
	"category",
	"package",
] as const satisfies readonly FacetId[];

export interface ValueCount {
	value: string;
	builds: number;
	winners: number;
	/** builds / known; null when no build's value is known. */
	share: number | null;
}

export interface Distribution {
	builds: number;
	/** Builds whose value is known: every share's denominator. */
	known: number;
	unknown: number;
	values: ValueCount[];
}

export interface CountOpts {
	/** Most values to report (most builds first). */
	top?: number;
	/** Report only this value, as a row even at zero. */
	value?: string;
	now?: number;
}

const round = (n: number, places: number) =>
	Math.round(n * 10 ** places) / 10 ** places;

export function distribution(
	builds: IndexedBuild[],
	facet: FacetId,
	opts: CountOpts = {},
): Distribution {
	const now = opts.now ?? Date.now();
	const read: Facet["values"] = FACETS[facet].values;
	const tally = new Map<string, { builds: number; winners: number }>();
	let known = 0;
	for (const b of builds) {
		const vs = read(b, now);
		if (vs === null) continue;
		known++;
		for (const v of new Set(vs)) {
			const t = tally.get(v) ?? { builds: 0, winners: 0 };
			t.builds++;
			if (b.isWinner) t.winners++;
			tally.set(v, t);
		}
	}
	const row = (value: string, t = { builds: 0, winners: 0 }): ValueCount => ({
		value,
		...t,
		share: known ? round(t.builds / known, 3) : null,
	});
	let values: ValueCount[];
	if (opts.value) {
		// A package name asked of the library facet counts as its library.
		const want = (
			facet === "library" ? libraryOf(opts.value.toLowerCase()) : opts.value
		).toLowerCase();
		const hit = [...tally].find(([v]) => v.toLowerCase() === want);
		values = [hit ? row(hit[0], hit[1]) : row(opts.value)];
	} else {
		values = [...tally]
			.map(([v, t]) => row(v, t))
			.sort(
				(a, b) =>
					b.builds - a.builds ||
					b.winners - a.winners ||
					a.value.localeCompare(b.value),
			)
			.slice(0, opts.top ?? 10);
	}
	return {
		builds: builds.length,
		known,
		unknown: builds.length - known,
		values,
	};
}

export interface Group extends Distribution {
	value: string;
	/** by=event: the event's title and end date. */
	title?: string;
	endedAt?: string | null;
	/** Builds in this group before the topic query: the group's whole field,
	 * so builds / field is the share of the group that matched. */
	field: number;
}

/** The facet counted within each group (each event, each year...). Groups
 * come from the field, so a group where nothing matched still reports zero.
 * Events and years run oldest first, so a trend reads in time order. */
export function distributionBy(
	matched: IndexedBuild[],
	field: IndexedBuild[],
	facet: FacetId,
	by: GroupFacetId,
	opts: CountOpts = {},
): Group[] {
	const now = opts.now ?? Date.now();
	const read: Facet["values"] = FACETS[by].values;
	const groups = new Map<
		string,
		{ first: IndexedBuild; field: number; members: IndexedBuild[] }
	>();
	const at = (b: IndexedBuild, v: string) => {
		let g = groups.get(v);
		if (!g) {
			g = { first: b, field: 0, members: [] };
			groups.set(v, g);
		}
		return g;
	};
	for (const b of field) for (const v of read(b, now) ?? []) at(b, v).field++;
	for (const b of matched)
		for (const v of read(b, now) ?? []) at(b, v).members.push(b);
	const out: Group[] = [...groups].map(([value, g]) => ({
		value,
		...(by === "event"
			? { title: g.first.hackathon.title, endedAt: g.first.hackathon.endedAt }
			: {}),
		field: g.field,
		...distribution(g.members, facet, { ...opts, now }),
	}));
	if (by === "event")
		out.sort((a, b) => (a.endedAt ?? "").localeCompare(b.endedAt ?? ""));
	else if (by === "year") out.sort((a, b) => a.value.localeCompare(b.value));
	else out.sort((a, b) => b.field - a.field || a.value.localeCompare(b.value));
	return out;
}

export interface Lift {
	value: string;
	winners: number;
	others: number;
	winnersShare: number | null;
	othersShare: number | null;
	/** winnersShare / othersShare; null when either is unknown or zero. */
	lift: number | null;
}

/** Winners against everyone else in the same set, value by value: what the
 * winners did differently. Null when the set has no winners or no others, or
 * the facet is placement itself. Values run most common among winners first. */
export function winnersVsOthers(
	builds: IndexedBuild[],
	facet: FacetId,
	opts: CountOpts = {},
): { winnersKnown: number; othersKnown: number; values: Lift[] } | null {
	if (facet === "placement") return null;
	const w = builds.filter((b) => b.isWinner);
	const o = builds.filter((b) => !b.isWinner);
	if (!w.length || !o.length) return null;
	const all = { ...opts, top: Number.POSITIVE_INFINITY };
	const dw = distribution(w, facet, all);
	const dO = distribution(o, facet, all);
	const others = new Map(dO.values.map((v) => [v.value, v]));
	const oKnown = dO.known;
	const values = dw.values
		.map((v): Lift => {
			const x = others.get(v.value);
			const othersShare = oKnown ? round((x?.builds ?? 0) / oKnown, 3) : null;
			return {
				value: v.value,
				winners: v.builds,
				others: x?.builds ?? 0,
				winnersShare: v.share,
				othersShare,
				lift:
					v.share != null && othersShare
						? round(v.share / othersShare, 2)
						: null,
			};
		})
		.slice(0, opts.value ? 1 : (opts.top ?? 10));
	return { winnersKnown: dw.known, othersKnown: oKnown, values };
}

/** One value's share in each compared event, for the shifts between them. */
export interface FacetShift {
	facet: (typeof SHIFT_FACETS)[number];
	value: string;
	/** Per event: the value's share of the submissions whose facet is known;
	 * null when none is. */
	shares: { slug: string; share: number | null }[];
	/** Highest share minus lowest, over the events where it is known. */
	spread: number;
}

/** The values whose share moved most between the events: the "what changed"
 * line. Candidates are the values in any event's top list; each is then
 * counted against every event's full set, so a value outside one event's top
 * list still gets its real share there. */
export function facetShifts(
	byEvent: Map<string, IndexedBuild[]>,
): FacetShift[] {
	const events = [...byEvent].filter(([, builds]) => builds.length);
	if (events.length < 2) return [];
	const out: FacetShift[] = [];
	for (const facet of SHIFT_FACETS) {
		const candidates = new Set(
			events.flatMap(([, builds]) =>
				distribution(builds, facet, { top: 5 }).values.map((v) => v.value),
			),
		);
		for (const value of candidates) {
			const shares = events.map(([slug, builds]) => ({
				slug,
				share: distribution(builds, facet, { value }).values[0]?.share ?? null,
			}));
			const known = shares
				.map((x) => x.share)
				.filter((x): x is number => x != null);
			if (known.length < 2) continue;
			out.push({
				facet,
				value,
				shares,
				spread:
					Math.round((Math.max(...known) - Math.min(...known)) * 1000) / 1000,
			});
		}
	}
	return out.sort((a, b) => b.spread - a.spread).slice(0, 6);
}
