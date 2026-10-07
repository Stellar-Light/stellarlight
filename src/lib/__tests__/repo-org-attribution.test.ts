import { describe, expect, it } from "vitest";
import { repoNameOwner } from "../repo-org-attribution";

// LuanLabs ships both, and Wagent is the more prominent record — which is why
// it was claiming Fluxity's repos (sls-068).
const luanlabs = [
	{ slug: "wagent", name: "Wagent", prominence: 5 },
	{ slug: "fluxity", name: "Fluxity", prominence: 1 },
];

describe("repoNameOwner", () => {
	it("gives each Fluxity repo to Fluxity, not the org's prominence winner", () => {
		for (const repo of [
			"fluxity-api",
			"fluxity-interface",
			"fluxity.finance",
		]) {
			expect(repoNameOwner(repo, luanlabs)?.slug).toBe("fluxity");
		}
	});

	it("still gives Wagent its own repo", () => {
		expect(repoNameOwner("wagent-payment", luanlabs)?.slug).toBe("wagent");
	});

	it("ignores punctuation — fluxity.finance is fluxity", () => {
		expect(repoNameOwner("fluxity.finance", luanlabs)?.slug).toBe("fluxity");
	});

	it("returns null for a repo naming neither, so the org winner keeps it", () => {
		expect(repoNameOwner("shared-ci-config", luanlabs)).toBeNull();
		expect(repoNameOwner("docs", luanlabs)).toBeNull();
	});

	it("longest match wins — a prefix sibling cannot steal a longer name", () => {
		const sibs = [
			{ slug: "flux", name: "Flux", prominence: 9 },
			{ slug: "fluxity", name: "Fluxity", prominence: 1 },
		];
		expect(repoNameOwner("fluxity-api", sibs)?.slug).toBe("fluxity");
	});

	it("refuses short identifiers — 'api' must not claim api-gateway", () => {
		expect(
			repoNameOwner("api-gateway", [{ slug: "api", name: "API" }]),
		).toBeNull();
	});

	it("matches on display name when the slug differs", () => {
		expect(
			repoNameOwner("soroswap-router", [
				{ slug: "ss-protocol", name: "Soroswap", prominence: 1 },
			])?.slug,
		).toBe("ss-protocol");
	});

	it("is order-independent — ties break deterministically", () => {
		const a = [
			{ slug: "alpha", name: "Alpha", prominence: 1 },
			{ slug: "bravo", name: "Bravo", prominence: 1 },
		];
		expect(repoNameOwner("alpha-x", a)?.slug).toBe(
			repoNameOwner("alpha-x", [...a].reverse())?.slug,
		);
	});

	it("handles an empty sibling list and a blank repo name", () => {
		expect(repoNameOwner("anything", [])).toBeNull();
		expect(repoNameOwner("", luanlabs)).toBeNull();
	});
});
