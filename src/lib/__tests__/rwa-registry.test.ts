import { describe, expect, it } from "vitest";
import {
	RWA_ISSUER_COVERAGE,
	RWA_REGISTRY,
	RWA_REGISTRY_AS_OF,
	RWA_STATES,
	RWA_VERIFICATION_LEVELS,
} from "@/data/rwa-registry";
import {
	mergeProducts,
	productsCoverage,
	registryProducts,
} from "../rwa-products";

const G = /^G[A-Z2-7]{55}$/;
const C = /^C[A-Z2-7]{55}$/;
const LEVELS = new Set<string>(RWA_VERIFICATION_LEVELS);
const STATES = new Set<string>(RWA_STATES);

describe("RWA registry integrity", () => {
	it("holds the 97 tokens rwa.xyz lists on Stellar plus the issuer-declared siblings, each with one identity", () => {
		const listed = RWA_REGISTRY.filter((r) => r.rwaxyzListed);
		const declared = RWA_REGISTRY.filter((r) => !r.rwaxyzListed);
		expect(listed.length).toBe(97);
		expect(declared.map((r) => r.symbol).sort()).toEqual(
			[
				"CETESZ",
				"FOCGX",
				"GILTS",
				"MEX",
				"MEXe",
				"SBRL",
				// Spiko's zero-supply deployer contracts (deployer-contracts basis)
				"eurUSTBL",
				"eurUKTBL",
				"sekSAFO",
				"nokSAFO",
				"dkkSAFO",
				"plnSAFO",
				"hufSAFO",
				"czkSAFO",
			].sort(),
		);
		expect(new Set(RWA_REGISTRY.map((r) => r.id)).size).toBe(
			RWA_REGISTRY.length,
		);
	});

	it("an issuer-declared row carries no rwa.xyz figure — null is not-provided, never zero", () => {
		for (const r of RWA_REGISTRY.filter((x) => !x.rwaxyzListed)) {
			expect(r.rwaxyzValueUsd, r.id).toBeNull();
			expect(r.rwaxyzHolders, r.id).toBeNull();
			expect(r.basisNote, r.id).toMatch(
				/issuer-declared|deployer-contracts basis/,
			);
		}
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

	it("every row is dated no later than the registry, cites evidence, and uses only the documented enums", () => {
		// registryAsOf is the LATEST verifiedAt, not a date every row must
		// share: six rows were verified 2026-09-09 and the other 97 keep the
		// day they were actually read.
		expect(
			RWA_REGISTRY.map((r) => r.verifiedAt)
				.sort()
				.at(-1),
		).toBe(RWA_REGISTRY_AS_OF);
		for (const r of RWA_REGISTRY) {
			expect(r.verifiedAt, r.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			expect(r.verifiedAt <= RWA_REGISTRY_AS_OF, r.id).toBe(true);
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
		)) {
			expect(r.totalSupply === 0 || r.totalSupply === null, r.id).toBe(true);
			// A classic asset in this state must say so from Horizon's reading:
			// trustlines may exist, nothing was minted.
			if (r.kind === "classic")
				expect(r.horizonNote, r.id).toMatch(/^supply=0/);
		}
	});

	it("issuer-declared rows follow the toml's anchor_asset_type for productKind: fiat → stablecoin, else rwa-asset", () => {
		const kind = (sym: string) =>
			RWA_REGISTRY.find((r) => r.symbol === sym && !r.rwaxyzListed)
				?.productKind;
		expect(kind("MEX")).toBe("stablecoin"); // anchor MXN, fiat
		expect(kind("CETESZ")).toBe("stablecoin"); // anchor MXN, fiat
		expect(kind("SBRL")).toBe("stablecoin"); // anchor BRL, fiat
		expect(kind("GILTS")).toBe("rwa-asset"); // anchor UK Gilts, bond
		expect(kind("MEXe")).toBe("rwa-asset"); // anchor Etherfuse CETES, crypto
		expect(kind("FOCGX")).toBe("rwa-asset"); // anchor FOBXX, other
	});

	it("Spiko — the largest RWA issuer on Stellar — is present as Soroban contracts, the class Horizon /assets cannot see", () => {
		const spiko = RWA_REGISTRY.filter((r) => r.issuerEntity === "Spiko");
		expect(spiko.length).toBe(17); // 9 rwa.xyz-listed + 8 zero-supply deployer contracts
		expect(spiko.filter((r) => r.rwaxyzListed).length).toBe(9);
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
			// asOf is the ROW's own verifiedAt (rows are dated individually since
			// 2026-09-09), never later than the registry's date.
			expect(p.asOf).toBe(
				RWA_REGISTRY.find((r) => r.id === p.assetId)?.verifiedAt,
			);
			expect(p.asOf <= RWA_REGISTRY_AS_OF).toBe(true);
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

	it("a classic asset with trustlines and no supply is tracked but never a product (CETESZ, FOCGX)", () => {
		expect(
			registryProducts("etherfuse").some((p) =>
				p.assetId?.startsWith("CETESZ-"),
			),
		).toBe(false);
		expect(
			registryProducts("benji").some((p) => p.assetId?.startsWith("FOCGX-")),
		).toBe(false);
		// The four Etherfuse assets the toml declared and the registry lacked
		// (sls-083): three are minted and served, one is zero-supply.
		const ef = registryProducts("etherfuse").map((p) => p.name);
		expect(ef).toEqual(
			expect.arrayContaining([
				"Etherfuse MEX",
				"Etherfuse GILTS",
				"Etherfuse MEXe",
			]),
		);
		expect(ef).toHaveLength(8);
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
		// dated by the lending row's own verifiedAt, not a registry-wide stamp
		expect(d.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect((d.asOf ?? "") <= RWA_REGISTRY_AS_OF).toBe(true);
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

describe("issuer coverage — a tracked issuer is covered completely (sls-083)", () => {
	const ids = new Set(RWA_REGISTRY.map((r) => r.id));
	const classicIssuers = new Map(
		RWA_REGISTRY.filter((r) => r.kind === "classic" && r.issuer).map((r) => [
			r.issuer as string,
			r,
		]),
	);

	it("every coverage entry names a tracked classic issuer, once, dated no later than the registry", () => {
		const seen = new Set<string>();
		for (const c of RWA_ISSUER_COVERAGE) {
			expect(classicIssuers.has(c.issuer), c.issuer).toBe(true);
			expect(seen.has(c.issuer), c.issuer).toBe(false);
			seen.add(c.issuer);
			expect(c.tomlUrl).toMatch(/^https:\/\/.+\/\.well-known\/stellar\.toml$/);
			expect(c.reconciledAt <= RWA_REGISTRY_AS_OF).toBe(true);
			// An empty declared list is allowed ONLY for an issuer the registry
			// tracks on-chain-home-domain evidence: its toml was read and omits
			// the asset. Otherwise an empty list would be a table entry that
			// reconciles nothing.
			if (c.declared.length === 0)
				expect(
					RWA_REGISTRY.some(
						(r) =>
							r.issuer === c.issuer &&
							r.verificationLevel === "on-chain-home-domain",
					),
					c.issuer,
				).toBe(true);
		}
	});

	it("every (code, issuer) a tracked issuer's toml declares is a registry row — declared ⊆ tracked", () => {
		const missing: string[] = [];
		for (const c of RWA_ISSUER_COVERAGE)
			for (const code of c.declared)
				if (!ids.has(`${code}-${c.issuer}`))
					missing.push(`${code}-${c.issuer}`);
		expect(missing).toEqual([]);
	});

	it("every issuer whose evidence IS a toml has a coverage entry", () => {
		const covered = new Set(RWA_ISSUER_COVERAGE.map((c) => c.issuer));
		for (const r of RWA_REGISTRY)
			if (
				r.kind === "classic" &&
				(r.verificationLevel === "toml-bidirectional" ||
					r.verificationLevel === "entity-toml")
			)
				expect(covered.has(r.issuer as string), r.id).toBe(true);
	});

	it("Etherfuse: nine declared, nine tracked, eight served (CETESZ is zero-supply), complete", () => {
		expect(productsCoverage("etherfuse")).toEqual({
			basis: "issuer-stellar-toml",
			asOf: "2026-09-09",
			issuers: 1,
			issuersUnreconciled: 0,
			declared: 9,
			tracked: 9,
			served: 8,
			complete: true,
		});
	});

	it("Rivool and Franklin (benji) are complete after the reconcile; served < tracked where an asset is zero-supply", () => {
		const rv = productsCoverage("rivool-finance");
		expect(rv?.complete).toBe(true);
		expect(rv?.declared).toBe(5);
		expect(rv?.served).toBe(5);
		const ft = productsCoverage("benji");
		expect(ft?.complete).toBe(true);
		expect(ft?.tracked).toBeGreaterThan(ft?.served ?? 0); // FOCGX tracked, not served
	});

	it("Spiko (Soroban, no toml) is covered on the deployer-contracts basis: 17 token contracts declared, 17 tracked, 8 served, complete", () => {
		expect(productsCoverage("spiko")).toEqual({
			basis: "deployer-contracts",
			asOf: "2026-09-09",
			issuers: 1,
			issuersUnreconciled: 0,
			declared: 17,
			tracked: 17,
			served: 8,
			complete: true,
		});
		// The eight zero-supply contracts are tracked, never products.
		const spiko = RWA_REGISTRY.filter((r) => r.issuerEntity === "Spiko");
		expect(spiko.length).toBe(17);
		expect(spiko.filter((r) => r.state === "deployed-no-supply").length).toBe(
			9,
		); // chfSAFO + 8
		expect(spiko.filter((r) => !r.rwaxyzListed).length).toBe(8);
		expect(registryProducts("spiko").length).toBe(8);
	});

	it("null — never 'complete' — when there is nothing to reconcile against", () => {
		expect(productsCoverage("centrifuge")).toBeNull(); // Soroban, no deployer entry yet
		expect(productsCoverage("no-such-project")).toBeNull();
		expect(productsCoverage(null)).toBeNull();
	});

	it("complete means declared === tracked AND no joined issuer is unreconciled — the rule, on every covered project", () => {
		const slugs = new Set(
			RWA_REGISTRY.map((r) => r.projectSlug).filter((x): x is string => !!x),
		);
		let covered = 0;
		let falses = 0;
		for (const slug of slugs) {
			const c = productsCoverage(slug);
			if (!c) continue;
			covered++;
			expect(c.complete, slug).toBe(
				c.declared === c.tracked && c.issuersUnreconciled === 0,
			);
			if (!c.complete) falses++;
		}
		expect(covered).toBeGreaterThanOrEqual(10);
		// Both branches of the rule are exercised by real data, so the test is
		// not a tautology on today's snapshot.
		expect(falses).toBeGreaterThanOrEqual(1);
	});

	it("Circle is NOT complete: the EURC issuer's home domain serves no toml, so a green flag would be sls-083 again", () => {
		const c = productsCoverage("circle");
		expect(c?.issuersUnreconciled).toBe(1);
		expect(c?.complete).toBe(false);
		expect(c?.declared).toBe(c?.tracked); // the covered issuer IS fully tracked
	});

	it("SBRL: tracked and served, and the product says the issuer calls it a private offering", () => {
		const row = RWA_REGISTRY.find((r) => r.symbol === "SBRL");
		expect(row?.tomlStatus).toBe("private");
		const p = registryProducts("rivool-finance").find((x) =>
			x.assetId?.startsWith("SBRL-"),
		);
		expect(p?.tomlStatus).toBe("private");
		expect(p?.note).toMatch(/private/);
		// The rows whose toml block was read carry its status; the rest admit null.
		expect(
			RWA_REGISTRY.filter((r) => r.tomlStatus !== null)
				.map((r) => r.symbol)
				.sort(),
		).toEqual(["CETESZ", "GILTS", "MEX", "MEXe", "SBRL"]);
	});

	it("served is its own count: WisdomTree serves EPXC, which its toml omits (on-chain-home-domain), so served > tracked there", () => {
		const wt = productsCoverage("wisdomtree");
		expect(wt?.complete).toBe(true);
		expect(wt?.served).toBeGreaterThan(wt?.tracked ?? 0);
		expect(
			RWA_REGISTRY.some(
				(r) =>
					r.projectSlug === "wisdomtree" &&
					r.verificationLevel === "on-chain-home-domain",
			),
		).toBe(true);
	});
});
