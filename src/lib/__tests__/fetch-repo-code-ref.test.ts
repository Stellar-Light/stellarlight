import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRepoCode, type Gh } from "../../../scripts/scan/fetch-repo-code";

// A fixture pinned to the commit its label was verified at must be scored at
// that commit: the LOBSTR extension's repo became a different package on
// 2026-10-02 and its true label went false at HEAD.
const REF = "849662d17063c0c0ddf51a7eeddef6bd734fad03";

afterEach(() => vi.unstubAllGlobals());

describe("fetchRepoCode at a pinned commit", () => {
	it("reads the tree and every file at the ref, never the default branch", async () => {
		const calls: string[] = [];
		const gh: Gh = async (url) => {
			calls.push(url);
			const body = url.includes("/git/trees/")
				? {
						tree: [
							{ path: "package.json", type: "blob", size: 60, sha: "a" },
							{ path: "src/stellar.ts", type: "blob", size: 80, sha: "b" },
						],
					}
				: url.endsWith("/tags?per_page=100")
					? []
					: { default_branch: "master", fork: false, topics: [] };
			return new Response(JSON.stringify(body));
		};
		const raw: string[] = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string) => {
				raw.push(url);
				return new Response(
					url.endsWith("package.json")
						? JSON.stringify({
								dependencies: { "@stellar/stellar-sdk": "^12" },
							})
						: 'import { Horizon } from "@stellar/stellar-sdk";\nexport const s = new Horizon.Server("x");\n',
				);
			}),
		);
		const r = await fetchRepoCode(gh, "Lobstrco/signer-extension-api", {
			ref: REF,
		});
		expect(r?.scannedRef).toBe(REF);
		expect(calls).toContain(
			`/repos/Lobstrco/signer-extension-api/git/trees/${REF}?recursive=1`,
		);
		expect(calls.some((c) => c.includes("/branches/"))).toBe(false);
		expect(raw.length).toBeGreaterThan(0);
		expect(raw.every((u) => u.includes(`/${REF}/`))).toBe(true);
	});
});
