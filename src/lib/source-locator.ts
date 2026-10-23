/**
 * locateSource: scored, verifiable source pointers into Stellar's own repos.
 *
 * A pointer names where a fact lives (repo, the commit it was read at, path,
 * a symbol or heading locator, the git blob sha, the line) and why it
 * matched; the caller fetches the file itself. The index stores names and
 * hashes only, never file bodies (scripts/build-source-locators.ts builds
 * it). The pointer shape follows the SourcePointer design an MCP consumer
 * published, so it can be adopted as is. Measured, not yet served: see
 * improvements/audits/2026-10-23-source-locator/.
 *
 * Ranking is lexical and the same for every query. Each word of q scores by
 * its best match against a pointer: the whole symbol (or file name) 8, a
 * symbol holding an identifier of several parts (getEvents in
 * NewGetEventsHandler, six letters or more) 5, else the word's parts that
 * are parts of the symbol or heading 3 times the share found; the word's
 * parts in the path or repo name add 1 times the share. The share of the
 * name's own parts that q accounts for adds up to 1, so a tighter name wins
 * a near tie. A repo named in q adds 3 to its pointers. Ties: symbols and
 * headings before files, then the shorter path, the repo name, the line.
 */

export const LOCATOR_KINDS = ["file", "symbol", "heading"] as const;
export type PointerKind = (typeof LOCATOR_KINDS)[number];

export const AUTHORITY_ROLES = [
	"implementation",
	"tooling",
	"reference-docs",
] as const;
export type AuthorityRole = (typeof AUTHORITY_ROLES)[number];

/** The allowlist. A repo is here for the authority of its code, never for one question. */
export const SOURCE_REPOS: ReadonlyArray<{
	repo: string;
	role: AuthorityRole;
	aliases: readonly string[];
	why: string;
}> = [
	{
		repo: "stellar/stellar-core",
		role: "implementation",
		aliases: ["stellar-core"],
		why: "the validator: protocol rules, ledger close, config keys and their defaults",
	},
	{
		repo: "stellar/rs-soroban-sdk",
		role: "implementation",
		aliases: ["rs-soroban-sdk", "soroban-sdk"],
		why: "the Rust contract SDK every Soroban contract compiles against",
	},
	{
		repo: "stellar/rs-soroban-env",
		role: "implementation",
		aliases: ["rs-soroban-env", "soroban-env", "soroban-env-host"],
		why: "the Soroban host: host functions, budget and metering, auth",
	},
	{
		repo: "stellar/js-stellar-sdk",
		role: "implementation",
		aliases: ["js-stellar-sdk", "stellar-sdk"],
		why: "the JavaScript SDK: RPC and Horizon clients, contract client, transaction building",
	},
	{
		repo: "stellar/stellar-rpc",
		role: "implementation",
		aliases: ["stellar-rpc", "soroban-rpc"],
		why: "the RPC server: method handlers and operator-configurable options",
	},
	{
		repo: "stellar/quickstart",
		role: "implementation",
		aliases: ["quickstart"],
		why: "the local network image: its start script holds flags and defaults the docs omit",
	},
	{
		repo: "stellar/stellar-cli",
		role: "tooling",
		aliases: ["stellar-cli", "soroban-cli"],
		why: "the CLI: command flags, environment variables, defaults",
	},
	{
		repo: "stellar/soroban-examples",
		role: "reference-docs",
		aliases: ["soroban-examples"],
		why: "reference contracts: the canonical token, swap and auth examples",
	},
];

export const SOURCE_REPO_NAMES = SOURCE_REPOS.map((r) => r.repo);

/** One stored pointer: names, hashes and a line, never a file body. */
export interface IndexRow {
	key: string;
	repo: string;
	ref: string;
	path: string;
	locatorKind: PointerKind;
	locator: string | null;
	line: number | null;
	blobSha: string;
	terms: string[];
}

export function rowKey(
	repo: string,
	path: string,
	kind: PointerKind,
	locator: string | null,
): string {
	return `${repo}|${path}|${kind}|${locator ?? ""}`;
}

