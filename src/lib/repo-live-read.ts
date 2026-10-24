/**
 * A bounded, read-only look at one public GitHub repo in the request path:
 * what a judge opening the repo finds. reviewSubmission's judging block reads
 * it for a repo Scout never stored.
 *
 * Reads (GitHub REST, 4 calls): the repo itself; its default branch's newest
 * commit and its newest release; then the tree at that commit. Then the
 * README and up to 12 manifests from raw.githubusercontent.com at the same
 * commit, off the REST pool. Every part comes from that one commit, never
 * from the ref HEAD, which GitHub resolves to a branch named HEAD when one
 * exists. Facts come from the scan lane's own parsers (extractStellarDeps,
 * detectStellarProof); nothing here writes anywhere.
 *
 * Bounds, so a burst of reviews never drains the scan lane's token:
 * - one deadline for the whole read (LIVE_READ_BUDGET_MS);
 * - at most LIVE_READ_HOURLY_CALLS REST calls per server instance per hour,
 *   and at most LIVE_READ_CALLER_SHARE of them for any one caller;
 * - no call while the token's pool is under LIVE_READ_POOL_FLOOR (read from
 *   GitHub's x-ratelimit-remaining), until GitHub's reset time;
 * - raw files read only to a byte cap, uncompressed, the stream cut there;
 * - one read per repo per CACHE_MS, shared by concurrent callers.
 * A part that did not answer is listed in `unread`, with its own reason in
 * `unreadWhy`, and its facts are null: could not check, never a no. A repo
 * that is not public is never read past its metadata and answers missing.
 */
import { detectStellarProof } from "@/lib/code-signals";
import { githubToken } from "@/lib/github";
import { extractStellarDeps } from "@/lib/stellar-deps";

export const LIVE_READ_PARTS = [
	"metadata",
	"tree",
	"manifests",
	"readme",
	"commits",
	"releases",
] as const;
export type LiveReadPart = (typeof LIVE_READ_PARTS)[number];

export const LIVE_READ_BUDGET_MS = 4000;
export const LIVE_READ_HOURLY_CALLS = 240;
/** The most of an instance's hourly calls one caller (an IP, or a partner
 * key) may spend: a quarter, so one caller cannot empty it for the rest. */
export const LIVE_READ_CALLER_SHARE = 0.25;
export const LIVE_READ_POOL_FLOOR = 1500;
const CACHE_MS = 5 * 60_000;
/** A read with a part missing is retried sooner. */
const PARTIAL_CACHE_MS = 60_000;
const CACHE_MAX = 500;
const MAX_MANIFESTS = 12;
/** Raw bytes read, the stream cut there: the README's head, and a manifest,
 * which past its cap is not read at all. */
const README_MAX_BYTES = 100_000;
const MANIFEST_MAX_BYTES = 512 * 1024;
/** A read's REST calls: the repo, the newest commit, the releases, the tree. */
const CALLS_PER_READ = 4;
const KEEP_PATHS = 10;
const UA = "stellarlight-review (+https://stellarlight.xyz)";

export interface LiveRepoFacts {
	/** owner/name as GitHub answers it (a renamed repo answers its new name). */
	fullName: string;
	url: string;
	defaultBranch: string;
	/** The default branch's newest commit, the one commit every part was read
	 * at; null for an empty repository or when the commits did not answer. */
	commit: string | null;
	archived: boolean;
	createdAt: string | null;
	/** The repo's website field; null = none set. */
	website: string | null;
	/** GitHub answered that the repository has no commits. */
	empty: boolean;
	/** null = the tree was not read. Paths are a sample; counts are totals. */
	tree: {
		complete: boolean;
		tests: string[];
		testCount: number;
		ci: string[];
	} | null;
	/** null = the tree was not read, so no manifest was. */
	manifests: {
		read: number;
		unread: number;
		/** extractStellarDeps over the package.json and Cargo.toml files read. */
		packages: string[];
		/** A Stellar SDK another language's manifest declares
		 * (detectStellarProof's lang-sdk marker, e.g. python:requirements.txt). */
		otherSdk: string | null;
		sorobanSdk: string | null;
		stellarJsDep: string | null;
		cargoRead: number;
		cargoUnread: number;
		/** Directories of Cargo.toml files that declare soroban-sdk and build a
		 * cdylib outside examples and tests (the scan's deployable rule). */
		contractCrates: string[];
	} | null;
	/** undefined = not read (unreadWhy.readme says why, a listing cut short
	 * among the reasons); null = no README at the root of a full listing. */
	readme?: {
		path: string;
		chars: number;
		truncated: boolean;
		contractIds: string[];
		demoLinks: string[];
		otherLinks: string[];
	} | null;
	/** null = not read. */
	commits: { count: number; lastAt: string | null } | null;
	/** null = not read. */
	releases: {
		count: number;
		latestTag: string | null;
		latestAt: string | null;
	} | null;
}

