/**
 * Historical-name resolution — "an agent read this name in an old post, what
 * is it now?"
 *
 * We already answer this for PEOPLE: a dead slug 307s to its survivor in a
 * browser. Machines got nothing. That is backwards for the case it exists to
 * serve, which is an agent hitting an ancient repo, changelog or blog post and
 * needing to reconcile a name that no longer matches anything current.
 *
 * The rules that keep it honest:
 *   - a MISS is a first-class answer. "We hold no project by that name" is
 *     useful and true; guessing a near-match would invent a company.
 *   - a hit reports how it matched, so a caller can weigh an exact slug
 *     differently from a normalized name collision.
 *   - inactive is reported with its evidence, or with an explicit admission
 *     that we have none. We serve ~80 inactive rows and only 10 carry a
 *     source URL; a resolver that hid that would be laundering unsourced
 *     claims about named companies.
 *   - "no successor recorded" never means "nothing succeeded it".
 *
 * Pure — the route supplies the rows, so the matching rules are testable.
 */

/** How the input matched. Exactness is part of the answer. */
export type MatchKind = "slug" | "canonical-slug" | "alias" | "name" | "repo";

export interface ResolvableProject {
	slug: string;
	name?: string | null;
	status?: string | null;
	statusAsOf?: string | null;
	statusBasis?: string | null;
	statusSourceUrl?: string | null;
	canonicalSlug?: string | null;
	aliases?: string[] | null;
	shortDescription?: string | null;
}

export interface ResolutionEvidence {
	/** Dated basis for the status, or an explicit admission we hold none. */
	statusAsOf: string | null;
	statusBasis: string | null;
	statusSourceUrl: string | null;
	/** True when we assert a status with no citable source behind it. */
	unsourced: boolean;
}

export interface Resolution {
	query: string;
	found: boolean;
	matchedOn: MatchKind | null;
	/** The record the query names — which may itself be superseded. */
	subject: {
		slug: string;
		name: string | null;
		status: string | null;
	} | null;
	/** Where a caller should look now. Same as subject when nothing moved. */
	current: {
		slug: string;
		name: string | null;
		status: string | null;
		url: string;
	} | null;
	superseded: boolean;
	evidence: ResolutionEvidence | null;
	note: string;
}

const SITE = "https://stellarlight.xyz";

/** Case, punctuation and spacing insensitive key for name matching. */
export function normalizeName(s: string): string {
	return s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

/** Strip a pasted project URL down to its slug; pass anything else through. */
export function queryToKey(raw: string): string {
	const m = raw.match(/\/project\/([a-z0-9-]+)/i);
	return (m ? m[1] : raw).trim();
}

/**
 * Resolve one historical name against the project set.
 *
 * Match order is strongest-first: an exact slug beats an alias beats a
 * normalized name. A normalized name matching TWO projects is reported as a
 * miss with both candidates named — picking one would attribute a history to
 * the wrong company.
 */
export function resolveProject(
	rawQuery: string,
	projects: ResolvableProject[],
): Resolution {
	const query = rawQuery.trim();
	const key = queryToKey(query).toLowerCase();
	const miss = (note: string): Resolution => ({
		query,
		found: false,
		matchedOn: null,
		subject: null,
		current: null,
		superseded: false,
		evidence: null,
		note,
	});
	if (!key) return miss("Empty query — nothing to resolve.");

	const bySlug = new Map<string, ResolvableProject>();
	for (const p of projects) if (p.slug) bySlug.set(p.slug.toLowerCase(), p);

	let hit: ResolvableProject | undefined;
	let matchedOn: MatchKind | null = null;

	hit = bySlug.get(key);
	if (hit) matchedOn = "slug";

	if (!hit) {
		const aliasHits = projects.filter((p) =>
			(p.aliases ?? []).some((a) => normalizeName(a) === normalizeName(key)),
		);
		if (aliasHits.length === 1) {
			hit = aliasHits[0];
			matchedOn = "alias";
		} else if (aliasHits.length > 1) {
			return miss(
				`"${query}" is an alias of more than one project (${aliasHits.map((p) => p.slug).join(", ")}) — resolve by slug instead.`,
			);
		}
	}

	if (!hit) {
		const nameHits = projects.filter(
			(p) => p.name && normalizeName(p.name) === normalizeName(key),
		);
		if (nameHits.length === 1) {
			hit = nameHits[0];
			matchedOn = "name";
		} else if (nameHits.length > 1) {
			return miss(
				`"${query}" matches the name of more than one project (${nameHits.map((p) => p.slug).join(", ")}) — resolve by slug instead.`,
			);
		}
	}

	if (!hit) {
		return miss(
			`No project in this directory is named "${query}". That means it is NOT TRACKED HERE — never that it never existed, and never that it is defunct.`,
		);
	}

	// Follow the successor pointer, guarding against a cycle or a dangling
	// target: a broken chain must degrade to "here is what we hold" rather
	// than throwing or silently returning the dead record as current.
	let current = hit;
	const seen = new Set<string>([hit.slug.toLowerCase()]);
	while (current.canonicalSlug) {
		const nextKey = current.canonicalSlug.toLowerCase();
		if (seen.has(nextKey)) break;
		const next = bySlug.get(nextKey);
		if (!next) break;
		seen.add(nextKey);
		current = next;
	}
	const superseded = current.slug !== hit.slug;

	const unsourced = !hit.statusSourceUrl;
	const evidence: ResolutionEvidence = {
		statusAsOf: hit.statusAsOf ?? null,
		statusBasis: hit.statusBasis ?? null,
		statusSourceUrl: hit.statusSourceUrl ?? null,
		unsourced,
	};

	const parts: string[] = [];
	if (superseded) {
		parts.push(
			`"${hit.slug}" is superseded — look at "${current.slug}" instead.`,
		);
	} else if (hit.status === "Inactive") {
		parts.push(
			`"${hit.slug}" is recorded inactive and we hold NO successor for it. That is not a claim nothing succeeded it — only that we do not know of one.`,
		);
	} else {
		parts.push(`"${hit.slug}" is current.`);
	}
	if (hit.status === "Inactive" && unsourced) {
		parts.push(
			"We carry no source for that inactive status, so treat it as our unverified record rather than an established fact.",
		);
	}

	return {
		query,
		found: true,
		matchedOn,
		subject: {
			slug: hit.slug,
			name: hit.name ?? null,
			status: hit.status ?? null,
		},
		current: {
			slug: current.slug,
			name: current.name ?? null,
			status: current.status ?? null,
			url: `${SITE}/project/${current.slug}`,
		},
		superseded,
		evidence,
		note: parts.join(" "),
	};
}