/** Repo given as owner/name or name alone; null when not allowlisted. */
export function resolveRepo(value: string): string | null {
	const v = value.trim().toLowerCase();
	return (
		SOURCE_REPO_NAMES.find((r) => r === v || r.split("/")[1] === v) ?? null
	);
}

// A Map, not an object literal: subwords("constructor") must not read Object.prototype.
const CANON = new Map(
	Object.entries({
		maximum: "max",
		minimum: "min",
		configuration: "config",
		configure: "config",
		configured: "config",
		cfg: "config",
		conf: "config",
		authorization: "auth",
		authorize: "auth",
		authentication: "auth",
		initialize: "init",
		initialise: "init",
		environment: "env",
		parameter: "param",
		argument: "arg",
		tx: "transaction",
		txn: "transaction",
		addr: "address",
	}),
);

function stem(w: string): string {
	if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
	if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss"))
		return w.slice(0, -1);
	return w;
}

/** Lowercased word parts of an identifier, heading or path, stemmed. */
export function subwords(s: string): string[] {
	const words = s
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((w) => w.length > 1 || /\d/.test(w));
	const out = new Set<string>();
	for (const w of words) {
		const st = stem(w);
		out.add(CANON.get(st) ?? CANON.get(w) ?? st);
	}
	return [...out];
}

