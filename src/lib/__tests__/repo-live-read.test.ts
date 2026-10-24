import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	ciPaths,
	LIVE_READ_CALLER_SHARE,
	LIVE_READ_HOURLY_CALLS,
	LIVE_READ_POOL_FLOOR,
	manifestPaths,
	pageCount,
	readmeEvidence,
	readmePath,
	readRepoLive,
	resetLiveReadForTests,
	TOKEN_RETRY_MS,
	testPaths,
} from "../repo-live-read";

describe("test files in a tree", () => {
	it("counts files that follow a test-naming convention, the Soroban and Rust ones included", () => {
		const hits = [
			"contracts/pay/src/test.rs",
			"leaderboard/src/tests.rs",
			"leaderboard/src/admin_tests.rs",
			"contracts/vault/src/test_blend.rs",
			"contracts/escrow/tests/cancel.rs",
			"src/hooks/usePool.test.tsx",
			"tests/e2e-ui/tests/smoke.spec.ts",
			"sdk-go/client_test.go",
			"backend/test_api.py",
			"backend/api_test.py",
			"backend/conftest.py",
			"src/test/setup.ts",
		];
		const misses = [
			"contracts/x/test_snapshots/test/deposit.1.json",
			".agents/skills/smart-contracts/testing.md",
			"node_modules/foo/index.test.js",
			"src/testnet.ts",
			"src/contest.rs",
			"src/latest_prices.rs",
			"docs/test-plan.md",
		];
		expect(testPaths([...hits, ...misses])).toEqual(hits);
	});

	// Pass 1 of the live measurement (improvements/rounds/2026-10-23-judging-
	// review.md): a generator counted as a test, and test-named scripts no
	// convention names. A count is a claim; only conventions back it.
	it("never counts a file that only looks test-named", () => {
		expect(
			testPaths([
				"scripts/generate_matrix_tests.py",
				"frontend/scripts/withdraw-test.mts",
				"scripts/_test-binding.ts",
				"scripts/test-realtime.ts",
				"scripts/fund-test-account.ts",
			]),
		).toEqual([]);
	});
});

describe("CI config, manifests and the README in a tree", () => {
	it("reads CI config files at their conventional paths only", () => {
		expect(
			ciPaths([
				".github/workflows/ci.yml",
				".github/workflows/release.yaml",
				".github/ISSUE_TEMPLATE/bug.md",
				".gitlab-ci.yml",
				".circleci/config.yml",
				"docs/workflows/ci.yml",
				"Jenkinsfile",
			]),
		).toEqual([
			".github/workflows/ci.yml",
			".github/workflows/release.yaml",
			".gitlab-ci.yml",
			".circleci/config.yml",
			"Jenkinsfile",
		]);
	});

	it("orders manifests shallow first, examples and tests last, and skips vendored ones", () => {
		expect(
			manifestPaths([
				"examples/web-demo/package.json",
				"sdk/package.json",
				"contracts/escrow/Cargo.toml",
				"Cargo.toml",
				"node_modules/x/package.json",
				"backend/requirements.txt",
				"src/index.ts",
			]),
		).toEqual([
			"Cargo.toml",
			"backend/requirements.txt",
			"sdk/package.json",
			"contracts/escrow/Cargo.toml",
			"examples/web-demo/package.json",
		]);
	});

	it("takes the README at the root, Markdown first", () => {
		expect(readmePath(["docs/README.md", "README.rst", "README.md"])).toBe(
			"README.md",
		);
		expect(readmePath(["Kivo/README.md"])).toBeNull();
	});
});

