/**
 * The filters every hackathon-submission operation takes, parsed and applied
 * once, so search, analyze and compare read the same set the same way.
 */
import { semanticBuildScores } from "@/lib/hackathon-build-semantic";
import {
	BUILD_SEARCH_MODES,
	type BuildSearchMode,
	type IndexedBuild,
	type ScoredBuild,
	searchHackathonBuilds,
} from "@/lib/hackathon-builds";
import {
	BOOL_FALSE_VALUES,
	BOOL_TRUE_VALUES,
	strictBoolParam,
} from "@/lib/http-params";
import { fetchAllDoraHacksHackathonsChecked } from "@/lib/integrations/dorahacks";
import { getPayloadSafe } from "@/lib/payload-client";
import { PROJECT_TYPES } from "@/lib/project-types";

export const BUILD_FILTER_PARAMS = [
	"q",
	"mode",
	"winnersOnly",
	"hackathon",
	"track",
	"category",
	"package",
] as const;

const MAX_EVENTS = 10;
/** Nearest submissions search by meaning reads. Counting needs the whole
 * neighbourhood, not a page: at 50, analyze counted 50 matches against a
 * field of 1,343 and called it a share. */
export const MEANING_NEIGHBOURS = 300;

export interface BuildFilters {
	/** Lowercased topic; "" = none. */
	q: string;
	mode: BuildSearchMode;
	winnersOnly: boolean;
	/** Event slugs; [] = every event. */
	hackathons: string[];
	track?: string;
	/** A PROJECT_TYPES value, as the vocabulary spells it. */
	category?: string;
	package?: string;
}

interface EventName {
	slug: string;
	title: string;
}

/** Every name `hackathon` accepts, lowercased, to the slugs it selects: each
 * event's slug and its exact title. A title several events share selects
 * them all. */
function eventNames(events: EventName[]): Map<string, Set<string>> {
	const names = new Map<string, Set<string>>();
	for (const e of events)
		for (const name of [e.slug, e.title]) {
			const key = name.trim().toLowerCase();
			if (key) names.set(key, (names.get(key) ?? new Set()).add(e.slug));
		}
	return names;
}

/** The events getHackathons lists. `complete` is false when a listing read
 * failed: a name missing from `events` was then not checked. */
export interface ListedEvents {
	events: EventName[];
	complete: boolean;
}

/** Every event getHackathons lists, read the way it and compareHackathons
 * read them: the curated collection, then DoraHacks with the curated file. */
export async function listedEvents(): Promise<ListedEvents> {
	const [payload, dora] = await Promise.all([
		getPayloadSafe(),
		fetchAllDoraHacksHackathonsChecked(),
	]);
	const events = dora.hackathons.map((h) => ({
		slug: h.uname,
		title: h.title,
	}));
	// One failed DoraHacks read leaves its events out: then not checked.
	let complete = dora.complete && !!payload;
	if (payload)
		try {
			const res = await payload.find({
				collection: "hackathons",
				limit: 300,
				depth: 0,
				select: { slug: true, name: true },
			});
			for (const d of res.docs) events.push({ slug: d.slug, title: d.name });
		} catch {
			complete = false;
		}
	return { events, complete };
}

/** Split `hackathon` into slugs and the values that name no event. Titles
 * can hold commas ("Build, Create & Win"), so from each piece the longest
 * run of pieces that names an event wins. */
function resolveEvents(
	raw: string,
	names: Map<string, Set<string>>,
): { slugs: Set<string>; unknown: Set<string> } {
	// Bounds the runs tried by the most commas any name holds, so a value of
	// many commas costs a few lookups per piece, not one per pair of pieces.
	const maxRun = Math.max(
		1,
		...[...names.keys()].map((k) => k.split(",").length),
	);
	const pieces = raw.split(",");
	const slugs = new Set<string>();
	const unknown = new Set<string>();
	// Greedy longest match: "A, B" is the event titled "A, B" when one exists, never events A and B.
	for (let i = 0; i < pieces.length; ) {
		let run = Math.min(maxRun, pieces.length - i);
		let key = "";
		for (; run > 0; run--) {
			key = pieces
				.slice(i, i + run)
				.join(",")
				.trim()
				.toLowerCase();
			if (names.has(key)) break;
		}
		if (run > 0) {
			for (const s of names.get(key) ?? []) slugs.add(s);
			i += run;
		} else {
			const v = pieces[i].trim();
			if (v) unknown.add(v);
			i++;
		}
	}
	return { slugs, unknown };
}

