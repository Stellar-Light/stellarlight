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

/** Every name `hackathon` accepts, lowercased, to the slugs it selects: each
 * indexed event's slug and its exact title. A title several events share
 * selects them all. */
function eventNames(indexed: IndexedBuild[]): Map<string, Set<string>> {
	const names = new Map<string, Set<string>>();
	for (const { hackathon: h } of indexed)
		for (const name of [h.slug, h.title]) {
			const key = name.trim().toLowerCase();
			if (key) names.set(key, (names.get(key) ?? new Set()).add(h.slug));
		}
	return names;
}

/** Split `hackathon` into slugs and the values that name no indexed event.
 * Titles can hold commas ("Build, Create & Win"), so from each piece the
 * longest run of pieces that names an event wins. */
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
 * an error. */
export function parseBuildFilters(
	sp: URLSearchParams,
	/** The mode when the request names none. Search answers "has anyone built
	 * X" best with hybrid; analyze counts with keyword so its numbers do not
	 * move with the meaning index. Required, so each caller chooses. */
	defaultMode: BuildSearchMode,
	/** The index the filters will run over: `hackathon` must name its events.
	 * A slug it does not hold matched nothing and answered an empty 200. */
	indexed: IndexedBuild[],
): { filters: BuildFilters } | { error: Record<string, unknown> } {
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
	const { slugs, unknown } = resolveEvents(
		sp.get("hackathon") ?? "",
		eventNames(indexed),
	);
	if (slugs.size + unknown.size > MAX_EVENTS)
		return {
			error: {
				error: `At most ${MAX_EVENTS} hackathon slugs.`,
				hint: "hackathon=slug-a,slug-b: each an event's slug or exact title.",
			},
		};
	if (unknown.size)
		return {
			error: {
				error: `hackathon value(s) not recognised: ${[...unknown].map((v) => `'${v}'`).join(", ")}.`,
				hint: "Pass a slug from validHackathons (every event with stored submissions) or an event's exact title, any case.",
				validHackathons: [
					...new Set(indexed.map((b) => b.hackathon.slug)),
				].sort(),
			},
		};
	const hackathons = [...slugs];
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
	const opt = (k: string) => sp.get(k)?.trim().toLowerCase() || undefined;
	return {
		filters: {
			q: sp.get("q")?.trim().toLowerCase() ?? "",
			mode: mode as BuildSearchMode,
			winnersOnly,
			hackathons,
			track: opt("track"),
			category,
			package: opt("package"),
		},
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
}

/** Run the filters over the index. Search by meaning that cannot run serves
 * keyword matches and says so; it is never read as "nothing close". */
export async function queryBuilds(
	indexed: IndexedBuild[],
	f: BuildFilters,
	/** searchHackathonBuilds: one result per submission. analyze leaves it
	 * off and counts every event entry (sls-092). */
	opts: { perSubmission?: boolean } = {},
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
	if (!f.q) return { scored: browse, field, served: f.mode, warnings: [] };
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
	const scored = searchHackathonBuilds(indexed, f.q, {
		...structural,
		mode: served,
		semantic,
	});
	return { scored, field, served, warnings };
}
