/**
 * Partner coverage: does Scout surface the partners SDF has announced, as a
 * row of the right type, with a status and network that match the source?
 *
 * The rules are the 2026-11-11 read-only measurement's, made mechanical: no
 * judge, no /api/ask. The reads are injected (`Get`), so every rule here runs
 * in a unit test; scripts/eval/partner-coverage.ts supplies the paced reader,
 * the fixture (scripts/eval/partner-coverage.json) and the committed baseline.
 *
 * Trinary: a read that failed after retries returns null and makes the check
 * could-not-check. That is never a miss and never a regression. A request the
 * API refuses (a 4xx other than 429) is the eval itself broken: `EvalBroken`.
 */

export type SourceStatus = "live" | "announced" | "coming";
export type Cls =
	| "well"
	| "wrong"
	| "research-only"
	| "missing"
	| "could-not-check";
export type Check = "pass" | "fail" | "unknown" | "could-not-check" | "n/a";
export const CHECKS = [
	"rank",
	"types",
	"status",
	"website",
	"network",
	"resolve",
] as const;
export type CheckName = (typeof CHECKS)[number];

export interface Partner {
	name: string;
	category: string;
	weight: number;
	source: {
		url: string;
		date: string | null;
		/** Why `date` is null. */
		dateNote?: string;
		/** sdf: an SDF page. partner: the partner's own page. operator: listed
		 * from its operator's own site, not an SDF announcement. */
		owner: "sdf" | "partner" | "operator";
		status: SourceStatus;
		says: string;
	};
	aliases: string[];
	queries: string[];
	domains: string[];
	expectedSlug: string | null;
	/** Other rows reviewed as the same partner (a company row beside its
	 * product row); they count as the partner wherever the expected row does. */
	alsoSlugs?: string[];
	expectedTypes: string[];
	/** Statuses the source allows; derived from source.status when absent. */
	expectedStatus?: string[];
	expectedNetwork?: { network: "mainnet" | "testnet"; source: string };
	/** false: only the announcement URL counts as research coverage. */
	researchMentions?: boolean;
	/** A research mention counts only within CONTEXT_CHARS of a word starting
	 * with one of these, for a partner named by a common word. */
	researchContext?: string[];
	notes?: string;
}

export interface Override {
	reason: string;
	expectedSlug?: string | null;
	alsoSlugs?: string[];
	expectedTypes?: string[];
	expectedStatus?: string[];
	domainsAdd?: string[];
	researchMentions?: boolean;
	researchContext?: string[];
}
const OVERRIDE_KEYS = new Set([
	"reason",
	"expectedSlug",
	"alsoSlugs",
	"expectedTypes",
	"expectedStatus",
	"domainsAdd",
	"researchMentions",
	"researchContext",
]);

export interface Question {
	id: string;
	question: string;
	type: string | null;
	expected: string[];
}

export interface Fixture {
	k: { partner: number; question: number };
	categories: Record<string, string>;
	partners: Partner[];
	questions: Question[];
	overrides: Record<string, Override>;
}

/** A JSON GET; null when the read failed after retries. */
export type Get = (
	path: string,
	params: Record<string, string | number>,
) => Promise<unknown>;

export interface PartnerResult {
	name: string;
	category: string;
	weight: number;
	expectedSlug: string | null;
	cls: Cls;
	checks: Record<CheckName, Check>;
	row: {
		slug: string;
		name: string;
		rank: number;
		query: string;
		types: string[];
		status: string | null;
		website: string | null;
		network: string | null;
	} | null;
	resolvedVia: string | null;
	problems: string[];
	research: { announcement: boolean; mentions: string[] } | null;
}

export interface QuestionVariant {
	variant: "q" | "q+type";
	state: "read" | "could-not-check";
	/** Expected partner name to its rank in the top k. */
	found: Record<string, number>;
	recall: number | null;
	total: number | null;
}

export interface QuestionResult extends Question {
	k: number;
	variants: QuestionVariant[];
}

export interface Baseline {
	$comment?: string;
	generatedAt: string;
	apiVersion: string | null;
	partners: Record<
		string,
		{ cls: Cls; checks: Record<CheckName, Check>; rank?: number | null }
	>;
	questions: Record<
		string,
		Record<string, { recall: number | null; found: string[] }>
	>;
}

export interface Comparison {
	regressions: string[];
	improvements: string[];
	/** Moves that are neither: research-only and missing, a swap past k. */
	changes: string[];
	stale: string[];
	unbaselined: string[];
	notCompared: string[];
	/** Unread units of partners the baseline holds with a row (well or
	 * wrong): no verdict, whatever the unreadable budget. */
	unreadableWithRow: string[];
}

