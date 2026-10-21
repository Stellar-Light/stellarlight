/**
 * Portions of this file are ported, with changes, from
 * stellar-experimental/stellar-raven at commit b1dc866 (Apache License 2.0),
 * and through Raven's vendored scorer from @cloudflare/codemode 0.4.2 (MIT
 * License, Copyright (c) 2025 Cloudflare, Inc.). See THIRD-PARTY-NOTICES.md
 * and LICENSES/ for the notices and license texts.
 *
 * Raven routing-gate replica: would Raven accept this OpenAPI spec, and which
 * of its routing questions move?
 *
 * Raven builds its catalog from our spec and absorbs a new version only when
 * three offline routing gates hold (eval/gates.json in its repo): the legacy
 * lane (338 questions, top-1/3/5 within a band of the accepted totals), the
 * skills lane (top-1 floor) and the frozen 49-case holdout (rank floors and a
 * forbidden-capture ceiling). In practice it also holds any version that lowers
 * an accepted total or flips one question from hit to miss in any of its 544
 * routing rows, the two diagnostic lanes included (1.9.71 and 1.9.78 were held
 * inside the band for exactly that). This script answers the same question
 * offline, before we ship.
 *
 *   pnpm raven:gate --raven <stellar-raven checkout> [--spec <openapi.json>] [--json <out>]
 *
 *   --raven  a checkout of github.com/stellar-experimental/stellar-raven
 *            (git clone --depth 1). Read as DATA only: nothing in it is run.
 *            Default: $RAVEN_DIR.
 *   --spec   the candidate spec as JSON (a PR's specs/openapi.json, a
 *            production download). Default: this tree's src/lib/openapi-spec.ts.
 *   --json   also write the full per-question report.
 *   --baseline-only  stop after the self-check.
 *
 * Self-check first, every run: score Raven's committed manifest and reproduce
 * eval/gates.json acceptedTotals exactly, then rebuild the committed Scout and
 * stellarDocs entries from Raven's own inventory, every field identical but
 * provenance (source URL, fetch time). Either miss
 * exits 2, as does a changed ported source file (PORTED_FROM_RAVEN), a missing
 * --raven, or a thrown error: re-port before trusting a verdict. Exit 0 =
 * Raven would accept, 1 = it would hold (gate breach, a lower accepted total,
 * a per-question hit-to-miss flip in any of the 544 rows across five lanes:
 * 338 legacy, 23 skills, 49 holdout, 122 extended, 12 protocol; or a catalog
 * build guard). Question counts come from Raven's case files, the same for
 * the baseline and the candidate.
 *
 * Ported from Raven at commit b1dc866 (2026-10-15):
 *   src/catalog/vendor/search-scoring.ts  field scorer and coverage gate
 *   src/catalog/scoring.ts                keyword blends, stopword rescue,
 *                                         aliases, acronym rescue, diversity
 *   src/catalog/search.ts                 searchCatalogPage hit selection
 *                                         (signatures and advisories skipped:
 *                                         they never change hits)
 *   src/catalog/known-aliases.ts, skill-search-admission.ts, id.ts
 *   src/catalog/extract-keywords.ts, extract-routing-phrases.ts
 *   scripts/build-catalog.mjs             buildScout, routing keywords and
 *                                         phrases, schema keywords (DF filter),
 *                                         buildStellarDocs + title keywords,
 *                                         exposure and leak guards
 *   scripts/description-notes.mjs, emitted-text-guard.mjs
 *   eval/run-routing.mjs, eval/lib/grade.mjs  lanes, grading, gate rule
 * Data is read from the checkout at run time (exclusions, scrubs, notes,
 * retrieval profiles, cases, thresholds), never copied here. Lumenloop and
 * skills entries come from the committed manifest as is: our spec cannot move
 * them. stellarDocs keywords are rebuilt because Raven's title filter reads
 * Scout vocabulary.
 *
 * Validated 2026-10-20 beyond the self-check: our 1.9.72 snapshot reproduces
 * Raven's own fresh-1.9.72 run (.agents/rounds/2026-10-08-routing-repair in its
 * repo) on every lane total, all 8 graded flips and 81 of 84 moved rows; the
 * other 3 are the docs-title refresh Raven ran alongside. 1.9.78 gives the
 * 220/295/325/111 its drift issue reports.
 *
 * Pre-ship: run it on any change to an operation's summary, description,
 * operationId, x-routing, or schema property names and enums.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * The Raven source files this script ports, hashed at commit b1dc866. Any
 * difference fails the self-check: Raven can change its scorer without
 * changing its accepted totals, and a port of old code would then grade a
 * spec by rules Raven no longer runs.
 */
const PORTED_FROM_RAVEN: Record<string, string> = {
	"src/catalog/vendor/search-scoring.ts":
		"718924d10533ea49d472602f600ece0e4d7a0aae3e9e0ca5a95d9a8c6e611b14",
	"src/catalog/scoring.ts":
		"5c2d39dbefae23a89abd07a07eba61f05a3116f9477900f0b1324f1aa086781a",
	"src/catalog/search.ts":
		"02e8c9b3512ca791582a29c9a21f1baba8ea347490e7cec75b5041a5aa7945fe",
	"src/catalog/known-aliases.ts":
		"fbff3fb8eeb0a256020fca2e93f889e7b5c474526a3baf4d576ed3a4a44b3db2",
	"src/catalog/skill-search-admission.ts":
		"6c26fb77db5663db6b5774f494e428db338213faca197eec5935b65a5d1744d3",
	"src/catalog/id.ts":
		"f39bd39a88d171956a1760ae451c559fea5363413b24625f0fbf64c42cead104",
	"src/catalog/extract-keywords.ts":
		"598a0d012a4a4b0855092547f2d61e0cf63e53b9c66c41a45a2c98978a8f684e",
	"src/catalog/extract-routing-phrases.ts":
		"943251c31eb5ce37ea27ee960ad7aa707a80793df0dfdda8c77df7d16b247812",
	"scripts/build-catalog.mjs":
		"ee74cbd0f454fcb1c9befcfe35335d1efdda35b1a3ca6981a6bbc485f32dfa6b",
	"scripts/description-notes.mjs":
		"7dcc25e2d52672cdff2fb9ee3916c78d64faf5ee6ccf1816d097e63dcc68c908",
	"scripts/emitted-text-guard.mjs":
		"4ba4fa5df05cde34ba3516f4fd4cd2c91d1b09c6725a2d65ae83c47830e75717",
	"eval/run-routing.mjs":
		"61fdb67b1d8cc17d81afd3719d68e3e56f398104c15d93744a26d701841c11bb",
	"eval/lib/grade.mjs":
		"86d42c16038821629ad517cf9db0a8a6238a197caea8917801463e9986c3a8cf",
};

type Json = Record<string, unknown>;
interface Phrase {
	field: string;
	tokens: string[];
}
interface Profile {
	lane: string;
	recoverWith: Array<{ id: string; relation: string; on: string[] }>;
}
interface Entry {
	id: string;
	service: string;
	kind: string;
	description: string;
	keywords?: string[];
	routingKeywords?: string[];
	routingPhrases?: Phrase[];
	routingExclusions?: Array<{ tokens: string[] }>;
	knownAliases?: string[];
	knownAliasTriggers?: string[];
	retrievalProfile?: Profile;
	searchable?: boolean;
	inputSchema?: unknown;
	outputSchema?: unknown;
	transport?: unknown;
	provenance?: unknown;
}

// --- vendor scorer (src/catalog/vendor/search-scoring.ts) --------------------

