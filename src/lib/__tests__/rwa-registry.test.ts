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
const STATES = new Set([
	"live",
	"issued-single-holder",
	"deployed-no-supply",
	"not-found",
]);

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

describe("audit corrections (cross-vendor, 2026-09-04)", () => {
	it("live means a second holder exists; a one-holder mint is issued-single-holder, never live", () => {
		for (const r of RWA_REGISTRY.filter((x) => x.state === "live"))
			expect(
				(r.rwaxyzHolders ?? 0) >= 2 ||
					/holders=([2-9]|\d{2,})/.test(String(r.horizonNote)),
				r.id,
			).toBe(true);
		expect(
			RWA_REGISTRY.filter((x) => x.state === "issued-single-holder").length,
		).toBeGreaterThan(0);
	});

	it("a tranche deployed twice is linked both ways, same name and symbol, and a project gets ONE product per pair", () => {
		const paired = RWA_REGISTRY.filter((r) => r.pairedWith);
		expect(paired.length % 2).toBe(0);
		for (const r of paired) {
			const sib = RWA_REGISTRY.find((x) => x.id === r.pairedWith);
			expect(sib?.pairedWith, r.id).toBe(r.id);
			expect([sib?.name, sib?.symbol]).toEqual([r.name, r.symbol]);
		}
		// no paired tranche currently joins a project row; if one ever does, the
		// de-dup in registryProducts is what keeps the count honest
		for (const slug of new Set(
			paired.map((r) => r.projectSlug).filter(Boolean),
		)) {
			const names = registryProducts(slug as string).map((p) => p.name);
			expect(new Set(names).size).toBe(names.length);
		}
	});

	it("USDGLO joins Glo Dollar's own row, not its issuing platform; grBENJI carries its real fund name", () => {
		expect(RWA_REGISTRY.find((r) => r.symbol === "USDGLO")?.projectSlug).toBe(
			"glo-dollar",
		);
		expect(RWA_REGISTRY.find((r) => r.symbol === "grBENJI")?.name).toContain(
			"AB (Ddis)",
		);
	});

	it("productKind follows rwa.xyz's asset class, not a ticker list", () => {
		for (const r of RWA_REGISTRY)
			expect(r.productKind, r.symbol).toBe(
				r.assetClass === "Stablecoins" ? "stablecoin" : "rwa-asset",
			);
	});

	it("a product record carries the identity, issuer, level, state and launch date the finding asked for", () => {
		const p = registryProducts("wisdomtree")[0];
		expect(p.assetId).toMatch(
			/^[A-Za-z0-9]{1,12}-G[A-Z2-7]{55}$|^C[A-Z2-7]{55}$/,
		);
		expect(p.issuer).toBeTruthy();
		expect(p.verificationLevel).toBeTruthy();
		expect(["live", "issued-single-holder"]).toContain(p.registryState);
	});

	it("a single-holder mint is served as a product with its state said, and lends deployment evidence; a zero-supply contract does neither", () => {
		const single = RWA_REGISTRY.find(
			(r) => r.state === "issued-single-holder" && r.projectSlug,
		);
		expect(single).toBeTruthy();
		const prods = registryProducts(single?.projectSlug as string);
		expect(
			prods.some(
				(p) =>
					p.assetId === single?.id &&
					p.registryState === "issued-single-holder",
			),
		).toBe(true);
		const unknown = {
			network: "unknown" as const,
			basis: null,
			sourceUrl: null,
			asOf: null,
		};
		expect(
			deploymentFromRegistry(unknown, single?.projectSlug as string).network,
		).toBe("mainnet");
		const dead = RWA_REGISTRY.find((r) => r.state === "deployed-no-supply");
		expect(
			registryProducts(dead?.projectSlug as string).some(
				(p) => p.assetId === dead?.id,
			),
		).toBe(false);
	});
});

describe("controls — the issuer's on-chain flags (sls-023 GT-18)", () => {
	it("every classic row carries the four flags from Horizon; every Soroban row says null", () => {
		for (const r of RWA_REGISTRY) {
			if (r.kind === "classic") {
				expect(r.controlsBasis, r.id).toBe("horizon-issuer-flags");
				for (const k of [
					"authRequired",
					"authRevocable",
					"authImmutable",
					"clawbackEnabled",
				] as const)
					expect(typeof r.controls?.[k], `${r.id}.${k}`).toBe("boolean");
			} else {
				expect(r.controls, r.id).toBeNull();
				expect(r.controlsBasis, r.id).toBeNull();
			}
		}
	});

	it("pins two fixtures read live 2026-09-05: BENJI is whitelisted + revocable + clawback; USDY is revocable + clawback and open to any holder", () => {
		const benji = RWA_REGISTRY.find((r) => r.symbol === "BENJI")?.controls;
		expect(benji).toEqual({
			authRequired: true,
			authRevocable: true,
			authImmutable: false,
			clawbackEnabled: true,
		});
		const usdy = RWA_REGISTRY.find((r) => r.symbol === "USDY")?.controls;
		expect(usdy?.authRequired).toBe(false);
		expect(usdy?.authRevocable).toBe(true);
		expect(usdy?.clawbackEnabled).toBe(true);
	});

	it("a product record carries the controls, so a project row can tell a whitelisted fund share from an open stablecoin", () => {
		const p = registryProducts("benji").find((x) =>
			x.assetId?.startsWith("BENJI-"),
		);
		expect(p?.controls?.authRequired).toBe(true);
		const w = registryProducts("wisdomtree")[0];
		expect(w.controls).not.toBeUndefined();
	});
});
