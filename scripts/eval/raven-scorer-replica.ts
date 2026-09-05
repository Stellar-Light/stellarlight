/**
 * Spec-side replica of Raven's lexical catalog scorer — used to EXPLAIN a
 * routing miss with evidence (does the intended op pass the coverage gate on
 * this question, which of the question's words its indexed text lacks, which
 * other op's id noun the question carries, whether the text Raven indexes is
 * older than ours), never to grade. The live gateway's ranking is the truth;
 * this reproduces the scoring math over a given text so a miss can be
 * classified from what we control.
 *
 * Ported 2026-09-05 from stellar-experimental/stellar-raven (public):
 *   src/catalog/vendor/search-scoring.ts  tokenize, field weights, coverage gate
 *   src/catalog/scoring.ts                STOPWORDS, routing-keyword blend (1.0),
 *                                         stopword rescue
 *   src/catalog/extract-keywords.ts       x-routing → NOVEL tokens only, cap 256
 *   scripts/build-catalog.mjs             entry text = summary + ". " + description;
 *                                         purpose/useWhen/exampleQuestions/keywords
 *                                         feed routingKeywords; notFor is dropped
 *
 * Deliberately NOT replicated (small, and theirs to change): the hand-authored
 * "Catalog note" Raven appends to 11 scout descriptions, schema-derived
 * low-weight keywords (blend 0.4), query alias canonicalization and per-entry
 * knownAliases. Mirror upstream changes here; raven-routing.ts reports how
 * often the replica reproduces the live score exactly, so drift is visible.
 *
 * Three consequences worth knowing when editing x-routing:
 *   - flattening destroys phrases: an exampleQuestion never becomes an exact
 *     phrase (the gate bypass) — only its novel tokens count;
 *   - the id and name fields weigh 12 and 10 against the description's 5, so a
 *     question carrying another op's id noun ("projects", "contracts") hands
 *     that op ~88 points no vocabulary of ours can outweigh (#124 upstream);
 *   - a token matches by prefix in EITHER direction with no minimum length, so
 *     the lone word "a" in a description covers every query token starting
 *     with "a". `coverage` is Raven's gate math with that quirk; `missingWords`
 *     is the stricter list (whole word or ≥3-char prefix) to edit against.
 */

export const FIELD_WEIGHTS = {
	id: 12,
	name: 10,
	service: 8,
	description: 5,
	kind: 2,
} as const;

/** Raven's general-English stopword set (verbatim). */
export const STOPWORDS: ReadonlySet<string> = new Set([
	"a",
	"about",
	"an",
	"and",
	"any",
	"are",
	"as",
	"at",
	"be",
	"been",
	"but",
	"by",
	"can",
	"could",
	"did",
	"do",
	"does",
	"doing",
	"for",
	"from",
	"get",
	"had",
	"has",
	"have",
	"how",
	"i",
	"if",
	"in",
	"into",
	"is",
	"it",
	"its",
	"just",
	"me",
	"my",
	"no",
	"not",
	"of",
	"on",
	"or",
	"our",
	"s",
	"should",
	"so",
	"some",
	"such",
	"t",
	"than",
	"that",
	"the",
	"their",
	"them",
	"then",
	"there",
	"these",
	"they",
	"this",
	"those",
	"to",
	"up",
	"was",
	"we",
	"were",
	"what",
	"when",
	"where",
	"which",
	"who",
	"whose",
	"why",
	"will",
	"with",
	"would",
	"you",
	"your",
]);