/** Parse the shared filters, or the 400 body naming what was wrong. A bad
 * value is never coerced: a list that looks filtered but is not is worse than
 * an error. `warnings` belong in the response's meta.warnings. */
export async function parseBuildFilters(
	sp: URLSearchParams,
	/** The mode when the request names none. Search answers "has anyone built
	 * X" best with hybrid; analyze counts with keyword so its numbers do not
	 * move with the meaning index. Required, so each caller chooses. */
	defaultMode: BuildSearchMode,
	/** The index the filters will run over. A slug it does not hold matched
	 * nothing and answered an empty 200 that said nothing. */
	indexed: IndexedBuild[],
	/** Read only when a hackathon value names no indexed event (the routes
	 * pass listedEvents). */
	listed: () => Promise<ListedEvents>,
): Promise<
	| { filters: BuildFilters; warnings: string[] }
	| { error: Record<string, unknown> }
> {
	const winnersOnly = strictBoolParam(sp.get("winnersOnly"));
	if (winnersOnly === "invalid")
		return {
			error: {
				error: `Invalid winnersOnly value '${sp.get("winnersOnly")}'.`,
				validValues: [...BOOL_TRUE_VALUES, ...BOOL_FALSE_VALUES],
			},
		};
	const mode = sp.get("mode") ?? defaultMode;
	if (!(BUILD_SEARCH_MODES as readonly string[]).includes(mode))
		return {
			error: {
				error: `Invalid mode '${mode}'.`,
				validValues: BUILD_SEARCH_MODES,
			},
		};
	const rawCategory = sp.get("category")?.trim();
	const category = rawCategory
		? PROJECT_TYPES.find((t) => t.toLowerCase() === rawCategory.toLowerCase())
		: undefined;
	if (rawCategory && !category)
		return {
			error: {
				error: `Unknown category '${rawCategory}'.`,
				validValues: PROJECT_TYPES,
			},
		};
	const raw = sp.get("hackathon") ?? "";
	const stored = indexed.map((b) => b.hackathon);
	let { slugs, unknown } = resolveEvents(raw, eventNames(stored));
	const tooMany = {
		error: {
			error: `At most ${MAX_EVENTS} hackathon slugs.`,
			hint: "hackathon=slug-a,slug-b: each an event's slug or exact title.",
		},
	};
	// Counted before the listing read too, so a pile of values the index
	// does not hold never sets it off. ponytail: here an unstored listed
	// title with commas counts once per piece; it can only matter at the cap.
	if (slugs.size + unknown.size > MAX_EVENTS) return tooMany;
	// A value the index does not hold may still name an event getHackathons
	// lists whose submissions are not stored: resolve again over both.
	let complete = true;
	if (unknown.size) {
		const l = await listed();
		complete = l.complete;
		({ slugs, unknown } = resolveEvents(
			raw,
			eventNames([...stored, ...l.events]),
		));
	}
	// Again after it: a title several events share selects them all.
	if (slugs.size + unknown.size > MAX_EVENTS) return tooMany;
	const storedSlugs = new Set(stored.map((h) => h.slug));
	if (unknown.size && complete)
		return {
			error: {
				error: `hackathon value(s) name no event getHackathons lists: ${[...unknown].map((v) => `'${v}'`).join(", ")}.`,
				hint: "Pass a slug from validHackathons (every event with stored submissions) or an event's exact title, any case. getHackathons lists every event.",
				validHackathons: [...storedSlugs].sort(),
			},
		};
	// Both kinds stay in the filter and match nothing, so the answer is never
	// widened to every event; the warnings say why their share is empty.
	const warnings = [
		...[...slugs]
			.filter((s) => !storedSlugs.has(s))
			.map(
				(s) =>
					`no submissions are stored for ${s}; 0 matched from it is not evidence that nothing was built`,
			),
		...[...unknown].map(
			(v) =>
				`could not check hackathon '${v}': the event listing could not be read; 0 matched from it is not evidence that nothing was built`,
		),
	];
	const opt = (k: string) => sp.get(k)?.trim().toLowerCase() || undefined;
	return {
		filters: {
			q: sp.get("q")?.trim().toLowerCase() ?? "",
			mode: mode as BuildSearchMode,
			winnersOnly,
			hackathons: [...slugs, ...[...unknown].map((v) => v.toLowerCase())],
			track: opt("track"),
			category,
			package: opt("package"),
		},
		warnings,
	};
}

