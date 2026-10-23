/**
 * locateSource: scored, verifiable source pointers into allowlisted repos
 * (Stellar's own, and OpenZeppelin's Soroban contract library).
 *
 * A pointer names where a fact lives (repo, the commit it was read at, path,
 * a symbol or heading locator, the git blob sha, the line) and why it
 * matched; the caller fetches the file itself. The index stores names and
 * hashes only, never file bodies (scripts/build-source-locators.ts builds
 * it, src/app/api/sources/locate/route.ts serves it). The pointer shape
 * follows the SourcePointer design an MCP consumer published, so it can be
 * adopted as is. Measurements: improvements/audits/2026-10-23-source-locator/
 * and 2026-10-23-locate-ranking/.
 *
 * Ranking is lexical and the same for every query. Each word of q scores by
 * its best form (itself, or a synonym from source-locator-synonyms.ts)
 * against a pointer: the whole symbol (or file name) 8, a symbol holding an
 * identifier of several parts (getEvents in NewGetEventsHandler, six
 * letters or more) 5, else the word's parts that are parts of the symbol or
 * heading 3 times the share found; the word's parts in the path or repo
 * name add 1 times the share. An identifier typed in q (camelCase,
 * snake_case, a flag, kebab-case of three parts, letters with digits such as
 * secp256k1), or a synonym in that form, found whole in a name counts twice
 * its tier. Adjacent plain words of q are also read as one name ("token
 * interface" as TokenInterface): per run of such words, the best span adds 8
 * for the whole symbol, heading or file name, 5 for a name holding it (a
 * symbol only when it holds the whole run), times the square of the share
 * of the run it covers. The share of the name's own parts that q accounts
 * for adds up to 1, so a tighter name wins a near tie. A repo named in q
 * adds 8 to its pointers (3 when named only by quickstart, a docs word too).
 * A stellar-cli command typed in q (stellar contract invoke, or the stellar
 * CLI followed by contract invoke) adds 8 per matching command word to the
 * module that implements it, and counts only when some pointer's module
 * does. Ties: symbols and headings before files, then the shorter path, the
 * repo name, the line.
 */

import { SYNONYMS } from "./source-locator-synonyms";

export const LOCATOR_KINDS = ["file", "symbol", "heading"] as const;
export type PointerKind = (typeof LOCATOR_KINDS)[number];

