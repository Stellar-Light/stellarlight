import { describe, expect, it } from "vitest";
import {
	ONCHAIN_NOT_THIS_ROW,
	ONCHAIN_SEEDS,
} from "../../data/onchain-contracts";

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
	it("Reflector's seeds name its XRF token SAC as a token, and carry its Stellar DEX and FX oracles (2026-11-11 ledger read)", () => {
		const labels = Object.fromEntries(
			(ONCHAIN_SEEDS.find((s) => s.slug === "reflector")?.contracts ?? []).map(
				(c) => [c.address, c.label],
			),
		);
		expect(
			labels.CBLLEW7HD2RWATVSMLAGWM4G3WCHSHDJ25ALP4DI6LULV5TU35N2CIZA,
		).toBe("XRF token (SAC)");
		expect(
			labels.CAFJZQWSED6YAWZU3GWRTOCNPPCGBN32L7QV43XX5LZLFTK6JLN34DLN,
		).toBe("price oracle");
		expect(
			labels.CALI2BYU2JE6WVRUFYTS6MSBNEHGJ35P4AVCZYF3B6QOE3QKOB2PLE6M,
		).toBe("price oracle (Stellar DEX)");
		expect(
			labels.CBKGPWGKSKZF52CFHMTRR23TBWTPMRDIYZ4O2P5VS65BMHYH4DXMCJZC,
		).toBe("price oracle (fiat FX rates)");
		// Each added address names the page it was read from; any per-contract
		// source, where given, is an https URL.
		const sourced = ONCHAIN_SEEDS.flatMap((s) =>
			(s.contracts ?? []).filter((c) => c.source !== undefined),
		);
		expect(sourced.map((c) => c.address).sort()).toEqual([
			"CALI2BYU2JE6WVRUFYTS6MSBNEHGJ35P4AVCZYF3B6QOE3QKOB2PLE6M",
			"CBKGPWGKSKZF52CFHMTRR23TBWTPMRDIYZ4O2P5VS65BMHYH4DXMCJZC",
		]);
		for (const c of sourced) expect(c.source).toMatch(/^https:\/\//);
	});
});

// A seed may name the repo a contract's code comes from, and a curator may
// take a contract away from a row: both decide attribution, so both carry
// what settles them.
describe("curated attribution carries its evidence", () => {
	it("a seed's sourceRepo is owner/name", () => {
		for (const s of ONCHAIN_SEEDS)
			for (const c of s.contracts ?? [])
				if (c.sourceRepo !== undefined)
					expect(c.sourceRepo, c.address).toMatch(/^[\w.-]+\/[\w.-]+$/);
	});
	it("every contract held back from a row names the row, the repo, the reason and the day", () => {
		for (const x of ONCHAIN_NOT_THIS_ROW) {
			expect(x.address).toMatch(/^C[A-Z2-7]{55}$/);
			expect(x.repo).toMatch(/^[\w.-]+\/[\w.-]+$/);
			expect(x.slug.length).toBeGreaterThan(0);
			expect(x.note.length).toBeGreaterThan(40);
			expect(x.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		}
		// a seed gives a contract to a row by hand: it cannot also be held back there
		for (const x of ONCHAIN_NOT_THIS_ROW)
			for (const s of ONCHAIN_SEEDS.filter((s) => s.slug === x.slug))
				expect(
					(s.contracts ?? []).map((c) => c.address),
					x.slug,
				).not.toContain(x.address);
	});
});
