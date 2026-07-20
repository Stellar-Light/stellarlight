import { describe, expect, it } from "vitest";
import { ONCHAIN_SEEDS } from "../../data/onchain-contracts";

// The seed map is a hand-verified join table — malformed entries would
// silently misattribute on-chain activity, so shape is CI-enforced.
describe("onchain seed map", () => {
	it("every contract address is a valid StrKey contract id", () => {
		for (const s of ONCHAIN_SEEDS) {
			for (const c of s.contracts ?? []) {
				expect(c.address).toMatch(/^C[A-Z2-7]{55}$/);
				expect(c.label.length).toBeGreaterThan(0);
			}
		}
	});
	it("every asset issuer is a valid account id", () => {
		for (const s of ONCHAIN_SEEDS) {
			if (s.asset) expect(s.asset.issuer).toMatch(/^G[A-Z2-7]{55}$/);
		}
	});
	it("no duplicate addresses or slugs, every entry carries a source", () => {
		const slugs = ONCHAIN_SEEDS.map((s) => s.slug);
		expect(new Set(slugs).size).toBe(slugs.length);
		const addrs = ONCHAIN_SEEDS.flatMap((s) =>
			(s.contracts ?? []).map((c) => c.address),
		);
		expect(new Set(addrs).size).toBe(addrs.length);
		for (const s of ONCHAIN_SEEDS) {
			expect(s.source).toMatch(/^https:\/\//);
			expect(s.contracts?.length || (s.asset ? 1 : 0)).toBeGreaterThan(0);
		}
	});
});
