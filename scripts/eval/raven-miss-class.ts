/**
 * The routing-eval miss classifier, as a pure function.
 *
 * Lived inline in scripts/raven-routing.ts, where it could not be tested
 * without a live gateway. Two defects a cross-vendor audit found there and
 * this module fixes:
 *
 *   PRECEDENCE — catalog-lag is decided FIRST. If the text Raven indexes lacks
 *   words our current spec carries and our text would have routed the
 *   question, the miss is lag: it is upstream's re-baseline, not a defect of
 *   ours, and that is true whether another op's id noun happens to be in the
 *   question or nothing from scout came back at all. Classing such a miss as
 *   id-noun-exclusion or no-scout-op invites a second "fix" to text that is
 *   already correct (feedback_catalog_lag_is_not_drift).
 *
 *   FAIL CLOSED — the named-entity test asks the directory's own resolver
 *   whether a missing word is a project name. When that fetch errors the
 *   verdict is unknown, and the old code let unknown fall through to
 *   `vocabulary` — a class that reads as "ours to fix" and would have sent
 *   someone to edit a description over a network blip. An unresolvable word
 *   yields `could-not-check` carrying the error, never a vocabulary fix.
 */

export type MissClass =
	| "catalog-lag"
	| "no-scout-op"
	| "id-noun-exclusion"
	| "named-entity"
	| "vocabulary"
	| "outscored"
	| "could-not-check";

/** Precedence order, and the order the artifact reports counts in. */
export const MISS_CLASSES: MissClass[] = [
	"catalog-lag",
	"no-scout-op",
	"id-noun-exclusion",
	"named-entity",
	"vocabulary",
	"outscored",
	"could-not-check",
];

/** The directory resolver's answer: is this word a project name, or unknown? */
export type NameVerdict = boolean | { error: string };

export interface ClassifierInput {
	/** Scout op ids returned live, in rank order. Empty = no scout hit at all. */
	scoutHits: string[];
	/** Other ops' id nouns present in the question that outranked the intended op. */
	collisions: Array<{ op: string }>;
	/** Intended ops whose LIVE text lags ours on this question's words. */
	lagged: Array<{ op: string }>;
	/** The intended op with the fewest uncovered words (undefined = none cataloged). */
	best?: { missingWords: string[] };
	/** Asks the live directory whether a word is a project name. */
	resolveProjectName: (word: string) => Promise<NameVerdict>;
}

export interface Classification {
	missClass: MissClass;
	/** Missing words the resolver confirmed are project names. */
	projectNames: string[];
	/** Set only for could-not-check: which word failed to resolve, and why. */
	resolverError?: string;
}

export async function classifyMiss(
	input: ClassifierInput,
): Promise<Classification> {
	// Lag first: upstream has not absorbed text we already ship.
	if (input.lagged.length > 0)
		return { missClass: "catalog-lag", projectNames: [] };
	if (input.scoutHits.length === 0)
		return { missClass: "no-scout-op", projectNames: [] };
	if (input.collisions.length > 0)
		return { missClass: "id-noun-exclusion", projectNames: [] };
	const missingWords = input.best?.missingWords ?? [];
	if (missingWords.length === 0)
		return { missClass: "outscored", projectNames: [] };

	const verdicts = await Promise.all(
		missingWords.map(
			async (w) => [w, await input.resolveProjectName(w)] as const,
		),
	);
	const failed = verdicts.find(
		(v): v is readonly [string, { error: string }] => typeof v[1] !== "boolean",
	);
	if (failed)
		return {
			missClass: "could-not-check",
			projectNames: [],
			resolverError: `resolver could not answer for "${failed[0]}": ${failed[1].error}`,
		};
	const projectNames = verdicts.filter(([, v]) => v === true).map(([w]) => w);
	return {
		missClass:
			projectNames.length === missingWords.length
				? "named-entity"
				: "vocabulary",
		projectNames,
	};
}