interface Row {
	slug?: string;
	name?: string;
	types?: string[];
	status?: string;
	links?: { website?: string };
	deployment?: { network?: string };
}

/** Applies the reviewed overrides and refuses a fixture that cannot score:
 * an override with no reason, no partner or an unknown key, and a question
 * that expects no partner or an unknown one. */
export function applyOverrides(f: Fixture): Partner[] {
	const names = new Set(f.partners.map((p) => p.name));
	if (names.size !== f.partners.length)
		throw new Error("duplicate partner names in the fixture");
	for (const [n, o] of Object.entries(f.overrides)) {
		if (!names.has(n)) throw new Error(`override for unknown partner '${n}'`);
		if (!o.reason?.trim()) throw new Error(`override '${n}' has no reason`);
		const bad = Object.keys(o).filter((key) => !OVERRIDE_KEYS.has(key));
		if (bad.length)
			throw new Error(`override '${n}' has unknown keys: ${bad.join(", ")}`);
	}
	for (const q of f.questions) {
		if (!q.expected.length) throw new Error(`${q.id} expects no partner`);
		for (const n of q.expected)
			if (!names.has(n))
				throw new Error(`${q.id} expects unknown partner '${n}'`);
	}
	return f.partners.map((p) => {
		const o = f.overrides[p.name];
		if (!o) return p;
		const { reason: _reason, domainsAdd, ...fields } = o;
		return { ...p, ...fields, domains: [...p.domains, ...(domainsAdd ?? [])] };
	});
}

const norm = (s: string | undefined | null) =>
	(s ?? "")
		.toLowerCase()
		.replace(/[^a-z0-9.]+/g, " ")
		.trim();

function host(u: string | undefined | null): string {
	if (!u) return "";
	try {
		const h = new URL(u.includes("://") ? u : `https://${u}`).hostname;
		return h.replace(/^www\./, "");
	} catch {
		return "";
	}
}

const onDomain = (h: string, domains: string[]) =>
	!!h && domains.some((d) => h === d || h.endsWith(`.${d}`));