describe("what a README head shows a judge", () => {
	it("labels a link a demo from its own words, its cell, or the words before it on its line", () => {
		const text = [
			"## Demo",
			"- 🔗 Live App: https://first-app.example.net/",
			"- 🎬 Demo Video: [View on Youtube](https://video.example.net/demo-one)",
			"- 🖼 Pitch Deck: [View on Canva](https://slides.example.net/deck-one)",
			"",
			"| **Live Project Link** | https://second-app.example.net |",
			"| **Repository** | https://github.com/team/app |",
			"",
			"Evidence is logged in [docs](./docs/d3.md).",
			"The demo UI serves this instance at",
			"[vault.example.net/?vault=eurc](https://vault.example.net/?vault=eurc):",
			"opening the trustline takes one signature. Testnet EURC comes from",
			"[Circle's faucet](https://faucet.example.net/), since Friendbot only hands out XLM.",
			'- Live app: <a href="https://third-app.example.net/" target="_blank">third-app.example.net</a>',
			'- Fiat rail: <a href="https://anchor.example.net/">TR Mock Anchor</a>',
			"**🔗 Live on testnet:** [`CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`](https://stellar.expert/explorer/testnet/contract/CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA)",
			"![Live demo screenshot](https://example.net/shot.png)",
			"Open **http://127.0.0.1:5173/** and see the [Live docs](https://docs.example.net/wave/).",
		].join("\n");
		const r = readmeEvidence(text);
		expect(r.demoLinks).toEqual([
			"https://first-app.example.net/",
			"https://video.example.net/demo-one",
			"https://second-app.example.net",
			"https://third-app.example.net/",
		]);
		// A demo named only on the line above its link is not judged: the
		// cost of never borrowing another line's words.
		expect(r.otherLinks).toEqual([
			"https://slides.example.net/deck-one",
			"https://vault.example.net/?vault=eurc",
			"https://faucet.example.net/",
			"https://anchor.example.net/",
		]);
		expect(r.contractIds).toEqual([
			"CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
		]);
	});

	it("never lends one link's label to the next link on its line", () => {
		const r = readmeEvidence(
			"- [Live demo](https://app.example.net) · [Blog](https://blog.example.net)",
		);
		expect(r.demoLinks).toEqual(["https://app.example.net"]);
		expect(r.otherLinks).toEqual(["https://blog.example.net"]);
	});

	// Third-set run 1 (improvements/rounds/2026-10-23-judging-review.md):
	// a measured repo's badge row and wrapped docs sentence.
	it("never lends the line above to a link, in a badge row or a wrapped sentence", () => {
		const r = readmeEvidence(
			[
				"[![Deployed on Vercel](https://img.shields.io/badge/deploy-vercel-000)](https://intel.example.net)",
				"[![Conventional Commits](https://img.shields.io/badge/commits-conventional-fe5196)](https://www.conventionalcommits.org)",
				"",
				"The developer portal, with SDK documentation and a live API playground, is at",
				"[**intel.example.net/docs**](https://intel.example.net/docs).",
				"[![Watch Demo](https://img.youtube.com/vi/x/maxresdefault.jpg)](https://video.example.net/demo-two)",
				'<a href="https://lend.example.net/"><strong>Live demo</strong></a> ·',
				"Live: https://ok.example.net",
			].join("\n"),
		);
		expect(r.demoLinks).toEqual([
			"https://intel.example.net",
			"https://video.example.net/demo-two",
			"https://lend.example.net/",
			"https://ok.example.net",
		]);
		expect(r.otherLinks).toEqual([
			"https://www.conventionalcommits.org",
			"https://intel.example.net/docs",
		]);
	});

	// Fifth-set run (review round 1): a docs portal whose specs "are hosted
	// at" a link was served as a link labelled a demo.
	it("never calls a link a demo for a passing verb, or when its words say docs", () => {
		const r = readmeEvidence(
			[
				"> **Live Documentation Portal:** Specs and error codes are hosted at **[https://portal.example.net/](https://portal.example.net/)**.",
				"The API reference is hosted at https://ref.example.net.",
				"- Demo docs: https://guide.example.net",
				"- Hosted version: https://hosted.example.net",
				"Hosted: https://alpha.example.net",
			].join("\n"),
		);
		expect(r.demoLinks).toEqual([
			"https://hosted.example.net",
			"https://alpha.example.net",
		]);
		expect(r.otherLinks).toEqual([
			"https://portal.example.net/",
			"https://ref.example.net",
			"https://guide.example.net",
		]);
	});

	// Re-check 2: GitHub does not show an HTML comment, so a link inside one
	// is no link a judge sees. Fenced code blocks are read as before.
	it("reads no link inside an HTML comment", () => {
		const r = readmeEvidence(
			[
				"<!-- Live demo: https://old.example.net -->",
				"<!--",
				"[Live app](https://hidden.example.net)",
				"-->",
				"Live demo: https://app.example.net",
			].join("\n"),
		);
		expect(r.demoLinks).toEqual(["https://app.example.net"]);
		expect(r.otherLinks).toEqual([]);
	});
});