function normalizeSearchText(value: string): string {
	return value
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/[_./:#-]+/g, " ")
		.toLowerCase()
		.trim();
}

function tokenize(value: string): string[] {
	return normalizeSearchText(value)
		.split(/[^a-z0-9]+/)
		.map((t) => t.trim())
		.filter(Boolean);
}

interface Field {
	raw: string;
	tokens: string[];
	set: Set<string>;
}
// Memo only: Raven re-prepares every field per call; same result.
const fieldCache = new Map<string, Field>();
function prepareField(value: string): Field {
	let f = fieldCache.get(value);
	if (!f) {
		const tokens = tokenize(value);
		f = { raw: normalizeSearchText(value), tokens, set: new Set(tokens) };
		fieldCache.set(value, f);
	}
	return f;
}

function scoreField(
	query: string,
	queryTokens: readonly string[],
	field: Field,
	weight: number,
): { score: number; matched: Set<string>; exactPhrase: boolean } {
	const matched = new Set<string>();
	if (field.raw.length === 0) return { score: 0, matched, exactPhrase: false };
	let score = 0;
	const exactPhrase = query.length > 0 && field.raw.includes(query);
	if (query.length > 0) {
		if (field.raw === query) score += weight * 14;
		else if (field.raw.startsWith(query)) score += weight * 9;
		else if (exactPhrase) score += weight * 6;
	}
	for (const token of queryTokens) {
		if (field.set.has(token)) {
			score += weight * 4;
			matched.add(token);
		} else if (
			field.tokens.some((c) => c.startsWith(token) || token.startsWith(c))
		) {
			score += weight * 2;
			matched.add(token);
		} else if (field.raw.includes(token)) {
			score += weight;
			matched.add(token);
		}
	}
	return { score, matched, exactPhrase };
}

interface Scorable {
	id: string;
	name: string;
	service: string;
	kind: string;
	description: string;
	keywords?: string[];
	routingKeywords?: string[];
	routingPhrases?: Phrase[];
}

/** Vendor scoreEntry (gated) and scoring.ts scoreEntryUngated (gated=false):
 *  identical math except the coverage gate. */
function scoreEntry(
	entry: Scorable,
	nq: string,
	qt: readonly string[],
	gated: boolean,
): number | null {
	if (nq.length === 0 || qt.length === 0) return null;
	const fields: Array<[string, number]> = [
		[entry.id, 12],
		[entry.name, 10],
		[entry.service, 8],
		[entry.description, 5],
		[entry.kind, 2],
	];
	let score = 0;
	let exactPhrase = false;
	const matched = new Set<string>();
	for (const [value, weight] of fields) {
		const f = scoreField(nq, qt, prepareField(value), weight);
		score += f.score;
		exactPhrase ||= f.exactPhrase;
		for (const t of f.matched) matched.add(t);
	}
	if (matched.size === 0) return null;
	const coverage = matched.size / qt.length;
	if (gated && coverage < (qt.length <= 2 ? 1 : 0.6) && !exactPhrase)
		return null;
	score += coverage === 1 ? 25 : Math.round(coverage * 10);
	if (
		prepareField(entry.id).tokens[0] === qt[0] ||
		prepareField(entry.name).tokens[0] === qt[0]
	)
		score += 8;
	if (
		normalizeSearchText(entry.id) === nq ||
		normalizeSearchText(entry.name) === nq
	)
		score += 20;
	return score;
}

// --- scoring.ts --------------------------------------------------------------

const STOPWORDS: ReadonlySet<string> = new Set(
	"a about an and any are as at be been but by can could did do does doing for from get had has have how i if in into is it its just me my no not of on or our s should so some such t than that the their them then there these they this those to up was we were what when where which who whose why will with would you your".split(
		" ",
	),
);

interface Form {
	query: string;
	tokens: string[];
	contentTokens: string[];
	effective: Form;
}

function prepareQueryForm(query: string): Form {
	const tokens = tokenize(query);
	const kept = tokens.filter((t) => !STOPWORDS.has(t));
	const effectiveQuery = kept.length > 0 ? kept.join(" ") : query;
	const contentTokens = [
		...new Set(tokens.filter((t) => t.length >= 2 && !STOPWORDS.has(t))),
	];
	const form = { query, tokens, contentTokens } as Form;
	if (effectiveQuery === query) {
		form.effective = form;
		return form;
	}
	const effective = {
		query: effectiveQuery,
		tokens: kept,
		contentTokens: [...new Set(kept.filter((t) => t.length >= 2))],
	} as Form;
	effective.effective = effective;
	form.effective = effective;
	return form;
}

function canonicalRoutingToken(token: string): string {
	if (token === "people") return "person";
	if (token.endsWith("ies") && token.length > 4)
		return `${token.slice(0, -3)}y`;
	if (token.endsWith("xes") && token.length > 4) return token.slice(0, -2);
	if (token.endsWith("s") && token.length > 3) return token.slice(0, -1);
	return token;
}

function tokensOverlap(left: string, right: string): boolean {
	const l = canonicalRoutingToken(left);
	const r = canonicalRoutingToken(right);
	if (l === r) return true;
	const shorter = Math.min(l.length, r.length);
	const longer = Math.max(l.length, r.length);
	if (shorter < 4 || shorter / longer < 0.75) return false;
	return l.startsWith(r) || r.startsWith(l);
}

function hasCoherentRoutingWitness(
	phrases: readonly Phrase[] | undefined,
	queryTokens: readonly string[],
): boolean {
	if (!phrases || phrases.length === 0 || queryTokens.length < 3) return false;
	return phrases.some(
		(p) =>
			queryTokens.filter((q) => p.tokens.some((t) => tokensOverlap(t, q)))
				.length >= 2,
	);
}

type Scorer = (entry: Scorable, form: Form) => number | null;
const gatedScorer: Scorer = (e, f) =>
	scoreEntry(e, normalizeSearchText(f.query), f.tokens, true);
const ungatedScorer: Scorer = (e, f) =>
	scoreEntry(e, normalizeSearchText(f.query), f.tokens, false);

function scoreWithKeywords(
	entry: Scorable,
	query: Form,
	score: Scorer,
): number | null {
	const base = score(entry, query);
	const fields: Array<{ tokens: string[]; blend: number }> = [];
	const schemaMatches = entry.keywords
		? entry.keywords.filter((t) =>
				query.tokens.some((q) => tokensOverlap(t, q)),
			)
		: [];
	const hasSchemaEvidence =
		schemaMatches.length >= 2 ||
		(base !== null &&
			schemaMatches.some((t) => canonicalRoutingToken(t).length >= 4));
	if (entry.keywords && hasSchemaEvidence)
		fields.push({ tokens: [...new Set(entry.keywords)], blend: 0.4 });
	if (
		entry.routingKeywords &&
		(base !== null ||
			hasCoherentRoutingWitness(entry.routingPhrases, query.contentTokens))
	)
		fields.push({ tokens: [...new Set(entry.routingKeywords)], blend: 1.0 });
	if (fields.length === 0) return base;
	let blended = base ?? 0;
	let rescued: number | null = null;
	for (const field of fields) {
		const augmented = score(
			{
				...entry,
				description: `${entry.description} ${field.tokens.join(" ")}`,
			},
			query,
		);
		if (augmented === null) continue;
		if (base === null)
			rescued = Math.max(rescued ?? 0, Math.round(augmented * field.blend));
		else blended += Math.max(0, Math.round((augmented - base) * field.blend));
	}
	return base === null ? rescued : blended;
}

function weightedScore(
	entry: Scorable,
	query: Form,
	score: Scorer,
): number | null {
	const kindWeight = entry.kind === "skill-section" ? 0.75 : 1;
	const base = scoreWithKeywords(entry, query, score);
	if (base !== null) return Math.round(base * kindWeight);
	if (query.effective === query) return null;
	const rescued = scoreWithKeywords(entry, query.effective, score);
	return rescued === null ? null : Math.round(rescued * kindWeight);
}

const QUERY_TOKEN_ALIASES = new Map([
	["tx", "transaction"],
	["txn", "transaction"],
	["txs", "transactions"],
	["acct", "account"],
	["addr", "address"],
]);

const ACRONYM_WORDS = new Set([
	...STOPWORDS,
	..."all one two three four five six seven eight nine ten zero only none each every both other either neither must may might shall never always yes true false note use read write".split(
		" ",
	),
]);

interface Prepared {
	original: Form;
	canonical: Form | null;
	acronyms: Array<{ acronym: string; contextTokens: string[]; form: Form }>;
}

function prepareScoringQuery(
	query: string,
	ordinaryWords: ReadonlySet<string>,
): Prepared {
	const tokens = tokenize(query);
	const canonical = tokens.some((t) => QUERY_TOKEN_ALIASES.has(t))
		? tokens.map((t) => QUERY_TOKEN_ALIASES.get(t) ?? t).join(" ")
		: null;
	const acronyms: Prepared["acronyms"] = [];
	const at = tokenize(canonical ?? query);
	outer: for (let start = 0; start < at.length; start++) {
		let acronym = "";
		for (let end = start; end < Math.min(at.length, start + 6); end++) {
			const token = at[end];
			if (!token || STOPWORDS.has(token) || !/^[a-z]{2,}$/.test(token)) break;
			acronym += token.charAt(0);
			if (end - start < 2) continue;
			if (ACRONYM_WORDS.has(acronym) || ordinaryWords.has(acronym)) continue;
			const outside = [...at.slice(0, start), ...at.slice(end + 1)];
			const contextTokens = outside.filter(
				(t) => t.length >= 2 && !STOPWORDS.has(t),
			);
			if (contextTokens.length === 0) continue;
			acronyms.push({
				acronym: acronym.toUpperCase(),
				contextTokens,
				form: prepareQueryForm(
					[...at.slice(0, start), acronym, ...at.slice(end + 1)].join(" "),
				),
			});
			if (acronyms.length === 32) break outer;
		}
	}
	return {
		original: prepareQueryForm(query),
		canonical: canonical === null ? null : prepareQueryForm(canonical),
		acronyms,
	};
}

function aliasMaxScore(
	entry: Scorable,
	q: Prepared,
	score: Scorer,
): number | null {
	const base = weightedScore(entry, q.original, score);
	if (q.canonical === null) return base;
	const alt = weightedScore(entry, q.canonical, score);
	if (alt === null) return base;
	return base === null ? alt : Math.max(base, alt);
}

/** scoreEntryWeighted: gated pipeline plus source-witnessed acronym rescue. */
function scoreEntryWeighted(entry: Scorable, q: Prepared): number | null {
	let best = aliasMaxScore(entry, q, gatedScorer);
	if (best !== null || q.acronyms.length === 0) return best;
	const ungated = aliasMaxScore(entry, q, ungatedScorer);
	const acronyms = new Set(entry.description.match(/\b[A-Z]{3,6}\b/g) ?? []);
	const entryTokens = new Set(
		tokenize(`${entry.id} ${entry.name} ${entry.description}`).map(
			canonicalRoutingToken,
		),
	);
	for (const v of q.acronyms) {
		if (!acronyms.has(v.acronym)) continue;
		if (!v.contextTokens.some((t) => entryTokens.has(canonicalRoutingToken(t))))
			continue;
		const alt = weightedScore(entry, v.form, gatedScorer);
		if (alt !== null && (ungated === null || alt >= ungated))
			best = best === null ? alt : Math.max(best, alt);
	}
	return best;
}

const scoreEntryWeightedUngated = (entry: Scorable, q: Prepared) =>
	aliasMaxScore(entry, q, ungatedScorer);

const serviceQuota = (limit: number) => Math.max(2, Math.ceil(limit * 0.4));

function diversifyByService<T extends { entry: Entry }>(
	candidates: T[],
	limit: number,
): T[] {
	if (candidates.length <= limit) return candidates.slice(0, limit);
	const quota = serviceQuota(limit);
	const perService = new Map<string, number>();
	const picked: T[] = [];
	const overflow: T[] = [];
	for (const item of candidates) {
		if (picked.length >= limit) break;
		const used = perService.get(item.entry.service) ?? 0;
		if (used < quota) {
			picked.push(item);
			perService.set(item.entry.service, used + 1);
		} else overflow.push(item);
	}
	for (const item of overflow) {
		if (picked.length >= limit) break;
		picked.push(item);
	}
	const rank = new Map(candidates.map((c, i) => [c, i]));
	return picked.sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0));
}

// --- known-aliases.ts, skill-search-admission.ts, id.ts ----------------------

const normalizeAliasSequence = (v: string) =>
	v.toLowerCase().replace(/[^a-z0-9]+/g, "");

function queryContainsAliasTrigger(
	queryTokens: readonly string[],
	trigger: string,
): boolean {
	const t = normalizeAliasSequence(trigger);
	if (!t) return false;
	for (let start = 0; start < queryTokens.length; start++) {
		let candidate = "";
		for (let end = start; end < queryTokens.length; end++) {
			candidate += queryTokens[end];
			if (candidate === t) return true;
			if (candidate.length >= t.length) break;
		}
	}
	return false;
}

function lastIdSegment(id: string): string {
	const segments = (id.split("#")[0] ?? id).split(".");
	return segments[segments.length - 1] ?? id;
}

function containsSequence(
	haystack: readonly string[],
	needle: readonly string[],
): boolean {
	if (needle.length === 0 || needle.length > haystack.length) return false;
	return haystack.some((_, s) => needle.every((t, o) => haystack[s + o] === t));
}

function regularPluralBase(token: string): string | null {
	if (token.length < 5 || !token.endsWith("s") || token.endsWith("ss"))
		return null;
	return token.slice(0, -1);
}

function admitsWholeSkill(
	entry: Entry,
	query: string,
	queryTokens: readonly string[],
	aliasTokens: readonly string[],
): boolean {
	if (queryTokens.length === 0) return false;
	const name = lastIdSegment(entry.id);
	const nq = normalizeSearchText(query);
	if (nq === normalizeSearchText(entry.id) || nq === normalizeSearchText(name))
		return true;
	const nameTokens = tokenize(name);
	if (containsSequence(queryTokens, nameTokens)) return true;
	if (
		entry.knownAliases?.length &&
		entry.knownAliasTriggers?.some((t) =>
			queryContainsAliasTrigger(aliasTokens, t),
		)
	)
		return true;
	const qset = new Set(queryTokens);
	if (nameTokens.length === 1 && qset.has(nameTokens[0] ?? "")) return true;
	if (nameTokens.some((t) => t.length >= 6 && qset.has(t))) return true;
	const codes = [...entry.description.matchAll(/\b[A-Za-z0-9]+\b/g)].flatMap(
		([token]) => {
			if (token.length < 2 || token.length > 5) return [];
			const upper = [...token].filter((c) => /[A-Z]/.test(c)).length;
			if (upper < 2 && !/\d/.test(token)) return [];
			const split = tokenize(token);
			const folded = [token.toLowerCase()];
			return split.length === 1 && split[0] === folded[0]
				? [split]
				: [split, folded];
		},
	);
	if (codes.some((seq) => containsSequence(queryTokens, seq))) return true;
	const descTokens = tokenize(entry.description);
	return queryTokens.some(
		(q) =>
			q.length >= 5 &&
			!STOPWORDS.has(q) &&
			descTokens.some(
				(d) =>
					q === d || regularPluralBase(q) === d || regularPluralBase(d) === q,
			),
	);
}

// --- search.ts (hit selection only) ------------------------------------------

interface Catalog {
	entries: Entry[];
	discriminative: Set<string>;
	ordinaryWords: Set<string>;
}

function makeCatalog(entries: Entry[]): Catalog {
	const freq = new Map<string, number>();
	const ordinaryWords = new Set<string>();
	for (const e of entries) {
		const toks = new Set(
			tokenize(
				[
					e.id,
					e.description,
					...(e.keywords ?? []),
					...(e.routingKeywords ?? []),
				].join(" "),
			).map(canonicalRoutingToken),
		);
		for (const t of toks) freq.set(t, (freq.get(t) ?? 0) + 1);
		for (const w of `${lastIdSegment(e.id)} ${e.description}`.match(
			/[A-Za-z0-9_-]+/g,
		) ?? [])
			if (/^[a-z]{3,6}$/.test(w)) ordinaryWords.add(w);
	}
	const discriminative = new Set(
		[...freq].filter(([, n]) => n === 1).map(([t]) => t),
	);
	return { entries, discriminative, ordinaryWords };
}

function uniqueContentTokens(value: string | readonly string[]): string[] {
	const tokens = typeof value === "string" ? tokenize(value) : value;
	return [...new Set(tokens.filter((t) => t.length >= 2 && !STOPWORDS.has(t)))];
}

function routingConceptToken(token: string): string {
	const c =
		token.endsWith("ing") && token.length > 5 ? token.slice(0, -3) : token;
	return c === "token" || c === "asset" ? "asset" : c;
}

function routingIntentCoverage(
	tokens: readonly string[],
	queryTokens: readonly string[],
): number {
	return queryTokens.filter((q) =>
		tokens.some((s) =>
			tokensOverlap(routingConceptToken(s), routingConceptToken(q)),
		),
	).length;
}

function negativeRoutingIntentCoverage(
	tokens: readonly string[],
	queryTokens: readonly string[],
	queryWords: readonly string[],
): number {
	for (let i = 0; i < tokens.length - 1; i++) {
		if (tokens[i] !== "non") continue;
		const excluded = tokens[i + 1] ?? "";
		const hasModifier = queryWords.some(
			(w, qi) =>
				(w === "non" || w === "not") &&
				qi + 1 < queryWords.length &&
				tokensOverlap(excluded, queryWords[qi + 1] ?? ""),
		);
		if (!hasModifier) return 0;
	}
	return routingIntentCoverage(tokens, queryTokens);
}