const normUrl = (u: string) =>
	u
		.toLowerCase()
		.replace(/^https?:\/\//, "")
		.replace(/^www\./, "")
		.replace(/[?#].*$/, "")
		.replace(/\/+$/, "");

/** The row's name, its name without a parenthetical, or its slug is one of
 * the partner's names. A row that only contains a name is a look-alike. */
function nameMatch(r: Row, p: Partner): boolean {
	const names = new Set([p.name, ...p.aliases].map(norm));
	return [
		norm(r.name),
		norm((r.name ?? "").replace(/\(.*?\)/g, "")),
		norm((r.slug ?? "").replace(/-/g, " ")),
	].some((n) => n && names.has(n));
}

/** Domains under stellar.org check a website but never identify a row. */
const domainMatch = (r: Row, p: Partner) =>
	onDomain(
		host(r.links?.website),
		p.domains.filter((d) => !d.endsWith("stellar.org")),
	);

const isPartnerRow = (r: Row, p: Partner) =>
	p.expectedSlug
		? r.slug === p.expectedSlug || !!p.alsoSlugs?.includes(r.slug ?? "")
		: nameMatch(r, p) || domainMatch(r, p);

export function allowedStatus(p: Partner): string[] {
	if (p.expectedStatus) return p.expectedStatus;
	if (p.source.status === "live") return ["Live"];
	if (p.source.status === "coming")
		return ["Draft", "Development", "Pre-Release"];
	return ["Draft", "Development", "Pre-Release", "Live"];
}

function rowsOf(d: unknown, key: "projects" | "results"): Row[] | null {
	const v = (d as Record<string, unknown> | null)?.[key];
	return Array.isArray(v) ? (v as Row[]) : null;
}

const CONTEXT_CHARS = 80;
const reEscape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function mentions(text: string, p: Partner): boolean {
	const t = norm(text);
	const context = p.researchContext?.length
		? new RegExp(
				`\\b(?:${p.researchContext.map((w) => reEscape(norm(w))).join("|")})`,
			)
		: null;
	return p.aliases
		.filter((a) => a.length > 2)
		.some((a) => {
			for (const m of t.matchAll(
				new RegExp(`\\b${reEscape(norm(a))}\\b`, "g"),
			)) {
				if (!context) return true;
				const at = m.index ?? 0;
				const near = t.slice(
					Math.max(0, at - CONTEXT_CHARS),
					at + m[0].length + CONTEXT_CHARS,
				);
				if (context.test(near)) return true;
			}
			return false;
		});
}

export async function scorePartner(
	p: Partner,
	get: Get,
	k: number,
): Promise<PartnerResult> {
	const checks: Record<CheckName, Check> = {
		rank: "n/a",
		types: "n/a",
		status: "n/a",
		website: "n/a",
		network: "n/a",
		resolve: "n/a",
	};
	const problems: string[] = [];
	const out: PartnerResult = {
		name: p.name,
		category: p.category,
		weight: p.weight,
		expectedSlug: p.expectedSlug,
		cls: "could-not-check",
		checks,
		row: null,
		resolvedVia: null,
		problems,
		research: null,
	};

	// Search: the partner's queries in order, stopping at the first hit.
	let hit: { r: Row; rank: number; query: string } | null = null;
	let namesake: { slug: string; rank: number; query: string } | null = null;
	for (const query of p.queries) {
		const rows = rowsOf(
			await get("/api/projects/search", { q: query, limit: k }),
			"projects",
		);
		if (!rows) {
			for (const c of CHECKS)
				checks[c] =
					c === "resolve" && !p.expectedSlug ? "n/a" : "could-not-check";
			problems.push(`search for '${query}' could not be read`);
			return out;
		}
		rows.slice(0, k).forEach((r, i) => {
			if (hit) return;
			if (isPartnerRow(r, p)) hit = { r, rank: i + 1, query };
			else if (p.expectedSlug && !namesake && nameMatch(r, p))
				namesake = { slug: r.slug ?? "", rank: i + 1, query };
		});
		if (hit) break;
	}

	// Resolve: depth only, for partners with a row to resolve to.
	if (p.expectedSlug) {
		let unreadable = false;
		const others: string[] = [];
		checks.resolve = "fail";
		for (const query of [...new Set([p.name, ...p.queries])]) {
			const d = (await get("/api/projects/resolve", { q: query })) as {
				found?: boolean;
				subject?: { slug?: string } | null;
				current?: { slug?: string } | null;
			} | null;
			if (!d || typeof d.found !== "boolean") {
				unreadable = true;
				continue;
			}
			const slugs = [d.subject?.slug, d.current?.slug];
			if (d.found && slugs.includes(p.expectedSlug)) {
				checks.resolve = "pass";
				out.resolvedVia = query;
				break;
			}
			if (d.found) others.push(`'${query}' to ${slugs[0] ?? slugs[1]}`);
		}
		if (checks.resolve === "fail" && unreadable)
			checks.resolve = "could-not-check";
		if (checks.resolve === "fail")
			problems.push(
				`resolve finds ${p.expectedSlug} under none of its names${others.length ? ` (resolves ${others.join(", ")})` : ""}`,
			);
	}

	if (hit) {
		const { r, rank, query } = hit as { r: Row; rank: number; query: string };
		const website = r.links?.website ?? null;
		const network = r.deployment?.network ?? null;
		out.row = {
			slug: r.slug ?? "",
			name: r.name ?? "",
			rank,
			query,
			types: r.types ?? [],
			status: r.status ?? null,
			website,
			network,
		};
		checks.rank = query === p.queries[0] ? "pass" : "fail";
		if (checks.rank === "fail")
			problems.push(`'${p.queries[0]}' misses; found only via '${query}'`);
		else if (rank > 1) problems.push(`rank ${rank} for its own name`);
		checks.types = (r.types ?? []).some((t) => p.expectedTypes.includes(t))
			? "pass"
			: "fail";
		if (checks.types === "fail")
			problems.push(
				`types [${(r.types ?? []).join(", ")}], expected one of [${p.expectedTypes.join(", ")}]`,
			);
		checks.status = allowedStatus(p).includes(r.status ?? "") ? "pass" : "fail";
		if (checks.status === "fail")
			problems.push(
				`status ${r.status ?? "none"} (source: ${p.source.status})`,
			);
		checks.website = onDomain(host(website), p.domains) ? "pass" : "fail";
		if (checks.website === "fail")
			problems.push(
				website ? `website ${host(website)}` : "no website on the row",
			);
		if (p.expectedNetwork) {
			const want = p.expectedNetwork.network;
			checks.network =
				network === want
					? "pass"
					: !network || network === "unknown"
						? "unknown"
						: "fail";
			if (checks.network !== "pass")
				problems.push(`network ${network ?? "none"}, sourced ${want}`);
		}
		if (!p.expectedSlug)
			problems.push(
				`new row ${r.slug}: review it and set expectedSlug in the fixture`,
			);
		const core: CheckName[] = ["rank", "types", "status", "website"];
		out.cls =
			core.every((c) => checks[c] === "pass") && checks.network !== "fail"
				? "well"
				: "wrong";
		return out;
	}

	checks.rank = "fail";
	if (namesake) {
		const n = namesake as { slug: string; rank: number; query: string };
		problems.push(
			`'${n.query}' ranks ${n.slug} at ${n.rank}, expected ${p.expectedSlug}`,
		);
		out.cls = "wrong";
		return out;
	}
	if (p.expectedSlug && checks.resolve === "pass") {
		problems.push(
			`row ${p.expectedSlug} exists but ranks outside the top ${k}`,
		);
		out.cls = "wrong";
		return out;
	}
	if (p.expectedSlug && checks.resolve === "could-not-check") return out;

	const results = rowsOf(
		await get("/api/research", { q: `${p.queries[0]} stellar`, limit: 5 }),
		"results",
	) as Array<{ url?: string; title?: string; content?: string }> | null;
	if (!results) {
		problems.push("research could not be read");
		return out;
	}
	const ann = normUrl(p.source.url);
	out.research = {
		announcement: results.some((x) => normUrl(x.url ?? "") === ann),
		mentions:
			p.researchMentions === false
				? []
				: results
						.filter((x) => mentions(`${x.title ?? ""} ${x.content ?? ""}`, p))
						.map((x) => x.title ?? x.url ?? ""),
	};
	out.cls =
		out.research.announcement || out.research.mentions.length
			? "research-only"
			: "missing";
	return out;
}

export async function scoreQuestion(
	q: Question,
	partners: Map<string, Partner>,
	get: Get,
	k: number,
): Promise<QuestionResult> {
	const variants: QuestionVariant[] = [];
	const asks: Array<
		[QuestionVariant["variant"], Record<string, string | number>]
	> = [["q", { q: q.question, limit: k }]];
	if (q.type) asks.push(["q+type", { q: q.question, type: q.type, limit: k }]);
	for (const [variant, params] of asks) {
		const d = await get("/api/projects/search", params);
		const rows = rowsOf(d, "projects");
		if (!rows) {
			variants.push({
				variant,
				state: "could-not-check",
				found: {},
				recall: null,
				total: null,
			});
			continue;
		}
		const found: Record<string, number> = {};
		rows.slice(0, k).forEach((r, i) => {
			const n = q.expected.find((e) => {
				const p = partners.get(e);
				return !(e in found) && p && isPartnerRow(r, p);
			});
			if (n) found[n] = i + 1;
		});
		const total = (d as { meta?: { counts?: { total?: unknown } } }).meta
			?.counts?.total;
		variants.push({
			variant,
			state: "read",
			found,
			recall: Object.keys(found).length / q.expected.length,
			total: typeof total === "number" ? total : null,
		});
	}
	return { ...q, k, variants };
}

export const CLASSES: Cls[] = [
	"well",
	"wrong",
	"research-only",
	"missing",
	"could-not-check",
];
/** Ratchet tiers. research-only and missing share one: both mean no row, and
 * the line between them is a vector top 5 that can turn on one document. */
const TIER: Record<Cls, number> = {
	well: 3,
	wrong: 2,
	"research-only": 1,
	missing: 1,
	"could-not-check": -1,
};
const CHECK_ORDER: Partial<Record<Check, number>> = {
	pass: 2,
	unknown: 1,
	fail: 0,
};

export function summarize(
	partners: PartnerResult[],
	questions: QuestionResult[],
) {
	const zero = () =>
		Object.fromEntries(CLASSES.map((c) => [c, 0])) as Record<Cls, number>;
	const totals = zero();
	const byCategory: Record<string, Record<Cls, number>> = {};
	const depth = Object.fromEntries(
		CHECKS.map((c) => [c, {} as Record<string, number>]),
	) as Record<CheckName, Record<string, number>>;
	for (const p of partners) {
		totals[p.cls]++;
		byCategory[p.category] ??= zero();
		byCategory[p.category][p.cls]++;
		for (const c of CHECKS)
			depth[c][p.checks[c]] = (depth[c][p.checks[c]] ?? 0) + 1;
	}
	// Units: each partner's class, each resolve asked, each question variant.
	const variants = questions.flatMap((q) => q.variants);
	const resolves = partners.filter((p) => p.checks.resolve !== "n/a");
	const units =
		totals["could-not-check"] +
		resolves.filter((p) => p.checks.resolve === "could-not-check").length +
		variants.filter((v) => v.state === "could-not-check").length;
	const total = partners.length + resolves.length + variants.length;
	return {
		totals,
		byCategory,
		depth,
		unreadable: { units, total, share: total ? units / total : 0 },
	};
}

/** The partner's rank for its own name, or null when it has none. */
const ownRank = (p: PartnerResult) =>
	p.checks.rank === "pass" ? (p.row?.rank ?? null) : null;

export function toBaseline(
	partners: PartnerResult[],
	questions: QuestionResult[],
	meta: { generatedAt: string; apiVersion: string | null },
): Baseline {
	return {
		$comment:
			"Partner coverage ratchet: the state of every fixture partner and question at the last reviewed run. scripts/eval/partner-coverage.ts fails on any worse state and prints better ones. Rewrite only with --update-baseline after reviewing the change.",
		...meta,
		partners: Object.fromEntries(
			partners.map((p) => [
				p.name,
				{ cls: p.cls, rank: ownRank(p), checks: { ...p.checks } },
			]),
		),
		questions: Object.fromEntries(
			questions.map((q) => [
				q.id,
				Object.fromEntries(
					q.variants.map((v) => [
						v.variant,
						{ recall: v.recall, found: Object.keys(v.found).sort() },
					]),
				),
			]),
		),
	};
}

export function compareToBaseline(
	partners: PartnerResult[],
	questions: QuestionResult[],
	b: Baseline,
): Comparison {
	const c: Comparison = {
		regressions: [],
		improvements: [],
		changes: [],
		stale: [],
		unbaselined: [],
		notCompared: [],
		unreadableWithRow: [],
	};
	const names = new Set(partners.map((p) => p.name));
	for (const n of Object.keys(b.partners))
		if (!names.has(n)) c.stale.push(`partner ${n}`);
	for (const p of partners) {
		const was = b.partners[p.name];
		if (!was) {
			c.unbaselined.push(`partner ${p.name}`);
			continue;
		}
		const rowed = was.cls === "well" || was.cls === "wrong";
		if (p.cls === "could-not-check") {
			c.notCompared.push(p.name);
			if (rowed) c.unreadableWithRow.push(p.name);
			continue;
		}
		const move = `${p.name}: ${was.cls} -> ${p.cls}`;
		if (TIER[p.cls] < TIER[was.cls]) c.regressions.push(move);
		else if (TIER[p.cls] > TIER[was.cls]) c.improvements.push(move);
		else if (p.cls !== was.cls) c.changes.push(move);
		for (const k of CHECKS) {
			const before = was.checks[k];
			const now = p.checks[k];
			if (now === "could-not-check") {
				if (before !== "n/a" && before !== "could-not-check") {
					c.notCompared.push(`${p.name}: ${k}`);
					if (rowed) c.unreadableWithRow.push(`${p.name}: ${k}`);
				}
				continue;
			}
			const from = CHECK_ORDER[before];
			const to = CHECK_ORDER[now];
			if (from === undefined || to === undefined || from === to) continue;
			(to < from ? c.regressions : c.improvements).push(
				`${p.name}: ${k} ${before} -> ${now}`,
			);
		}
		const from = was.rank ?? null;
		const to = ownRank(p);
		if (from !== null && to !== null && from !== to)
			(to > from ? c.regressions : c.improvements).push(
				`${p.name}: rank ${from} -> ${to} for its own name`,
			);
	}
	const ids = new Set(questions.map((q) => q.id));
	for (const id of Object.keys(b.questions))
		if (!ids.has(id)) c.stale.push(`question ${id}`);
	for (const q of questions) {
		const was = b.questions[q.id];
		if (!was) {
			c.unbaselined.push(`question ${q.id}`);
			continue;
		}
		for (const variant of Object.keys(was))
			if (!q.variants.some((v) => v.variant === variant))
				c.stale.push(`question ${q.id} (${variant})`);
		for (const v of q.variants) {
			const tag = `${q.id} (${v.variant})`;
			const before = was[v.variant];
			if (!before) {
				c.unbaselined.push(`question ${tag}`);
				continue;
			}
			if (v.state === "could-not-check" || before.recall === null) {
				c.notCompared.push(tag);
				continue;
			}
			const now = Object.keys(v.found);
			const lost = before.found.filter((n) => !now.includes(n));
			const gained = now.filter((n) => !before.found.includes(n));
			const pct = (x: number | null) => `${Math.round((x ?? 0) * 100)}%`;
			const line = `${tag}: recall ${pct(before.recall)} -> ${pct(v.recall)}`;
			const detail = `${line}, lost ${lost.join(", ")}${gained.length ? `, gained ${gained.join(", ")}` : ""}`;
			// More expected partners than k: a gain must push one out, so only a
			// smaller count is a regression; a swap is a change.
			const capped = q.expected.length > q.k;
			if (lost.length && (!capped || now.length < before.found.length))
				c.regressions.push(detail);
			else if (lost.length) c.changes.push(detail);
			else if (gained.length)
				c.improvements.push(`${line}, gained ${gained.join(", ")}`);
		}
	}
	return c;
}

/** Scores between two API version reads; when the version moved (a deploy
 * mid-run) or could not be read, scores once more before giving up. */
export async function stableRun<T>(
	version: () => Promise<string | null>,
	score: () => Promise<T>,
	tries = 2,
): Promise<{
	result: T;
	start: string | null;
	end: string | null;
	moved: boolean;
	attempts: number;
}> {
	for (let attempts = 1; ; attempts++) {
		const start = await version();
		const result = await score();
		const end = await version();
		const moved = !start || start !== end;
		if (!moved || attempts >= tries)
			return { result, start, end, moved, attempts };
	}
}

/** Why a run gives no verdict (exit 2), or null when it gives one. */
export function noVerdict(o: {
	start: string | null;
	end: string | null;
	share: number;
	max: number;
	cmp: Pick<Comparison, "unreadableWithRow"> | null;
}): string | null {
	const pct = (x: number) => `${Math.round(x * 100)}%`;
	if (!o.start || o.start !== o.end)
		return `the API version moved mid-run (${o.start} -> ${o.end}) or could not be read, on the rerun too`;
	if (o.share > o.max)
		return `${pct(o.share)} unreadable, above the stated ${pct(o.max)}`;
	if (o.cmp?.unreadableWithRow.length)
		return `unreadable units of partners the baseline holds with a row (well or wrong): ${o.cmp.unreadableWithRow.join(", ")}`;
	return null;
}

/** A request the API refused (a 4xx other than 429): the eval is broken,
 * not production unreadable. */
export class EvalBroken extends Error {}

/** Paced JSON GETs: at most one start per `gapMs`, Retry-After on 429,
 * backoff on 5xx and network errors, null after the last attempt. */
export function pacedReader(o: {
	base: string;
	userAgent: string;
	gapMs: number;
	attempts: number;
	fetch?: typeof fetch;
	sleep?: (ms: number) => Promise<void>;
	now?: () => number;
	log?: (line: string) => void;
}): { get: Get; stats: { requests: number; failed: number } } {
	const doFetch = o.fetch ?? fetch;
	const sleep =
		o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
	const now = o.now ?? Date.now;
	const stats = { requests: 0, failed: 0 };
	let last = Number.NEGATIVE_INFINITY;
	const get: Get = async (path, params) => {
		const qs = new URLSearchParams(
			Object.entries(params).map(([k, v]) => [k, String(v)]),
		).toString();
		const url = `${o.base}${path}${qs ? `?${qs}` : ""}`;
		let why = "";
		for (let attempt = 1; attempt <= o.attempts; attempt++) {
			const wait = last + o.gapMs - now();
			if (wait > 0) await sleep(wait);
			last = now();
			stats.requests++;
			try {
				const res = await doFetch(url, {
					headers: { "User-Agent": o.userAgent, Accept: "application/json" },
					signal:
						typeof AbortSignal.timeout === "function"
							? AbortSignal.timeout(60_000)
							: undefined,
				});
				if (res.ok) return await res.json();
				why = `HTTP ${res.status}`;
				if (res.status === 429) {
					const ra = Number(res.headers.get("retry-after"));
					await sleep(Math.min(ra > 0 ? ra : 10, 60) * 1000);
					continue;
				}
				if (res.status < 500)
					throw new EvalBroken(
						`${url}: HTTP ${res.status}. The API refused the request itself, so the eval is broken, not production unreadable.`,
					);
			} catch (e) {
				if (e instanceof EvalBroken) throw e;
				why = e instanceof Error ? e.message : String(e);
			}
			if (attempt < o.attempts) await sleep(5000 * attempt);
		}
		stats.failed++;
		o.log?.(`could not read ${url} (${why})`);
		return null;
	};
	return { get, stats };
}
