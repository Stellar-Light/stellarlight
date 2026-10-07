import { afterEach, describe, expect, it, vi } from "vitest";
import {
	fetchRepoStack,
	type Gh,
	type TreeEntry,
} from "../../../scripts/scan/fetch-repo-code";

const blob = (path: string): TreeEntry => ({ path, type: "blob", sha: "x" });
const ghReturning =
	(status: number, body: unknown = {}): Gh =>
	async () =>
		new Response(JSON.stringify(body), { status });

const MANIFESTS: Record<string, string> = {
	"package.json": JSON.stringify({
		dependencies: { "@stellar/stellar-sdk": "^14", react: "^19" },
	}),
	"contract/Cargo.toml": '[dependencies]\nsoroban-sdk = "22"\n',
	// A dependency's own manifest: never the repo's.
	"web/node_modules/@stellar/stellar-sdk/package.json": JSON.stringify({
		dependencies: { "@stellar/stellar-base": "^14" },
	}),
};

afterEach(() => vi.unstubAllGlobals());

const serveRaw = (fail?: string) =>
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string) => {
			const path = decodeURIComponent(url.split("/HEAD/")[1] ?? "");
			if (path === fail) return new Response("", { status: 500 });
			return MANIFESTS[path] != null
				? new Response(MANIFESTS[path])
				: new Response("", { status: 404 });
		}),
	);

describe("fetchRepoStack", () => {
	it("reads the repo's own manifests, never vendored ones", async () => {
		serveRaw();
		const s = await fetchRepoStack(
			ghReturning(200, { tree: Object.keys(MANIFESTS).map(blob) }),
			"ctx-com/cards402",
		);
		expect(s).toEqual({
			state: "read",
			stack: ["@stellar/stellar-sdk", "soroban-sdk"],
		});
	});

	it("says missing on 404 and read-empty for an empty repo", async () => {
		expect(await fetchRepoStack(ghReturning(404), "a/b")).toEqual({
			state: "missing",
		});
		expect(await fetchRepoStack(ghReturning(409), "a/b")).toEqual({
			state: "read",
			stack: [],
		});
	});

	it("concludes nothing from a failed manifest or a truncated empty tree", async () => {
		serveRaw("contract/Cargo.toml");
		const tree = { tree: Object.keys(MANIFESTS).map(blob) };
		expect((await fetchRepoStack(ghReturning(200, tree), "a/b")).state).toBe(
			"error",
		);
		expect(
			(
				await fetchRepoStack(
					ghReturning(200, { tree: [blob("README.md")], truncated: true }),
					"a/b",
				)
			).state,
		).toBe("error");
	});
});

describe("fetchRepoActivity", () => {
	it("reads commits and archived flags, says missing only on NOT_FOUND, and skips a failed batch", async () => {
		const { fetchRepoActivity } = await import(
			"../../../scripts/scan/fetch-repo-code"
		);
		const post = vi.fn(async (_url: string, init: { body: string }) => {
			const q = JSON.parse(init.body).query as string;
			if (q.includes('"broken"')) return new Response("", { status: 502 });
			return new Response(
				JSON.stringify({
					data: {
						r0: {
							isArchived: false,
							defaultBranchRef: {
								target: { committedDate: "2026-08-01T00:00:00Z" },
							},
						},
						r1: null,
					},
					errors: [{ type: "NOT_FOUND", path: ["r1"] }],
				}),
			);
		});
		const got = await fetchRepoActivity(
			"t",
			["a/live", "a/gone"],
			post as unknown as typeof fetch,
		);
		expect(got.get("a/live")).toEqual({
			state: "read",
			lastCommitAt: "2026-08-01T00:00:00Z",
			archived: false,
		});
		expect(got.get("a/gone")).toEqual({ state: "missing" });
		const failed = await fetchRepoActivity(
			"t",
			["a/broken"],
			post as unknown as typeof fetch,
		);
		expect(failed.size).toBe(0);
	});
});