function completeInputEnumWitnesses(
	entry: Entry,
	queryTokens: readonly string[],
): { count: number; tokens: Set<string> } {
	const schema = entry.inputSchema as
		| { properties?: Record<string, { enum?: unknown[] }> }
		| null
		| undefined;
	const forms = [...queryTokens];
	for (let i = 0; i < queryTokens.length - 1; i++)
		forms.push(`${queryTokens[i]}${queryTokens[i + 1]}`);
	let count = 0;
	const tokens = new Set<string>();
	for (const property of Object.values(schema?.properties ?? {})) {
		const values = Array.isArray(property.enum) ? property.enum : [];
		const hit = values.find((v) => {
			if (typeof v !== "string") return false;
			const vt = uniqueContentTokens(v);
			return (
				vt.length > 0 && vt.every((t) => forms.some((q) => tokensOverlap(t, q)))
			);
		});
		if (typeof hit === "string") {
			count++;
			for (const t of uniqueContentTokens(hit))
				tokens.add(canonicalRoutingToken(t));
		}
	}
	return { count, tokens };
}

function hasSpecificRoutingVocabularyWitness(
	entry: Entry,
	queryTokens: readonly string[],
): boolean {
	if (!entry.routingKeywords?.length || queryTokens.length < 3) return false;
	const vocab = new Set(entry.routingKeywords.map(canonicalRoutingToken));
	const n = queryTokens.filter((t) =>
		vocab.has(canonicalRoutingToken(t)),
	).length;
	return n >= 3 && n * 2 >= queryTokens.length;
}

const GENERIC_ROUTING_ACTION_TOKENS = new Set(
	"compare differ find get list search show".split(" "),
);

function discriminativeDirectoryVocabularyCoverage(
	entry: Entry,
	queryTokens: readonly string[],
	discriminative: ReadonlySet<string>,
): number | null {
	if (
		entry.retrievalProfile?.lane !== "directory" ||
		!entry.routingKeywords?.length
	)
		return null;
	const vocab = new Set(entry.routingKeywords.map(canonicalRoutingToken));
	const matched = queryTokens
		.map(canonicalRoutingToken)
		.filter((t) => vocab.has(t));
	const coverage = new Set(matched).size;
	if (coverage < 2) return null;
	const enumWitness = completeInputEnumWitnesses(entry, queryTokens);
	if (enumWitness.count < 1) return null;
	return matched.some((token) => {
		if (
			enumWitness.tokens.has(token) ||
			!discriminative.has(token) ||
			GENERIC_ROUTING_ACTION_TOKENS.has(token)
		)
			return false;
		const fields = new Set(
			(entry.routingPhrases ?? [])
				.filter((p) =>
					p.tokens.some((pt) => canonicalRoutingToken(pt) === token),
				)
				.map((p) => p.field),
		);
		return (
			fields.has("useWhen") &&
			fields.has("exampleQuestions") &&
			!fields.has("purpose") &&
			!fields.has("keywords")
		);
	})
		? coverage
		: null;
}

const GENERIC_OPERATION_VERBS = new Set(["get", "list", "search"]);

function rejectsRoutingIntent(
	entry: Entry,
	queryTokens: readonly string[],
	discriminative: ReadonlySet<string>,
	queryWords: readonly string[],
): boolean {
	if (!entry.routingExclusions?.length) return false;
	const negative = Math.max(
		0,
		...entry.routingExclusions.map((p) =>
			negativeRoutingIntentCoverage(p.tokens, queryTokens, queryWords),
		),
	);
	const positive = Math.max(
		0,
		...(entry.routingPhrases ?? []).map((p) =>
			routingIntentCoverage(p.tokens, queryTokens),
		),
	);
	if (negative >= 2 && negative + 1 >= positive) return true;
	if (positive >= 2) return false;
	if (completeInputEnumWitnesses(entry, queryTokens).count >= 2) return false;
	if (negative === 0 && hasSpecificRoutingVocabularyWitness(entry, queryTokens))
		return false;
	if (
		negative === 0 &&
		discriminativeDirectoryVocabularyCoverage(
			entry,
			queryTokens,
			discriminative,
		) !== null
	)
		return false;
	const identity = uniqueContentTokens(lastIdSegment(entry.id)).filter(
		(t) => !GENERIC_OPERATION_VERBS.has(t),
	);
	return !queryTokens.some((q) => identity.some((i) => tokensOverlap(q, i)));
}

interface Query {
	text: string;
	scoring: Prepared;
	aliasTokens: string[];
	contentTokens: string[];
	rejections: Map<Entry, boolean>;
}

function prepareSearchQuery(catalog: Catalog, text: string): Query {
	const scoring = prepareScoringQuery(text, catalog.ordinaryWords);
	return {
		text,
		scoring,
		aliasTokens: tokenize(text).map(normalizeAliasSequence).filter(Boolean),
		contentTokens: scoring.original.contentTokens,
		rejections: new Map(),
	};
}

function scorableOf(entry: Entry, aliasTokens: readonly string[]): Scorable {
	const triggered = entry.knownAliasTriggers?.some((t) =>
		queryContainsAliasTrigger(aliasTokens, t),
	);
	const name =
		triggered && entry.knownAliases?.length
			? `${lastIdSegment(entry.id)} ${entry.knownAliases
					.flatMap(tokenize)
					.filter((t) => !STOPWORDS.has(t))
					.join(" ")}`
			: lastIdSegment(entry.id);
	return {
		id: entry.id,
		name,
		service: entry.service,
		kind: entry.kind,
		description: entry.description,
		keywords: entry.keywords,
		routingKeywords: entry.routingKeywords,
		routingPhrases: entry.routingPhrases,
	};
}

interface Candidate {
	entry: Entry;
	score: number;
}

function isRejected(catalog: Catalog, q: Query, entry: Entry): boolean {
	let rejected = q.rejections.get(entry);
	if (rejected === undefined) {
		rejected = rejectsRoutingIntent(
			entry,
			q.contentTokens,
			catalog.discriminative,
			q.scoring.original.tokens,
		);
		q.rejections.set(entry, rejected);
	}
	return rejected;
}

function scoreCandidates(
	catalog: Catalog,
	q: Query,
	scoreFn: (e: Scorable, p: Prepared) => number | null,
	include?: (entry: Entry) => boolean,
): Candidate[] {
	const scored: Candidate[] = [];
	for (const entry of catalog.entries) {
		if (entry.searchable === false) continue;
		if (include && !include(entry)) continue;
		if (entry.kind === "operation" && isRejected(catalog, q, entry)) continue;
		const score = scoreFn(scorableOf(entry, q.aliasTokens), q.scoring);
		if (score === null) continue;
		if (
			entry.kind === "skill" &&
			!admitsWholeSkill(entry, q.text, q.scoring.original.tokens, q.aliasTokens)
		)
			continue;
		scored.push({ entry, score });
	}
	return scored.sort(compareCandidates);
}

function compareCandidates(a: Candidate, b: Candidate): number {
	return (
		b.score - a.score ||
		(a.entry.id < b.entry.id ? -1 : a.entry.id > b.entry.id ? 1 : 0)
	);
}

function structuredIntentCoverage(
	entry: Entry,
	queryTokens: readonly string[],
): number | null {
	const desc = new Set(uniqueContentTokens(entry.description));
	if (queryTokens.filter((t) => desc.has(t)).length < 2) return null;
	let best: number | null = null;
	for (const phrase of entry.routingPhrases ?? []) {
		const pt = new Set(uniqueContentTokens(phrase.tokens));
		const pm = queryTokens.filter((t) => pt.has(t));
		if (pm.length < 2) continue;
		if (!pm.some((t) => !desc.has(t))) continue;
		const covered = queryTokens.filter((t) => desc.has(t) || pt.has(t)).length;
		best = Math.max(best ?? 0, covered);
	}
	return best;
}

function intentCoverage(entry: Entry, queryTokens: readonly string[]): number {
	const desc = new Set(uniqueContentTokens(entry.description));
	return Math.max(
		queryTokens.filter((t) => desc.has(t)).length,
		structuredIntentCoverage(entry, queryTokens) ?? 0,
	);
}

const VOCABULARY_INTENT_TOKENS = new Set(
	"allowed controlled distinct exact filter list values vocabulary".split(" "),
);

function vocabularyIntentCoverage(
	entry: Entry,
	queryTokens: readonly string[],
): number | null {
	const d = entry.description.toLowerCase();
	if (
		!d.includes("controlled vocabulary") &&
		!/\bdistinct\b[^.\n]*\bvalues\b/.test(d)
	)
		return null;
	if (!queryTokens.some((t) => VOCABULARY_INTENT_TOKENS.has(t))) return null;
	const identity = uniqueContentTokens(lastIdSegment(entry.id))
		.filter((t) => t !== "get")
		.slice(-2);
	if (!queryTokens.some((q) => identity.some((i) => tokensOverlap(q, i))))
		return null;
	const desc = uniqueContentTokens(entry.description);
	return queryTokens.filter((q) => desc.some((t) => tokensOverlap(q, t)))
		.length;
}

const preservesCompleteStructuredIntent = (
	c: Candidate,
	queryTokens: readonly string[],
) =>
	c.entry.kind === "operation" &&
	c.entry.retrievalProfile?.lane !== "detail" &&
	structuredIntentCoverage(c.entry, queryTokens) === queryTokens.length;

function targetedIntentCoverage(
	c: Candidate,
	queryTokens: readonly string[],
	discriminative: ReadonlySet<string>,
): number | null {
	if (c.entry.kind !== "operation") return null;
	const vocabulary = vocabularyIntentCoverage(c.entry, queryTokens);
	const directory = discriminativeDirectoryVocabularyCoverage(
		c.entry,
		queryTokens,
		discriminative,
	);
	if (vocabulary === null) return directory;
	if (directory === null) return vocabulary;
	return Math.max(vocabulary, directory);
}

function preserveIntentWithinServiceQuota(
	selected: Candidate[],
	candidates: Candidate[],
	qt: readonly string[],
	limit: number,
	disc: ReadonlySet<string>,
): Candidate[] {
	if (selected.length < limit) return selected;
	const quota = serviceQuota(limit);
	const selectedIds = new Set(selected.map((c) => c.entry.id));
	const indexesByService = new Map<string, number[]>();
	for (const [i, c] of selected.entries()) {
		const list = indexesByService.get(c.entry.service) ?? [];
		list.push(i);
		indexesByService.set(c.entry.service, list);
	}
	const preserved = selected.slice();
	const at = (i: number) => preserved[i] as Candidate;
	for (const [service, indexes] of indexesByService) {
		if (indexes.length !== quota) continue;
		const replacement = candidates.find(
			(c) =>
				c.entry.service === service &&
				!selectedIds.has(c.entry.id) &&
				(preservesCompleteStructuredIntent(c, qt) ||
					targetedIntentCoverage(c, qt, disc) !== null),
		);
		if (!replacement) continue;
		const victimIndex = indexes
			.slice(1)
			.sort(
				(l, r) =>
					intentCoverage(at(l).entry, qt) - intentCoverage(at(r).entry, qt) ||
					at(l).score - at(r).score ||
					r - l,
			)[0];
		if (victimIndex === undefined) continue;
		const targeted = targetedIntentCoverage(replacement, qt, disc);
		if (
			(targeted !== null ? targeted : intentCoverage(replacement.entry, qt)) <=
			(targeted !== null
				? (targetedIntentCoverage(at(victimIndex), qt, disc) ?? 0)
				: intentCoverage(at(victimIndex).entry, qt))
		)
			continue;
		selectedIds.delete(at(victimIndex).entry.id);
		selectedIds.add(replacement.entry.id);
		preserved[victimIndex] = replacement;
	}
	const counts = new Map<string, number>();
	for (const c of preserved)
		counts.set(c.entry.service, (counts.get(c.entry.service) ?? 0) + 1);
	const cross = candidates.find(
		(c) =>
			!selectedIds.has(c.entry.id) &&
			(counts.get(c.entry.service) ?? 0) < quota &&
			targetedIntentCoverage(c, qt, disc) !== null,
	);
	if (cross) {
		const victim = preserved
			.map((c, index) => ({ c, index }))
			.filter(
				({ c, index }) =>
					index > 0 &&
					(counts.get(c.entry.service) ?? 0) > 1 &&
					targetedIntentCoverage(c, qt, disc) === null,
			)
			.sort((l, r) => l.c.score - r.c.score)[0];
		if (victim) preserved[victim.index] = cross;
	}
	return preserved.sort(compareCandidates);
}

