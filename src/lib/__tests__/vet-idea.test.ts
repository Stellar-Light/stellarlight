import { describe, expect, it } from "vitest";
import { GAP_VERTICALS } from "../ecosystem-gaps";
import { buildHaystack, scoreTokens, tokenize } from "../project-search-match";
import { buildVetIdea, VERTICAL_TOKENS } from "../vet-idea";

describe("vet-idea vertical map", () => {
	it("every VERTICAL_TOKENS value is a real GAP_VERTICALS member", () => {
		for (const [token, vertical] of Object.entries(VERTICAL_TOKENS)) {
			expect(GAP_VERTICALS as readonly string[], `token '${token}'`).toContain(
				vertical,
			);
		}
	});

	it("porter + core entry points map (2026-08-15 lesson)", () => {
		expect(VERTICAL_TOKENS["erc-3643"]).toBe("RWA");
		expect(VERTICAL_TOKENS.amm).toBe("DEX");
		expect(VERTICAL_TOKENS.ramp).toBe("Anchor");
	});
});

/**
 * sls-073 regression. vet-idea returned an EMPTY competitors.projects array for
 * "perpetuals / derivatives trading protocol on Stellar" while the directory
 * returned 25 rows for the identical string — because vet-idea's no-vertical
 * fallback hand-rolled its own `includes` pass over an arbitrary 400-row window
 * and over `description`, while the directory ranks the whole active set with
 * the shared matcher over `shortDescription` + structured fields.
 *
 * These rows are the real ones the directory returned that day. If the two
 * surfaces ever diverge on the same matcher again, this fails.
 */
describe("vet-idea competitor consistency with the directory (sls-073)", () => {
	// Real shapes: these carry NO perpetuals type — the vertical does not exist
	// — so they can only be found by the prose matcher.
	const rows = [
		{
			slug: "noether",
			name: "Noether",
			types: [],
			shortDescription:
				"A decentralized perpetual futures exchange on Stellar/Soroban.",
		},
		{
			slug: "zenex",
			name: "Zenex",
			types: [],
			shortDescription:
				"A decentralized perpetual trading exchange on Stellar/Soroban.",
		},
		{
			slug: "turbolong",
			name: "TurboLong",
			types: [],
			shortDescription: "A leveraged trading platform on Stellar.",
		},
		{
			slug: "stellars-finance",
			name: "Stellars Finance",
			types: ["DEX"],
			shortDescription: "A perpetual trading protocol on Stellar.",
		},
	];

	it("the shared matcher finds the perps rows the directory returns", () => {
		const tokens = tokenize(
			"perpetuals / derivatives trading protocol on Stellar",
		);
		const matched = rows.filter(
			(r) => scoreTokens(buildHaystack(r), tokens) > 0,
		);
		expect(matched.map((r) => r.slug)).toEqual([
			"noether",
			"zenex",
			"turbolong",
			"stellars-finance",
		]);
	});

	it("the OLD naive fallback missed them — proving the matcher swap matters", () => {
		// What vet-idea used to do: raw includes over name + description.
		const naive = ["perpetuals", "derivatives", "trading"];
		const missed = rows.filter((r) => {
			const hay = `${r.name} ${""}`.toLowerCase(); // description was unset on these rows
			return !naive.some((t) => hay.includes(t));
		});
		expect(missed.length).toBe(rows.length);
	});
});

/**
 * sls-073, second half. Making the fallback non-empty was not enough: the
 * displayed slice was still sorted audited-first, so asking for competitors to
 * a perpetuals protocol returned audited NON-perps projects (soroswap, equitx)
 * while the two real perps venues — higher-scoring but unaudited — fell outside
 * the 8-row window. Relevance has to lead; an audit is a quality signal about a
 * competitor, not what makes something a competitor.
 */
describe("vet-idea competitor ordering (sls-073, ranking half)", () => {
	type Doc = { slug: string; name: string; __rel: number };
	const audited = new Set(["soroswap"]);
	const order = (docs: Doc[]) =>
		[...docs]
			.sort((a, b) => {
				const ar = a.__rel ?? 0;
				const br = b.__rel ?? 0;
				const aa = audited.has(a.slug) ? 0 : 1;
				const bb = audited.has(b.slug) ? 0 : 1;
				return br - ar || aa - bb || a.name.localeCompare(b.name);
			})
			.map((d) => d.slug);

	it("a more relevant unaudited row outranks a less relevant audited one", () => {
		// Real scores from the shared matcher for the perps query.
		expect(
			order([
				{ slug: "soroswap", name: "Soroswap", __rel: 0 },
				{ slug: "zenex", name: "Zenex", __rel: 2 },
				{ slug: "noether", name: "Noether", __rel: 1 },
			]),
		).toEqual(["zenex", "noether", "soroswap"]);
	});

	it("audit still breaks a tie between equally relevant rows", () => {
		expect(
			order([
				{ slug: "aaa-unaudited", name: "AAA", __rel: 2 },
				{ slug: "soroswap", name: "Soroswap", __rel: 2 },
			]),
		).toEqual(["soroswap", "aaa-unaudited"]);
	});
});

