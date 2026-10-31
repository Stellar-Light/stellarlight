// @vitest-environment node

/**
 * The live GitHub read's completeness and budget, from an outside review
 * (2026-10-31) reproduced in tests: a git submodule or a cut-short tree is a
 * partial read, never a no; a contract id inside an HTML comment is not
 * shown; optionalDependencies and the Rust soroban-client crate are Stellar
 * packages; a 401'd token is retried on time; a refund stays in its hour.
 */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detectStellarProof } from "../code-signals";
import { repoEvidence } from "../hackathon-judging";
import { rateLimit } from "../rate-limit";
import {
	LIVE_READ_HOURLY_CALLS,
	pageCount,
	readmeEvidence,
	readRepoLive,
	resetLiveReadForTests,
} from "../repo-live-read";

// ── A scripted GitHub (same shape as repo-live-read.test.ts) ────────────────

type Init = { signal?: AbortSignal; headers?: Record<string, string> };
type Route = (url: string, init?: Init) => Response | Promise<Response>;
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
let calls: string[] = [];
let inits: Init[] = [];
const script = (route: Route) => {
	calls = [];
	inits = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: string, init?: Init) => {
			calls.push(String(input));
			inits.push(init ?? {});
			return route(String(input), init);
		}),
	);
};
const META = (name: string) => ({
	full_name: `Team/${name}`,
	html_url: `https://github.com/Team/${name}`,
	private: false,
	archived: false,
	default_branch: "main",
	homepage: null,
	created_at: "2026-10-01T00:00:00Z",
});
/** Public repo team/<name> at commit abc123, with this tree and raw files. */
const repo =
	(name: string, tree: unknown, files: Record<string, string>): Route =>
	(url) => {
		if (url === `https://api.github.com/repos/team/${name}`)
			return ok(META(name));
		if (url.includes(`/repos/Team/${name}/commits?per_page=1`))
			return ok([
				{
					sha: "abc123",
					commit: { committer: { date: "2026-10-23T10:00:00Z" } },
				},
			]);
		if (url.includes(`/repos/Team/${name}/releases?per_page=1`)) return ok([]);
		if (url.endsWith(`/repos/Team/${name}/git/trees/abc123?recursive=1`))
			return ok(tree);
		const raw = `https://raw.githubusercontent.com/Team/${name}/abc123/`;
		if (url.startsWith(raw)) {
			const path = decodeURIComponent(url.slice(raw.length));
			if (path in files) return ok(files[path]);
		}
		return status(404);
	};
const blobs = (...paths: string[]) =>
	paths.map((path) => ({ path, type: "blob" }));
const judged = async (name: string) => {
	const r = await readRepoLive(`team/${name}`);
	if (r.state !== "read") throw new Error(`${r.state}`);
	return { r, e: repoEvidence(r) };
};