function preserveStrongBackfill(
	selected: Candidate[],
	backfill: Candidate[],
	qt: readonly string[],
	limit: number,
): Candidate[] {
	if (selected.length < limit || backfill.length === 0) return selected;
	const quota = serviceQuota(limit);
	const counts = new Map<string, number>();
	const ids = new Set<string>();
	for (const c of selected) {
		counts.set(c.entry.service, (counts.get(c.entry.service) ?? 0) + 1);
		ids.add(c.entry.id);
	}
	for (const candidate of backfill) {
		if (ids.has(candidate.entry.id)) continue;
		const candidateCount = counts.get(candidate.entry.service) ?? 0;
		const victim = selected
			.map((v, index) => ({ v, index }))
			.filter(
				({ v, index }) =>
					index > 0 &&
					candidate.score >= 1.6 * v.score &&
					intentCoverage(candidate.entry, qt) > intentCoverage(v.entry, qt) &&
					candidateCount < quota &&
					(counts.get(v.entry.service) ?? 0) > quota,
			)
			.sort((l, r) => l.v.score - r.v.score)[0];
		if (!victim) continue;
		selected[victim.index] = candidate;
		return selected;
	}
	return selected;
}

function fullPageUngatedAdmission(
	selected: readonly Candidate[],
	gatedIds: ReadonlySet<string>,
	qt: readonly string[],
	limit: number,
	disc: ReadonlySet<string>,
): (entry: Entry) => boolean {
	const quota = serviceQuota(limit);
	const counts = new Map<string, number>();
	for (const c of selected)
		counts.set(c.entry.service, (counts.get(c.entry.service) ?? 0) + 1);
	const replaceable = selected
		.filter((c, i) => i > 0 && (counts.get(c.entry.service) ?? 0) > quota)
		.map((c) => intentCoverage(c.entry, qt));
	return (entry) => {
		if (gatedIds.has(entry.id)) return false;
		const c = { entry, score: 0 };
		if (
			preservesCompleteStructuredIntent(c, qt) ||
			targetedIntentCoverage(c, qt, disc) !== null
		)
			return true;
		if ((counts.get(entry.service) ?? 0) >= quota || replaceable.length === 0)
			return false;
		const coverage = intentCoverage(entry, qt);
		return replaceable.some((v) => coverage > v);
	};
}

function mergeCandidates(left: Candidate[], right: Candidate[]): Candidate[] {
	const merged: Candidate[] = [];
	let i = 0;
	let j = 0;
	while (i < left.length && j < right.length) {
		const l = left[i] as Candidate;
		const r = right[j] as Candidate;
		if (compareCandidates(l, r) <= 0) {
			merged.push(l);
			i++;
		} else {
			merged.push(r);
			j++;
		}
	}
	return [...merged, ...left.slice(i), ...right.slice(j)];
}

interface Hit {
	id: string;
	service: string;
	score: number;
	tier: "gated" | "backfill";
}

const FRESHNESS_INTENT_TOKENS = new Set(
	"current currently latest quarter quarterly recent recently today trend trended trending trends".split(
		" ",
	),
);

/** searchCatalog(catalog, { query, limit }).hits, as run-routing.mjs calls it. */
function searchCatalog(catalog: Catalog, text: string, limit = 5): Hit[] {
	const q = prepareSearchQuery(catalog, text);
	const disc = catalog.discriminative;
	const gated = scoreCandidates(catalog, q, scoreEntryWeighted);
	const gatedIds = new Set(gated.map((c) => c.entry.id));
	let selected = diversifyByService(gated, limit);
	const full = selected.length >= limit;
	const ungated = scoreCandidates(
		catalog,
		q,
		scoreEntryWeightedUngated,
		full
			? fullPageUngatedAdmission(
					selected,
					gatedIds,
					q.contentTokens,
					limit,
					disc,
				)
			: undefined,
	);
	const backfill = full
		? ungated
		: ungated.filter((c) => !gatedIds.has(c.entry.id));
	if (selected.length < limit) {
		const tier1 = new Set(selected.map((c) => c.entry.id));
		const rescue = diversifyByService(ungated, limit + 10).filter(
			(c) => !tier1.has(c.entry.id),
		);
		selected = [...selected, ...rescue].slice(0, limit);
	}
	selected = preserveStrongBackfill(selected, backfill, q.contentTokens, limit);
	selected = preserveIntentWithinServiceQuota(
		selected,
		mergeCandidates(gated, backfill),
		q.contentTokens,
		limit,
		disc,
	);
	// interleaveSelectedPage: gated first, then backfill bubbles left past a
	// gated hit it beats by TIER_INTERLEAVE_MARGIN (1.6).
	const page: Array<Candidate & { tier: Hit["tier"] }> = [
		...selected.filter((c) => gatedIds.has(c.entry.id)),
		...selected.filter((c) => !gatedIds.has(c.entry.id)),
	].map((c) => ({
		...c,
		tier: gatedIds.has(c.entry.id) ? "gated" : "backfill",
	}));
	for (let i = 0; i < page.length; i++) {
		for (let k = i; k > 0; k--) {
			const b = page[k] as (typeof page)[number];
			const p = page[k - 1] as (typeof page)[number];
			if (
				b.tier !== "backfill" ||
				p.tier !== "gated" ||
				b.score < 1.6 * p.score
			)
				break;
			page[k - 1] = b;
			page[k] = p;
		}
	}
	// prioritizeDatedSemanticForFreshness
	const fresh = uniqueContentTokens(text).filter((t) =>
		FRESHNESS_INTENT_TOKENS.has(t),
	).length;
	if (fresh >= 2) {
		const dated = (e: Entry) => {
			const props = (e.inputSchema as { properties?: Json } | undefined)
				?.properties;
			return (
				e.retrievalProfile?.lane === "semantic" &&
				props?.date_start !== undefined &&
				props.date_end !== undefined
			);
		};
		for (let i = 1; i < page.length; i++) {
			for (
				let k = i;
				k > 0 &&
				dated((page[k] as Candidate).entry) &&
				(page[k - 1] as Candidate).entry.retrievalProfile?.lane === "exact";
				k--
			) {
				const t = page[k - 1] as (typeof page)[number];
				page[k - 1] = page[k] as (typeof page)[number];
				page[k] = t;
			}
		}
	}
	return page.map((c) => ({
		id: c.entry.id,
		service: c.entry.service,
		score: c.score,
		tier: c.tier,
	}));
}

// --- catalog builder (scripts/build-catalog.mjs, Scout + stellarDocs) --------

function sortDeep(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortDeep);
	if (value && typeof value === "object") {
		const out: Json = {};
		for (const k of Object.keys(value).sort())
			out[k] = sortDeep((value as Json)[k]);
		return out;
	}
	return value;
}
const stableJson = (v: unknown) => JSON.stringify(sortDeep(v));
/** An entry's routing-relevant identity: everything but provenance. */
const entryKey = (e: Entry | undefined) =>
	e ? stableJson({ ...e, provenance: undefined }) : "";

function inlineRefs(
	schema: unknown,
	root: Json,
	seen = new Set<string>(),
): unknown {
	if (Array.isArray(schema))
		return schema.map((s) => inlineRefs(s, root, seen));
	if (!schema || typeof schema !== "object") return schema;
	const s = schema as Json;
	if (typeof s.$ref === "string") {
		const ref = s.$ref;
		if (!ref.startsWith("#/") || seen.has(ref)) return { ...s };
		let target: unknown = root;
		for (const seg of ref.slice(2).split("/")) {
			const key = seg.replace(/~1/g, "/").replace(/~0/g, "~");
			if (!target || typeof target !== "object") return { ...s };
			target = (target as Json)[key];
		}
		if (target === undefined) return { ...s };
		return inlineRefs(target, root, new Set(seen).add(ref));
	}
	const out: Json = {};
	for (const [k, v] of Object.entries(s)) out[k] = inlineRefs(v, root, seen);
	return out;
}

function scoutInputSchema(op: Json, pathItem: Json, openapi: Json): Json {
	const properties: Json = {};
	const required: string[] = [];
	const params = [
		...((pathItem.parameters as unknown[]) ?? []),
		...((op.parameters as unknown[]) ?? []),
	];
	for (const raw of params) {
		const param = inlineRefs(raw, openapi) as Json | null;
		if (!param?.name) continue;
		const schema = (
			param.schema ? inlineRefs(param.schema, openapi) : { type: "string" }
		) as Json;
		if (param.description && !schema.description)
			schema.description = param.description;
		properties[param.name as string] = schema;
		if (param.required) required.push(param.name as string);
	}
	const body = (
		(op.requestBody as Json | undefined)?.content as Json | undefined
	)?.["application/json"] as Json | undefined;
	if (body?.schema) {
		const inlined = inlineRefs(body.schema, openapi) as Json;
		if (inlined.type === "object" && inlined.properties) {
			for (const [n, s] of Object.entries(inlined.properties as Json))
				properties[n] = s;
			for (const n of (inlined.required as string[]) ?? []) required.push(n);
		} else {
			properties.body = inlined;
			required.push("body");
		}
	}
	if (Object.keys(properties).length === 0)
		return { type: "object", properties: {} };
	const schema: Json = { type: "object", properties };
	if (required.length > 0) schema.required = [...new Set(required)].sort();
	return schema;
}

function scoutOutputSchema(op: Json, openapi: Json): unknown {
	const r200 = (op.responses as Json | undefined)?.["200"] as Json | undefined;
	const schema = (
		(r200?.content as Json | undefined)?.["application/json"] as
			| Json
			| undefined
	)?.schema;
	return schema ? inlineRefs(schema, openapi) : null;
}

