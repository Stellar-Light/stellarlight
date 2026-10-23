import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { GAP_VERTICALS } from "../ecosystem-gaps";
import { semanticBuildScores } from "../hackathon-build-semantic";
import {
	getHackathonBuildsIndex,
	type IndexedBuild,
} from "../hackathon-builds";
import { buildHaystack, scoreTokens, tokenize } from "../project-search-match";
import { buildVetIdea, VERTICAL_TOKENS, verticalOf } from "../vet-idea";

vi.mock("@/lib/hackathon-build-semantic", () => ({
	BUILD_SEMANTIC_FLOOR: 0.68,
	// Search by meaning ran and found nothing above its floor, which is what a
	// short idea gets in production.
	semanticBuildScores: vi.fn(async () => new Map()),
}));
const buildsIndex: IndexedBuild[] = [];
vi.mock("@/lib/hackathon-builds", async (orig) => ({
	...(await orig<typeof import("@/lib/hackathon-builds")>()),
	getHackathonBuildsIndex: vi.fn(async () => buildsIndex),
}));

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

describe("vet-idea reads an idea's vertical", () => {
	it("reads a stablecoin rail by the idea's other vertical", () => {
		// Payroll on a stablecoin rail competes with payroll tools, not issuers.
		expect(verticalOf("stablecoin payroll for freelancers")).toBe("Payments");
		expect(
			verticalOf("subscription billing with recurring stablecoin payments"),
		).toBe("Payments");
		expect(verticalOf("stablecoin wallet for remittances")).toBe("Wallet");
	});

	it("keeps Stablecoin for a stablecoin product, even beside a payments word", () => {
		// Each phrase also names Payments, so a rail reading would move it.
		for (const idea of [
			"stablecoin issuer for merchant payments",
			"stablecoin issuance for payroll",
			"a stablecoin with 1:1 backing for merchant payments",
			"fiat-backed stablecoin for payments",
			"a minted stablecoin for payments",
			"a stablecoin pegging the dollar for payments",
			"redeemable stablecoin for merchant payments",
			"a stablecoin with daily redemptions for payroll",
			"stablecoin reserves dashboard for payments teams",
			"a stablecoin minter for merchant payments",
			"an overcollateralized stablecoin for lending",
			"a stablecoin with dollar collateral for payments",
			"stablecoin issuances for payroll",
			"an algorithmic stablecoin for merchant payments",
			"a depegged stablecoin for merchant payments",
		])
			expect(verticalOf(idea)).toBe("Stablecoin");
		expect(verticalOf("a stablecoin that anchors its peg to gold")).toBe(
			"Stablecoin",
		);
	});

	it("knows the plural and compound forms ideas use", () => {
		expect(verticalOf("loans for farmers")).toBe("Lending");
		expect(verticalOf("microloan app")).toBe("Lending");
		expect(verticalOf("microloans for small businesses")).toBe("Lending");
		expect(verticalOf("microfinance platform")).toBe("Lending");
		expect(verticalOf("charity auctions")).toBe("Social Impact");
		expect(verticalOf("donation matching for nonprofits")).toBe(
			"Social Impact",
		);
		expect(verticalOf("accept donations in crypto")).toBe("Social Impact");
		expect(verticalOf("transparent donation platform for charities")).toBe(
			"Social Impact",
		);
		expect(verticalOf("payroll for remote teams")).toBe("Payments");
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

/**
 * Live probe (2026-10-22): `/api/vet-idea?q=remittance app` served
 * priorArt.builds [] while searchHackathonBuilds matched 16. The search reads
 * the idea as one word, so the two-word evidence rule could never pass, and
 * search by meaning never clears its floor for so few words. An empty list
 * says checked and none, which was false.
 */
describe("vet-idea prior-art builds for short ideas", () => {
	const build = (
		id: string,
		description: string,
		award: string | null = null,
	): IndexedBuild => ({
		id,
		name: id,
		description,
		githubUrl: null,
		demoUrl: null,
		videoUrl: null,
		track: null,
		hackathonPlacement: null,
		award,
		isWinner: false,
		voteCount: null,
		url: `https://dorahacks.io/buidl/${id}`,
		source: "dorahacks",
		hackathon: { title: "E", slug: "e", endedAt: "2025-01-15" },
		haystack: `${id} ${description} ${award ?? ""}`.toLowerCase(),
	});
	beforeAll(() => {
		buildsIndex.push(
			build("remit-home", "Send remittances home in USDC."),
			build("corridor", "A remittance corridor for families abroad."),
			build("chess-club", "A chess game for clubs."),
			build("bracket", "Esports tournament brackets."),
			build("peg-desk", "A stablecoin backed by treasuries."),
			build(
				"swap-award",
				"A DEX for long-tail assets.",
				"Best Stablecoin Integration",
			),
		);
	});
	afterAll(() => {
		buildsIndex.length = 0;
	});
	const payload = {
		find: async () => ({ docs: [], totalDocs: 0 }),
	} as never;
	const priorArt = async (q: string) =>
		(await buildVetIdea(payload, q)).priorArt;

	it("serves the builds that match every word of a one-word idea", async () => {
		const p = await priorArt("remittance app");
		expect(p.builds?.map((b) => b.id).sort()).toEqual([
			"corridor",
			"remit-home",
		]);
		expect(p.buildsBelowEvidenceRule).toBe(0);
	});

	it("says the nearest builds did not meet the evidence rule instead of claiming none", async () => {
		// Each build matches one of the idea's two words: near, not evidence.
		const p = await priorArt("chess tournament");
		expect(p.builds).toEqual([]);
		expect(p.buildsBelowEvidenceRule).toBe(2);
		expect(p.note).toMatch(
			/2 nearest submissions did not meet the evidence rule/,
		);
	});

	it("keeps [] for an idea no build matches at all", async () => {
		const p = await priorArt("quantum teleportation");
		expect(p.builds).toEqual([]);
		expect(p.buildsBelowEvidenceRule).toBe(0);
		expect(p.note).not.toMatch(/did not meet the evidence rule/);
	});

	it("serves null, not a count, when the index could not be read", async () => {
		vi.mocked(getHackathonBuildsIndex).mockRejectedValueOnce(new Error("down"));
		const p = await priorArt("remittance app");
		expect(p.builds).toBeNull();
		expect(p.buildsBelowEvidenceRule).toBeNull();
	});

	it("lists a one-word idea's builds only when their own words use it", async () => {
		// swap-award has the word only in its award title; remit-home matches
		// only through the synonym usdc. Both are near, neither is evidence.
		const p = await priorArt("stablecoin");
		expect(p.builds?.map((b) => b.id)).toEqual(["peg-desk"]);
		expect(p.buildsBelowEvidenceRule).toBe(2);
	});

	it("says a one-word idea's builds need only mention the word", async () => {
		const p = await priorArt("remittance app");
		expect(p.note).toMatch(
			/reads this idea as one word, "remittance": each listed build need only mention it/,
		);
		expect((await priorArt("chess tournament")).note).not.toMatch(
			/reads this idea as one word/,
		);
	});

	it("says search by meaning did not run, in keyword mode, instead of citing a score", async () => {
		vi.mocked(semanticBuildScores).mockResolvedValueOnce(null);
		const p = await priorArt("chess tournament");
		expect(p.buildsMode).toBe("keyword");
		expect(p.note).toMatch(
			/did not meet the evidence rule: too few of the idea's words matched, and search by meaning could not run/,
		);
		expect(p.note).not.toMatch(/no meaning score reached 0\.7/);
	});
});

/**
 * 2026-10-23: the hybrid top 50 reordered by a reranker that reads the idea
 * with each build's name and summary; of the five it puts first, those it
 * scores at least RERANK_FLOOR are listed. On held-out labeled ideas:
 * same-idea builds listed 11 to 14, wrong ones 16 to 10. When it cannot run,
 * today's order and evidence rule serve, and the answer says so.
 */
describe("vet-idea prior-art builds, reranked", () => {
	const build = (id: string, description: string): IndexedBuild => ({
		id,
		name: id,
		description,
		githubUrl: null,
		demoUrl: null,
		videoUrl: null,
		track: null,
		hackathonPlacement: null,
		award: null,
		isWinner: false,
		voteCount: null,
		url: `https://dorahacks.io/buidl/${id}`,
		source: "dorahacks",
		hackathon: { title: "E", slug: "e", endedAt: "2025-01-15" },
		haystack: `${id} ${description}`.toLowerCase(),
	});
	let scoreOf: (doc: string) => number = () => 0.5;
	beforeAll(() => {
		buildsIndex.push(
			build("remit-home", "Send remittances home in USDC."),
			build("corridor", "A remittance corridor for families abroad."),
			build("chess-club", "A chess game for clubs."),
			build("bracket", "Esports tournament brackets."),
		);
	});
	afterAll(() => {
		buildsIndex.length = 0;
	});
	beforeEach(() => {
		vi.stubEnv("VOYAGE_API_KEY", "test");
		vi.stubGlobal(
			"fetch",
			vi.fn(async (_url: string, init: RequestInit) => {
				const { documents } = JSON.parse(String(init.body)) as {
					documents: string[];
				};
				return {
					ok: true,
					status: 200,
					json: async () => ({
						data: documents.map((d, index) => ({
							index,
							relevance_score: scoreOf(d),
						})),
					}),
				};
			}),
		);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});
	const payload = {
		find: async () => ({ docs: [], totalDocs: 0 }),
	} as never;
	const priorArt = async (q: string) =>
		(await buildVetIdea(payload, q)).priorArt;

	// First: the reranker caches what it scored, and a failure is not cached.
	it("falls back to the hybrid order and the evidence rule when the reranker fails, and says so", async () => {
		vi.mocked(fetch).mockRejectedValueOnce(new Error("network"));
		const p = await priorArt("remittance app");
		expect(p.builds?.map((b) => b.id).sort()).toEqual([
			"corridor",
			"remit-home",
		]);
		expect(p.buildsReranked).toBe(false);
		expect(p.note).toMatch(/the reranker could not run this request/);
		expect(p.note).toMatch(/reads this idea as one word/);
	});

	it("lists the reranked top five in the reranker's order", async () => {
		scoreOf = (d) => (d.startsWith("remit-home.") ? 0.9 : 0.6);
		const p = await priorArt("remittance");
		expect(p.builds?.map((b) => b.id)).toEqual(["remit-home", "corridor"]);
		expect(p.buildsReranked).toBe(true);
		expect(p.buildsBelowEvidenceRule).toBe(0);
		// The one-word path is not how a reranked build is listed.
		expect(p.note).not.toMatch(/reads this idea as one word/);
	});

	it("leaves out a build the reranker scores below its floor", async () => {
		scoreOf = (d) => (d.startsWith("corridor.") ? 0.9 : 0.2);
		const p = await priorArt("remittance app");
		expect(p.builds?.map((b) => b.id)).toEqual(["corridor"]);
		expect(p.buildsBelowEvidenceRule).toBe(1);
	});

	it("says the reranker scored the nearest below its floor instead of claiming none", async () => {
		scoreOf = () => 0.1;
		const p = await priorArt("chess tournament");
		expect(p.builds).toEqual([]);
		expect(p.buildsBelowEvidenceRule).toBe(2);
		expect(p.note).toMatch(
			/2 nearest submissions did not meet the evidence rule: the reranker, reading the idea with each one's name and summary, scored them below 0\.45/,
		);
	});

	it("does not rerank when search by meaning did not run", async () => {
		vi.mocked(semanticBuildScores).mockResolvedValueOnce(null);
		const p = await priorArt("chess tournament");
		expect(p.buildsMode).toBe("keyword");
		expect(p.buildsReranked).toBe(false);
		expect(fetch).not.toHaveBeenCalled();
	});
});