beforeEach(() => {
	resetLiveReadForTests();
	// No real token ever reaches the mocked fetch.
	vi.stubEnv("GITHUB_TOKEN", "");
	vi.stubEnv("NEXT_PUBLIC_GITHUB_TOKEN", "");
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

describe("live read completeness and budget", () => {
	it("a submodule's contents read could-not-check, never not-found", async () => {
		script(
			repo(
				"sub",
				{
					truncated: false,
					tree: [
						...blobs(".gitmodules", "README.md"),
						// GitHub lists a submodule as mode 160000, type commit.
						{ path: "contracts", type: "commit" },
					],
				},
				{
					"README.md":
						"# Sub\nThe contract lives in the contracts submodule.\n",
				},
			),
		);
		const { e } = await judged("sub");
		// CI is not affected: a workflow inside a submodule never runs for the parent.
		for (const id of [
			"contractCrates",
			"stellarPackages",
			"testFiles",
		] as const)
			expect(e[id].state, `${id}: ${e[id].finding}`).toBe("could-not-check");
	});

	it('pageCount reads the rel="last" page GitHub sends on per_page=1 lists', () => {
		// Link headers GitHub sent 2026-10-31 for stellar/soroban-examples (one unauthenticated GET each).
		expect(
			pageCount(
				'<https://api.github.com/repositories/515646831/commits?per_page=1&page=2>; rel="next", <https://api.github.com/repositories/515646831/commits?per_page=1&page=283>; rel="last"',
				1,
			),
		).toBe(283);
		expect(
			pageCount(
				'<https://api.github.com/repositories/515646831/releases?per_page=1&page=2>; rel="next", <https://api.github.com/repositories/515646831/releases?per_page=1&page=22>; rel="last"',
				1,
			),
		).toBe(22);
	});

	const cutShort = async () => {
		script(
			repo(
				"huge",
				{
					truncated: true,
					tree: blobs("src/a.test.ts", "README.md", "package.json"),
				},
				{
					"README.md": "# Huge\n",
					"package.json": JSON.stringify({
						dependencies: { "@stellar/stellar-sdk": "^14.2.0" },
					}),
				},
			),
		);
		return judged("huge");
	};

	it("a tree listing GitHub cut short lists tree in repo.unread", async () => {
		const { r } = await cutShort();
		expect(r.facts.tree?.complete).toBe(false);
		// Spec (openapi-spec.ts unread): [] only when every part was read.
		expect(r.unread).toContain("tree");
	});

	it("after a 401, an empty anonymous pool does not keep the token from its retry", async () => {
		const oldKey = ["test", "old", "value"].join("-");
		const newKey = ["test", "new", "value"].join("-");
		vi.stubEnv("GITHUB_TOKEN", oldKey);
		const t0 = Date.now();
		const spy = vi.spyOn(Date, "now").mockReturnValue(t0);
		const reset = String(Math.floor(t0 / 1000) + 3600);
		const app = repo(
			"app",
			{ truncated: false, tree: blobs("README.md") },
			{
				"README.md": "# App\n",
			},
		);
		script((url, init) => {
			if (!url.startsWith("https://api.github.com")) return app(url);
			const auth = init?.headers?.authorization;
			if (auth === `Bearer ${newKey}`) return app(url);
			if (auth)
				return new Response('{"message":"Bad credentials"}', { status: 401 });
			// The server's own address (shared egress): none left for an hour.
			return new Response('{"message":"API rate limit exceeded"}', {
				status: 403,
				headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": reset },
			});
		});
		expect((await readRepoLive("team/app", { caller: "ip:1" })).state).toBe(
			"unread",
		);
		// 16 minutes on, past the 15-minute retry window, a token GitHub accepts.
		vi.stubEnv("GITHUB_TOKEN", newKey);
		spy.mockReturnValue(t0 + 16 * 60_000);
		const before = inits.length;
		const again = await readRepoLive("team/app", { caller: "ip:2" });
		expect(
			inits
				.slice(before)
				.some((i) => i.headers?.authorization === `Bearer ${newKey}`),
			again.state === "unread" ? again.reason : again.state,
		).toBe(true);
	});

	it("an anonymous pool that runs dry later in the window does not outlast the token's retry", async () => {
		const oldKey = ["test", "old", "value"].join("-");
		const newKey = ["test", "new", "value"].join("-");
		vi.stubEnv("GITHUB_TOKEN", oldKey);
		const t0 = Date.now();
		const spy = vi.spyOn(Date, "now").mockReturnValue(t0);
		const reset = String(Math.floor(t0 / 1000) + 50 * 60);
		// Three repos, so no read is served from the cache.
		const app = (url: string) => {
			const name = /\/(?:team|Team)\/(app\d)/.exec(url)?.[1] ?? "app1";
			return repo(
				name,
				{ truncated: false, tree: blobs("README.md") },
				{ "README.md": "# App\n" },
			)(url);
		};
		let anonymous = 0;
		script((url, init) => {
			if (!url.startsWith("https://api.github.com")) return app(url);
			const auth = init?.headers?.authorization;
			if (auth === `Bearer ${newKey}`) return app(url);
			if (auth)
				return new Response('{"message":"Bad credentials"}', { status: 401 });
			// The first anonymous reads have room; then the pool is empty for 50 minutes.
			anonymous++;
			if (anonymous <= 4) return app(url);
			return new Response('{"message":"API rate limit exceeded"}', {
				status: 403,
				headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": reset },
			});
		});
		expect((await readRepoLive("team/app1", { caller: "ip:1" })).state).toBe(
			"read",
		);
		spy.mockReturnValue(t0 + 60_000);
		await readRepoLive("team/app2", { caller: "ip:2" });
		// 16 minutes on, a token GitHub accepts is tried, not locked out.
		vi.stubEnv("GITHUB_TOKEN", newKey);
		spy.mockReturnValue(t0 + 16 * 60_000);
		const before = inits.length;
		const again = await readRepoLive("team/app3", { caller: "ip:3" });
		expect(
			inits
				.slice(before)
				.some((i) => i.headers?.authorization === `Bearer ${newKey}`),
			again.state === "unread" ? again.reason : again.state,
		).toBe(true);
	});

	it("a tree partial for good keeps the full cache: a submodule repo is not re-read a minute later", async () => {
		const t0 = Date.now();
		const spy = vi.spyOn(Date, "now").mockReturnValue(t0);
		script(
			repo(
				"subcache",
				{
					truncated: false,
					tree: [...blobs("README.md"), { path: "contracts", type: "commit" }],
				},
				{ "README.md": "# Sub\n" },
			),
		);
		expect((await readRepoLive("team/subcache")).state).toBe("read");
		const made = calls.length;
		spy.mockReturnValue(t0 + 90_000);
		await readRepoLive("team/subcache");
		expect(calls.length).toBe(made);
	});

	it("a Cargo.toml whose only Stellar dependency is stellar-rpc-client is found", async () => {
		script(
			repo(
				"rpc2",
				{ truncated: false, tree: blobs("README.md", "Cargo.toml") },
				{
					"README.md": "# Rpc\n",
					"Cargo.toml":
						'[package]\nname = "rpc2"\nversion = "0.1.0"\n\n[dependencies]\nstellar-rpc-client = "22"\n',
				},
			),
		);
		const { e } = await judged("rpc2");
		expect(e.stellarPackages.state, e.stellarPackages.finding).toBe("found");
		// The scan lane's parser reads it as Stellar too.
		expect(
			detectStellarProof({
				fullName: "Team/rpc2",
				blobs: [
					{
						path: "Cargo.toml",
						text: '[package]\nname = "rpc2"\n\n[dependencies]\nstellar-rpc-client = "22"\n',
						present: true,
					},
				],
				tree: [],
				treeComplete: true,
			}).proof,
		).toBe("lang-sdk");
	});

	it("an @stellar package in optionalDependencies is found", async () => {
		script(
			repo(
				"opt",
				{ truncated: false, tree: blobs("README.md", "package.json") },
				{
					"README.md": "# Opt\n",
					"package.json": JSON.stringify({
						optionalDependencies: { "@stellar/stellar-sdk": "^14.2.0" },
					}),
				},
			),
		);
		const { r, e } = await judged("opt");
		// The read's own parser saw the SDK.
		expect(r.facts.manifests?.stellarJsDep).toBe(
			"@stellar/stellar-sdk@^14.2.0",
		);
		expect(e.stellarPackages.state, e.stellarPackages.finding).toBe("found");
	});

	it("a Cargo.toml whose only Stellar dependency is soroban-client is found", async () => {
		const cargo =
			'[package]\nname = "rpc-bot"\nversion = "0.1.0"\n\n[dependencies]\nsoroban-client = "0.9"\n';
		// The scan lane's own parser calls it Stellar (rust-infra marker).
		expect(
			detectStellarProof({
				fullName: "Team/rpcbot",
				blobs: [{ path: "Cargo.toml", text: cargo, present: true }],
				tree: [],
				treeComplete: true,
			}).proof,
		).toBe("lang-sdk");
		script(
			repo(
				"rpcbot",
				{ truncated: false, tree: blobs("README.md", "Cargo.toml") },
				{
					"README.md": "# Bot\n",
					"Cargo.toml": cargo,
				},
			),
		);
		const { e } = await judged("rpcbot");
		expect(e.stellarPackages.state, e.stellarPackages.finding).not.toBe(
			"not-found",
		);
	});

	it("a contract crate under templates/ is listed, or the finding names the folders left out", async () => {
		script(
			repo(
				"tpl",
				{
					truncated: false,
					tree: blobs("README.md", "templates/hello/Cargo.toml"),
				},
				{
					"README.md": "# Tpl\n",
					"templates/hello/Cargo.toml":
						'[package]\nname = "hello"\n\n[lib]\ncrate-type = ["cdylib"]\n\n[dependencies]\nsoroban-sdk = "23.0.0"\n',
				},
			),
		);
		const { e } = await judged("tpl");
		const c = e.contractCrates;
		// Either the crate is listed, or the sentence names the rule that left it out.
		expect(c.state === "found" || /templates/.test(c.finding), c.finding).toBe(
			true,
		);
	});

	it("a contract id only inside an HTML comment, which GitHub does not show, is not read", () => {
		const id = `C${"A".repeat(55)}`;
		expect(readmeEvidence(`# App\n<!-- ${id} -->\n`).contractIds).toEqual([]);
	});

	it("a read reserved before the hour turned refunds nothing into the next hour", async () => {
		const t0 = Date.now();
		const spy = vi.spyOn(Date, "now").mockReturnValue(t0);
		const held = new Map<string, (r: Response) => void>();
		const full = (name: string) =>
			repo(
				name,
				{ truncated: false, tree: blobs("README.md") },
				{
					"README.md": "# x\n",
				},
			);
		script((url) => {
			const slow =
				/^https:\/\/api\.github\.com\/repos\/team\/(slow-[ab])$/.exec(url);
			if (slow)
				return new Promise<Response>((resolve) => held.set(slow[1], resolve));
			if (url.startsWith("https://api.github.com/repos/team/f-"))
				return status(404); // a filler: one call, three given back
			return full(url.includes("slow-b") ? "slow-b" : "full-z")(url);
		});
		await readRepoLive("team/f-warm", { caller: "ip:warm" }); // opens the hour at t0
		spy.mockReturnValue(t0 + 3_599_000);
		const a = readRepoLive("team/slow-a", { caller: "ip:a" }); // reserves 4, old hour
		spy.mockReturnValue(t0 + 3_600_500);
		const mark = calls.length;
		const b = readRepoLive("team/slow-b", { caller: "ip:b" }); // turns the hour, reserves 4
		held.get("slow-a")?.(status(404));
		await a; // made 1, gives back 3 into the new hour
		held.get("slow-b")?.(ok(META("slow-b")));
		await b; // a full read: 4 calls
		for (let i = 0; i < 235; i++)
			await readRepoLive(`team/f-${i}`, { caller: `ip:f${i % 8}` });
		await readRepoLive("team/full-z", { caller: "ip:z" });
		const madeThisHour = calls
			.slice(mark)
			.filter((u) => u.startsWith("https://api.github.com")).length;
		expect(madeThisHour).toBeLessThanOrEqual(LIVE_READ_HOURLY_CALLS);
	});
});