describe("the total behind a per_page=1 list", () => {
	it("reads the last page, or the rows when there is one page", () => {
		expect(
			pageCount(
				'<https://api.github.com/repositories/1/commits?per_page=1&page=2>; rel="next", <https://api.github.com/repositories/1/commits?per_page=1&page=141>; rel="last"',
				1,
			),
		).toBe(141);
		expect(pageCount(null, 1)).toBe(1);
		expect(pageCount(null, 0)).toBe(0);
	});
});

// ── The read, against a scripted GitHub ─────────────────────────────────────

type Route = (
	url: string,
	init?: { signal?: AbortSignal },
) => Response | Promise<Response>;
const ok = (body: unknown, headers: Record<string, string> = {}) =>
	new Response(typeof body === "string" ? body : JSON.stringify(body), {
		status: 200,
		headers: { "x-ratelimit-remaining": "4000", ...headers },
	});
const status = (code: number) =>
	new Response("{}", {
		status: code,
		headers: { "x-ratelimit-remaining": "4000" },
	});

const META = {
	full_name: "Team/App",
	html_url: "https://github.com/Team/App",
	private: false,
	archived: false,
	default_branch: "main",
	homepage: "https://app.example.net",
	created_at: "2026-10-01T00:00:00Z",
};
const TREE = {
	truncated: false,
	tree: [
		{ path: "README.md", type: "blob" },
		{ path: "package.json", type: "blob" },
		{ path: "contracts/hello/Cargo.toml", type: "blob" },
		{ path: "contracts/hello/src/test.rs", type: "blob" },
		{ path: ".github/workflows/ci.yml", type: "blob" },
	],
};
/** A stale branch literally named HEAD, carrying tests the default branch
 * lacks: GitHub resolves the ref HEAD to it when it exists. */
const HEAD_BRANCH_TREE = {
	truncated: false,
	tree: [
		...TREE.tree,
		{ path: "fake/a.test.ts", type: "blob" },
		{ path: "fake/b.test.ts", type: "blob" },
		{ path: ".github/workflows/extra.yml", type: "blob" },
	],
};
const happy: Route = (url) => {
	if (url.endsWith("/repos/team/app")) return ok(META);
	if (url.endsWith("/git/trees/abc123?recursive=1")) return ok(TREE);
	if (url.includes("/git/trees/HEAD")) return ok(HEAD_BRANCH_TREE);
	if (url.includes("/commits?per_page=1"))
		return ok(
			[
				{
					sha: "abc123",
					commit: { committer: { date: "2026-10-23T10:00:00Z" } },
				},
			],
			{
				link: '<https://api.github.com/x?per_page=1&page=42>; rel="last"',
			},
		);
	if (url.includes("/releases?per_page=1")) return ok([]);
	if (url.endsWith("/abc123/README.md"))
		return ok("# App\n- Live demo: https://demo.example.net\n");
	if (url.endsWith("/abc123/package.json"))
		return ok(
			JSON.stringify({ dependencies: { "@stellar/stellar-sdk": "^14.2.0" } }),
		);
	if (url.endsWith("/abc123/contracts/hello/Cargo.toml"))
		return ok(
			'[lib]\ncrate-type = ["cdylib"]\n[dependencies]\nsoroban-sdk = "23.0.1"\n',
		);
	return status(404);
};

let calls: string[] = [];
let inits: Array<{ headers?: Record<string, string> }> = [];
const script = (route: Route) => {
	calls = [];
	inits = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(
			async (
				input: string,
				init?: { signal?: AbortSignal; headers?: Record<string, string> },
			) => {
				calls.push(String(input));
				inits.push(init ?? {});
				if (init?.signal?.aborted)
					throw new DOMException("aborted", "AbortError");
				return route(String(input), init);
			},
		),
	);
};
/** A body that never ends, 64 KB a chunk; pulled counts what was read. */
let pulled = 0;
const endless = () =>
	new Response(
		new ReadableStream<Uint8Array>({
			pull(controller) {
				pulled++;
				controller.enqueue(new Uint8Array(64 * 1024).fill(97));
			},
		}),
		{ status: 200, headers: { "x-ratelimit-remaining": "4000" } },
	);