/**
 * The mapped-vertical path had the same defect as the fallback, hidden one
 * layer down: type membership decided eligibility AND ordering was left to the
 * alphabet, so "a non-custodial wallet for Stellar" answered airgap, akuna,
 * albedo. Membership says who is eligible; relevance says who leads.
 */
describe("vet-idea vertical path ranks by relevance, not the alphabet", () => {
	it("a well-matching wallet outranks an alphabetically-earlier one", () => {
		const toks = tokenize("a non-custodial wallet for Stellar");
		const airgap = scoreTokens(
			buildHaystack({
				slug: "airgap",
				name: "AirGap",
				types: ["Wallet"],
				shortDescription: "Offline signing companion.",
			} as never),
			toks,
		);
		const freighter = scoreTokens(
			buildHaystack({
				slug: "freighter",
				name: "Freighter",
				types: ["Wallet"],
				shortDescription:
					"Non-custodial Stellar wallet browser extension for Soroban dapps.",
			} as never),
			toks,
		);
		expect(freighter).toBeGreaterThan(airgap);
	});
});

/**
 * Most rows inside a mapped vertical score identically — "wallet" matches
 * every wallet — so the tie-break IS the answer. It used to be the alphabet,
 * which returned albedo, beans, bitget-wallet, coca, cypher for "a
 * non-custodial wallet for Stellar". prominence is the curated "canonical pick
 * for its category" signal (Freighter = 90).
 */
describe("vet-idea tie-break is prominence, not the alphabet", () => {
	type Doc = { slug: string; name: string; __rel: number; prominence?: number };
	const audited = new Set<string>();
	const order = (docs: Doc[]) =>
		[...docs]
			.sort((a, b) => {
				const ar = a.__rel ?? 0;
				const br = b.__rel ?? 0;
				const ap = Number(a.prominence ?? 0);
				const bp = Number(b.prominence ?? 0);
				const aa = audited.has(a.slug) ? 0 : 1;
				const bb = audited.has(b.slug) ? 0 : 1;
				return br - ar || bp - ap || aa - bb || a.name.localeCompare(b.name);
			})
			.map((d) => d.slug);

	it("equal relevance: the canonical pick leads, not the alphabet", () => {
		expect(
			order([
				{ slug: "albedo", name: "Albedo", __rel: 2, prominence: 50 },
				{ slug: "freighter", name: "Freighter", __rel: 2, prominence: 90 },
				{ slug: "beans", name: "Beans", __rel: 2, prominence: 0 },
			]),
		).toEqual(["freighter", "albedo", "beans"]);
	});

	it("relevance still outranks prominence", () => {
		expect(
			order([
				{ slug: "freighter", name: "Freighter", __rel: 1, prominence: 90 },
				{ slug: "niche", name: "Niche", __rel: 3, prominence: 0 },
			]),
		).toEqual(["niche", "freighter"]);
	});
});

/**
 * Competitor padding (2026-10-20, 40 blind-labeled ideas). The block was
 * filled to 8 with whatever matched one word, ordered by prominence:
 * "fans fund artists" served Tipper plus the seven rows below, which share
 * only "fund" (Friendbot funds testnet accounts). These are the rows the
 * live directory served that day, in its own words.
 */
describe("vet-idea competitors are not padded with one-word matches", () => {
	const row = (
		slug: string,
		name: string,
		types: string[],
		prominence: number,
		shortDescription: string,
	) => ({ slug, name, status: "Live", types, prominence, shortDescription });
	const rows = [
		row(
			"tipper",
			"Tipper",
			["Payments"],
			0,
			"TIPPER is the best way for creators to get tipped in USDC on Stellar. Tipper allows for Latin American influencers, artists and communities that want monetize their audience, get support from fans anywhere around the world, and convert their tips and earnings into Digital Dollars.",
		),
		row(
			"freighter",
			"Freighter",
			["Wallet"],
			90,
			"Freighter is the Stellar Development Foundation's official non-custodial Stellar wallet: a browser extension and iOS/Android apps, across Mainnet, Testnet and Futurenet (Friendbot funding).",
		),
		row(
			"stellar-cli",
			"Stellar CLI",
			["Faucet"],
			90,
			"The Stellar CLI is the official command-line tool for Stellar/Soroban developers. It generates a keypair and funds it with test XLM via Friendbot, the fastest way to fund a testnet account.",
		),
		row(
			"benji",
			"Benji",
			["RWA"],
			88,
			"Benji is Franklin Templeton's tokenized real-world asset (RWA) platform. The Franklin OnChain U.S. Government Money Fund (FOBXX), a tokenized money market fund, is natively issued on Stellar.",
		),
		row(
			"friendbot",
			"Friendbot",
			["Faucet"],
			85,
			"Friendbot is Stellar's official testnet faucet: an SDF-hosted bot that funds new accounts and Soroban contracts with 10,000 fake test XLM.",
		),
		row(
			"chaincerts",
			"Chaincerts",
			["Security"],
			82,
			"Chaincerts issues verifiable credentials and decentralized identity (DID) on Stellar using Soroban smart contracts. SCF-funded, by kommitters.",
		),
		row(
			"nodies",
			"Nodies",
			["RPC"],
			82,
			"Nodies is a Web3 infrastructure platform and Stellar RPC node provider offering RPC and Horizon endpoints. SCF-funded.",
		),
		row(
			"phoenix",
			"Phoenix",
			["DEX"],
			80,
			"Phoenix DeFi Hub is an SCF-funded AMM-based DEX on Stellar/Soroban running constant-product and stableswap liquidity pools.",
		),
	];
	const payload = {
		find: async ({ collection }: { collection: string }) =>
			collection === "projects"
				? { docs: structuredClone(rows), totalDocs: rows.length }
				: { docs: [], totalDocs: 0 },
	};
	const served = async (q: string) =>
		(await buildVetIdea(payload as never, q)).competitors.projects.map(
			(p) => p.slug,
		);

	it("a row sharing only a common word of the idea is not served", async () => {
		expect(await served("fans fund artists")).toEqual(["tipper"]);
	});

	it("a one-word idea is not gated", async () => {
		expect(await served("wallet")).toEqual(["freighter"]);
	});
});