const plainText = (md: string) =>
	md
		.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/[`*]/g, "")
		.replace(/\s+/g, " ")
		.trim();
const slugify = (text: string) =>
	plainText(text)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "") || "section";
const snakeCase = (opId: string) =>
	opId.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
const regexEscape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const completePathRe = (needle: string) =>
	new RegExp(
		`(?<![\\w/.-])${regexEscape(needle)}(?![\\w/{}%+~@=:$&-]|\\.[\\w]|;\\S)`,
		"g",
	);
const HTTP_METHODS = ["get", "post", "put", "patch", "delete"];
const ALL_METHODS = [...HTTP_METHODS, "head", "options", "trace"];

function extractKeywords(body: string, exclude: string[], cap = 64): string[] {
	const excluded = new Set(exclude.flatMap(tokenize));
	const freq = new Map<string, { count: number; first: number }>();
	const tokens = tokenize(body);
	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i] as string;
		if (t.length < 2 || STOPWORDS.has(t) || excluded.has(t)) continue;
		const seen = freq.get(t);
		if (seen) seen.count += 1;
		else freq.set(t, { count: 1, first: i });
	}
	return [...freq.entries()]
		.sort((a, b) => b[1].count - a[1].count || a[1].first - b[1].first)
		.slice(0, cap)
		.map(([t]) => t);
}

const ROUTING_FIELDS = ["purpose", "useWhen", "exampleQuestions", "keywords"];

function extractRoutingPhrases(source: Record<string, string[]>): Phrase[] {
	let remaining = 256;
	const seen = new Set<string>();
	const byField = new Map<string, Phrase[]>();
	for (const field of ROUTING_FIELDS) {
		for (const text of source[field] ?? []) {
			const tokens = uniqueContentTokens(text);
			if (tokens.length < 2) continue;
			const key = tokens.join("\u0000");
			if (seen.has(key)) continue;
			seen.add(key);
			byField.set(field, [...(byField.get(field) ?? []), { field, tokens }]);
		}
	}
	const all = ROUTING_FIELDS.flatMap((f) => byField.get(f) ?? []);
	if (all.reduce((n, p) => n + p.tokens.length, 0) <= remaining) return all;
	const fair = new Map<string, number[]>();
	for (const field of ROUTING_FIELDS) {
		const len = byField.get(field)?.length ?? 0;
		const idx: number[] = [];
		for (let lo = 0, hi = len - 1; lo <= hi; lo++, hi--) {
			idx.push(lo);
			if (hi !== lo) idx.push(hi);
		}
		fair.set(field, idx);
	}
	const phrases: Phrase[] = [];
	let round = 0;
	let considered = true;
	while (remaining > 0 && considered) {
		considered = false;
		for (const field of ROUTING_FIELDS) {
			const pi = fair.get(field)?.[round];
			const phrase = pi === undefined ? undefined : byField.get(field)?.[pi];
			if (!phrase) continue;
			considered = true;
			if (phrase.tokens.length > remaining) continue;
			phrases.push(phrase);
			remaining -= phrase.tokens.length;
			if (remaining === 0) return phrases;
		}
		round++;
	}
	return phrases;
}

function extractRoutingExclusions(
	source: string[],
): Array<{ tokens: string[] }> {
	let remaining = 128;
	const seen = new Set<string>();
	const out: Array<{ tokens: string[] }> = [];
	for (const text of source) {
		const tokens = uniqueContentTokens(text.split(/\s*->\s*/u, 1)[0] ?? "");
		if (tokens.length < 2) continue;
		const key = tokens.join("\u0000");
		if (seen.has(key)) continue;
		seen.add(key);
		if (tokens.length > remaining) continue;
		out.push({ tokens });
		remaining -= tokens.length;
		if (remaining === 0) break;
	}
	return out;
}

function schemaTextParts(schema: unknown, out: string[] = []): string[] {
	if (!schema || typeof schema !== "object") return out;
	if (Array.isArray(schema)) {
		for (const item of schema) schemaTextParts(item, out);
		return out;
	}
	for (const [key, value] of Object.entries(schema)) {
		if (
			key === "properties" &&
			value &&
			typeof value === "object" &&
			!Array.isArray(value)
		) {
			for (const [prop, sub] of Object.entries(value)) {
				out.push(prop);
				schemaTextParts(sub, out);
			}
		} else if (key === "enum" && Array.isArray(value)) {
			for (const v of value) if (typeof v === "string") out.push(v);
		} else if (value && typeof value === "object") schemaTextParts(value, out);
	}
	return out;
}

/** attachOperationKeywords: schema names and enums, DF-filtered per service. */
function attachOperationKeywords(
	entries: Entry[],
	extras = new Map<string, string[]>(),
	cap = 64,
	guard?: (text: string, label: string) => void,
): Entry[] {
	const tokenSets = new Map(
		entries.map((e) => {
			const text = [
				...schemaTextParts(e.inputSchema),
				...schemaTextParts(e.outputSchema),
				...(extras.get(e.id) ?? []),
			].join("\n");
			guard?.(text, `${e.id} keyword source`);
			return [e.id, new Set(tokenize(text))] as const;
		}),
	);
	const df = new Map<string, number>();
	for (const set of tokenSets.values())
		for (const t of set) df.set(t, (df.get(t) ?? 0) + 1);
	const maxDf = Math.max(1, Math.floor(entries.length * 0.3));
	return entries.map((e) => {
		const distinctive = [...(tokenSets.get(e.id) ?? [])].filter(
			(t) => (df.get(t) ?? 0) <= maxDf,
		);
		const keywords = extractKeywords(
			distinctive.join(" "),
			[e.id, e.service, e.kind, e.description, ...(e.routingKeywords ?? [])],
			cap,
		);
		return keywords.length > 0 ? { ...e, keywords } : e;
	});
}

/** Raven's exposure and description policy, parsed from the checkout. */
interface Policy {
	excluded: Map<string, string>; // "GET /api/x" -> operationId
	optionalExcluded: Map<string, string>;
	excludedOps: Set<string>;
	nonExposedNames: Set<string>;
	absentPaths: Set<string>;
	scrubs: Record<string, string[]>;
	excludedLumenloop: string[];
	retiredSkillRe: RegExp;
	notes: Map<string, string>; // operationId -> plainText note (from manifest)
	profiles: Map<string, Profile>; // entry id -> retrievalProfile (from manifest)
}

function sourceBlock(src: string, start: string, end: string, file: string) {
	const i = src.indexOf(start);
	const j = i < 0 ? -1 : src.indexOf(end, i + start.length);
	if (i < 0 || j < 0)
		throw new Error(
			`${file}: "${start}" not found; Raven's source layout changed, update the replica's parser`,
		);
	return src.slice(i + start.length, j);
}

function loadPolicy(dir: string, manifest: { entries: Entry[] }): Policy {
	const read = (p: string) => readFileSync(join(dir, p), "utf8");
	const exposure = read("src/policy/scout-exposure.ts");
	const pairs = (block: string) =>
		new Map(
			[...block.matchAll(/\[\s*"([A-Z]+ [^"]+)"\s*,\s*"([^"]+)"\s*\]/g)].map(
				(m) => [m[1] as string, m[2] as string],
			),
		);
	const strings = (block: string) =>
		[...block.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(
			(m) => JSON.parse(`"${m[1]}"`) as string,
		);
	const excluded = pairs(
		sourceBlock(
			exposure,
			"EXCLUDED_SCOUT_OPERATIONS = new Map([",
			"]);",
			"scout-exposure.ts",
		),
	);
	const optionalExcluded = pairs(
		sourceBlock(
			exposure,
			"OPTIONAL_EXCLUDED_SCOUT_OPERATIONS = new Map([",
			"]);",
			"scout-exposure.ts",
		),
	);
	const absentPaths = new Set(
		strings(
			sourceBlock(
				exposure,
				"SCOUT_PATHS_ABSENT_FROM_SPEC = new Set(",
				");",
				"scout-exposure.ts",
			),
		),
	);
	const notesSrc = read("scripts/description-notes.mjs")
		.split("\n")
		.filter((l) => !l.trim().startsWith("//"))
		.join("\n");
	const scrubs: Record<string, string[]> = {};
	for (const m of sourceBlock(
		notesSrc,
		"SCOUT_DESCRIPTION_SCRUBS = {",
		"\n};",
		"description-notes.mjs",
	).matchAll(/(\w+):\s*\[([\s\S]*?)\]/g))
		scrubs[m[1] as string] = strings(m[2] as string);
	const excludedLumenloop = strings(
		sourceBlock(
			read("scripts/exposure.mjs"),
			"EXCLUDED_LUMENLOOP_OPS = new Set([",
			"]);",
			"exposure.mjs",
		),
	);
	const re = read("src/skills/scrub.ts").match(
		/RETIRED_SKILL_REF_RE\s*=\s*\/(.+?)\/([a-z]*);/,
	);
	if (!re)
		throw new Error("src/skills/scrub.ts: RETIRED_SKILL_REF_RE not found");
	const notes = new Map<string, string>();
	const profiles = new Map<string, Profile>();
	for (const e of manifest.entries) {
		if (e.retrievalProfile) profiles.set(e.id, e.retrievalProfile);
		if (e.service !== "scout") continue;
		const i = e.description.indexOf("\n\n");
		if (i >= 0) notes.set(lastIdSegment(e.id), e.description.slice(i + 2));
	}
	return {
		excluded,
		optionalExcluded,
		excludedOps: new Set([...excluded.keys(), ...optionalExcluded.keys()]),
		nonExposedNames: new Set([
			...excluded.values(),
			...optionalExcluded.values(),
		]),
		absentPaths,
		scrubs,
		excludedLumenloop,
		retiredSkillRe: new RegExp(re[1] as string, re[2]),
		notes,
		profiles,
	};
}

/** emitted-text-guard.mjs assertNoNonExposedRefsInText, as a message. */
function leakIn(text: string, p: Policy): string | null {
	const names = [...p.nonExposedNames].flatMap((n) => [n, snakeCase(n)]);
	const scoutName = text.match(new RegExp(`\\b(?:${names.join("|")})\\b`, "i"));
	if (scoutName) return `excluded scout operation name "${scoutName[0]}"`;
	const ll = p.excludedLumenloop.join("|");
	const qualified = text.match(
		new RegExp(`(?<![.\\w])lumenloop\\.(?:${ll})\\b`, "i"),
	);
	if (qualified) return `non-exposed operation "${qualified[0]}"`;
	const decoded = text
		.replace(/(?:%[0-9a-f]{2})+/gi, (enc) => {
			try {
				return decodeURIComponent(enc);
			} catch {
				return enc;
			}
		})
		.toLowerCase();
	for (const sig of p.excludedOps) {
		const path = sig.split(" ")[1] as string;
		if (decoded.includes(path.toLowerCase()))
			return `excluded scout endpoint path "${path}"`;
	}
	if (p.retiredSkillRe.test(text)) return "retired-skill reference";
	const bare = text.match(new RegExp(`\\b(?:${ll})\\b`, "i"));
	if (bare) return `excluded lumenloop tool name "${bare[0]}"`;
	return null;
}

function scoutRefRewrites(openapi: Json, p: Policy): Array<[string, string]> {
	const pairs: Array<[string, string]> = [];
	const bareByPath = new Map<string, string>();
	for (const [path, item] of Object.entries(openapi.paths as Json)) {
		for (const method of HTTP_METHODS) {
			const op = (item as Json)[method] as Json | undefined;
			if (!op?.operationId) continue;
			if (p.excludedOps.has(`${method.toUpperCase()} ${path}`)) continue;
			const opId = op.operationId as string;
			const callable = `scout.${opId}`;
			pairs.push([`${method.toUpperCase()} ${path}`, callable]);
			if (!bareByPath.has(path) || method === "get")
				bareByPath.set(path, callable);
			const snake = snakeCase(opId);
			if (snake !== opId) pairs.push([snake, opId]);
		}
	}
	for (const [path, callable] of bareByPath) pairs.push([path, callable]);
	return pairs.sort((a, b) => b[0].length - a[0].length);
}

function rewriteScoutRefs(
	text: string,
	pairs: Array<[string, string]>,
): string {
	let out = text;
	for (const [needle, replacement] of pairs) {
		out = needle.includes("/")
			? out.replace(completePathRe(needle), replacement)
			: out.replace(
					new RegExp(`(?<![\\w.])${regexEscape(needle)}(?![\\w])`, "g"),
					replacement,
				);
	}
	return out.replace(/(^|[\s(/])\?([a-z])/g, "$1$2");
}

function schemaScrubber(p: Policy): (value: unknown) => unknown {
	const names = new Set(
		[...p.nonExposedNames].flatMap((n) => [n.toLowerCase(), snakeCase(n)]),
	);
	const rewrites: Array<[string, string]> = [
		...[...p.excludedOps].flatMap((sig): Array<[string, string]> => {
			const path = sig.slice(sig.indexOf(" ") + 1);
			const label = `upstream ${(path.split("/").filter(Boolean).at(-1) ?? "").replaceAll("-", " ")}`;
			return [
				[sig, label],
				[path, label],
			];
		}),
		...[...p.nonExposedNames].flatMap((name): Array<[string, string]> => {
			const words = name
				.replace(/^(get|list)(?=[A-Z])/, "")
				.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
			return [name, snakeCase(name)].map((s): [string, string] => [
				s,
				`upstream ${words.toLowerCase()}`,
			]);
		}),
	].sort((a, b) => b[0].length - a[0].length);
	const scrub = (value: unknown): unknown => {
		if (Array.isArray(value)) return value.map(scrub);
		if (!value || typeof value !== "object") return value;
		const out: Json = {};
		for (const [key, item] of Object.entries(value)) {
			if (key !== "description" || typeof item !== "string") {
				out[key] = scrub(item);
				continue;
			}
			let d = item.replace(
				/\((?:[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?\s*,\s*)+[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?\)/g,
				(list) => {
					const all = list.slice(1, -1).split(/\s*,\s*/);
					const kept = all.filter(
						(n) => !names.has(n.replace(/^scout\./i, "").toLowerCase()),
					);
					if (kept.length === all.length) return list;
					return kept.length > 0 ? `(${kept.join(", ")})` : "";
				},
			);
			for (const [needle, replacement] of rewrites) {
				d = needle.includes("/")
					? d.replace(completePathRe(needle), replacement)
					: d.replace(
							new RegExp(
								`(?<![\\w])(?:scout\\.)?${regexEscape(needle)}(?![\\w])`,
								"gi",
							),
							replacement,
						);
			}
			out[key] = d;
		}
		return out;
	};
	return scrub;
}

/**
 * buildScout + attachRoutingKeywords + attachRoutingPhrases +
 * attachOperationKeywords, over an openapi object deep-sorted the way Raven's
 * refresh-inventory.mjs stores it. Build-guard failures are collected, not thrown.
 */
function buildScoutEntries(
	rawOpenapi: Json,
	p: Policy,
	problems: string[],
): Entry[] {
	const openapi = sortDeep(rawOpenapi) as Json;
	const paths = openapi.paths as Json;
	const guard = (text: string, label: string) => {
		const leak = leakIn(text, p);
		if (leak) problems.push(`ADR-0003 leak: ${label} emits ${leak}`);
	};
	// assertScoutExclusionsResolve + assertSideEffectingOpsExcluded
	const present = new Map<string, string>();
	for (const [path, item] of Object.entries(paths))
		for (const m of ALL_METHODS) {
			const op = (item as Json)[m] as Json | undefined;
			if (!op) continue;
			present.set(`${m.toUpperCase()} ${path}`, op.operationId as string);
			if (
				HTTP_METHODS.includes(m) &&
				op["x-side-effecting"] === true &&
				!p.excludedOps.has(`${m.toUpperCase()} ${path}`)
			)
				problems.push(
					`exposure gate: "${m.toUpperCase()} ${path}" is x-side-effecting but not excluded`,
				);
		}
	for (const sig of p.excluded.keys())
		if (!present.has(sig))
			problems.push(`excluded Scout op no longer in the spec: ${sig}`);
	const optionalPaths = new Set(
		[...p.optionalExcluded.keys()].map((s) => s.split(" ")[1]),
	);
	for (const sig of present.keys())
		if (optionalPaths.has(sig.split(" ")[1]) && !p.excludedOps.has(sig))
			problems.push(`unreviewed Scout op at an excluded path: ${sig}`);
	for (const [sig, name] of [...p.excluded, ...p.optionalExcluded])
		if (present.has(sig) && present.get(sig) !== name)
			problems.push(`excluded Scout op renamed: ${sig}`);
	for (const path of p.absentPaths)
		if (path in paths)
			problems.push(`previously unlisted Scout path appeared: ${path}`);

	const scrub = schemaScrubber(p);
	const refPairs = scoutRefRewrites(openapi, p);
	const base =
		((openapi.servers as Json[] | undefined)?.[0]?.url as string) ??
		"https://stellarlight.xyz";
	const entries: Entry[] = [];
	const routingBodies = new Map<string, string>();
	const routingSources = new Map<string, Record<string, string[]>>();
	const consumedNotes = new Set<string>();
	for (const [path, pathItem] of Object.entries(paths)) {
		for (const method of HTTP_METHODS) {
			const op = (pathItem as Json)[method] as Json | undefined;
			if (!op) continue;
			const httpMethod = method.toUpperCase();
			if (p.excludedOps.has(`${httpMethod} ${path}`)) continue;
			const opId = (op.operationId as string) ?? `${method}_${slugify(path)}`;
			let raw = [op.summary, op.description]
				.filter(Boolean)
				.join(". ")
				.replace(/\.\.\s/g, ". ");
			for (const needle of p.scrubs[opId] ?? []) {
				if (!raw.includes(needle))
					problems.push(
						`SCOUT_DESCRIPTION_SCRUBS["${opId}"] needle no longer matches: ${JSON.stringify(needle)}`,
					);
				raw = raw.split(needle).join("");
			}
			const description = plainText(rewriteScoutRefs(raw, refPairs));
			const note = p.notes.get(opId);
			if (note !== undefined) consumedNotes.add(opId);
			const routing = op["x-routing"] as Json | undefined;
			if (routing && typeof routing === "object") {
				const asStrings = (v: unknown) =>
					Array.isArray(v)
						? v.filter(
								(s): s is string => typeof s === "string" && s.length > 0,
							)
						: [];
				const source: Record<string, string[]> = {
					purpose: typeof routing.purpose === "string" ? [routing.purpose] : [],
					useWhen: asStrings(routing.useWhen),
					exampleQuestions: asStrings(routing.exampleQuestions),
					keywords: asStrings(routing.keywords),
					notFor: asStrings(routing.notFor),
				};
				for (const [field, texts] of Object.entries(source))
					for (const text of texts)
						guard(
							field === "notFor" ? (text.split(/\s*->\s*/u, 1)[0] ?? "") : text,
							`scout.${opId} x-routing.${field}`,
						);
				const parts = [
					...(source.purpose ?? []),
					...(source.useWhen ?? []),
					...(source.exampleQuestions ?? []),
					...(source.keywords ?? []),
				];
				if (parts.length > 0)
					routingBodies.set(`scout.${opId}`, parts.join("\n"));
				if (parts.length > 0 || (source.notFor ?? []).length > 0)
					routingSources.set(`scout.${opId}`, source);
			}
			entries.push({
				id: `scout.${opId}`,
				service: "scout",
				kind: "operation",
				description: [description || opId, note ? plainText(note) : undefined]
					.filter(Boolean)
					.join("\n\n"),
				inputSchema: scrub(scoutInputSchema(op, pathItem as Json, openapi)),
				outputSchema: scrub(scoutOutputSchema(op, openapi)),
				transport: { type: "http", method: httpMethod, path, base },
			});
		}
	}
	for (const key of p.notes.keys())
		if (!consumedNotes.has(key))
			problems.push(
				`SCOUT_DESCRIPTION_NOTES key "${key}" matched no scout operation (orphaned note)`,
			);
	for (const key of Object.keys(p.scrubs))
		if (!entries.some((e) => e.id === `scout.${key}`))
			problems.push(
				`SCOUT_DESCRIPTION_SCRUBS key "${key}" matched no exposed scout operation`,
			);

	const withRouting = entries.map((e) => {
		let out: Entry = e;
		const body = routingBodies.get(e.id);
		if (body) {
			guard(body, `${e.id} keyword source`);
			const routingKeywords = extractKeywords(
				body,
				[e.id, e.service, e.kind, e.description],
				256,
			);
			if (routingKeywords.length > 0) out = { ...out, routingKeywords };
		}
		const source = routingSources.get(e.id);
		if (source) {
			const routingPhrases = extractRoutingPhrases(source);
			const routingExclusions = extractRoutingExclusions(source.notFor ?? []);
			if (routingPhrases.length > 0) out = { ...out, routingPhrases };
			if (routingExclusions.length > 0) out = { ...out, routingExclusions };
		}
		return out;
	});
	return attachOperationKeywords(withRouting, undefined, 64, guard);
}

/** buildStellarDocs + stellarDocsTitleExtras + attachOperationKeywords(cap 256). */
function buildDocsEntries(
	docsSpec: Json,
	titles: { titles: Array<{ path: string; title: string }> },
	others: Entry[],
): Entry[] {
	const backend = docsSpec.backend as Json;
	const hints = docsSpec.catalogHints as Json;
	const docs: Entry[] = (docsSpec.operations as Json[]).map((op) => ({
		id: op.id as string,
		service: docsSpec.service as string,
		kind: hints.kind as string,
		description: op.returns
			? `${op.description}\n\nReturns: ${op.returns}`
			: (op.description as string),
		inputSchema: op.params,
		outputSchema: op.outputSchema ?? null,
		transport: {
			type: "algolia",
			index: backend.index,
			endpoint: backend.endpoint,
			hosts: backend.hosts,
			applicationIdEnv: backend.applicationIdEnv,
			apiKeyEnv: backend.apiKeyEnv,
			retry: backend.retry,
			baseParams: backend.baseParams,
			constraints: backend.constraints,
			algolia: op.algolia,
		},
	}));
	const searchable = [...others, ...docs].filter((e) => e.searchable !== false);
	const services = new Set(searchable.map((e) => e.service));
	const namespace = new Set(
		[...services].flatMap(tokenize).map(canonicalRoutingToken),
	);
	const names = new Set(
		searchable
			.flatMap((e) => tokenize(lastIdSegment(e.id)))
			.map(canonicalRoutingToken),
	);
	const descTokens = new Map<string, Set<string>>();
	const tokenCounts = new Map<string, Map<string, number>>();
	const opNames = new Map<string, Set<string>>();
	for (const e of searchable) {
		const d = descTokens.get(e.service) ?? new Set<string>();
		for (const t of tokenize(e.description).map(canonicalRoutingToken))
			d.add(t);
		descTokens.set(e.service, d);
		const counts = tokenCounts.get(e.service) ?? new Map<string, number>();
		for (const t of new Set(
			tokenize(
				[
					e.id,
					e.service,
					e.kind,
					e.description,
					...(e.keywords ?? []),
					...(e.routingKeywords ?? []),
				].join("\n"),
			).map(canonicalRoutingToken),
		))
			counts.set(t, (counts.get(t) ?? 0) + 1);
		tokenCounts.set(e.service, counts);
		if (e.kind === "operation") {
			const n = opNames.get(e.service) ?? new Set<string>();
			for (const t of tokenize(lastIdSegment(e.id)).map(canonicalRoutingToken))
				n.add(t);
			opNames.set(e.service, n);
		}
	}
	const owners: Array<{ path: string; id: string }> = [];
	for (const e of docs) {
		const algolia = ((e.transport as Json).algolia as Json | undefined) ?? {};
		const prefixes =
			((algolia.clientFilter as Json | undefined)?.prefixesAnyOf as string[]) ??
			[];
		for (const prefix of prefixes)
			owners.push({
				path: prefix.replace(/^https?:\/\/[^/]+/, "").replace(/\/$/, ""),
				id: e.id,
			});
	}
	owners.sort((a, b) => b.path.length - a.path.length);
	const titlesById = new Map<string, string[]>();
	for (const t of titles.titles) {
		const owner = owners.find(
			(o) => t.path === o.path || t.path.startsWith(`${o.path}/`),
		);
		if (owner)
			titlesById.set(owner.id, [...(titlesById.get(owner.id) ?? []), t.title]);
	}
	const extras = new Map<string, string[]>();
	for (const e of docs) {
		const otherServices = [...services].filter((s) => s !== e.service);
		const distinctive = tokenize(
			(titlesById.get(e.id) ?? []).join("\n"),
		).filter((token) => {
			const c = canonicalRoutingToken(token);
			if (namespace.has(c)) return false;
			if (names.has(c)) return true;
			if (descTokens.get(e.service)?.has(c)) return true;
			return (
				otherServices.filter(
					(s) =>
						(tokenCounts.get(s)?.get(c) ?? 0) > 1 || opNames.get(s)?.has(c),
				).length < 2
			);
		});
		if (distinctive.length > 0) extras.set(e.id, [distinctive.join(" ")]);
	}
	return attachOperationKeywords(docs, extras, 256);
}

/** Catalog Raven would build with these Scout entries (docs keywords rebuilt). */
function assembleCatalog(
	raven: Raven,
	scout: Entry[],
	problems: string[],
): Entry[] {
	const kept = raven.manifest.entries.filter(
		(e) => e.service === "lumenloop" || e.service === "skills",
	);
	const docs = buildDocsEntries(raven.docsSpec, raven.docsTitles, [
		...kept,
		...scout,
	]);
	const entries = [...kept, ...scout, ...docs].sort((a, b) =>
		a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
	);
	const ops = new Set(
		entries.filter((e) => e.kind === "operation").map((e) => e.id),
	);
	for (const [id] of raven.policy.profiles)
		if (!ops.has(id))
			problems.push(
				`retrieval profile key "${id}" matched no exposed operation`,
			);
	const out = entries.map((e) => {
		const profile =
			e.service === "scout" || e.service === "stellarDocs"
				? raven.policy.profiles.get(e.id)
				: e.retrievalProfile;
		for (const edge of profile?.recoverWith ?? [])
			if (!ops.has(edge.id))
				problems.push(
					`retrieval profile "${e.id}" references non-exposed operation "${edge.id}"`,
				);
		return profile && !e.retrievalProfile
			? { ...e, retrievalProfile: profile }
			: e;
	});
	// assertNoNonExposedRefs: callable tokens must name an exposed op.
	for (const e of out) {
		const text = [
			e.description,
			...(e.keywords ?? []),
			...(e.routingKeywords ?? []),
			...(e.routingPhrases ?? []).flatMap((x) => x.tokens),
			...(e.routingExclusions ?? []).flatMap((x) => x.tokens),
			...(e.kind === "operation"
				? [JSON.stringify(e.inputSchema), JSON.stringify(e.outputSchema)]
				: []),
		].join("\n");
		for (const token of text.match(
			/(?<![.\w])(?:lumenloop|scout|stellarDocs)\.[A-Za-z_]\w*/g,
		) ?? []) {
			if (
				["com", "org", "net", "io", "xyz", "dev", "app", "buzz"].includes(
					token.split(".")[1] ?? "",
				)
			)
				continue;
			if (!ops.has(token))
				problems.push(
					`ADR-0003 leak: ${e.id} references non-exposed operation "${token}"`,
				);
		}
		if (e.service === "scout") {
			const leak = leakIn(text, raven.policy);
			if (leak) problems.push(`ADR-0003 leak: ${e.id} emits ${leak}`);
		}
	}
	return out;
}

// --- grading (eval/lib/grade.mjs, eval/run-routing.mjs) ----------------------

const CARD_PREFIXES: Array<[string, string]> = [
	["stellar_docs_", "stellarDocs"],
	["stellar_light_", "scout"],
	["stellardocs_", "stellarDocs"],
	["lumenloop_", "lumenloop"],
	["scout_", "scout"],
	["skills_", "skills"],
];
const canonToken = (s: string) =>
	String(s)
		.toLowerCase()
		.replace(/[-.\s]+/g, "_");
function splitCard(token: string): { service: string | null; op: string } {
	const t = canonToken(token);
	for (const [prefix, service] of CARD_PREFIXES)
		if (t.startsWith(prefix)) return { service, op: t.slice(prefix.length) };
	return { service: null, op: t };
}
function hitOp(hit: { id: string; service: string }): string {
	const canon = canonToken(hit.id);
	const svc = canonToken(hit.service);
	return canon.startsWith(`${svc}_`)
		? canon.slice(svc.length + 1)
		: splitCard(hit.id).op;
}
function cardMatchesExact(
	card: string,
	hit: { id: string; service: string },
): boolean {
	const e = splitCard(card);
	if (!e.service || canonToken(e.service) !== canonToken(hit.service))
		return false;
	if (hit.service === "skills")
		return (
			e.op ===
			canonToken((hit.id.split("#", 1)[0] ?? "").split(".").at(-1) ?? "")
		);
	return e.op === hitOp(hit);
}
function cardMatches(
	card: string,
	hit: { id: string; service: string },
): boolean {
	if (cardMatchesExact(card, hit)) return true;
	if (canonToken(card) === canonToken(hit.id)) return true;
	const e = splitCard(card);
	if (!e.service || canonToken(e.service) !== canonToken(hit.service))
		return false;
	const op = hitOp(hit);
	if (e.op === op) return true;
	const [shorter, longer] = e.op.length <= op.length ? [e.op, op] : [op, e.op];
	return shorter.length >= 4 && longer.includes(shorter);
}

interface Case {
	id: string;
	question: string;
	expected_service: string;
	expected_cards?: string[];
	forbidden_cards?: string[];
	role?: "positive" | "control";
}
/** Gated lanes first; extended and protocol are Raven's diagnostics, counted
 *  here only for per-question flips (its reviews compare all 544 rows). */
const LANES = ["legacy", "skills", "holdout", "extended", "protocol"] as const;
interface Result {
	lane: (typeof LANES)[number];
	role?: Case["role"];
	id: string;
	question: string;
	expected: string;
	cards: string[];
	top1: boolean;
	top3: boolean;
	top5: boolean;
	cardHit5: boolean | null;
	rank?: number | null;
	forbidden?: string[];
	hits: Hit[];
}

function grade(
	lane: Result["lane"],
	c: Case,
	hits: Hit[],
	target: string,
): Result {
	const svc = (h: Hit) => h.service === c.expected_service;
	const base = {
		lane,
		id: c.id,
		question: c.question,
		expected: c.expected_service,
		cards: c.expected_cards ?? [],
		hits,
	};
	if (lane === "protocol") {
		const idx = hits.findIndex((h) => h.id === target);
		const rank = idx < 0 ? null : idx + 1;
		// A control passes while the target stays out of its top five.
		const pass = c.role === "control" ? rank === null : null;
		return {
			...base,
			role: c.role,
			expected: `${c.role} ${target}`,
			top1: pass ?? rank === 1,
			top3: pass ?? (rank !== null && rank <= 3),
			top5: pass ?? (rank !== null && rank <= 5),
			cardHit5: null,
			rank,
		};
	}
	if (lane === "holdout") {
		const idx = hits.findIndex((h) =>
			(c.expected_cards ?? []).some((k) => cardMatchesExact(k, h)),
		);
		const rank = idx < 0 ? null : idx + 1;
		const top5 = rank !== null && rank <= 5;
		return {
			...base,
			top1: rank === 1,
			top3: rank !== null && rank <= 3,
			top5,
			cardHit5: top5,
			rank,
			forbidden: hits
				.filter((h) =>
					(c.forbidden_cards ?? []).some((k) => cardMatchesExact(k, h)),
				)
				.map((h) => h.id),
		};
	}
	const opCards = (c.expected_cards ?? []).filter(
		(k) => splitCard(k).op !== "mcp",
	);
	return {
		...base,
		top1: hits.length > 0 && svc(hits[0] as Hit),
		top3: hits.slice(0, 3).some(svc),
		top5: hits.slice(0, 5).some(svc),
		cardHit5:
			opCards.length > 0
				? hits.slice(0, 5).some((h) => opCards.some((k) => cardMatches(k, h)))
				: null,
	};
}

interface Raven {
	dir: string;
	manifest: { entries: Entry[] };
	manifestSha: string;
	gates: Json;
	lanes: Array<{ lane: Result["lane"]; cases: Case[] }>;
	protocolTarget: string;
	inventory: Json;
	docsSpec: Json;
	docsTitles: { titles: Array<{ path: string; title: string }> };
	policy: Policy;
}

function loadRaven(dir: string): Raven {
	const raw = (p: string) => readFileSync(join(dir, p));
	const json = (p: string) => JSON.parse(raw(p).toString("utf8"));
	const manifestBytes = raw("catalog/manifest.json");
	const manifest = JSON.parse(manifestBytes.toString("utf8"));
	const routing = json("eval/routing-cases.json");
	const protocol = json("eval/protocol-history-cases.json");
	return {
		dir,
		manifest,
		manifestSha: createHash("sha256").update(manifestBytes).digest("hex"),
		gates: json("eval/gates.json"),
		lanes: [
			{ lane: "legacy", cases: routing.cases },
			{ lane: "skills", cases: json("eval/skills-cases.json").cases },
			{ lane: "holdout", cases: json("eval/holdout-cases.json").cases },
			{ lane: "extended", cases: routing.extendedCases ?? [] },
			{
				lane: "protocol",
				cases: [
					...protocol.positiveCases.map((c: Case) => ({
						...c,
						role: "positive",
					})),
					...protocol.controlCases.map((c: Case) => ({
						...c,
						role: "control",
					})),
				],
			},
		],
		protocolTarget: protocol.targetOperation,
		inventory: json("inventory/stellar-light.json"),
		docsSpec: json("specs/stellar-docs.json"),
		docsTitles: json("inventory/stellar-docs-titles.json"),
		policy: loadPolicy(dir, manifest),
	};
}

function runLanes(
	raven: Raven,
	entries: Entry[],
	problems: string[],
): Result[] {
	const catalog = makeCatalog(entries);
	const out: Result[] = [];
	const searchable = entries.filter(
		(e) => e.searchable !== false && e.kind !== "skill-section",
	);
	for (const { lane, cases } of raven.lanes) {
		for (const c of cases) {
			if (lane === "holdout")
				for (const card of [
					...(c.expected_cards ?? []),
					...(c.forbidden_cards ?? []),
				]) {
					const n = searchable.filter((e) => cardMatchesExact(card, e)).length;
					if (n !== 1)
						problems.push(
							`holdout card "${card}" resolves to ${n} searchable entries (case ${c.id}); Raven's runner aborts`,
						);
				}
			out.push(
				grade(
					lane,
					c,
					searchCatalog(catalog, c.question, 5),
					raven.protocolTarget,
				),
			);
		}
	}
	return out;
}

