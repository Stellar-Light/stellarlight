import { describe, expect, it } from "vitest";
import {
	anchorIdentityHit,
	anchorTokens,
	buildHaystack,
	chainCorridorHit,
	corridorMatch,
	hitsAnyToken,
	identityZone,
	intentTypesFor,
	isRampIntent,
	namedChains,
	scoreTokens,
	structuredHit,
	structuredSelectClauses,
	termsForToken,
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
		expect(
			structuredHit(ETHERFUSE, intentTypesFor(tokens), tokens, false),
		).toBe(false);
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

describe("review finding 1 — corridor-discriminating admission", () => {
	const mexTokens = tokenize("mexico on-ramp");
	const intent = intentTypesFor(mexTokens);

	it("wrong-country anchor is NOT structurally admitted for 'mexico on-ramp'", () => {
		const coinsPh = {
			name: "Coins PH",
			shortDescription: "Philippines crypto wallet and fiat ramp.",
			category: "Anchor",
			types: ["Anchor"],
			coverage: {
				countries: ["Philippines"],
				currencies: ["PHP"],
				seps: ["sep-24"],
			},
		};
		expect(structuredHit(coinsPh, intent, mexTokens, true)).toBe(false);
	});

	it("right-corridor anchor IS admitted (Etherfuse recall preserved)", () => {
		const etherfuse = {
			name: "Etherfuse",
			shortDescription: "Stablebonds — tokenized government bonds.",
			category: "Protocol/Contract",
			types: ["RWA", "Anchor"],
			coverage: { countries: ["Mexico"], currencies: ["USD", "MXN"], seps: [] },
		};
		expect(structuredHit(etherfuse, intent, mexTokens, true)).toBe(true);
	});

	it("pure ramp query (no discriminator) still admits by Anchor type", () => {
		const t = tokenize("on-ramp anchors");
		const anyAnchor = {
			name: "X",
			shortDescription: "",
			category: "Anchor",
			types: ["Anchor"],
		};
		expect(structuredHit(anyAnchor, intentTypesFor(t), t, true)).toBe(true);
	});

	it("non-ramp category query keeps type admission (Sushi class)", () => {
		const t = tokenize("DEX AMM swap liquidity pool");
		const sushi = {
			name: "Sushi",
			shortDescription: "AMM swaps and liquidity provision.",
			category: "Protocol/Contract",
			types: ["DEX"],
		};
		expect(structuredHit(sushi, intentTypesFor(t), t, false)).toBe(true);
	});
});

describe("review finding 2 — identifier-form queries", () => {
	it("snake_case and camelCase queries split into word tokens AND keep the raw joined form (DeRisk fix)", () => {
		// Engine A run-1 catch: q=DeRisk missed the record named DeRisk because
		// only the split fragments participated. The joined raw form now rides
		// along — the named record passes strict, fragment-only matches drop a
		// tier.
		expect(tokenize("release_escrow")).toEqual([
			"release",
			"escrow",
			"releaseescrow",
		]);
		// Sub-3-char fragments drop once the joined form exists — they flood
		// the DB candidate window (the live DeRisk miss) without adding any
		// discrimination the joined form lacks.
		expect(tokenize("DeRisk")).toEqual(["risk", "derisk"]);
		expect(tokenize("DeFi")).toEqual(["defi"]);
		// Multi-word queries are untouched — no joined form appended.
		expect(tokenize("release escrow")).toEqual(["release", "escrow"]);
	});
	it("StellarX class: a camelCase query that collapses to an over-common fragment falls back to the joined identity form", () => {
		// "StellarX" split to [stellar, x]; "x" drops (too short) and "stellar"
		// is a corpus stopword, so tokenization fell back to the bare ecosystem
		// word ["stellar"] — matching everything and flooding the candidate window
		// so the record named StellarX never loaded. q=stellarx worked; q=StellarX
		// didn't. All casings must now resolve to the joined discriminator.
		expect(tokenize("StellarX")).toEqual(["stellarx"]);
		expect(tokenize("stellarx")).toEqual(["stellarx"]);
		expect(tokenize("STELLARX")).toEqual(["stellarx"]);
		// A discriminating fragment still rides along with the joined form; only
		// the ecosystem stopword is dropped.
		expect(tokenize("StellarTerm")).toEqual(["term", "stellarterm"]);
		// A bare ecosystem query is degenerate but unchanged (joined === token).
		expect(tokenize("Stellar")).toEqual(["stellar"]);
	});
	it("hyphenated vocabulary stays intact", () => {
		expect(tokenize("on-ramp mexico")).toContain("on-ramp");
	});

	it("F1: type-browse tokens become types-contains candidate clauses", () => {
		const cl = structuredSelectClauses(["decentralized", "exchange"]);
		expect(cl).toContainEqual({ types: { contains: "DEX" } });
		const edu = structuredSelectClauses(["education", "projects"]);
		expect(edu).toContainEqual({ types: { contains: "Education" } });
		const si = structuredSelectClauses(["social", "impact"]);
		expect(si).toContainEqual({ types: { contains: "Social Impact" } });
	});

	it("F1: sep tokens become coverage.seps clauses (hyphen-normalized)", () => {
		expect(structuredSelectClauses(["sep-24", "anchors"])).toContainEqual({
			"coverage.seps": { contains: "sep-24" },
		});
		expect(structuredSelectClauses(["sep24"])).toContainEqual({
			"coverage.seps": { contains: "sep-24" },
		});
		expect(structuredSelectClauses(["wallet"])).not.toContainEqual(
			expect.objectContaining({ "coverage.seps": expect.anything() }),
		);
	});

	it("F2: iterative stem variants reach doc forms via substring", () => {
		// donations → donation → donat (substring-matches "donate")
		expect(termsForToken("donations")).toContain("donat");
		// savings → saving → sav (substring-matches "save")
		expect(termsForToken("savings")).toContain("sav");
		// charities → charity
		expect(termsForToken("charities")).toContain("charity");
	});

	it("F2: currency names map to stored codes at tokenize time", () => {
		expect(tokenize("kenyan shilling on-ramp")).toContain("kes");
		expect(tokenize("send argentine peso")).toContain("ars");
		expect(tokenize("peruvian sol wallet")).toContain("pen");
		expect(tokenize("random query")).not.toContain("kes");
	});

	it("F2: anchor tokens exclude generic transactional words", () => {
		expect(anchorTokens(["buy", "gold"])).toEqual(["gold"]);
		expect(anchorTokens(["send", "money", "philippines"])).toEqual([
			"philippines",
		]);
		// all-generic queries impose no constraint
		expect(anchorTokens(["buy", "sell"])).toEqual([]);
		// 'sol' alone is never an anchor (Solana ticker vs spanish sol)
		expect(anchorTokens(["peruvian", "sol"])).toEqual(["peruvian"]);
	});

	it("F2: hitsAnyToken tests expanded terms against a haystack", () => {
		expect(hitsAnyToken("tokenized gold vaults on stellar", ["gold"])).toBe(
			true,
		);
		expect(hitsAnyToken("a payments wallet", ["gold"])).toBe(false);
	});
});

// Live records behind the 2026-07-19 re-measure of audit item 1: "custody
// with staking" ranked prose-mentioners at 0.97 above the custody provider.
const COBO = {
	name: "Cobo",
	shortDescription:
		"Institutional-grade digital asset custody and wallet infrastructure with support for Stellar assets.",
	category: "Infrastructure",
	types: ["Infrastructure", "Wallet"],
};
const NORMAL_FINANCE = {
	name: "Normal",
	shortDescription:
		"A wrapped asset protocol helping institutions turn any token held in qualified custody into yield-generating staking assets.",
	category: "DeFi",
	types: ["DEX"],
};
const SELF_CUSTODY_WALLET = {
	name: "Solar",
	shortDescription:
		"Non-custodial wallet for the Stellar network with staking support.",
	category: "Wallet",
	types: ["Wallet"],
};

describe("mention-vs-identity (custody re-measure 2026-07-19)", () => {
	const tokens = tokenize("custody with staking");

	it("identity zone carries the lead clause but not late prose", () => {
		expect(identityZone(COBO)).toContain("custody");
		// Normal's custody mention sits past the 60-char lead clause
		expect(identityZone(NORMAL_FINANCE)).not.toContain("custody");
	});

	it("the custody provider hits identity; the prose-mentioner does not", () => {
		expect(anchorIdentityHit(COBO, tokens)).toBe(true);
		expect(anchorIdentityHit(NORMAL_FINANCE, tokens)).toBe(false);
	});

	it("negated identity does not count (non-custodial wallet)", () => {
		// "non-custodial" in the lead clause is the OPPOSITE of custody —
		// but "staking" legitimately hits Solar's identity zone, so probe the
		// custody anchor alone.
		expect(anchorIdentityHit(SELF_CUSTODY_WALLET, tokenize("custody"))).toBe(
			false,
		);
	});

	it("anchor-free queries switch the rule off", () => {
		expect(anchorIdentityHit(NORMAL_FINANCE, [])).toBe(true);
	});
});

describe("P-ATTR — structured chain support is identity (F1, 2026-07-21)", () => {
	// Real live shape: an infra project that declares evm support in
	// supportedNetworks but never says "evm" in its prose. It ranked #19 for
	// q=evm — below bridges that merely mention EVM — because identityZone
	// excluded supportedNetworks, so anchorIdentity was false for it.
	const BAND = {
		name: "Band Protocol",
		shortDescription: "Cross-chain data oracle platform.",
		category: "Infrastructure",
		types: [],
		supportedNetworks: ["stellar", "evm", "xrpl", "cosmos"],
		coverage: null,
	};
	// A record that neither declares nor mentions evm anywhere.
	const STELLAR_ONLY = {
		name: "Freighter",
		shortDescription: "A browser-extension wallet for Stellar.",
		category: "User-Facing App",
		types: ["Wallet"],
		supportedNetworks: ["stellar"],
		coverage: null,
	};

	it("declared supportedNetworks joins the identity zone", () => {
		expect(identityZone(BAND)).toContain("evm");
		expect(identityZone(STELLAR_ONLY)).not.toContain("evm");
	});

	it("a chain a project structurally supports counts as identity for that chain query", () => {
		// The P-ATTR fix: BAND now hits identity for q=evm off supportedNetworks
		// alone, so it ranks with the evm bridges instead of below them.
		expect(anchorIdentityHit(BAND, tokenize("evm"))).toBe(true);
		expect(anchorIdentityHit(BAND, tokenize("evm infrastructure"))).toBe(true);
		// A stellar-only record is not an evm identity.
		expect(anchorIdentityHit(STELLAR_ONLY, tokenize("evm"))).toBe(false);
	});
});

describe("chain-corridor discriminator (2026-07-21 persona battery)", () => {
	// Real supportedNetworks captured live 2026-07-21.
	const SPACEWALK = {
		name: "Spacewalk",
		shortDescription:
			"Spacewalk is a trust-minimized cross-chain bridge connecting Stellar and Polkadot, built by Pendulum.",
		category: "Bridge",
		types: ["Bridge"],
		supportedNetworks: ["stellar", "polkadot", "kusama"],
		coverage: null,
	};
	const ALLBRIDGE = {
		name: "Allbridge",
		shortDescription:
			"Allbridge enables users to access the Stellar ecosystem through cross-chain bridge swaps.",
		category: "Bridge",
		types: ["Bridge"],
		supportedNetworks: ["stellar", "evm", "solana", "tron", "sui"],
		coverage: null,
	};
	// A bridge whose supportedNetworks is not yet enriched — must fall back to
	// prose so we never penalize a record we simply haven't enriched.
	const UNENRICHED_SOL_BRIDGE = {
		name: "SolLink",
		shortDescription: "A Solana ⇄ Stellar bridge for SPL tokens.",
		category: "Bridge",
		types: ["Bridge"],
		supportedNetworks: [],
		coverage: null,
	};

	it("names external chains, ignoring Stellar and ambiguous English-word tickers", () => {
		expect([...namedChains(tokenize("solana to stellar bridge"))]).toEqual([
			"solana",
		]);
		expect([...namedChains(tokenize("ethereum bridge"))]).toEqual(["ethereum"]);
		// "stellar" is the home chain, never an external corridor.
		expect(namedChains(tokenize("stellar bridge")).size).toBe(0);
		// bare "sol"/"base"/"near" are English words / ambiguous → not chains.
		expect(namedChains(tokenize("cross-chain bridge")).size).toBe(0);
	});

	it("a solana-serving bridge proves the corridor; a polkadot-only one does not", () => {
		const t = tokenize("solana to stellar bridge");
		expect(chainCorridorHit(ALLBRIDGE, t)).toBe(true);
		expect(chainCorridorHit(SPACEWALK, t)).toBe(false); // polkadot/kusama ≠ solana
	});

	it("EVM-family queries are proven by the generic evm tag", () => {
		expect(chainCorridorHit(ALLBRIDGE, tokenize("ethereum bridge"))).toBe(true);
		expect(chainCorridorHit(SPACEWALK, tokenize("ethereum bridge"))).toBe(false);
	});

	it("unenriched bridges fall back to a prose mention", () => {
		expect(
			chainCorridorHit(UNENRICHED_SOL_BRIDGE, tokenize("solana bridge")),
		).toBe(true);
	});

	it("is inert on chain-agnostic queries and non-bridge records", () => {
		// No external chain named → rule off, every bridge passes.
		expect(chainCorridorHit(SPACEWALK, tokenize("cross-chain bridge"))).toBe(
			true,
		);
		// A non-bridge record that merely mentions a chain isn't a corridor claim.
		const SOLANA_WALLET = {
			name: "Phantom-ish",
			shortDescription: "A wallet that also supports Solana accounts.",
			category: "User-Facing App",
			types: ["Wallet"],
			supportedNetworks: ["stellar"],
			coverage: null,
		};
		expect(chainCorridorHit(SOLANA_WALLET, tokenize("solana wallet"))).toBe(
			true,
		);
	});
});
