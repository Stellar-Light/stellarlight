import { describe, expect, it } from "vitest";
import { RWA_REGISTRY, RWA_REGISTRY_AS_OF } from "@/data/rwa-registry";
import { mergeProducts, registryProducts } from "../rwa-products";

const G = /^G[A-Z2-7]{55}$/;
const C = /^C[A-Z2-7]{55}$/;
const LEVELS = new Set([
	"toml-bidirectional",
	"entity-toml",
	"contract-metadata",
	"on-chain-home-domain",
	"on-chain-only",
]);
const STATES = new Set(["live", "deployed-no-supply", "not-found"]);

describe("RWA registry integrity", () => {
	it("holds the 97 tokens rwa.xyz lists on Stellar, each with one identity", () => {
		expect(RWA_REGISTRY.length).toBe(97);
		expect(new Set(RWA_REGISTRY.map((r) => r.id)).size).toBe(97);
	});

	it("every classic row is (code, issuer) with a well-formed issuer; every soroban row a well-formed contract", () => {
		for (const r of RWA_REGISTRY) {
			if (r.kind === "classic") {
				expect(r.code, r.id).toBeTruthy();
				expect(r.issuer, r.id).toMatch(G);
				expect(r.id).toBe(`${r.code}-${r.issuer}`);
				expect(r.contract).toBeNull();
			} else {
				expect(r.contract, r.id).toMatch(C);
				expect(r.id).toBe(r.contract);
			}
		}
	});

	it("every row is dated, cites evidence, and uses only the documented enums", () => {
		for (const r of RWA_REGISTRY) {
			expect(r.verifiedAt).toBe(RWA_REGISTRY_AS_OF);
			expect(r.evidenceUrl).toMatch(/^https:\/\//);
			expect(
				LEVELS.has(r.verificationLevel),
				`${r.id} ${r.verificationLevel}`,
			).toBe(true);
			expect(STATES.has(r.state), `${r.id} ${r.state}`).toBe(true);
			expect(r.network).toBe("mainnet");
		}
	});

	it("a deployed-no-supply row really has nothing behind it — the state is not decorative", () => {
		for (const r of RWA_REGISTRY.filter(
			(x) => x.state === "deployed-no-supply",
		))
			expect(r.totalSupply === 0 || r.totalSupply === null, r.id).toBe(true);
	});

	it("Spiko — the largest RWA issuer on Stellar — is present as Soroban contracts, the class Horizon /assets cannot see", () => {
		const spiko = RWA_REGISTRY.filter((r) => r.issuerEntity === "Spiko");
		expect(spiko.length).toBe(9);
		expect(spiko.every((r) => r.kind === "soroban")).toBe(true);
		expect(spiko.find((r) => r.symbol === "USTBL")?.contract).toBe(
			"CARUUX2FZNPH6DGJOEUFSIUQWYHNL5AVDV7PMVSHWL7OBYIBFC76F4TO",
		);
	});
});

describe("registry -> project products", () => {
	it("null, never [], when neither stored nor registry rows exist", () => {
		expect(mergeProducts(null, "no-such-project")).toBeNull();
		expect(mergeProducts([], null)).toBeNull();
	});

	it("serves a joined project's live rows as product records with contractId, evidence and asOf", () => {
		const wt = registryProducts("wisdomtree");
		// rwa.xyz does not count WisdomTree's USD/BTC/ETH tokens as RWA, so the
		// joined set is smaller than the 18 the toml declares. Assert the
		// registry's own live count, not a number carried in from elsewhere.
		expect(wt.length).toBe(
			RWA_REGISTRY.filter(
				(r) => r.projectSlug === "wisdomtree" && r.state === "live",
			).length,
		);
		expect(wt.length).toBeGreaterThanOrEqual(15);
		for (const p of wt) {
			expect(p.status).toBe("live");
			expect(p.network).toBe("mainnet");
			expect(p.contractId).toMatch(
				/^[A-Za-z0-9]{1,12}-G[A-Z2-7]{55}$|^C[A-Z2-7]{55}$/,
			);
			expect(p.evidenceUrl).toMatch(/^https:\/\//);
			expect(p.asOf).toBe(RWA_REGISTRY_AS_OF);
		}
	});

	it("never promotes a deployed-no-supply contract to a live product", () => {
		const spiko = registryProducts("spiko");
		expect(spiko.some((p) => p.name.includes("(CHF)"))).toBe(false); // chfSAFO: zero supply, zero events
		expect(spiko.length).toBe(
			RWA_REGISTRY.filter(
				(r) => r.projectSlug === "spiko" && r.state === "live",
			).length,
		);
	});

	it("de-duplicates a stored row against the registry on contractId, keeping the stored one", () => {
		const reg = registryProducts("wisdomtree")[0];
		const stored = [{ ...reg, note: "hand-curated" }];
		const merged = mergeProducts(stored, "wisdomtree");
		expect(merged?.filter((p) => p.contractId === reg.contractId).length).toBe(
			1,
		);
		expect(merged?.find((p) => p.contractId === reg.contractId)?.note).toBe(
			"hand-curated",
		);
	});
});

import { deploymentFromRegistry } from "../rwa-products";

describe("registry -> project deployment (sls-023: 47 of 61 RWA rows had network unknown)", () => {
	const unknown = {
		network: "unknown" as const,
		basis: null,
		sourceUrl: null,
		asOf: null,
	};

	it("fills an UNKNOWN deployment from a project's strongest-verified live product", () => {
		const d = deploymentFromRegistry(unknown, "wisdomtree");
		expect(d.network).toBe("mainnet");
		expect(d.basis).toBe("rwa-registry");
		expect(d.sourceUrl).toMatch(/^https:\/\//);
		expect(d.asOf).toBe(RWA_REGISTRY_AS_OF);
		// WisdomTree's rows are toml-bidirectional, so the lent evidence is the toml.
		expect(d.sourceUrl).toContain("stellar.toml");
	});

	it("never overwrites a stored mainnet or testnet fact", () => {
		const stored = {
			network: "testnet" as const,
			basis: "human-verified",
			sourceUrl: "https://x",
			asOf: "2026-01-01",
		};
		expect(deploymentFromRegistry(stored, "wisdomtree")).toEqual(stored);
	});

	it("leaves unknown as unknown when the project has no live registry row: an admission must not become a claim", () => {
		expect(deploymentFromRegistry(unknown, "no-such-project")).toEqual(unknown);
		expect(deploymentFromRegistry(unknown, null)).toEqual(unknown);
	});

	it("does not lend a deployed-no-supply contract as deployment evidence", () => {
		const d = deploymentFromRegistry(unknown, "spiko");
		expect(d.network).toBe("mainnet");
		const dead = RWA_REGISTRY.find(
			(r) => r.state === "deployed-no-supply" && r.projectSlug === "spiko",
		);
		if (dead?.contract) expect(d.sourceUrl).not.toContain(dead.contract);
	});
});