/** locateSource's meta.matchMode: identifiers split, plurals folded, abbreviations mapped. */
export const LOCATE_MATCH_MODES = ["expanded"] as const;
/** meta.counts.totalBasis when total is null. */
export const LOCATE_TOTAL_BASES = ["not-indexed"] as const;

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
	{
		// Not "stellar-contracts" as an alias: "stellar contracts" in prose
		// would read as naming it. The owner/name in q still does.
		repo: "OpenZeppelin/stellar-contracts",
		role: "implementation",
		aliases: ["openzeppelin"],
		why: "OpenZeppelin's audited contract library for Soroban: fungible and non-fungible tokens, smart accounts with their policies and verifiers, access control, governance",
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

/** The fields ranking and the served pointer read; the route fetches only these. */
export const RANK_FIELDS = [
	"repo",
	"ref",
	"path",
	"locatorKind",
	"locator",
	"line",
	"blobSha",
] as const;
export type RankRow = Pick<IndexRow, (typeof RANK_FIELDS)[number]>;

export function rowKey(
	repo: string,
	path: string,
	kind: PointerKind,
	locator: string | null,
): string {
	return `${repo}|${path}|${kind}|${locator ?? ""}`;
}

/** Repo given as owner/name or name alone, in any case; null when not allowlisted. */
export function resolveRepo(value: string): string | null {
	const v = value.trim().toLowerCase();
	return (
		SOURCE_REPO_NAMES.find(
			(r) => r.toLowerCase() === v || r.split("/")[1].toLowerCase() === v,
		) ?? null
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

/** Lowercased word parts of an identifier, heading or path, stemmed, in order (repeats kept). */
function wordSeq(s: string): string[] {
	return s
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((w) => w.length > 1 || /\d/.test(w))
		.map((w) => {
			const st = stem(w);
			return CANON.get(st) ?? CANON.get(w) ?? st;
		});
}

/** Lowercased word parts of an identifier, heading or path, stemmed. */
export function subwords(s: string): string[] {
	return [...new Set(wordSeq(s))];
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

/**
 * One term of q. A unit scores its best form: itself or one of `alts`.
 * typed: written as an identifier (camelCase, PascalCase, snake_case,
 * a::path, a.member, a --flag, or letters run into digits as in
 * secp256k1); word: a plain word; joined: a span of adjacent plain words
 * read as one name ("token interface" for TokenInterface).
 */
export interface QueryUnit {
	raw: string;
	key: string;
	words: string[];
	kind: "word" | "typed" | "joined";
	alts: QueryUnit[];
	/** joined only: the run of adjacent words it came from, and that run's length. */
	run?: number;
	runLength?: number;
}

export interface ParsedQuery {
	units: QueryUnit[];
	/** Spans of adjacent plain words, two to four long; per run only the best span counts. */
	joined: QueryUnit[];
	/** Allowlisted repos q names (owner/name, repo name or alias). */
	repos: string[];
	/** What naming each repo adds to its pointers: WEIGHTS.repo, or WEIGHTS.repoWord for a bare common-word alias. */
	repoLift: Record<string, number>;
	/** A stellar-cli command typed in q (`stellar contract invoke`), its words after the binary; null when none. */
	command: string[] | null;
}

function cleanToken(t: string): string {
	return t
		.replace(/[^\w]+$/, "")
		.replace(/['’]s$/i, "")
		.replace(/^[^\w-]+|[^\w]+$/g, "")
		.replace(/^-(?!-)/, "");
}

const TYPED =
	/[a-z0-9][A-Z]|[A-Za-z0-9]_[A-Za-z0-9]|^_+[A-Za-z]|::|[a-z0-9]\.[A-Za-z]|^--[A-Za-z]|[A-Za-z][0-9]|[0-9][A-Za-z]/;
/** kebab-case of three parts or more names a command or an option (calculate-asset-supply). */
const KEBAB = /^[a-z][a-z0-9]+(?:-[a-z][a-z0-9]+){2,}$/;
/** A plain word, an acronym or letters with digits (poseidon2): may join its neighbours. */
const JOINABLE = /^(?:[A-Z]?[a-z0-9]+|[A-Z0-9]+)$/;
// Stopwords for search that still name code, so they may sit inside a
// joined name or a command: StellarAssetContract, protocol_version,
// `stellar contract build`, `stellar contract alias show`.
const JOINS_THOUGH_STOPWORD = new Set(["stellar", "protocol", "build", "show"]);
// An alias that is also a docs word ("a quickstart guide") lifts its repo by
// WEIGHTS.repoWord, not WEIGHTS.repo.
const COMMON_WORD_ALIASES = new Set(["quickstart"]);
const ENDS_RUN = /[,.;:!?)\]}"'`]$/;
const STARTS_RUN = /^[([{"'`]/;
const MAX_SPAN = 4;

/** stellar-cli's command tree: `stellar contract invoke` is commands/contract/invoke.rs. */
export const CLI_COMMANDS = {
	repo: "stellar/stellar-cli",
	root: "cmd/soroban-cli/src/commands/",
	binaries: ["stellar", "soroban"],
} as const;

function synonymAlts(key: string, words: string[]): QueryUnit[] {
	const found = new Set<string>();
	for (const k of [key, stem(key), ...words])
		for (const a of SYNONYMS.get(k)?.alts ?? []) found.add(a);
	return [...found].map((raw) => ({
		raw,
		key: identKey(raw),
		words: subwords(raw),
		kind: TYPED.test(raw) ? "typed" : "word",
		alts: [],
	}));
}

export function parseQuery(
	q: string,
	isStopword: (w: string) => boolean,
): ParsedQuery {
	const parts = q
		.split(/\s+/)
		.map((raw) => ({ raw, t: cleanToken(raw) }))
		.filter((p) => p.t);
	const tokens = parts.map((p) => p.t);
	const consumed = new Set<number>();
	const repos = new Set<string>();
	const repoLift: Record<string, number> = {};
	const lift = (repo: string, weight: number) => {
		repos.add(repo);
		repoLift[repo] = Math.max(repoLift[repo] ?? 0, weight);
	};
	// The last token of an alias naming stellar-cli ("the stellar CLI"): a
	// command may follow it.
	const cliAliasEnds = new Set<number>();
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
					lift(
						r.repo,
						COMMON_WORD_ALIASES.has(alias) ? WEIGHTS.repoWord : WEIGHTS.repo,
					);
					for (let k = i; k < j; k++) consumed.add(k);
					if (r.repo === CLI_COMMANDS.repo) cliAliasEnds.add(j - 1);
				}
			}
		}
	}
	tokens.forEach((t, i) => {
		const named = t.includes("/") ? resolveRepo(t) : null;
		if (named) {
			lift(named, WEIGHTS.repo);
			consumed.add(i);
		}
	});
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
		const typed =
			(TYPED.test(raw) && (words.length > 1 || /\d|^--/.test(raw))) ||
			KEBAB.test(raw);
		units.push({
			raw,
			key,
			words,
			kind: typed ? "typed" : "word",
			alts: synonymAlts(key, words),
		});
	};
	tokens.forEach((t, i) => {
		if (!consumed.has(i)) make(t);
	});
	// A q that is only a repo name still searches by those words.
	if (!units.length) for (const i of consumed) make(tokens[i]);

	// Runs of adjacent plain words; a stopword, a filler word, a repo name,
	// an identifier or punctuation (a comma, a bracket, a quote) ends a run.
	const runs: string[][] = [[]];
	const close = () => {
		if (runs[runs.length - 1].length) runs.push([]);
	};
	tokens.forEach((t, i) => {
		const lower = t.toLowerCase();
		const joins =
			!consumed.has(i) &&
			JOINABLE.test(t) &&
			!FILLER.has(lower) &&
			(!isStopword(lower) || JOINS_THOUGH_STOPWORD.has(lower)) &&
			subwords(t).length > 0;
		if (STARTS_RUN.test(parts[i].raw)) close();
		if (joins) runs[runs.length - 1].push(t);
		else close();
		if (ENDS_RUN.test(parts[i].raw)) close();
	});
	const joined: QueryUnit[] = [];
	runs.forEach((run, r) => {
		for (let len = 2; len <= Math.min(MAX_SPAN, run.length); len++)
			for (let s = 0; s + len <= run.length; s++) {
				const span = run.slice(s, s + len);
				joined.push({
					raw: span.join(" "),
					key: identKey(span.join("")),
					words: span.flatMap(wordSeq),
					kind: "joined",
					alts: [],
					run: r,
					runLength: run.length,
				});
			}
	});

	// stellar or soroban, or an alias naming stellar-cli ("the stellar CLI"),
	// then two or more lowercase command words: the first such run counts.
	// Alias and filler words are skipped; punctuation, a quote or a stopword
	// ends the run, as it ends a joined run.
	let command: string[] | null = null;
	for (let bin = 0; bin < tokens.length && !command; bin++) {
		const binary =
			!consumed.has(bin) &&
			(CLI_COMMANDS.binaries as readonly string[]).includes(tokens[bin]);
		if (!(binary || cliAliasEnds.has(bin)) || ENDS_RUN.test(parts[bin].raw))
			continue;
		const words: string[] = [];
		for (let i = bin + 1; i < tokens.length && words.length < 4; i++) {
			const t = tokens[i];
			if (STARTS_RUN.test(parts[i].raw)) break;
			if (!consumed.has(i) && !FILLER.has(t)) {
				if (!/^[a-z][a-z0-9-]*$/.test(t)) break;
				if (isStopword(t) && !JOINS_THOUGH_STOPWORD.has(t)) break;
				words.push(t);
			}
			if (ENDS_RUN.test(parts[i].raw)) break;
		}
		if (words.length >= 2) command = words;
	}
	return { units, joined, repos: [...repos], repoLift, command };
}

/** Module path prefixes under stellar-cli's commands tree that a typed command names, two words or more. */
export function commandPrefixes(command: string[] | null): string[] {
	if (!command) return [];
	const segs = command.map((w) => w.replace(/-/g, "_"));
	return segs
		.slice(1)
		.map((_, i) => `${CLI_COMMANDS.root}${segs.slice(0, i + 2).join("/")}`);
}

/** How many leading command words a stellar-cli file's module path matches (0 when under 2). */
export function commandDepth(
	command: string[] | null,
	repo: string,
	path: string,
): number {
	if (!command || repo !== CLI_COMMANDS.repo) return 0;
	if (!path.startsWith(CLI_COMMANDS.root) || !path.endsWith(".rs")) return 0;
	const mod = path.slice(CLI_COMMANDS.root.length, -3).split("/");
	if (mod.at(-1) === "mod") mod.pop();
	let n = 0;
	while (
		n < mod.length &&
		n < command.length &&
		mod[n] === command[n].replace(/-/g, "_")
	)
		n++;
	return n >= 2 ? n : 0;
}

/** Most candidate rows one query reads before ranking; past it the answer says it was cut. */
export const CANDIDATE_CAP = 20_000;
/** Pointers per page, and the last page the candidate cap can fill. */
export const LOCATE_PAGE_SIZE = 10;
export const LOCATE_MAX_PAGE = CANDIDATE_CAP / LOCATE_PAGE_SIZE;

/**
 * Terms a candidate row must carry (any one), key prefixes for symbol-prefix
 * matches, and the stellar-cli module paths a typed command names (every row
 * under them is read, whatever its terms).
 */
export function candidateTerms(pq: ParsedQuery): {
	exact: string[];
	prefixes: string[];
	paths: string[];
} {
	const exact = new Set<string>();
	const prefixes = new Set<string>();
	for (const u of pq.units)
		for (const f of [u, ...u.alts]) {
			exact.add(f.key);
			exact.add(f.raw.toLowerCase());
			for (const w of f.words) exact.add(w);
			if (f.key.length >= 6) prefixes.add(f.key);
		}
	return {
		exact: [...exact],
		prefixes: [...prefixes],
		paths: commandPrefixes(pq.command),
	};
}

/** The same rows the route reads: a term (or term prefix) in common, or a path under a typed command's module. */
export function isCandidate(
	row: Pick<IndexRow, "terms" | "repo" | "path">,
	c: { exact: string[]; prefixes: string[]; paths?: string[] },
): boolean {
	const exact = new Set(c.exact);
	return (
		row.terms.some(
			(t) => exact.has(t) || c.prefixes.some((p) => t.startsWith(p)),
		) ||
		(row.repo === CLI_COMMANDS.repo &&
			(c.paths ?? []).some(
				(p) => row.path === `${p}.rs` || row.path.startsWith(`${p}/`),
			))
	);
}

/** The route's driver filter for the command branch of isCandidate. */
export function commandPathPattern(paths: string[]): string | null {
	if (!paths.length) return null;
	const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return `^(?:${paths.map(esc).join("|")})(?:\\.rs$|/)`;
}

export const WEIGHTS = {
	exact: 8,
	prefix: 5,
	word: 3,
	path: 1,
	/** A repo named in q by owner/name or a hyphenated alias (stellar-rpc). */
	repo: 8,
	/** A repo named only by a bare alias that is also a docs word (quickstart). */
	repoWord: 3,
	/** Times the share of the name's own words that q accounts for: a tighter name wins a tie. */
	name: 1,
	/** An identifier typed in q, found whole in a name, counts this many times its tier. */
	typed: 2,
} as const;

export interface Scored {
	row: RankRow;
	/** How many of q's words this pointer matched at all. */
	matched: number;
	total: number;
	score: number;
	matchReason: string;
	factors: string;
}

type Hit = "exact" | "prefix" | "word" | "path";

interface FormMatch {
	loc: number;
	path: number;
	hit: Hit;
	why: string;
	inLoc: string[];
	/** An identifier typed in q (or a synonym in identifier form) found whole in the name. */
	ident: boolean;
}

function indexOfRun(hay: string[], needle: string[]): number {
	for (let i = 0; i + needle.length <= hay.length; i++)
		if (needle.every((w, k) => hay[i + k] === w)) return i;
	return -1;
}

export function scoreRow(pq: ParsedQuery, row: RankRow): Scored | null {
	const isFile = row.locatorKind === "file" || !row.locator;
	const isSymbol = row.locatorKind === "symbol";
	const locator = row.locator ?? "";
	const locKey = identKey(locator);
	const segKey = identKey(lastSegment(locator));
	const locSeq = isFile ? [] : wordSeq(locator);
	const locWords = new Set(locSeq);
	const pWords = pathWords(row.repo, row.path);
	const base = baseName(row.path).toLowerCase();
	const counts: Record<Hit, number> = { exact: 0, prefix: 0, word: 0, path: 0 };
	const reasons: string[] = [];
	let total = 0;
	let matched = 0;
	let idHits = 0;
	const nameHits = new Set<string>();
	// One form of a unit against this pointer. The locator's own match: the
	// whole name; an identifier of several parts held inside it (getEvents in
	// NewGetEventsHandler); else the share of the form's words that are parts
	// of it. A single word held inside a name without being one of its parts
	// (six letters or more only) counts as a word, never above one.
	const match = (f: QueryUnit): FormMatch | null => {
		let loc = 0;
		let hit: Hit | null = null;
		let why = "";
		const held = isSymbol && f.key.length >= 6 && locKey.includes(f.key);
		const inLoc = f.words.filter((w) => locWords.has(w));
		if (
			isFile
				? f.raw.toLowerCase() === base
				: isSymbol && (f.key === locKey || f.key === segKey)
		) {
			loc = WEIGHTS.exact;
			hit = "exact";
			why = `${isFile ? "file" : "symbol"} ${f.raw}`;
		} else if (held && f.words.length > 1) {
			loc = WEIGHTS.prefix;
			hit = "prefix";
			why = `symbol holds ${f.raw}`;
		} else if (inLoc.length) {
			loc = (WEIGHTS.word * inLoc.length) / f.words.length;
			hit = "word";
			why = `${row.locatorKind} has ${inLoc.join(" ")}`;
		} else if (held) {
			loc = WEIGHTS.word;
			hit = "word";
			why = `symbol holds ${f.raw}`;
		}
		// The path's words add to it: a symbol in a file named for the same thing is stronger.
		const inPath = f.words.filter((w) => pWords.has(w));
		const path = (WEIGHTS.path * inPath.length) / f.words.length;
		if (path) {
			if (!hit) {
				hit = "path";
				why = `path has ${inPath.join(" ")}`;
			} else why += ", path too";
		}
		if (!hit) return null;
		// An identifier typed in q, found whole (the name is it, holds it, or
		// holds all its parts), counts WEIGHTS.typed times.
		const ident =
			f.kind === "typed" &&
			(hit === "exact" ||
				hit === "prefix" ||
				(hit === "word" && inLoc.length === f.words.length));
		if (ident) loc *= WEIGHTS.typed;
		return { loc, path, hit, why, inLoc, ident };
	};
	for (const u of pq.units) {
		let best: FormMatch | null = null;
		let bestForm = u;
		// A synonym in identifier form (secp256r1, TokenInterface) counts as if typed.
		for (const f of [u, ...u.alts]) {
			const m = match(f);
			if (m && (!best || m.loc + m.path > best.loc + best.path)) {
				best = m;
				bestForm = f;
			}
		}
		if (!best) continue;
		for (const w of best.inLoc) nameHits.add(w);
		counts[best.hit]++;
		matched++;
		total += best.loc + best.path;
		if (best.ident) idHits++;
		reasons.push(bestForm.raw === u.raw ? best.why : `${u.raw} as ${best.why}`);
	}
	// Adjacent words read as one name: per run, the best span, times the
	// square of the share of the run it covers, so the name that spans the
	// user's phrase beats one that spans a piece of it. Matched against a
	// symbol, a heading, or a file's name without its extension; a symbol
	// that only holds a span inside its name counts it when the span is the
	// whole run (INCLUSION_FEE_TITLE holds "inclusion fee", not "default
	// inclusion fee").
	const named = isFile
		? wordSeq(baseName(row.path).replace(/\.[^.]+$/, ""))
		: locSeq;
	const byRun = new Map<number, { loc: number; why: string }>();
	for (const j of pq.joined) {
		if (indexOfRun(named, j.words) < 0) continue;
		const whole = j.words.length === named.length;
		const span = j.raw.split(" ").length;
		const runLength = j.runLength ?? span;
		if (!whole && isSymbol && span !== runLength) continue;
		const loc =
			(whole ? WEIGHTS.exact : WEIGHTS.prefix) * (span / runLength) ** 2;
		const prev = byRun.get(j.run ?? 0);
		if (!prev || loc > prev.loc)
			byRun.set(j.run ?? 0, {
				loc,
				why: whole
					? `${isFile ? "file" : row.locatorKind} ${j.raw}`
					: `${row.locatorKind} holds ${j.raw}`,
			});
	}
	for (const m of byRun.values()) {
		total += m.loc;
		reasons.push(m.why);
	}
	const depth = commandDepth(pq.command, row.repo, row.path);
	if (depth) {
		total += WEIGHTS.exact * depth;
		reasons.unshift(`implements ${pq.command?.slice(0, depth).join(" ")}`);
	}
	if (!matched && !byRun.size && !depth) return null;
	const nameShare = locWords.size ? nameHits.size / locWords.size : 0;
	total += WEIGHTS.name * nameShare;
	const repoLift = pq.repoLift[row.repo] ?? 0;
	if (repoLift) {
		total += repoLift;
		reasons.push("repo named in q");
	}
	// The most a pointer could score for this q: each unit at its strongest
	// form (a synonym in identifier form counts as typed), every run's join,
	// the tightest name, the largest repo lift, every command word.
	const max =
		pq.units.reduce(
			(n, u) =>
				n +
				WEIGHTS.exact *
					Math.max(
						...[u, ...u.alts].map((f) =>
							f.kind === "typed" ? WEIGHTS.typed : 1,
						),
					) +
				WEIGHTS.path,
			0,
		) +
		WEIGHTS.exact * new Set(pq.joined.map((j) => j.run)).size +
		WEIGHTS.name +
		Math.max(0, ...Object.values(pq.repoLift)) +
		WEIGHTS.exact * (pq.command?.length ?? 0);
	const matchReason = reasons.join("; ");
	return {
		row,
		matched,
		total,
		score: Math.min(100, Math.round((100 * total) / max)),
		matchReason:
			matchReason.length > 100 ? `${matchReason.slice(0, 99)}…` : matchReason,
		factors: `words:${matched}/${pq.units.length} exact:${counts.exact} prefix:${counts.prefix} word:${counts.word} path:${counts.path} join:${byRun.size} ident:${idHits} cmd:${depth} repo:${repoLift ? 1 : 0} name:${nameShare.toFixed(2)}`,
	};
}

const KIND_ORDER: Record<PointerKind, number> = {
	symbol: 0,
	heading: 0,
	file: 1,
};

export function rankRows(
	pq: ParsedQuery,
	rows: RankRow[],
	filter: { repo?: string | null; kind?: PointerKind | null } = {},
): Scored[] {
	const pool = rows.filter(
		(row) =>
			(!filter.repo || row.repo === filter.repo) &&
			(!filter.kind || row.locatorKind === filter.kind),
	);
	// A command no pointer here implements ("how stellar contracts store
	// data") adds nothing, not even to the score's maximum.
	const q =
		pq.command &&
		!pool.some((row) => commandDepth(pq.command, row.repo, row.path) > 0)
			? { ...pq, command: null }
			: pq;
	const out: Scored[] = [];
	for (const row of pool) {
		const s = scoreRow(q, row);
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
