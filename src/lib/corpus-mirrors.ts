/**
 * S8 mirrored-content logic — ONE shared home for the grouping the
 * corpus-health sweep runs (scripts/eval/engine-b-corpus.ts) and the
 * classification the repair uses (scripts/fix-corpus-mirrors.ts), so the
 * guard and the fix can never drift apart.
 *
 * A "mirror" is one contentHash stored under >1 distinct URL. Two very
 * different things produce that signature, with OPPOSITE dispositions:
 *
 *   REPUBLICATION — the same article under two slugs (a CMS rename left the
 *   old slug's chunks behind). One URL is canonical; the mirror's chunks are
 *   pure dupes and can go. We only ever pick a canonical on POSITIVE
 *   evidence (an HTTP redirect from one to the other, or one side dead while
 *   the other lives) — never on slug aesthetics. Precision over recall: an
 *   ambiguous pair is enumerated for a human, not guessed at.
 *
 *   TEMPLATE/SIBLINGS — different documents sharing text (protocol READMEs
 *   stamped from one template, release notes with identical bodies, SEP-6
 *   vs SEP-24 guide pages). Deleting any of them destroys a real document's
 *   existence in the corpus, so they are never auto-repaired — only
 *   enumerated. Rank-time collapse already dedupes them per query.
 */

export interface MirrorRowLike {
	url: string;
	contentHash?: string | null;
}

/** Same grouping S8 reports: contentHash → the distinct URLs carrying it,
 * groups with >1 URL only, insertion-ordered like the sweep's frame. */
export function mirrorGroups(
	rows: MirrorRowLike[],
): Array<{ hash: string; urls: string[] }> {
	const byHash = new Map<string, Set<string>>();
	for (const r of rows) {
		if (!r.contentHash) continue;
		const set = byHash.get(r.contentHash) ?? new Set<string>();
		set.add(r.url);
		byHash.set(r.contentHash, set);
	}
	return [...byHash.entries()]
		.filter(([, urls]) => urls.size > 1)
		.map(([hash, urls]) => ({ hash, urls: [...urls] }));
}

/** Connected components over URLs sharing any mirrored hash — one component
 * per "these URLs carry the same text" cluster. Shared by the repair script
 * and the S8 sweep so their group counts can never disagree. */
export function mirrorComponents(rows: MirrorRowLike[]): string[][] {
	const groups = mirrorGroups(rows);
	const parent = new Map<string, string>();
	const find = (x: string): string => {
		let r = x;
		while (parent.get(r) !== r) r = parent.get(r) as string;
		parent.set(x, r);
		return r;
	};
	const union = (a: string, b: string): void => {
		for (const u of [a, b]) if (!parent.has(u)) parent.set(u, u);
		parent.set(find(a), find(b));
	};
	for (const g of groups)
		for (let i = 1; i < g.urls.length; i++) union(g.urls[0], g.urls[i]);
	const components = new Map<string, string[]>();
	for (const u of parent.keys()) {
		const r = find(u);
		components.set(r, [...(components.get(r) ?? []), u]);
	}
	return [...components.values()];
}

/** Sibling-slug detector: paths identical once digits are stripped are
 * versioned/numbered siblings ("…/releases/tag/v22.0.10" vs "v23.5.2",
 * "…/sep6/integration" vs "…/sep24/integration") — distinct documents by
 * construction, whatever their bodies say. */
export function digitSiblingPaths(a: string, b: string): boolean {
	const strip = (u: string): string => {
		try {
			return new URL(u).pathname.replace(/\d+/g, "");
		} catch {
			return u.replace(/\d+/g, "");
		}
	};
	return a !== b && strip(a) === strip(b);
}

export interface UrlDocLike {
	source: string;
	hashes: Set<string>;
}

/** Liveness probe result for a URL, gathered by the caller (the repair
 * script does real HEAD requests; tests fabricate them). `finalUrl` is where
 * redirects landed. */
export interface UrlProbe {
	status: number;
	finalUrl: string;
}

export type MirrorDisposition =
	| { kind: "republication"; keep: string; drop: string; reason: string }
	| { kind: "template-siblings"; reason: string }
	| { kind: "boilerplate-overlap"; reason: string }
	| { kind: "ambiguous"; reason: string };

const normalizeUrl = (u: string): string => u.replace(/\/$/, "");

/**
 * Classify one connected component of mirrored URLs. Only a two-URL,
 * same-source, WHOLE-DOC-identical pair with redirect/dead-mirror proof
 * becomes an actionable republication; everything else is enumerated.
 */
export function classifyMirrorComponent(
	urls: string[],
	byUrl: Map<string, UrlDocLike>,
	probes?: Map<string, UrlProbe>,
): MirrorDisposition {
	const sources = new Set(urls.map((u) => byUrl.get(u)?.source ?? "?"));
	if (sources.size > 1)
		return {
			kind: "ambiguous",
			reason: `cross-source mirror (${[...sources].join(", ")}) — needs a human pick`,
		};
	if (urls.length === 2 && digitSiblingPaths(urls[0], urls[1]))
		return {
			kind: "template-siblings",
			reason: "slugs differ only by digits — versioned/numbered siblings",
		};
	const [a, b] = urls;
	const ha = byUrl.get(a)?.hashes ?? new Set();
	const hb = byUrl.get(b)?.hashes ?? new Set();
	const fullyIdentical =
		urls.length === 2 &&
		ha.size > 0 &&
		ha.size === hb.size &&
		[...ha].every((h) => hb.has(h));
	if (!fullyIdentical)
		return {
			kind: "boilerplate-overlap",
			reason:
				urls.length === 2
					? "docs share some chunks but are not identical — template/boilerplate text"
					: `${urls.length} URLs share chunk text — template/boilerplate class`,
		};

	// Whole-doc-identical same-source pair: canonical pick needs PROOF.
	const pa = probes?.get(a);
	const pb = probes?.get(b);
	if (pa && normalizeUrl(pa.finalUrl) === normalizeUrl(b))
		return {
			kind: "republication",
			keep: b,
			drop: a,
			reason: `${a} redirects to ${b}`,
		};
	if (pb && normalizeUrl(pb.finalUrl) === normalizeUrl(a))
		return {
			kind: "republication",
			keep: a,
			drop: b,
			reason: `${b} redirects to ${a}`,
		};
	const dead = (p?: UrlProbe): boolean =>
		p !== undefined && (p.status === 404 || p.status === 410);
	const live = (p?: UrlProbe): boolean =>
		p !== undefined && p.status >= 200 && p.status < 300;
	if (dead(pa) && live(pb))
		return {
			kind: "republication",
			keep: b,
			drop: a,
			reason: `${a} is dead (${pa?.status}); ${b} is live`,
		};
	if (dead(pb) && live(pa))
		return {
			kind: "republication",
			keep: a,
			drop: b,
			reason: `${b} is dead (${pb?.status}); ${a} is live`,
		};
	return {
		kind: "ambiguous",
		reason:
			"whole-doc-identical pair, both URLs live with no redirect — needs a human pick",
	};
}