type Totals = Record<string, Record<string, number>>;
function totalsOf(results: Result[]): Totals {
	const t: Totals = {};
	const add = (lane: string, key: string, n: number | boolean = 1) => {
		const b = t[lane] ?? {};
		t[lane] = b;
		b[key] = (b[key] ?? 0) + Number(n);
	};
	for (const r of results) {
		if (r.lane === "protocol" && r.role === "control") {
			add("protocol", "controls");
			add("protocol", "controlTop5Captures", !r.top5);
			continue;
		}
		add(r.lane, r.lane === "protocol" ? "positives" : "n");
		for (const k of ["top1", "top3", "top5"] as const) add(r.lane, k, r[k]);
		if (r.cardHit5 !== null) {
			add(r.lane, "cardN");
			add(r.lane, "cardHit5", r.cardHit5);
		}
		if (r.lane === "holdout") {
			const captured = (r.forbidden ?? []).length > 0;
			add(r.lane, "forbiddenCaptures", captured);
			add(r.lane, "passed", r.top5 && !captured);
		}
	}
	return t;
}

/** run-routing.mjs --gate thresholds (evidence hashes aside: any absorb re-pins them). */
function mechanicalGate(t: Totals, g: Json): string[] {
	const failures: string[] = [];
	const legacy = g.legacy as Record<string, number>;
	const skills = g.skills as Record<string, number>;
	const holdout = g.holdout as Record<string, number>;
	const L = t.legacy ?? {};
	const S = t.skills ?? {};
	const H = t.holdout ?? {};
	if (L.n !== legacy.n)
		failures.push(`legacy n=${L.n} differs from baselined ${legacy.n}`);
	else {
		const band = Math.round(((legacy.n ?? 0) * (legacy.bandPct ?? 0)) / 100);
		for (const k of ["top1", "top3", "top5"])
			if (Math.abs((L[k] ?? 0) - (legacy[k] ?? 0)) > band)
				failures.push(`legacy ${k}=${L[k]} outside ±${band} of ${legacy[k]}`);
	}
	if (S.n !== skills.n)
		failures.push(`skills n=${S.n} differs from baselined ${skills.n}`);
	else if ((S.top1 ?? 0) < (skills.minTop1 ?? 0))
		failures.push(`skills top1=${S.top1} below floor ${skills.minTop1}`);
	if (H.n !== holdout.n)
		failures.push(`holdout n=${H.n} differs from baselined ${holdout.n}`);
	else {
		for (const [k, floor] of [
			["top1", holdout.minTop1],
			["top3", holdout.minTop3],
			["top5", holdout.minTop5],
		] as const)
			if ((H[k] ?? 0) < (floor ?? 0))
				failures.push(`holdout ${k}=${H[k]} below floor ${floor}`);
		if ((H.forbiddenCaptures ?? 0) > (holdout.maxForbiddenCaptures ?? 0))
			failures.push(
				`holdout forbidden captures=${H.forbiddenCaptures} above ceiling ${holdout.maxForbiddenCaptures}`,
			);
	}
	return failures;
}