export type LiveRead =
	| {
			state: "read";
			readAt: string;
			readMs: number;
			unread: LiveReadPart[];
			/** Each unread part's own reason, in one sentence. */
			unreadWhy: Partial<Record<LiveReadPart, string>>;
			facts: LiveRepoFacts;
	  }
	/** GitHub answered 404, or the repo is not public. */
	| { state: "missing"; readAt: string; readMs: number }
	/** The repo's metadata did not answer: nothing could be checked. */
	| { state: "unread"; readAt: string; readMs: number; reason: string };

// ── Path rules over the tree ─────────────────────────────────────────────────

const VENDORED = /(^|\/)(node_modules|vendor|target|dist|build|\.next|out)\//;
const CODE_FILE =
	/\.(rs|[cm]?[jt]sx?|py|go|sol|move|java|kt|swift|dart|rb|php|cs|c|cc|cpp|h)$/i;
/** Test-naming conventions only, never a guess from a name: the scan's test
 * directories (code-signals' testsPresent), JS and TS *.test.* and *.spec.*,
 * the scan's Rust test-module names (selectDepthPaths), Go's *_test.go and
 * pytest's defaults. A file named otherwise is not counted (a generator
 * called generate_tests.py is not a test; withdraw-test.mts follows no
 * convention). The finding names these, so a count is checkable as stated. */
export const TEST_CONVENTIONS =
	"test directories (tests/, test/, __tests__/, spec/, e2e/, cypress/); *.test.* and *.spec.*; Rust test.rs, tests.rs, test_*.rs and *_test(s).rs; Go *_test.go; Python test_*.py, *_test.py and conftest.py";
const TEST_DIR = /(^|\/)(tests?|__tests__|spec|e2e|cypress)\//i;
const TEST_FILE =
	/\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)tests?\.rs$|(^|\/)test_[^/]*\.rs$|_tests?\.rs$|_test\.go$|(^|\/)test_[^/]*\.py$|_test\.py$|(^|\/)conftest\.py$/i;

/** Code files that follow a test-naming convention, outside vendored trees. */
export function testPaths(paths: string[]): string[] {
	return paths.filter(
		(p) =>
			!VENDORED.test(p) &&
			CODE_FILE.test(p) &&
			(TEST_FILE.test(p) || TEST_DIR.test(p)),
	);
}

const CI_FILE =
	/^\.github\/workflows\/[^/]+\.ya?ml$|^\.circleci\/config\.ya?ml$|^\.gitlab-ci\.ya?ml$|^\.travis\.ya?ml$|^azure-pipelines\.ya?ml$|^Jenkinsfile$|^bitbucket-pipelines\.ya?ml$/i;

export function ciPaths(paths: string[]): string[] {
	return paths.filter((p) => CI_FILE.test(p));
}

/** Manifests the scan's parsers read: package.json and Cargo.toml for the
 * package list, and the other languages' files detectStellarProof knows. */
const MANIFEST =
	/(^|\/)(package\.json|cargo\.toml|go\.mod|pubspec\.yaml|package\.swift|podfile|build\.gradle(\.kts)?|libs\.versions\.toml|requirements\.txt|pyproject\.toml|setup\.py|setup\.cfg|pom\.xml|composer\.json)$/i;