const restCalls = () =>
	calls.filter((u) => u.startsWith("https://api.github.com"));
/** A 200 whose body sends nothing until the read's deadline aborts it. */
const stalled = (signal?: AbortSignal) =>
	new Response(
		new ReadableStream<Uint8Array>({
			start(controller) {
				signal?.addEventListener("abort", () =>
					controller.error(signal.reason),
				);
			},
		}),
		{ status: 200, headers: { "x-ratelimit-remaining": "4000" } },
	);
/** Text as UTF-16 LE with its byte order mark. */
const utf16 = (s: string) =>
	new Uint8Array([
		0xff,
		0xfe,
		...[...s].flatMap((ch) => [ch.charCodeAt(0), 0]),
	]);
const bytes = (b: Uint8Array) =>
	new Response(b, {
		status: 200,
		headers: { "x-ratelimit-remaining": "4000" },
	});

beforeEach(() => resetLiveReadForTests());
afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

describe("readRepoLive", () => {
	it("reads a public repo: 4 REST calls, the rest from raw files at the commit read", async () => {
		script(happy);
		const r = await readRepoLive("team/app");
		expect(r.state).toBe("read");
		if (r.state !== "read") return;
		expect(r.unread).toEqual([]);
		expect(restCalls()).toHaveLength(4);
		const f = r.facts;
		expect(f.commit).toBe("abc123");
		expect(f.fullName).toBe("Team/App");
		expect(f.website).toBe("https://app.example.net");
		expect(f.tree).toEqual({
			complete: true,
			tests: ["contracts/hello/src/test.rs"],
			testCount: 1,
			ci: [".github/workflows/ci.yml"],
		});
		expect(f.manifests?.packages).toEqual([
			"@stellar/stellar-sdk",
			"soroban-sdk",
		]);
		expect(f.manifests?.sorobanSdk).toBe("23.0.1");
		expect(f.manifests?.stellarJsDep).toBe("@stellar/stellar-sdk@^14.2.0");
		expect(f.manifests?.contractCrates).toEqual(["contracts/hello"]);
		expect(f.readme?.demoLinks).toEqual(["https://demo.example.net"]);
		expect(f.commits).toEqual({ count: 42, lastAt: "2026-10-23T10:00:00Z" });
		expect(f.releases).toEqual({ count: 0, latestTag: null, latestAt: null });
	});

	it("serves a second ask from the cache with no call", async () => {
		script(happy);
		await readRepoLive("team/app");
		const before = calls.length;
		await readRepoLive("Team/App");
		expect(calls.length).toBe(before);
	});

	it("answers missing for a 404 or a repo that is not public, and reads nothing past its metadata", async () => {
		script((url) =>
			url.endsWith("/repos/team/secret")
				? ok({ ...META, full_name: "Team/Secret", private: true })
				: status(404),
		);
		expect((await readRepoLive("team/secret")).state).toBe("missing");
		expect(calls).toEqual(["https://api.github.com/repos/team/secret"]);
		expect((await readRepoLive("team/gone")).state).toBe("missing");
		expect((await readRepoLive("../etc")).state).toBe("missing");
	});

	it("reads an empty repo as empty: no files, no commits", async () => {
		script((url) =>
			url.endsWith("/repos/team/new")
				? ok({ ...META, full_name: "Team/New", homepage: null })
				: url.includes("/git/trees/") || url.includes("/commits")
					? status(409)
					: url.includes("/releases")
						? ok([])
						: status(404),
		);
		const r = await readRepoLive("team/new");
		if (r.state !== "read") throw new Error(r.state);
		expect(r.facts.empty).toBe(true);
		expect(r.facts.commits).toEqual({ count: 0, lastAt: null });
		expect(r.facts.readme).toBeNull();
		expect(r.unread).toEqual([]);
	});

	it("lists a part that did not answer as unread, never as empty, with its own reason", async () => {
		script((url) => (url.includes("/releases") ? status(502) : happy(url)));
		const r = await readRepoLive("team/app");
		if (r.state !== "read") throw new Error(r.state);
		expect(r.facts.releases).toBeNull();
		expect(r.unread).toEqual(["releases"]);
		expect(r.unreadWhy.releases).toMatch(/answered 502/);
		expect(r.unreadWhy.tree).toBeUndefined();
	});

	// Review round 1, finding 1: GitHub resolves the ref HEAD to a branch
	// named HEAD when one exists (stellar/stellar-cli has one, far behind
	// main), so the tree came from another branch than the commits and files.
	it("reads every part at the default branch's newest commit, never a branch named HEAD", async () => {
		script(happy);
		const r = await readRepoLive("team/app");
		if (r.state !== "read") throw new Error(r.state);
		expect(calls.some((u) => u.includes("/git/trees/HEAD"))).toBe(false);
		expect(calls).toContain(
			"https://api.github.com/repos/Team/App/git/trees/abc123?recursive=1",
		);
		expect(r.facts.tree?.testCount).toBe(1);
		expect(r.facts.tree?.ci).toEqual([".github/workflows/ci.yml"]);
		const rawCalls = calls.filter((u) => u.includes("raw.githubusercontent"));
		expect(rawCalls.length).toBeGreaterThan(0);
		for (const u of rawCalls) expect(u).toContain("/Team/App/abc123/");
	});

	it("reads no tree when the newest commit did not answer, and says so", async () => {
		script((url) => (url.includes("/commits") ? status(503) : happy(url)));
		const r = await readRepoLive("team/app");
		if (r.state !== "read") throw new Error(r.state);
		expect(calls.some((u) => u.includes("/git/trees/"))).toBe(false);
		expect(r.facts.tree).toBeNull();
		expect(r.unread).toEqual(["tree", "manifests", "readme", "commits"]);
		expect(r.unreadWhy.commits).toMatch(/answered 503/);
		expect(r.unreadWhy.tree).toMatch(/newest commit did not answer/);
	});

	it("gives the tree's own reason when GitHub answers an error for it", async () => {
		script((url) => (url.includes("/git/trees/") ? status(404) : happy(url)));
		const r = await readRepoLive("team/app");
		if (r.state !== "read") throw new Error(r.state);
		expect(r.unreadWhy.tree).toMatch(
			/answered 404 for the tree at commit abc123/,
		);
	});

	// Review round 1, finding 2: over a cut-short listing, a README missing
	// from the part listed is not known to be absent.
	it("leaves the README unread, not absent, when the listing was cut short without it", async () => {
		script((url) =>
			url.endsWith("/git/trees/abc123?recursive=1")
				? ok({
						truncated: true,
						tree: TREE.tree.filter((t) => t.path !== "README.md"),
					})
				: happy(url),
		);
		const r = await readRepoLive("team/app");
		if (r.state !== "read") throw new Error(r.state);
		expect(r.facts.readme).toBeUndefined();
		expect(r.unread).toContain("readme");
		expect(r.unreadWhy.readme).toMatch(/cut the tree listing short/);
	});

	// Review round 1, finding 3: the cap was checked on compressed bytes and
	// the whole body decoded before it was cut.
	it("reads a raw file only to its byte cap, asking for no compression and cutting the stream", async () => {
		pulled = 0;
		script((url) =>
			url.endsWith("/abc123/README.md") || url.endsWith("/abc123/package.json")
				? endless()
				: happy(url),
		);
		const r = await readRepoLive("team/app");
		if (r.state !== "read") throw new Error(r.state);
		expect(r.facts.readme?.truncated).toBe(true);
		expect(r.facts.readme?.chars).toBe(100_000);
		// Two streams, each stopped after the few chunks its cap needs.
		expect(pulled).toBeLessThan(30);
		const rawInits = inits.filter((_, i) =>
			calls[i].includes("raw.githubusercontent"),
		);
		for (const init of rawInits)
			expect(init.headers?.["accept-encoding"]).toBe("identity");
		// A manifest over its cap is not read, and the reason says so.
		expect(r.unread).toContain("manifests");
		expect(r.unreadWhy.manifests).toMatch(/larger than 512 KB/);
	});

	// Review round 1, finding 6.
	it("keeps an npm alias of the Stellar SDK as declared", async () => {
		script((url) =>
			url.endsWith("/abc123/package.json")
				? ok(
						JSON.stringify({
							dependencies: {
								"stellar-sdk": "npm:@stellar/stellar-sdk@17.0.1",
							},
						}),
					)
				: happy(url),
		);
		const r = await readRepoLive("team/app");
		if (r.state !== "read") throw new Error(r.state);
		expect(r.facts.manifests?.stellarJsDep).toBe(
			"stellar-sdk@npm:@stellar/stellar-sdk@17.0.1",
		);
		expect(r.facts.manifests?.packages).toContain("stellar-sdk");
	});

	// Review round 1, found by the reviewer's set: a monorepo's root resolved
	// its own workspace package, and "workspace:*" was cited as an SDK version.
	it("cites no SDK version for a workspace, file or git reference, which names none", async () => {
		for (const value of [
			"workspace:*",
			"file:../sdk",
			"github:team/sdk#main",
		]) {
			resetLiveReadForTests();
			script((url) =>
				url.endsWith("/abc123/package.json")
					? ok(
							JSON.stringify({
								resolutions: { "@stellar/freighter-api": value },
							}),
						)
					: happy(url),
			);
			const r = await readRepoLive("team/app");
			if (r.state !== "read") throw new Error(r.state);
			expect(r.facts.manifests?.stellarJsDep, value).toBeNull();
		}
	});

	// Re-check 2: a README served as UTF-16, or holding NUL bytes, decoded as
	// UTF-8 showed no link and no id: a not-found from a file never read.
	it("leaves a file that is not UTF-8 text unread, with that reason", async () => {
		const text = "# App\nLive demo: https://demo.example.net\n";
		for (const body of [utf16(text), new TextEncoder().encode(`${text}\0`)]) {
			resetLiveReadForTests();
			script((url) =>
				url.endsWith("/abc123/README.md") ? bytes(body) : happy(url),
			);
			const r = await readRepoLive("team/app");
			if (r.state !== "read") throw new Error(r.state);
			expect(r.facts.readme).toBeUndefined();
			expect(r.unread).toContain("readme");
			expect(r.unreadWhy.readme).toMatch(/not UTF-8 text/);
		}
		resetLiveReadForTests();
		script((url) =>
			url.endsWith("/abc123/package.json")
				? bytes(utf16('{"dependencies":{"@stellar/stellar-sdk":"^14.2.0"}}'))
				: happy(url),
		);
		const r = await readRepoLive("team/app");
		if (r.state !== "read") throw new Error(r.state);
		expect(r.unread).toContain("manifests");
		expect(r.unreadWhy.manifests).toMatch(/package\.json \(not UTF-8 text\)/);
		expect(r.unreadWhy.manifests).not.toMatch(/did not arrive/);
	});

	// Re-check 2: a 200 whose body stalled past the deadline was reported as
	// "GitHub answered 200 for the newest commit", which names no fault.
	it("says a body that stalled past the deadline did not arrive in time", async () => {
		script((url, init) =>
			url.includes("/commits?per_page=1") ? stalled(init?.signal) : happy(url),
		);
		const r = await readRepoLive("team/app", { budgetMs: 300 });
		if (r.state !== "read") throw new Error(r.state);
		expect(r.unread).toContain("commits");
		expect(r.unreadWhy.commits).toMatch(
			/did not arrive within the 0\.3-second budget/,
		);
		expect(r.unreadWhy.commits).not.toMatch(/answered 200/);
	});

	it("returns at its deadline when GitHub never answers", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				(_url: string, init?: { signal?: AbortSignal }) =>
					new Promise<Response>((_, reject) =>
						init?.signal?.addEventListener("abort", () =>
							reject(new DOMException("timed out", "TimeoutError")),
						),
					),
			),
		);
		const t0 = Date.now();
		const r = await readRepoLive("team/slow", { budgetMs: 300 });
		const took = Date.now() - t0;
		expect(r.state).toBe("unread");
		expect(took).toBeGreaterThanOrEqual(290);
		expect(took).toBeLessThan(300 + 250);
	});

	it("makes no call once the hour's cap is spent", async () => {
		script(() => status(404));
		// Each missing repo spends one metadata call; eight callers keep
		// every one inside its own share.
		for (let i = 0; i < LIVE_READ_HOURLY_CALLS; i++)
			await readRepoLive(`team/r${i}`, { caller: `ip:${i % 8}` });
		const spent = calls.length;
		const r = await readRepoLive("team/one-more", { caller: "ip:new" });
		expect(calls.length).toBe(spent);
		expect(r.state).toBe("unread");
		if (r.state === "unread") expect(r.reason).toMatch(/on this server/);
	});

	// Review round 1, finding 4: one caller at 20 a minute could spend the
	// instance's hour in three minutes, for every caller.
	it("holds one caller to its share of the hour, leaving the rest to others", async () => {
		script(() => status(404));
		const share = Math.floor(LIVE_READ_HOURLY_CALLS * LIVE_READ_CALLER_SHARE);
		for (let i = 0; i < share + 10; i++)
			await readRepoLive(`team/g${i}`, { caller: "ip:greedy" });
		expect(calls.length).toBeLessThanOrEqual(share);
		const spent = calls.length;
		const denied = await readRepoLive("team/g-more", { caller: "ip:greedy" });
		expect(calls.length).toBe(spent);
		expect(denied.state).toBe("unread");
		if (denied.state === "unread") expect(denied.reason).toMatch(/share/);
		// A refused read is not kept for others: another caller reads it.
		await readRepoLive("team/g-more", { caller: "ip:other" });
		expect(calls.length).toBe(spent + 1);
	});

	it("drops a token GitHub rejects (401) and reads the public repo without it", async () => {
		vi.stubEnv("GITHUB_TOKEN", ["test", "only", "value"].join("-"));
		// GitHub's 401 carries the unauthenticated pool's headers (60 an hour),
		// which must not read as the token's pool under its floor.
		const rejected = () =>
			new Response('{"message":"Bad credentials"}', {
				status: 401,
				headers: {
					"x-ratelimit-remaining": "55",
					"x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 3000),
				},
			});
		script((url, init) => {
			const sent = (init as { headers?: Record<string, string> } | undefined)
				?.headers?.authorization;
			return url.startsWith("https://api.github.com") && sent
				? rejected()
				: happy(url);
		});
		const r = await readRepoLive("team/app");
		expect(r.state).toBe("read");
		if (r.state === "read") expect(r.unread).toEqual([]);
		// One rejected call, then every REST call goes without the token.
		const authed = inits.filter((i) => i.headers?.authorization).length;
		expect(authed).toBe(1);
		// A later read in the window sends no token and is not held by the pool.
		const before = inits.length;
		const again = await readRepoLive("team/other-app", { caller: "ip:2" });
		expect(again.state).not.toBe("unread");
		expect(inits.slice(before).some((i) => i.headers?.authorization)).toBe(
			false,
		);
		vi.unstubAllEnvs();
	});

	it("tries the token again after the retry window, so a rotated token is used", async () => {
		vi.stubEnv("GITHUB_TOKEN", ["test", "only", "value"].join("-"));
		let reject = true;
		script((url, init) => {
			const sent = (init as { headers?: Record<string, string> } | undefined)
				?.headers?.authorization;
			if (url.startsWith("https://api.github.com") && sent && reject)
				return new Response("{}", { status: 401 });
			return happy(url);
		});
		const now = Date.now();
		const spy = vi.spyOn(Date, "now").mockReturnValue(now);
		await readRepoLive("team/app");
		reject = false;
		spy.mockReturnValue(now + TOKEN_RETRY_MS + 1);
		const before = inits.length;
		await readRepoLive("team/next-app", { caller: "ip:3" });
		expect(inits.slice(before).some((i) => i.headers?.authorization)).toBe(
			true,
		);
		spy.mockRestore();
		vi.unstubAllEnvs();
	});

	it("makes no call while the token's pool is under the floor", async () => {
		vi.stubEnv("GITHUB_TOKEN", ["test", "only", "value"].join("-"));
		const low = String(LIVE_READ_POOL_FLOOR - 1);
		const reset = String(Math.floor(Date.now() / 1000) + 600);
		script((url) =>
			url.endsWith("/repos/team/first")
				? new Response("{}", {
						status: 404,
						headers: {
							"x-ratelimit-remaining": low,
							"x-ratelimit-reset": reset,
						},
					})
				: happy(url),
		);
		await readRepoLive("team/first");
		const spent = calls.length;
		const r = await readRepoLive("team/app");
		expect(calls.length).toBe(spent);
		expect(r.state).toBe("unread");
		vi.unstubAllEnvs();
	});
});