const KEYS = [
	"n",
	"positives",
	"top1",
	"top3",
	"top5",
	"cardN",
	"cardHit5",
	"forbiddenCaptures",
	"passed",
	"controls",
	"controlTop5Captures",
];
const fmt = (b: Record<string, number> | undefined) =>
	b
		? KEYS.filter((k) => k in b)
				.map((k) => `${k} ${b[k]}`)
				.join(", ")
		: "none";

/** Which graded outcomes moved, per case: "top3 hit->miss", ... */
function flips(
	before: Result,
	after: Result,
): { worse: string[]; better: string[] } {
	const worse: string[] = [];
	const better: string[] = [];
	for (const k of ["top1", "top3", "top5", "cardHit5"] as const) {
		const b = before[k];
		const a = after[k];
		if (b === a || b === null || a === null) continue;
		(b ? worse : better).push(`${k} ${b ? "hit->miss" : "miss->hit"}`);
	}
	if (before.lane === "holdout") {
		const fb = (before.forbidden ?? []).length > 0;
		const fa = (after.forbidden ?? []).length > 0;
		if (fb !== fa)
			(fa ? worse : better).push(
				`forbidden capture ${fa ? "appeared" : "cleared"}`,
			);
	}
	return { worse, better };
}

// --- attribution: which Scout entry and which of its words moved a question --

const ENTRY_FIELDS = [
	"name",
	"description",
	"routingKeywords",
	"keywords",
] as const;
function wordsMatched(
	entry: Entry | undefined,
	query: string,
): Record<string, string[]> {
	const out: Record<string, string[]> = {};
	if (!entry) return out;
	const qt = prepareQueryForm(query).contentTokens;
	const values: Record<(typeof ENTRY_FIELDS)[number], string> = {
		name: lastIdSegment(entry.id),
		description: entry.description,
		routingKeywords: (entry.routingKeywords ?? []).join(" "),
		keywords: (entry.keywords ?? []).join(" "),
	};
	for (const f of ENTRY_FIELDS) {
		const field = prepareField(values[f]);
		const hit = [
			...scoreField(normalizeSearchText(query), qt, field, 1).matched,
		];
		if (hit.length > 0) out[f] = hit;
	}
	return out;
}

/** rejectsRoutingIntent's evidence: best notFor clause vs best positive phrase. */
function admissionOf(catalog: Catalog, entry: Entry, q: Query) {
	const best = <T extends { tokens: string[] }>(
		items: T[],
		cover: (t: string[]) => number,
	) =>
		items.reduce<{ n: number; item?: T }>(
			(m, item) => {
				const n = cover(item.tokens);
				return n > m.n ? { n, item } : m;
			},
			{ n: 0 },
		);
	const neg = best(entry.routingExclusions ?? [], (t) =>
		negativeRoutingIntentCoverage(
			t,
			q.contentTokens,
			q.scoring.original.tokens,
		),
	);
	const pos = best(entry.routingPhrases ?? [], (t) =>
		routingIntentCoverage(t, q.contentTokens),
	);
	return {
		rejected: entry.kind === "operation" && isRejected(catalog, q, entry),
		notFor: neg.item
			? `notFor[${neg.item.tokens.join(" ")}] covers ${neg.n}`
			: "no notFor match",
		phrase: pos.item
			? `${pos.item.field}[${pos.item.tokens.join(" ")}] covers ${pos.n}`
			: "no phrase match",
	};
}