const DEFERRED =
	/(^|\/)(examples?|tests?|fixtures?|benches?|templates?|test[-_]wasms)(\/|$)/i;

/** Manifests in read order: shallow first, examples and tests last. */
export function manifestPaths(paths: string[]): string[] {
	const depth = (p: string) => p.split("/").length;
	return paths
		.filter((p) => MANIFEST.test(p) && !VENDORED.test(p))
		.sort(
			(a, b) =>
				Number(DEFERRED.test(a)) - Number(DEFERRED.test(b)) ||
				depth(a) - depth(b) ||
				(a < b ? -1 : a > b ? 1 : 0),
		);
}

/** The README GitHub shows on the repo page: one at the root. */
export function readmePath(paths: string[]): string | null {
	const roots = paths.filter((p) =>
		/^readme(\.(md|markdown|mdx|rst|txt|org|adoc))?$/i.test(p),
	);
	return roots.find((p) => /\.md$/i.test(p)) ?? roots[0] ?? null;
}

// ── README ───────────────────────────────────────────────────────────────────

/** Hosts whose pages are code, docs, explorers, badges, chats or local
 * addresses: never the team's own demo, whatever the link says. */
const NOT_A_DEMO =
	/(^|\.)(github\.com|githubusercontent\.com|gitlab\.com|bitbucket\.org|shields\.io|badgen\.net|codecov\.io|coveralls\.io|stellar\.org|stellar\.expert|stellarchain\.io|steexp\.com|docs\.rs|crates\.io|npmjs\.com|npmjs\.org|pypi\.org|rust-lang\.org|rustup\.rs|nodejs\.org|python\.org|go\.dev|golang\.org|opensource\.org|creativecommons\.org|twitter\.com|x\.com|t\.me|telegram\.me|discord\.gg|discord\.com|linkedin\.com|example\.com|example\.org|localhost)$|^docs\.|^(127\.|0\.0\.0\.0|10\.|192\.168\.)/i;
/** Words a README uses for the team's own running product or its video.
 * "Live" and "hosted" count only as a label ("Live:", "live demo", "hosted
 * version"), never as an adjective or a verb ("a live API playground"
 * labelled a docs link; a docs portal's specs "are hosted at" one). */
const DEMO_CUE =
	/\b(demo|live (demo|app|site|version|link|project|url|preview|deployment)|hosted (app|demo|version|site|instance)|deployed|deployment|try it|try the app|launch app|open app|playground|walkthrough|website|project link)\b|\b(live|hosted)\s*:/i;
/** A link its own words call documentation is not a demo, whatever else
 * they say ("Live Documentation Portal", "Demo docs"). */
const DOCS_WORDS = /\b(docs?|documentation)\b/i;
const URL_RE = /https?:\/\/[^\s)<>"'`|\]]+/g;
/** Where any link ends on a line: a markdown link, a bare URL, an anchor. */
const LINK_END = /\]\([^)]*\)|https?:\/\/[^\s)<>"'`|\]]+|<\/a>/g;

const hostOf = (u: string): string | null => {
	try {
		return new URL(u).hostname.toLowerCase();
	} catch {
		return null;
	}
};

/** The words that label a link, and only its own: its markdown label (a
 * badge's alt text for [![alt](img)](url)), an HTML anchor's text, and the
 * words between it and the previous link on its own line (in a table, the
 * cell before it). Never the line above: in a badge row, or a sentence
 * wrapped onto the link's line, those words belong to something else. */