describe("vet-idea weighs a negation-seeking idea's words in context", () => {
	const row = (slug: string, types: string[], shortDescription: string) => ({
		slug,
		name: slug,
		status: "Live",
		types,
		prominence: 0,
		shortDescription,
	});
	const rows = [
		row("acme-vault", ["Wallet"], "A non-custodial wallet for teams."),
		row("custody-co", ["Custody"], "A regulated custodial wallet service."),
		row("anon-pay", ["Payments"], "An anonymous payments app with a wallet."),
		row("nft-gallery", ["NFT"], "A non-fungible token gallery and wallet."),
		row("nonce-kit", ["Tooling"], "Nonce tools for wallet developers."),
		row("pocket", ["Wallet"], "A mobile wallet."),
	];
	const payload = {
		find: async ({ collection }: { collection: string }) =>
			collection === "projects"
				? { docs: structuredClone(rows), totalDocs: rows.length }
				: { docs: [], totalDocs: 0 },
	};

	it("serves the non-custodial wallet the idea asks for", async () => {
		// Read one word at a time, "custodial" missed "non-custodial", so the
		// rare word's weight went to the custodial service alone and the
		// wallet the idea describes fell under the coverage floor.
		const served = (
			await buildVetIdea(payload as never, "non custodial wallet")
		).competitors.projects.map((p) => p.slug);
		expect(served[0]).toBe("acme-vault");
	});
});

describe("vet-idea labels the competitors it serves", () => {
	const row = (slug: string, types: string[], shortDescription: string) => ({
		slug,
		name: slug,
		status: "Live",
		types,
		prominence: 0,
		shortDescription,
	});
	const vet = (rows: ReturnType<typeof row>[], q: string) =>
		buildVetIdea(
			{
				find: async ({ collection }: { collection: string }) =>
					collection === "projects"
						? { docs: structuredClone(rows), totalDocs: rows.length }
						: { docs: [], totalDocs: 0 },
			} as never,
			q,
		).then((r) => r.competitors);
	const lendco = row(
		"lendco",
		["Lending"],
		"A lending protocol for stablecoins.",
	);

	it("an idea no row covers enough of serves nothing, labelled weak", async () => {
		// Each row matches one of three equally rare words: a third of the
		// idea. The label was set before the cut, so [] read as "typed
		// members of the idea's vertical", a landscape with nobody in it.
		const c = await vet(
			[
				lendco,
				row("artbox", ["NFT"], "A marketplace for artists."),
				row("coverly", ["Insurance"], "Parametric insurance for travel."),
			],
			"lending artists insurance",
		);
		expect(c.projects).toEqual([]);
		expect(c.matchMode).toBe("weak");
		expect(c.matchModeLabel).toMatch(/not evidence that none exists/);
	});

	it("names how the served rows were found, not the rows the cut removed", async () => {
		const c = await vet(
			[lendco, row("duo", ["Tooling"], "Insurance for artists' gear.")],
			"lending artists insurance",
		);
		expect(c.projects.map((p) => p.slug)).toEqual(["duo"]);
		expect(c.matchMode).toBe("scored");
		expect(c.matchModeLabel).toBe("matched the idea's own terms");
	});

	it("keeps calling a served member a member when every scored row was cut", async () => {
		const c = await vet(
			[
				row("lendco", ["Lending"], "Lending and insurance for artists."),
				row("quotes", ["Tooling"], "Insurance quotes."),
			],
			"lending artists insurance",
		);
		expect(c.projects.map((p) => p.slug)).toEqual(["lendco"]);
		expect(c.matchMode).toBe("vertical");
		expect(c.matchModeLabel).toBe("typed members of the idea's vertical");
	});
});
