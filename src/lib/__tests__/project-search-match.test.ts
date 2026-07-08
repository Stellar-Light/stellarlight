import { describe, expect, it } from "vitest";
import {
	buildHaystack,
	corridorMatch,
	intentTypesFor,
	isRampIntent,
	scoreTokens,
	structuredHit,
	tokenize,
	typeMatch,
} from "../project-search-match";

// Real record shapes (fields that drive retrieval), captured live 2026-07-08.
const ETHERFUSE = {
	name: "Etherfuse",
	shortDescription:
		"Etherfuse issues Stablebonds — tokenized real-world assets (RWAs) on Stellar, including Mexican CETES treasury certificates and US Treasuries.",
	category: "Protocol/Contract",
	types: ["RWA"],
	supportedNetworks: [],
	coverage: { countries: ["Mexico"], currencies: ["USD", "MXN"], seps: [] },
};
const SUSHI = {
	name: "Sushi",
	shortDescription:
		"Sushi (formerly SushiSwap) is a multi-chain DeFi super app offering AMM-based token swaps, perpetuals trading, and liquidity provision. Live on Stellar.",
	category: "Protocol/Contract",
	types: ["DEX"],
	supportedNetworks: [],
	coverage: null,
};
// A plain topic project with no coverage — the precision control.
const AQUARIUS = {
	name: "Aquarius",
	shortDescription: "Liquidity management and AMM pool incentives for Stellar.",
	category: "Protocol/Contract",
	types: ["DEX"],
	supportedNetworks: [],
	coverage: null,
};

describe("structured truth is searchable (sls-018 — Etherfuse corridor miss)", () => {
	const q = "Mexico on-ramp fiat MXN peso deposit anchor";
	const tokens = tokenize(q);

	it("folds coverage values + implied ramp vocabulary into the haystack", () => {
		const hay = buildHaystack(ETHERFUSE);
		expect(hay).toContain("mexico"); // coverage.countries
		expect(hay).toContain("mxn"); // coverage.currencies
		expect(hay).toContain("anchor"); // injected: coverage presence ⇒ ramp
		expect(hay).toContain("on-ramp"); // injected
	});

	it("scores Etherfuse on its structured corridor, not just its bond prose", () => {
		// Before the fix the haystack was name+desc+category only → score ~0 on
		// this query (desc says "Mexican"/"CETES", never "Mexico"/"MXN"/"on-ramp").
		const score = scoreTokens(buildHaystack(ETHERFUSE), tokens);
		expect(score).toBeGreaterThanOrEqual(4);
	});

	it("recognizes ramp intent and the corridor match", () => {
		expect(isRampIntent(tokens)).toBe(true);
		expect(corridorMatch(ETHERFUSE, tokens)).toBe(true); // Mexico + MXN
		expect(structuredHit(ETHERFUSE, intentTypesFor(tokens), tokens, true)).toBe(
			true,
		);
	});

	it("does NOT corridor-match a different country's query (precision)", () => {
		const braTokens = tokenize("Brazil on-ramp BRL real deposit anchor");
		expect(corridorMatch(ETHERFUSE, braTokens)).toBe(false); // no Brazil/BRL
	});
});

describe("category near-miss under strict-AND (sls-019 — Sushi)", () => {
	const q = "DEX AMM swap liquidity pool";
	const tokens = tokenize(q);
	const intentTypes = intentTypesFor(tokens);

	it("Sushi is a type-DEX structured hit even when it misses a prose word", () => {
		// "pool" isn't in Sushi's prose ("liquidity provision"), so strict AND (5/5)
		// dropped it. structuredHit lets it in one tier looser.
		expect(intentTypes.has("DEX")).toBe(true);
		expect(typeMatch(SUSHI, intentTypes)).toBe(true);
		const score = scoreTokens(buildHaystack(SUSHI), tokens);
		// scores 4/5 (misses literal "pool") but is a structured hit → admissible.
		expect(score).toBeGreaterThanOrEqual(tokens.length - 1);
		expect(structuredHit(SUSHI, intentTypes, tokens, false)).toBe(true);
	});

	it("pool ↔ liquidity synonym lifts a real pool project to full score", () => {
		expect(scoreTokens(buildHaystack(AQUARIUS), tokens)).toBe(tokens.length);
	});
});

describe("precision — structured admission does not over-recall", () => {
	it("a non-ramp topic query gets no corridor bypass", () => {
		const tokens = tokenize("gaming nft mint");
		expect(isRampIntent(tokens)).toBe(false);
		// Etherfuse has coverage but the query has no ramp intent → not a hit.
		expect(structuredHit(ETHERFUSE, intentTypesFor(tokens), tokens, false)).toBe(
			false,
		);
	});

	it("a covered anchor still isn't a hit for an unrelated corridor", () => {
		const tokens = tokenize("Kenya M-Pesa KES");
		expect(corridorMatch(ETHERFUSE, tokens)).toBe(false);
	});
});

describe("Beacon Q3 class — chain vocabulary + filler tokens", () => {
	it("tokenize drops natural-question filler so it can't score", () => {
		expect(tokenize("move tokens from Ethereum to Stellar")).toEqual([
			"move",
			"tokens",
			"ethereum",
		]);
	});

	it("'ethereum' reaches records that only say 'EVM' (and vice versa)", () => {
		const bridge = {
			name: "Allbridge",
			shortDescription: "Cross-chain bridge between EVM chains and Stellar.",
			category: "Protocol/Contract",
			types: ["Bridge"],
		};
		const hay = buildHaystack(bridge);
		expect(scoreTokens(hay, ["ethereum"])).toBe(1);
		expect(scoreTokens(hay, ["evm"])).toBe(1);
	});

	it("'cctp' reaches Circle/USDC-vocabulary records", () => {
		const hay = buildHaystack({
			name: "Circle CCTP (Cross-Chain Transfer Protocol)",
			shortDescription: "Native USDC transfers across chains by Circle.",
			category: "Infrastructure",
			types: ["Bridge"],
		});
		expect(scoreTokens(hay, ["cctp", "usdc"])).toBe(2);
	});
});