function labelOf(text: string, start: number, end: number): string {
	const lineStart = text.lastIndexOf("\n", start - 1) + 1;
	let line = text.slice(lineStart, start);
	const own =
		/\[!\[([^\]]*)\]\([^)]*\)\]\($/.exec(line) ?? /\[([^\]]*)\]\($/.exec(line);
	if (own) line = line.slice(0, own.index);
	line = line.replace(/<a\s[^>]*href=["']?$/i, "");
	const since = Math.max(
		0,
		...[...line.matchAll(LINK_END)].map((m) => (m.index ?? 0) + m[0].length),
	);
	let lead = line.slice(since);
	if (lead.includes("|"))
		lead =
			lead
				.split("|")
				.filter((cell) => cell.trim())
				.at(-1) ?? "";
	const sentence = lead.split(/[.!?]\s/).at(-1) ?? lead;
	const anchor =
		/^["'][^>]*>([\s\S]{0,240}?)<\/a>/i
			.exec(text.slice(end, end + 300))?.[1]
			?.replace(/<[^>]+>/g, " ") ?? "";
	return `${sentence} ${own?.[1] ?? ""} ${anchor}`;
}

/** What a judge reading the README head finds: contract ids it names,
 * links labelled as the team's demo, live app or video, and the other
 * external links (not judged). Images and badges are skipped. */
export function readmeEvidence(text: string): {
	contractIds: string[];
	demoLinks: string[];
	otherLinks: string[];
} {
	const contractIds = [...new Set(text.match(/\bC[A-Z2-7]{55}\b/g) ?? [])];
	// GitHub shows no HTML comment, so no link inside one is read. Its line
	// breaks stay, so every other link keeps its own line.
	const shown = text.replace(/<!--[\s\S]*?-->/g, (c) =>
		c.replace(/[^\n]/g, ""),
	);
	const demo: string[] = [];
	const other: string[] = [];
	for (const m of shown.matchAll(URL_RE)) {
		const url = m[0].replace(/[.,;:!?*_]+$/, "");
		const start = m.index ?? 0;
		const host = hostOf(url);
		if (!host || NOT_A_DEMO.test(host)) continue;
		// An image or badge: ![alt](url) or <img src="url">.
		const lead = shown.slice(Math.max(0, start - 300), start);
		if (/!\[[^\]]*\]\($/.test(lead) || /<img\b[^>]*src=["']$/i.test(lead))
			continue;
		if (/\.(png|jpe?g|gif|svg|webp|ico)(\?|$)/i.test(url)) continue;
		const label = labelOf(shown, start, start + m[0].length);
		(DEMO_CUE.test(label) && !DOCS_WORDS.test(label) ? demo : other).push(url);
	}
	const key = (u: string) => u.replace(/\/+$/, "").toLowerCase();
	const uniq = (xs: string[]) =>
		xs.filter((u, i) => xs.findIndex((v) => key(v) === key(u)) === i);
	const demoLinks = uniq(demo);
	return {
		contractIds,
		demoLinks,
		otherLinks: uniq(other).filter(
			(u) => !demoLinks.some((d) => key(d) === key(u)),
		),
	};
}

/** The total behind a per_page=1 list: the Link header's last page, or the
 * rows returned when there is one page. */
export function pageCount(link: string | null, rows: number): number {
	const m = /[?&]page=(\d+)[^>]*>;\s*rel="last"/.exec(link ?? "");
	return m ? Number(m[1]) : rows;
}

// ── Budget ───────────────────────────────────────────────────────────────────

const budget = {
	hourStart: 0,
	calls: 0,
	poolLowUntil: 0,
	byCaller: new Map<string, number>(),
};
type Denial = "pool" | "server" | "caller";
const DENIED: Record<Denial, string> = {
	pool: "GitHub reports the calls left on the token Scout reads with under the floor it keeps for its scan, so no live read runs until GitHub's reset time.",
	server:
		"Scout's hourly budget for live GitHub reads on this server is spent; it frees up within the hour.",
	caller:
		"This caller's share of Scout's hourly live-read budget is spent (a quarter of a server's hour); it frees up within the hour.",
};

/** Reserve n REST calls for a caller, or say why not: the pool is under the
 * floor, the instance's hour is spent, or the caller's share of it is. */
function takeCalls(n: number, caller: string, now = Date.now()): Denial | null {
	if (now < budget.poolLowUntil) return "pool";
	if (now - budget.hourStart >= 3_600_000) {
		budget.hourStart = now;
		budget.calls = 0;
		budget.byCaller.clear();
	}
	if (budget.calls + n > LIVE_READ_HOURLY_CALLS) return "server";
	const mine = budget.byCaller.get(caller) ?? 0;
	if (mine + n > Math.floor(LIVE_READ_HOURLY_CALLS * LIVE_READ_CALLER_SHARE))
		return "caller";
	budget.calls += n;
	budget.byCaller.set(caller, mine + n);
	return null;
}

/** Give back calls reserved but not made. */
function refund(n: number, caller: string) {
	if (n <= 0) return;
	budget.calls = Math.max(0, budget.calls - n);
	budget.byCaller.set(
		caller,
		Math.max(0, (budget.byCaller.get(caller) ?? 0) - n),
	);
}

/** Stop calling until the reset when GitHub says the pool is low. The floor
 * guards the token the scan lane shares; with no token the pool is this
 * server's address, so only an empty one stops the reads. */
function notePool(res: Response, withToken: boolean) {
	const left = res.headers.get("x-ratelimit-remaining");
	const floor = withToken ? LIVE_READ_POOL_FLOOR : 1;
	if (left === null || Number(left) >= floor) return;
	const reset = Number(res.headers.get("x-ratelimit-reset"));
	budget.poolLowUntil =
		Number.isFinite(reset) && reset > 0
			? reset * 1000
			: Date.now() + 15 * 60_000;
}

// ── The read ─────────────────────────────────────────────────────────────────

const left = (deadline: number) => Math.max(1, deadline - Date.now());

async function rest(path: string, deadline: number): Promise<Response | null> {
	const token = githubToken();
	try {
		const res = await fetch(`https://api.github.com${path}`, {
			headers: {
				accept: "application/vnd.github+json",
				"user-agent": UA,
				"x-github-api-version": "2022-11-28",
				...(token ? { authorization: `Bearer ${token}` } : {}),
			},
			cache: "no-store",
			signal: AbortSignal.timeout(left(deadline)),
		});
		notePool(res, !!token);
		return res;
	} catch {
		return null;
	}
}

/** JSON of a 200, or null; a body that does not arrive in time is null. */
async function json<T>(res: Response | null): Promise<T | null> {
	if (!res?.ok) return null;
	try {
		return (await res.json()) as T;
	} catch {
		return null;
	}
}

/** The bytes of a body up to cap, the stream cancelled there: a body never
 * held whole, whatever its size or encoding. */
async function readCapped(res: Response, cap: number): Promise<RawFile> {
	const reader = res.body?.getReader();
	if (!reader) return { text: "", truncated: false };
	const parts: Uint8Array[] = [];
	let size = 0;
	let truncated = false;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		if (size + value.byteLength > cap) {
			parts.push(value.subarray(0, cap - size));
			size = cap;
			truncated = true;
			await reader.cancel().catch(() => {});
			break;
		}
		parts.push(value);
		size += value.byteLength;
	}
	const bytes = new Uint8Array(size);
	let at = 0;
	for (const p of parts) {
		bytes.set(p, at);
		at += p.byteLength;
	}
	// UTF-16 (its byte order mark) or NUL bytes: decoded as UTF-8 it would
	// hide every link and id, so the file is not read at all.
	if (
		bytes.includes(0) ||
		(bytes[0] === 0xff && bytes[1] === 0xfe) ||
		(bytes[0] === 0xfe && bytes[1] === 0xff)
	)
		return { error: "not UTF-8 text" };
	return { text: new TextDecoder().decode(bytes), truncated };
}

type RawFile = { text: string; truncated: boolean } | { error: string };

async function raw(
	fullName: string,
	commit: string,
	path: string,
	deadline: number,
	cap: number,
): Promise<RawFile> {
	const enc = path.split("/").map(encodeURIComponent).join("/");
	try {
		const res = await fetch(
			`https://raw.githubusercontent.com/${fullName}/${commit}/${enc}`,
			{
				// Uncompressed, so the cap counts the bytes a decoder would hold.
				headers: { "user-agent": UA, "accept-encoding": "identity" },
				cache: "no-store",
				signal: AbortSignal.timeout(left(deadline)),
			},
		);
		if (!res.ok)
			return { error: `raw.githubusercontent.com answered ${res.status}` };
		return await readCapped(res, cap);
	} catch {
		return { error: "it did not arrive within the read's budget" };
	}
}

interface RepoMeta {
	full_name: string;
	html_url: string;
	private: boolean;
	archived: boolean;
	default_branch: string;
	homepage: string | null;
	created_at: string | null;
}
interface TreeBody {
	tree?: Array<{ path: string; type: string }>;
	truncated?: boolean;
}
interface CommitRow {
	sha?: string;
	commit?: { committer?: { date?: string } };
}
interface ReleaseRow {
	tag_name?: string;
	published_at?: string | null;
}

/** detectStellarProof's lang-sdk markers read "python:requirements.txt";
 * an npm dependency always holds an @ (an alias "npm:@stellar/..." too). */
const isLangMarker = (s: string | null): boolean =>
	!!s && /^[a-z][a-z-]*:[^@]+$/.test(s);
/** A declared npm dependency ("name@value") names a version unless its value
 * is a reference (workspace:*, file:, link:, github:, a URL). An alias
 * (npm:@stellar/stellar-sdk@17.0.1) names one. */
const namesVersion = (dep: string): boolean => {
	const value = dep.slice(dep.indexOf("@", 1) + 1);
	return value.startsWith("npm:") || !/^[a-z][a-z0-9+.-]*:/i.test(value);
};

async function readFresh(
	fullName: string,
	budgetMs: number,
	caller: string,
): Promise<LiveRead> {
	const started = Date.now();
	const deadline = started + budgetMs;
	const done = () => ({
		readAt: new Date(started).toISOString(),
		readMs: Date.now() - started,
	});
	// A read reserves all its calls before the first, so it never stops
	// halfway for budget; the calls it does not make are given back.
	const denied = takeCalls(CALLS_PER_READ, caller);
	if (denied) return { state: "unread", ...done(), reason: DENIED[denied] };
	let made = 0;
	try {
		// A 200 lands here only when its body was not read: cut at the
		// deadline (25 ms of timer slack), or a body that would not parse.
		const answered = (res: Response | null, what: string) =>
			res === null
				? `GitHub did not answer for ${what} within the ${budgetMs / 1000}-second budget.`
				: !res.ok
					? `GitHub answered ${res.status} for ${what}.`
					: Date.now() >= deadline - 25
						? `GitHub's answer for ${what} did not arrive within the ${budgetMs / 1000}-second budget.`
						: `GitHub answered ${res.status} for ${what}, with a body Scout could not read.`;
		made += 1;
		const metaRes = await rest(`/repos/${fullName}`, deadline);
		if (metaRes?.status === 404) return { state: "missing", ...done() };
		const meta = await json<RepoMeta>(metaRes);
		if (!meta)
			return {
				state: "unread",
				...done(),
				reason: answered(metaRes, "the repo"),
			};
		// Never read past the metadata of a repo that is not public.
		if (meta.private !== false) return { state: "missing", ...done() };

		const name = meta.full_name;
		const why: Partial<Record<LiveReadPart, string>> = {};
		const facts: LiveRepoFacts = {
			fullName: name,
			url: meta.html_url,
			defaultBranch: meta.default_branch,
			commit: null,
			archived: !!meta.archived,
			createdAt: meta.created_at ?? null,
			website: meta.homepage?.trim() || null,
			empty: false,
			tree: null,
			manifests: null,
			commits: null,
			releases: null,
		};
		made += 2;
		const [commitRes, releaseRes] = await Promise.all([
			rest(`/repos/${name}/commits?per_page=1`, deadline),
			rest(`/repos/${name}/releases?per_page=1`, deadline),
		]);
		const [commits, releases] = await Promise.all([
			json<CommitRow[]>(commitRes),
			json<ReleaseRow[]>(releaseRes),
		]);
		// 409, or no row: the repository has no commits.
		facts.empty =
			commitRes?.status === 409 ||
			(Array.isArray(commits) && commits.length === 0);
		if (facts.empty) facts.commits = { count: 0, lastAt: null };
		else if (Array.isArray(commits))
			facts.commits = {
				count: pageCount(
					commitRes?.headers.get("link") ?? null,
					commits.length,
				),
				lastAt: commits[0]?.commit?.committer?.date ?? null,
			};
		else why.commits = answered(commitRes, "the newest commit");
		if (Array.isArray(releases))
			facts.releases = {
				count: pageCount(
					releaseRes?.headers.get("link") ?? null,
					releases.length,
				),
				latestTag: releases[0]?.tag_name ?? null,
				latestAt: releases[0]?.published_at ?? null,
			};
		else why.releases = answered(releaseRes, "the releases");
		const sha = facts.empty ? null : (commits?.[0]?.sha ?? null);
		facts.commit = sha;

		let paths: string[] | null = null;
		let complete = false;
		if (facts.empty) {
			paths = [];
			complete = true;
		} else if (sha) {
			made += 1;
			const short = sha.slice(0, 7);
			const treeRes = await rest(
				`/repos/${name}/git/trees/${sha}?recursive=1`,
				deadline,
			);
			const tree = await json<TreeBody>(treeRes);
			if (tree && Array.isArray(tree.tree)) {
				paths = tree.tree.filter((t) => t.type === "blob").map((t) => t.path);
				complete = tree.truncated !== true;
			} else why.tree = answered(treeRes, `the tree at commit ${short}`);
		} else
			why.tree =
				"The default branch's newest commit did not answer, so the tree was not read at a known commit.";

		if (!paths) {
			why.manifests = `No manifest was read, because the tree was not: ${why.tree}`;
			why.readme = `The README was not read, because the tree was not: ${why.tree}`;
		} else {
			const tests = testPaths(paths);
			facts.tree = {
				complete,
				tests: tests.slice(0, KEEP_PATHS),
				testCount: tests.length,
				ci: ciPaths(paths),
			};
			const wanted = manifestPaths(paths);
			const chosen = wanted.slice(0, MAX_MANIFESTS);
			const readme = readmePath(paths);
			const [readmeFile, ...manifestFiles] = await Promise.all([
				readme && sha
					? raw(name, sha, readme, deadline, README_MAX_BYTES)
					: Promise.resolve(null),
				...chosen.map((p) =>
					raw(name, sha ?? "", p, deadline, MANIFEST_MAX_BYTES),
				),
			]);
			if (!readme) {
				if (complete) facts.readme = null;
				else
					why.readme =
						"GitHub cut the tree listing short and the README was not in the part listed, so whether the repo has one is not known.";
			} else if (!readmeFile || "error" in readmeFile)
				why.readme = `${readme} was not read: ${readmeFile && "error" in readmeFile ? readmeFile.error : "no commit to read it at"}.`;
			else
				facts.readme = {
					path: readme,
					chars: readmeFile.text.length,
					truncated: readmeFile.truncated,
					...readmeEvidence(readmeFile.text),
				};
			const blobs: Array<{ path: string; text: string }> = [];
			const oversize: string[] = [];
			const failed: string[] = [];
			chosen.forEach((path, i) => {
				const f = manifestFiles[i];
				if ("error" in f) failed.push(`${path} (${f.error})`);
				else if (f.truncated) oversize.push(path);
				else blobs.push({ path, text: f.text });
			});
			const beyond = wanted.length - chosen.length;
			if (beyond || oversize.length || failed.length)
				why.manifests = `${wanted.length - blobs.length} of ${wanted.length} manifests were not read: ${[
					beyond && `${beyond} beyond the ${MAX_MANIFESTS} a read takes`,
					oversize.length &&
						`${oversize.length} larger than 512 KB (${oversize.slice(0, 2).join(", ")})`,
					failed.length &&
						`${failed.length} could not be read (${failed.slice(0, 2).join(", ")})`,
				]
					.filter(Boolean)
					.join("; ")}.`;
			const isCargo = (p: string) => /(^|\/)cargo\.toml$/i.test(p);
			const sdkFacts = (files: typeof blobs) =>
				detectStellarProof({
					fullName: name,
					blobs: files.map((b) => ({ ...b, present: true })),
					tree: [],
					treeComplete: true,
				}).facts;
			// The scan's parser reads another language's SDK only when no JS
			// SDK is declared, so the other manifests are read on their own.
			const all = sdkFacts(blobs);
			const other = sdkFacts(
				blobs.filter(
					(b) => !/(^|\/)(package\.json|cargo\.toml)$/i.test(b.path),
				),
			).stellarJsDep;
			const cargoBlobs = blobs.filter((b) => isCargo(b.path));
			facts.manifests = {
				read: blobs.length,
				unread: wanted.length - blobs.length,
				packages: extractStellarDeps(blobs),
				otherSdk: isLangMarker(other) ? other : null,
				sorobanSdk: all.sorobanSdkVersion,
				stellarJsDep:
					all.stellarJsDep &&
					!isLangMarker(all.stellarJsDep) &&
					namesVersion(all.stellarJsDep)
						? all.stellarJsDep
						: null,
				cargoRead: cargoBlobs.length,
				cargoUnread: wanted.filter(isCargo).length - cargoBlobs.length,
				contractCrates: cargoBlobs
					.filter((b) => {
						const one = detectStellarProof({
							fullName: name,
							blobs: [{ ...b, present: true }],
							tree: [],
							treeComplete: true,
						});
						return one.proof === "cargo-sdk" && one.facts.isDeployableContract;
					})
					.map((b) => b.path.replace(/\/?cargo\.toml$/i, "") || "."),
			};
		}
		const unread = LIVE_READ_PARTS.filter((p) =>
			p === "metadata"
				? false
				: p === "tree"
					? !facts.tree
					: p === "manifests"
						? !facts.manifests || facts.manifests.unread > 0
						: p === "readme"
							? facts.readme === undefined
							: p === "commits"
								? !facts.commits
								: !facts.releases,
		);
		const unreadWhy = Object.fromEntries(
			unread.map((p) => [p, why[p] ?? "Not read."]),
		) as Partial<Record<LiveReadPart, string>>;
		return { state: "read", ...done(), unread, unreadWhy, facts };
	} finally {
		refund(CALLS_PER_READ - made, caller);
	}
}

const cache = new Map<
	string,
	{ at: number; ttl: number; read: Promise<LiveRead> }
>();

/** One repo's live read, from the per-instance cache when fresh. `fullName`
 * is owner/name as the caller gave it; it is validated here. `caller` is who
 * the read's calls count against (callerKey in rate-limit.ts). */
export function readRepoLive(
	fullName: string,
	opts: { budgetMs?: number; caller?: string } = {},
): Promise<LiveRead> {
	const [owner, name, extra] = fullName.split("/");
	const valid = (s?: string) =>
		!!s && /^[A-Za-z0-9_.-]+$/.test(s) && !/^\.+$/.test(s);
	if (!valid(owner) || !valid(name) || extra !== undefined)
		return Promise.resolve({
			state: "missing",
			readAt: new Date().toISOString(),
			readMs: 0,
		});
	const key = fullName.toLowerCase();
	const now = Date.now();
	const hit = cache.get(key);
	if (hit && now - hit.at < hit.ttl) return hit.read;
	const read = readFresh(
		key,
		opts.budgetMs ?? LIVE_READ_BUDGET_MS,
		opts.caller ?? "unknown",
	).catch(
		(): LiveRead => ({
			state: "unread",
			readAt: new Date(now).toISOString(),
			readMs: Date.now() - now,
			reason: "The read failed inside Scout before GitHub answered.",
		}),
	);
	const slot = { at: now, ttl: CACHE_MS, read };
	cache.delete(key);
	cache.set(key, slot);
	if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
	read.then((r) => {
		// A read refused or failed whole is not kept: the next caller, with
		// its own budget, reads again.
		if (r.state === "unread") slot.ttl = 0;
		else if (r.state === "read" && r.unread.length) slot.ttl = PARTIAL_CACHE_MS;
	});
	return read;
}

/** Tests only: forget cached reads and spent budget. */
export function resetLiveReadForTests() {
	cache.clear();
	budget.hourStart = 0;
	budget.calls = 0;
	budget.poolLowUntil = 0;
	budget.byCaller.clear();
}