export interface BuildQuery {
	/** Matching builds, ranked; the whole field when there is no q. */
	scored: ScoredBuild[];
	/** Every build that passes the filters other than q: the field the topic
	 * was searched in, and every share-of-field's denominator. */
	field: IndexedBuild[];
	served: BuildSearchMode;
	warnings: string[];
	/** With countEntries: the event entries that match, the unit analyze
	 * counts (a submission entered in several events is one entry per
	 * event), however perSubmission folded the rows. */
	entries?: number;
	/** Builds whose name matched q but that rule L held back, as most of q
	 * is in no submission, and that meaning did not list either. */
	withheld: { b: IndexedBuild; matched: string[] }[];
}

/** Run the filters over the index. Search by meaning that cannot run serves
 * keyword matches and says so; it is never read as "nothing close". */
export async function queryBuilds(
	indexed: IndexedBuild[],
	f: BuildFilters,
	/** searchHackathonBuilds: one result per submission. analyze leaves it
	 * off and counts every event entry (sls-092). `packages`: q also matches
	 * declared packages; only the searchHackathonBuilds route passes it.
	 * `countEntries`: also count matching event entries (meta.counts.entries). */
	opts: {
		perSubmission?: boolean;
		packages?: boolean;
		countEntries?: boolean;
	} = {},
): Promise<BuildQuery> {
	const structural = {
		winnersOnly: f.winnersOnly,
		track: f.track,
		package: f.package,
		hackathons: f.hackathons,
		category: f.category,
		perSubmission: opts.perSubmission,
	};
	const browse = searchHackathonBuilds(indexed, "", structural);
	const field = browse.map((s) => s.b);
	// The same match over every entry, so a per-submission answer can say
	// what analyze counts for the same filter.
	const entriesOf = (
		q: string,
		scored: ScoredBuild[],
		more: Parameters<typeof searchHackathonBuilds>[2] = {},
	) =>
		!opts.countEntries
			? undefined
			: opts.perSubmission
				? searchHackathonBuilds(indexed, q, {
						...structural,
						...more,
						perSubmission: false,
					}).length
				: scored.length;
	if (!f.q)
		return {
			scored: browse,
			field,
			served: f.mode,
			warnings: [],
			entries: entriesOf("", browse),
			withheld: [],
		};
	const warnings: string[] = [];
	let served = f.mode;
	let semantic: Map<string, number> | undefined;
	if (f.mode !== "keyword") {
		const sem = await semanticBuildScores(f.q, {
			winnersOnly: f.winnersOnly,
			limit: MEANING_NEIGHBOURS,
		});
		if (sem) semantic = sem;
		else {
			served = "keyword";
			warnings.push(
				"search by meaning could not run this request (embedding or vector index unavailable); these are keyword matches, not a statement that nothing close exists",
			);
		}
	}
	const held: BuildQuery["withheld"] = [];
	const scored = searchHackathonBuilds(indexed, f.q, {
		...structural,
		mode: served,
		semantic,
		packages: opts.packages,
		withheld: held,
	});
	const listed = new Set(scored.map((s) => s.b.id));
	return {
		scored,
		field,
		served,
		warnings,
		withheld: held.filter((w) => !listed.has(w.b.id)),
		entries: entriesOf(f.q, scored, {
			mode: served,
			semantic,
			packages: opts.packages,
		}),
	};
}
