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