export function normalizeSearchText(value: string): string {
	return value
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/[_./:#-]+/g, " ")
		.toLowerCase()
		.trim();
}

export function tokenize(value: string): string[] {
	return normalizeSearchText(value)
		.split(/[^a-z0-9]+/)
		.map((t) => t.trim())
		.filter(Boolean);
}

/** Non-stopword tokens of ≥2 chars — what extractKeywords can index. */
export function contentTokens(value: string): string[] {
	return tokenize(value).filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

/** Raven's query-side stopword rescue: drop stopwords unless nothing is left. */
export function effectiveQuery(query: string): string {
	const kept = tokenize(query).filter((t) => !STOPWORDS.has(t));
	return kept.length > 0 ? kept.join(" ") : query;
}

export interface ScoutEntry {
	id: string; // scout.<operationId>
	name: string; // operationId (Raven: last id segment)
	description: string; // summary + ". " + description, markdown stripped
	routingKeywords: string[]; // novel tokens from x-routing
	/** id tokens minus the leading verb — the tokens that collide (#124). */
	idNouns: string[];
}

const ID_VERBS = new Set([
	"get",
	"search",
	"list",
	"analyze",
	"compare",
	"explain",
	"resolve",
	"submit",
	"vet",
	"match",
	"verify",
]);

/** Raven's extractKeywords: novel, non-stopword tokens by frequency, capped. */
function extractKeywords(body: string, exclude: string[], cap = 256): string[] {
	const excluded = new Set<string>();
	for (const text of exclude) for (const t of tokenize(text)) excluded.add(t);
	const freq = new Map<string, { count: number; first: number }>();
	const tokens = tokenize(body);
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		if (token.length < 2 || STOPWORDS.has(token) || excluded.has(token))
			continue;
		const seen = freq.get(token);
		if (seen) seen.count += 1;
		else freq.set(token, { count: 1, first: i });
	}
	return [...freq.entries()]
		.sort((a, b) => b[1].count - a[1].count || a[1].first - b[1].first)
		.slice(0, cap)
		.map(([token]) => token);
}

/** Raven's plainText for scout descriptions: strip markdown emphasis/code. */
function plainText(s: string): string {
	return s.replace(/\*\*/g, "").replace(/`/g, "").replace(/\s+/g, " ").trim();
}

const idNounsOf = (operationId: string) =>
	tokenize(operationId).filter((t) => !ID_VERBS.has(t));

/** Build the scout entries Raven would index from our OpenAPI spec object. */
export function buildScoutEntries(spec: {
	paths: Record<string, unknown>;
}): ScoutEntry[] {
	const out: ScoutEntry[] = [];
	for (const methods of Object.values(spec.paths)) {
		for (const op of Object.values(methods as Record<string, unknown>)) {
			if (!op || typeof op !== "object") continue;
			const o = op as Record<string, unknown>;
			if (typeof o.operationId !== "string") continue;
			const rawDescription = [o.summary, o.description]
				.filter((v): v is string => typeof v === "string" && v.length > 0)
				.join(". ")
				.replace(/\.\.\s/g, ". ");
			const description = plainText(rawDescription) || o.operationId;
			const id = `scout.${o.operationId}`;
			const routing = (o["x-routing"] ?? {}) as Record<string, unknown>;
			const list = (v: unknown) => (Array.isArray(v) ? v : []);
			const parts = [
				routing.purpose,
				...list(routing.useWhen),
				...list(routing.exampleQuestions),
				...list(routing.keywords),
			].filter((v): v is string => typeof v === "string" && v.length > 0);
			out.push({
				id,
				name: o.operationId,
				description,
				routingKeywords: extractKeywords(parts.join("\n"), [
					id,
					"scout",
					"operation",
					description,
				]),
				idNouns: idNounsOf(o.operationId),
			});
		}
	}
	return out;
}

/**
 * The consumer's ACTUAL view of one op: the description the gateway serves
 * (authoritative) plus the routing keywords from Raven's committed manifest
 * when that manifest carries the same description — otherwise the keywords
 * are unknown and the caller says so.
 */
export function liveScoutEntry(
	id: string,
	liveDescription: string,
	manifestEntry: { description?: string; routingKeywords?: string[] } | null,
): ScoutEntry & { keywordsKnown: boolean } {
	const name = id.replace(/^scout\./, "");
	const keywordsKnown =
		!!manifestEntry && manifestEntry.description === liveDescription;
	return {
		id,
		name,
		description: liveDescription,
		routingKeywords: keywordsKnown
			? (manifestEntry?.routingKeywords ?? [])
			: [],
		idNouns: idNounsOf(name),
		keywordsKnown,
	};
}

interface FieldScore {
	score: number;
	matched: Set<string>;
	exactPhrase: boolean;
}

function scoreField(
	query: string,
	queryTokens: string[],
	value: string,
	weight: number,
): FieldScore {
	const raw = normalizeSearchText(value);
	const tokens = tokenize(value);
	const matched = new Set<string>();
	if (raw.length === 0) return { score: 0, matched, exactPhrase: false };
	let score = 0;
	const exactPhrase = query.length > 0 && raw.includes(query);
	if (query.length > 0) {
		if (raw === query) score += weight * 14;
		else if (raw.startsWith(query)) score += weight * 9;
		else if (exactPhrase) score += weight * 6;
	}
	for (const token of queryTokens) {
		if (tokens.includes(token)) {
			score += weight * 4;
			matched.add(token);
		} else if (tokens.some((c) => c.startsWith(token) || token.startsWith(c))) {
			score += weight * 2;
			matched.add(token);
		} else if (raw.includes(token)) {
			score += weight;
			matched.add(token);
		}
	}
	return { score, matched, exactPhrase };
}

interface EntryScore {
	score: number | null; // null = failed the coverage gate
	matched: Set<string>;
	coverage: number;
	exactPhrase: boolean;
}

/** Vendor scoreEntry, returning the coverage evidence alongside the score. */
function scoreEntry(
	entry: { id: string; name: string; description: string },
	query: string,
): EntryScore {
	const nq = normalizeSearchText(query);
	const qt = tokenize(query);
	const empty = {
		score: null,
		matched: new Set<string>(),
		coverage: 0,
		exactPhrase: false,
	};
	if (nq.length === 0 || qt.length === 0) return empty;
	const fields = [
		scoreField(nq, qt, entry.id, FIELD_WEIGHTS.id),
		scoreField(nq, qt, entry.name, FIELD_WEIGHTS.name),
		scoreField(nq, qt, "scout", FIELD_WEIGHTS.service),
		scoreField(nq, qt, entry.description, FIELD_WEIGHTS.description),
		scoreField(nq, qt, "operation", FIELD_WEIGHTS.kind),
	];
	const matched = new Set<string>();
	let score = 0;
	let exactPhrase = false;
	for (const f of fields) {
		score += f.score;
		exactPhrase ||= f.exactPhrase;
		for (const t of f.matched) matched.add(t);
	}
	const coverage = matched.size / qt.length;
	if (matched.size === 0) return { ...empty, coverage };
	if (coverage < (qt.length <= 2 ? 1 : 0.6) && !exactPhrase)
		return { score: null, matched, coverage, exactPhrase };
	score += coverage === 1 ? 25 : Math.round(coverage * 10);
	const idTokens = tokenize(entry.id);
	const nameTokens = tokenize(entry.name);
	if (idTokens[0] === qt[0] || nameTokens[0] === qt[0]) score += 8;
	if (
		normalizeSearchText(entry.id) === nq ||
		normalizeSearchText(entry.name) === nq
	)
		score += 20;
	return { score, matched, coverage, exactPhrase };
}

export interface Explanation {
	/** Final replica score, null = gated out even after the stopword rescue. */
	score: number | null;
	/** Coverage gate that applied to the scored query (1 for ≤2 tokens). */
	gate: number;
	/** Share of the scored query's tokens the entry's text covers (Raven's math). */
	coverage: number;
	/** Scored-query tokens Raven's matching leaves uncovered. */
	missing: string[];
	/** Question content words absent as a whole word or ≥3-char prefix — the
	 *  list to edit x-routing against; stopwords never appear here. */
	missingWords: string[];
	exactPhrase: boolean;
	/** True when only the stopword-filtered query reached the entry. */
	rescued: boolean;
}

function indexedTokens(entry: ScoutEntry): string[] {
	return tokenize(
		`${entry.id} ${entry.name} ${entry.description} ${entry.routingKeywords.join(" ")}`,
	);
}

/** Whole-word or ≥3-char prefix (either way) — the edit-worthy notion of "has". */
function hasWord(tokens: string[], word: string): boolean {
	return tokens.some(
		(c) =>
			c === word ||
			(word.length >= 3 && c.startsWith(word)) ||
			(c.length >= 3 && word.startsWith(c)),
	);
}

/**
 * Raven's pipeline for one entry: base score, x-routing blend (1.0), and the
 * stopword rescue. Evidence (coverage/missing) is taken from the augmented
 * pass, i.e. over description + routing keywords — the text we can edit.
 */
export function explain(entry: ScoutEntry, query: string): Explanation {
	const owned = indexedTokens(entry);
	const run = (q: string) => {
		const base = scoreEntry(entry, q);
		const aug = scoreEntry(
			{
				...entry,
				description: `${entry.description} ${entry.routingKeywords.join(" ")}`,
			},
			q,
		);
		let score: number | null;
		if (base.score === null)
			score = aug.score === null ? null : Math.round(aug.score * 1.0);
		else
			score =
				base.score +
				Math.max(0, aug.score === null ? 0 : aug.score - base.score);
		const qt = tokenize(q);
		return {
			score,
			gate: qt.length <= 2 ? 1 : 0.6,
			coverage: Math.round(aug.coverage * 100) / 100,
			missing: qt.filter((t) => !aug.matched.has(t)),
			missingWords: contentTokens(q).filter((t) => !hasWord(owned, t)),
			exactPhrase: aug.exactPhrase,
		};
	};
	const full = run(query);
	if (full.score !== null) return { ...full, rescued: false };
	const filtered = effectiveQuery(query);
	if (filtered === query) return { ...full, rescued: false };
	return { ...run(filtered), rescued: true };
}

/** Scout ops ranked by replica score on a question (gated-out ops dropped). */
export function scoutRanking(entries: ScoutEntry[], query: string): string[] {
	return entries
		.map((e) => ({ op: e.name, score: explain(e, query).score }))
		.filter((r): r is { op: string; score: number } => r.score !== null)
		.sort((a, b) => b.score - a.score || (a.op < b.op ? -1 : 1))
		.map((r) => r.op);
}

/**
 * Which of the question's content tokens are another op's id noun —
 * mirroring the scorer's prefix rule, so "project"/"projects" and
 * "audit"/"audits" collide the way they do live.
 */
export function idNounCollisions(
	question: string,
	entries: ScoutEntry[],
	exclude: Set<string>,
): Array<{ noun: string; token: string; op: string }> {
	const out: Array<{ noun: string; token: string; op: string }> = [];
	const qt = contentTokens(question);
	for (const e of entries) {
		if (exclude.has(e.name)) continue;
		for (const noun of e.idNouns) {
			const token = qt.find(
				(t) => t === noun || t.startsWith(noun) || noun.startsWith(t),
			);
			if (token) out.push({ noun, token, op: e.name });
		}
	}
	return out;
}

/** Question content words our text carries and the live text does not. */
export function lagTokens(
	question: string,
	ours: ScoutEntry,
	live: ScoutEntry,
): string[] {
	const liveTokens = indexedTokens(live);
	const ourTokens = indexedTokens(ours);
	return contentTokens(question).filter(
		(t) => hasWord(ourTokens, t) && !hasWord(liveTokens, t),
	);
}