/** Case- and separator-blind form: --enable-core-manual-close, ENABLE_CORE_MANUAL_CLOSE and enableCoreManualClose agree. */
export function identKey(s: string): string {
	return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const lastSegment = (locator: string) => locator.split("::").pop() ?? locator;
const baseName = (path: string) => path.split("/").pop() ?? path;

/** Match terms stored on a row: its words, plus its whole-name keys. */
export function rowTerms(
	kind: PointerKind,
	locator: string | null,
	path: string,
): string[] {
	const terms = new Set<string>();
	if (kind === "file" || !locator) {
		for (const w of subwords(path)) terms.add(w);
		terms.add(baseName(path).toLowerCase());
	} else {
		for (const w of subwords(locator)) terms.add(w);
		if (kind === "symbol") {
			terms.add(identKey(locator));
			terms.add(identKey(lastSegment(locator)));
		}
	}
	terms.delete("");
	return [...terms];
}

/** Repo words count as path words: "rpc" finds stellar-rpc, "examples" soroban-examples. */
function pathWords(repo: string, path: string): Set<string> {
	return new Set([...subwords(repo.split("/")[1]), ...subwords(path)]);
}

// Locator-question filler on top of the shared stopwords: "where is X
// defined", "which file implements Y". Plain words only; an identifier
// (camelCase, snake_case, a flag) is never dropped.
const FILLER = new Set([
	"a",
	"function",
	"functions",
	"method",
	"methods",
	"defined",
	"define",
	"defines",
	"definition",
	"implemented",
	"implement",
	"implements",
	"implementation",
	"file",
	"files",
	"code",
	"source",
	"sources",
	"located",
	"locate",
	"location",
	"live",
	"lives",
	"set",
	"sets",
	"part",
	"explains",
	"explain",
	"documented",
	"document",
	"declared",
	"declare",
	"handled",
	"parsed",
	"versus",
]);

export interface QueryUnit {
	raw: string;
	key: string;
	words: string[];
}

export interface ParsedQuery {
	units: QueryUnit[];
	/** Allowlisted repos q names (by repo name or alias). */
	repos: string[];
}

function cleanToken(t: string): string {
	return t
		.replace(/[^\w]+$/, "")
		.replace(/['’]s$/i, "")
		.replace(/^[^\w-]+|[^\w]+$/g, "")
		.replace(/^-(?!-)/, "");
}

export function parseQuery(
	q: string,
	isStopword: (w: string) => boolean,
): ParsedQuery {
	const tokens = q.split(/\s+/).map(cleanToken).filter(Boolean);
	const consumed = new Set<number>();
	const repos = new Set<string>();
	const tokenWords = tokens.map((t) =>
		t.toLowerCase().split(/-+/).filter(Boolean),
	);
	for (const r of SOURCE_REPOS) {
		for (const alias of r.aliases) {
			const want = alias.split("-");
			for (let i = 0; i < tokens.length; i++) {
				const got: string[] = [];
				let j = i;
				while (j < tokens.length && got.length < want.length)
					got.push(...tokenWords[j++]);
				if (got.join(" ") === want.join(" ")) {
					repos.add(r.repo);
					for (let k = i; k < j; k++) consumed.add(k);
				}
			}
		}
	}
	const units: QueryUnit[] = [];
	const seen = new Set<string>();
	const make = (raw: string) => {
		const plain = /^[a-z]+$/i.test(raw) && !/[a-z][A-Z]/.test(raw);
		const lower = raw.toLowerCase();
		if (plain && (isStopword(lower) || FILLER.has(lower))) return;
		const words = subwords(raw).filter((w) => !(plain && isStopword(w)));
		const key = identKey(raw);
		if (!words.length || key.length < 2 || seen.has(key)) return;
		seen.add(key);
		units.push({ raw, key, words });
	};
	tokens.forEach((t, i) => {
		if (!consumed.has(i)) make(t);
	});
	// A q that is only a repo name still searches by those words.
	if (!units.length) for (const i of consumed) make(tokens[i]);
	return { units, repos: [...repos] };
}

/** Most candidate rows one query reads before ranking; past it the answer says it was cut. */
export const CANDIDATE_CAP = 20_000;

/** Terms a candidate row must carry (any one), and key prefixes for symbol-prefix matches. */
export function candidateTerms(pq: ParsedQuery): {
	exact: string[];
	prefixes: string[];
} {
	const exact = new Set<string>();
	const prefixes = new Set<string>();
	for (const u of pq.units) {
		exact.add(u.key);
		exact.add(u.raw.toLowerCase());
		for (const w of u.words) exact.add(w);
		if (u.key.length >= 6) prefixes.add(u.key);
	}
	return { exact: [...exact], prefixes: [...prefixes] };
}

export function isCandidate(
	row: Pick<IndexRow, "terms">,
	c: { exact: string[]; prefixes: string[] },
): boolean {
	const exact = new Set(c.exact);
	return row.terms.some(
		(t) => exact.has(t) || c.prefixes.some((p) => t.startsWith(p)),
	);
}

export const WEIGHTS = {
	exact: 8,
	prefix: 5,
	word: 3,
	path: 1,
	repo: 3,
	/** Times the share of the name's own words that q accounts for: a tighter name wins a tie. */
	name: 1,
} as const;

export interface Scored {
	row: IndexRow;
	/** How many of q's words this pointer matched at all. */
	matched: number;
	total: number;
	score: number;
	matchReason: string;
	factors: string;
}

type Hit = "exact" | "prefix" | "word" | "path";

export function scoreRow(pq: ParsedQuery, row: IndexRow): Scored | null {
	const isFile = row.locatorKind === "file" || !row.locator;
	const isSymbol = row.locatorKind === "symbol";
	const locator = row.locator ?? "";
	const locKey = identKey(locator);
	const segKey = identKey(lastSegment(locator));
	const locWords = new Set(isFile ? [] : subwords(locator));
	const pWords = pathWords(row.repo, row.path);
	const base = baseName(row.path).toLowerCase();
	const counts: Record<Hit, number> = { exact: 0, prefix: 0, word: 0, path: 0 };
	const reasons: string[] = [];
	let total = 0;
	let matched = 0;
	const nameHits = new Set<string>();
	for (const u of pq.units) {
		// The locator's own match: the whole name; an identifier of several
		// parts held inside it (getEvents in NewGetEventsHandler); else the
		// share of u's words that are parts of it. A single word held inside
		// a name without being one of its parts (six letters or more only)
		// counts as a word, never above one.
		let loc = 0;
		let hit: Hit | null = null;
		let why = "";
		const held = isSymbol && u.key.length >= 6 && locKey.includes(u.key);
		const inLoc = u.words.filter((w) => locWords.has(w));
		for (const w of inLoc) nameHits.add(w);
		if (
			isFile
				? u.raw.toLowerCase() === base
				: isSymbol && (u.key === locKey || u.key === segKey)
		) {
			loc = WEIGHTS.exact;
			hit = "exact";
			why = `${isFile ? "file" : "symbol"} ${u.raw}`;
		} else if (held && u.words.length > 1) {
			loc = WEIGHTS.prefix;
			hit = "prefix";
			why = `symbol holds ${u.raw}`;
		} else if (inLoc.length) {
			loc = (WEIGHTS.word * inLoc.length) / u.words.length;
			hit = "word";
			why = `${row.locatorKind} has ${inLoc.join(" ")}`;
		} else if (held) {
			loc = WEIGHTS.word;
			hit = "word";
			why = `symbol holds ${u.raw}`;
		}
		// The path's words add to it: a symbol in a file named for the same thing is stronger.
		const inPath = u.words.filter((w) => pWords.has(w));
		const path = (WEIGHTS.path * inPath.length) / u.words.length;
		if (path) {
			if (!hit) {
				hit = "path";
				why = `path has ${inPath.join(" ")}`;
			} else why += ", path too";
		}
		if (hit) {
			counts[hit]++;
			matched++;
			total += loc + path;
			reasons.push(why);
		}
	}
	if (!matched) return null;
	const nameShare = locWords.size ? nameHits.size / locWords.size : 0;
	total += WEIGHTS.name * nameShare;
	const repoNamed = pq.repos.includes(row.repo);
	if (repoNamed) {
		total += WEIGHTS.repo;
		reasons.push("repo named in q");
	}
	const max =
		(WEIGHTS.exact + WEIGHTS.path) * pq.units.length +
		WEIGHTS.name +
		(pq.repos.length ? WEIGHTS.repo : 0);
	const matchReason = reasons.join("; ");
	return {
		row,
		matched,
		total,
		score: Math.min(100, Math.round((100 * total) / max)),
		matchReason:
			matchReason.length > 100 ? `${matchReason.slice(0, 99)}…` : matchReason,
		factors: `words:${matched}/${pq.units.length} exact:${counts.exact} prefix:${counts.prefix} word:${counts.word} path:${counts.path} repo:${repoNamed ? 1 : 0} name:${nameShare.toFixed(2)}`,
	};
}

const KIND_ORDER: Record<PointerKind, number> = {
	symbol: 0,
	heading: 0,
	file: 1,
};

export function rankRows(
	pq: ParsedQuery,
	rows: IndexRow[],
	filter: { repo?: string | null; kind?: PointerKind | null } = {},
): Scored[] {
	const out: Scored[] = [];
	for (const row of rows) {
		if (filter.repo && row.repo !== filter.repo) continue;
		if (filter.kind && row.locatorKind !== filter.kind) continue;
		const s = scoreRow(pq, row);
		if (s) out.push(s);
	}
	return out.sort(
		(a, b) =>
			b.total - a.total ||
			KIND_ORDER[a.row.locatorKind] - KIND_ORDER[b.row.locatorKind] ||
			a.row.path.length - b.row.path.length ||
			a.row.repo.localeCompare(b.row.repo) ||
			(a.row.line ?? 0) - (b.row.line ?? 0) ||
			(a.row.locator ?? "").localeCompare(b.row.locator ?? ""),
	);
}

export function verificationUrl(
	repo: string,
	ref: string,
	path: string,
	line: number | null,
): string {
	const p = path.split("/").map(encodeURIComponent).join("/");
	return `https://github.com/${repo}/blob/${ref}/${p}${line ? `#L${line}` : ""}`;
}

/** Markdown is reference docs wherever it lives; code takes its repo's role. */
export function authorityRole(repo: string, path: string): AuthorityRole {
	if (/\.mdx?$/i.test(path)) return "reference-docs";
	return SOURCE_REPOS.find((r) => r.repo === repo)?.role ?? "implementation";
}