function explainEntry(
	catalog: Catalog,
	entry: Entry | undefined,
	query: string,
) {
	if (!entry) return { present: false as const };
	const q = prepareSearchQuery(catalog, query);
	const admission = admissionOf(catalog, entry, q);
	const s = scorableOf(entry, q.aliasTokens);
	return {
		present: true as const,
		admission,
		score: admission.rejected ? null : scoreEntryWeighted(s, q.scoring),
		backfill: admission.rejected
			? null
			: scoreEntryWeightedUngated(s, q.scoring),
		words: wordsMatched(entry, query),
	};
}

function attribute(
	before: Result,
	after: Result,
	oldCatalog: Catalog,
	newCatalog: Catalog,
): string[] {
	const lines: string[] = [];
	for (const id of new Set([...before.hits, ...after.hits].map((h) => h.id))) {
		const b = before.hits.findIndex((h) => h.id === id);
		const a = after.hits.findIndex((h) => h.id === id);
		const move = `${id} ${b < 0 ? "-" : `#${b + 1}`} -> ${a < 0 ? "-" : `#${a + 1}`}`;
		const oldE = oldCatalog.entries.find((e) => e.id === id);
		const newE = newCatalog.entries.find((e) => e.id === id);
		const eo = explainEntry(oldCatalog, oldE, after.question);
		const en = explainEntry(newCatalog, newE, after.question);
		const same =
			entryKey(oldE) === entryKey(newE) ||
			(eo.present &&
				en.present &&
				eo.score === en.score &&
				eo.backfill === en.backfill &&
				eo.admission.rejected === en.admission.rejected);
		if (same) {
			if (b !== a)
				lines.push(`${move} (displaced; its own score did not change)`);
			continue;
		}
		const wo = eo.present ? eo.words : {};
		const wn = en.present ? en.words : {};
		const diffs = ENTRY_FIELDS.flatMap((f) => {
			const gained = (wn[f] ?? []).filter((t) => !(wo[f] ?? []).includes(t));
			const lost = (wo[f] ?? []).filter((t) => !(wn[f] ?? []).includes(t));
			return [
				...(gained.length ? [`+${f}[${gained.join(", ")}]`] : []),
				...(lost.length ? [`-${f}[${lost.join(", ")}]`] : []),
			];
		});
		const state = (e: ReturnType<typeof explainEntry>) =>
			!e.present
				? "absent"
				: e.admission.rejected
					? "rejected by notFor"
					: e.score !== null
						? `score ${e.score}`
						: `gated out, backfill ${e.backfill ?? "none"}`;
		const admission =
			en.present &&
			(!eo.present || eo.admission.rejected !== en.admission.rejected)
				? `; admission ${en.admission.rejected ? "lost" : "won"}: ${en.admission.phrase}; ${en.admission.notFor}`
				: "";
		lines.push(
			`${move}: ${state(eo)} -> ${state(en)}${diffs.length ? `; words ${diffs.join(" ")}` : ""}${admission}`,
		);
	}
	return lines;
}

// --- CLI ---------------------------------------------------------------------

function arg(name: string): string | undefined {
	const i = process.argv.indexOf(name);
	return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
	const dir = arg("--raven") ?? process.env.RAVEN_DIR;
	if (!dir) {
		console.error(
			"usage: raven-gate-replica --raven <stellar-raven checkout> [--spec <openapi.json>] [--json <out>]",
		);
		process.exit(2);
	}
	const raven = loadRaven(resolve(dir));
	const accepted = (raven.gates.evidence as Json).acceptedTotals as Totals;
	const pinned = (
		(raven.gates.evidence as Json).inputs as Array<{
			path: string;
			sha256: string;
		}>
	).find((i) => i.path === "catalog/manifest.json")?.sha256;

	// 1. Self-check: reproduce the accepted baseline and rebuild the committed entries.
	const baseProblems: string[] = [];
	const baseline = runLanes(raven, raven.manifest.entries, baseProblems);
	const baseTotals = totalsOf(baseline);
	const reproduced = ["legacy", "skills", "holdout"].every((lane) =>
		Object.entries(accepted[lane] ?? {}).every(
			([k, v]) => baseTotals[lane]?.[k] === v,
		),
	);
	const inv = raven.inventory;
	const parityProblems: string[] = [];
	const rebuiltScout = buildScoutEntries(
		inv.openapi as Json,
		raven.policy,
		parityProblems,
	);
	const rebuilt = assembleCatalog(raven, rebuiltScout, parityProblems);
	const committed = new Map(
		raven.manifest.entries.map((e) => [e.id, entryKey(e)]),
	);
	const mismatched = rebuilt
		.filter((e) => e.service === "scout" || e.service === "stellarDocs")
		.filter((e) => committed.get(e.id) !== entryKey(e))
		.map((e) => e.id);
	const missing = raven.manifest.entries
		.filter(
			(e) =>
				(e.service === "scout" || e.service === "stellarDocs") &&
				!rebuilt.some((r) => r.id === e.id),
		)
		.map((e) => e.id);
	const changedSources = Object.entries(PORTED_FROM_RAVEN)
		.filter(([path, sha]) => {
			try {
				const bytes = readFileSync(join(raven.dir, path));
				return createHash("sha256").update(bytes).digest("hex") !== sha;
			} catch {
				return true;
			}
		})
		.map(([path]) => path);
	console.log(`Raven checkout ${raven.dir}`);
	console.log(
		`  ported sources: ${changedSources.length ? `CHANGED since b1dc866 (${changedSources.join(", ")})` : "identical to b1dc866"}`,
	);
	console.log(
		`  manifest sha256 ${raven.manifestSha.slice(0, 12)} ${raven.manifestSha === pinned ? "= gates.json evidence" : "!= gates.json evidence (baseline may be stale)"}`,
	);
	for (const lane of LANES)
		console.log(`  baseline ${lane}: ${fmt(baseTotals[lane])}`);
	console.log(
		`  reproduces acceptedTotals exactly: ${reproduced ? "yes" : "NO"}`,
	);
	console.log(
		`  rebuilds committed Scout + stellarDocs entries from inventory (Scout ${inv.openapiVersion}): ${mismatched.length + missing.length === 0 && parityProblems.length === 0 ? "identical (provenance aside)" : `NO (${[...mismatched, ...missing, ...parityProblems].join("; ")})`}`,
	);
	if (
		changedSources.length ||
		!reproduced ||
		mismatched.length ||
		missing.length ||
		parityProblems.length ||
		baseProblems.length
	) {
		console.log(
			"SELF-CHECK FAILED: Raven's scorer, builder or grading changed; re-port (and re-pin PORTED_FROM_RAVEN) before trusting a verdict.",
		);
		process.exit(2);
	}
	if (process.argv.includes("--baseline-only")) return;

	// 2. Candidate: Raven's catalog with Scout entries built from this spec.
	const specPath = arg("--spec");
	const spec = (
		specPath
			? JSON.parse(readFileSync(specPath, "utf8"))
			: (await import("../../src/lib/openapi-spec")).spec
	) as Json;
	const version = String((spec.info as Json | undefined)?.version ?? "?");
	const problems: string[] = [];
	const scout = buildScoutEntries(spec, raven.policy, problems);
	const candidate = assembleCatalog(raven, scout, problems);
	const results = runLanes(raven, candidate, problems);
	const totals = totalsOf(results);
	const oldIds = new Set(
		raven.manifest.entries
			.filter((e) => e.service === "scout")
			.map((e) => e.id),
	);
	const newIds = new Set(scout.map((e) => e.id));
	const changedEntries = candidate
		.filter((e) => e.service === "scout" || e.service === "stellarDocs")
		.filter((e) => committed.get(e.id) !== entryKey(e)).length;

	const mechanical = mechanicalGate(totals, raven.gates);
	const lower: string[] = [];
	for (const lane of ["legacy", "skills", "holdout"])
		for (const [k, v] of Object.entries(accepted[lane] ?? {})) {
			const now = totals[lane]?.[k] ?? 0;
			if (
				k === "forbiddenCaptures"
					? now > v
					: k !== "n" && k !== "cardN" && now < v
			)
				lower.push(`${lane} ${k} ${v} -> ${now}`);
		}
	const oldCatalog = makeCatalog(raven.manifest.entries);
	const newCatalog = makeCatalog(candidate);
	const moved = results
		.map((after, i) => ({ before: baseline[i] as Result, after }))
		.map((m) => ({ ...m, ...flips(m.before, m.after) }))
		.filter((m) => m.worse.length || m.better.length)
		.map((m) => ({
			...m,
			why: attribute(m.before, m.after, oldCatalog, newCatalog),
		}));
	// Raven's "moved rows" (its round comparisons): top-5 id order changed.
	const ids = (r: Result) => r.hits.map((h) => h.id).join();
	const changedTopFive = results
		.map((after, i) => ({ before: baseline[i] as Result, after }))
		.filter(({ before, after }) => ids(before) !== ids(after))
		.map(({ before, after }) => ({
			lane: after.lane,
			id: after.id,
			before: before.hits,
			after: after.hits,
		}));
	const reordered = changedTopFive.length;
	const regressions = moved.filter((m) => m.worse.length > 0);
	const pass =
		mechanical.length === 0 &&
		lower.length === 0 &&
		regressions.length === 0 &&
		problems.length === 0;

	console.log(
		`\nCandidate spec ${version}${specPath ? ` (${specPath})` : " (src/lib/openapi-spec.ts)"}`,
	);
	console.log(
		`  exposed Scout ops ${newIds.size} (added ${[...newIds].filter((i) => !oldIds.has(i)).join(", ") || "none"}; removed ${[...oldIds].filter((i) => !newIds.has(i)).join(", ") || "none"}); ${changedEntries} Scout/stellarDocs entries differ from the committed catalog`,
	);
	console.log(
		`  catalog build guards: ${problems.length === 0 ? "pass" : `FAIL\n    - ${[...new Set(problems)].join("\n    - ")}`}`,
	);
	for (const lane of LANES)
		console.log(
			`  ${lane}: ${fmt(totals[lane])}   (${lane in accepted ? `accepted: ${fmt(accepted[lane])}` : `diagnostic; baseline: ${fmt(baseTotals[lane])}`})`,
		);
	console.log(
		`  mechanical gate (run-routing.mjs --gate): ${mechanical.length === 0 ? "pass" : `FAIL: ${mechanical.join("; ")}`}`,
	);
	console.log(
		`  accepted totals kept: ${lower.length === 0 ? "yes" : `NO: ${lower.join("; ")}`}`,
	);
	console.log(
		`  questions moved: ${moved.length} (${regressions.length} hit->miss, ${moved.length - regressions.length} gains only); top-5 lists changed: ${reordered}`,
	);
	for (const m of moved) {
		const top = (r: Result) =>
			r.hits.map((h) => `${h.id} ${h.score}`).join(", ") || "none";
		console.log(
			`\n  ${m.worse.length ? "REGRESSION" : "gain"} [${m.after.lane}] ${m.after.id}: "${m.after.question}"`,
		);
		console.log(
			`    labelled ${m.after.expected}${m.after.cards.length ? ` (${m.after.cards.join(", ")})` : ""}; ${[...m.worse, ...m.better].join(", ")}`,
		);
		console.log(
			`    pick ${m.before.hits[0]?.id ?? "none"} -> ${m.after.hits[0]?.id ?? "none"}`,
		);
		console.log(`    before: ${top(m.before)}`);
		console.log(`    after:  ${top(m.after)}`);
		for (const line of m.why) console.log(`    cause: ${line}`);
	}
	console.log(
		`\nVERDICT: Raven would ${pass ? "ACCEPT" : "HOLD"} ${version}${pass ? "" : " (any breach, lower accepted total, hit->miss flip or build guard holds it)"}`,
	);
	const out = arg("--json");
	if (out)
		writeFileSync(
			out,
			`${JSON.stringify(
				{
					raven: { dir: raven.dir, manifestSha256: raven.manifestSha },
					candidate: { version, spec: specPath ?? "src/lib/openapi-spec.ts" },
					accepted,
					totals,
					mechanical,
					lowerTotals: lower,
					buildProblems: [...new Set(problems)],
					moved: moved.map((m) => ({
						lane: m.after.lane,
						id: m.after.id,
						question: m.after.question,
						expected: m.after.expected,
						cards: m.after.cards,
						worse: m.worse,
						better: m.better,
						before: m.before.hits,
						after: m.after.hits,
						cause: m.why,
					})),
					changedTopFive,
					pass,
				},
				null,
				"\t",
			)}\n`,
		);
	process.exitCode = pass ? 0 : 1;
}

main().catch((e) => {
	console.error(
		"raven-gate-replica failed:",
		e instanceof Error ? e.message : e,
	);
	process.exit(2);
});
