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

/** Parse the shared filters, or the 400 body naming what was wrong. A bad
 * value is never coerced: a list that looks filtered but is not is worse than
 * an error. */
export function parseBuildFilters(
	sp: URLSearchParams,
): { filters: BuildFilters } | { error: Record<string, unknown> } {
	const winnersOnly = strictBoolParam(sp.get("winnersOnly"));
	if (winnersOnly === "invalid")
		return {
			error: {
				error: `Invalid winnersOnly value '${sp.get("winnersOnly")}'.`,
				validValues: [...BOOL_TRUE_VALUES, ...BOOL_FALSE_VALUES],
			},
		};
	const mode = sp.get("mode") ?? "keyword";
	if (!(BUILD_SEARCH_MODES as readonly string[]).includes(mode))
		return {
			error: {
				error: `Invalid mode '${mode}'.`,
				validValues: BUILD_SEARCH_MODES,
			},
		};
	const hackathons = [
		...new Set(
			(sp.get("hackathon") ?? "")
				.split(",")
				.map((s) => s.trim().toLowerCase())
				.filter(Boolean),
		),
	];
	if (hackathons.length > MAX_EVENTS)
		return {
			error: {
				error: `At most ${MAX_EVENTS} hackathon slugs.`,
				hint: "hackathon=slug-a,slug-b (the slugs getHackathons lists)",
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
): Promise<BuildQuery> {
	const structural = {
		winnersOnly: f.winnersOnly,
		track: f.track,
		package: f.package,
		hackathons: f.hackathons,
		category: f.category,
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
