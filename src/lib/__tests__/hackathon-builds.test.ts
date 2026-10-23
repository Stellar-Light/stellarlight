import { describe, expect, it } from "vitest";
import { indexProjectRepos, repoFullNameOf } from "@/lib/hackathon-build-links";
import {
	buildDetailFromStored,
	dedupeBuilds,
	type IndexedBuild,
	indexedFromStored,
	onePerSubmission,
	searchHackathonBuilds,
	unusedWordsWarning,
	wordsNoBuildUses,
} from "@/lib/hackathon-builds";
import {
	type DoraHacksHackathon,
	doraEventRef,
	endedDoraHacksEvents,
} from "@/lib/integrations/dorahacks";
import { spec } from "@/lib/openapi-spec";
import type { HackathonBuild } from "@/payload-types";
import {
	responseSchema,
	undeclaredInServed,
} from "../../../scripts/contract/served-shape";

const build = (
	name: string,
	description: string,
	isWinner = false,
	id = name,
): IndexedBuild => ({
	id,
	name,
	description,
	githubUrl: null,
	demoUrl: null,
	videoUrl: null,
	track: null,
	hackathonPlacement: isWinner ? "5th Place" : null,
	award: null,
	isWinner,
	voteCount: null,
	url: `https://dorahacks.io/buidl/${id}`,
	source: "dorahacks",
	hackathon: {
		title: "Stellar Hacks: Agents",
		slug: "stellar-agents-x402-stripe-mpp",
		endedAt: "2026-04-13",
	},
	haystack: `${name} ${description}`.toLowerCase(),
});

describe("searchHackathonBuilds ordering", () => {
	// The 2026-10-05 audit case: titles stuffed with the query's words outranked
	// the winner that built the idea.
	const index = [
		build(
			"Private Resource Access for AI Agents",
			"For AI agents paying per API call on-chain, paying is confessing.",
		),
		build(
			"AgentPay",
			"AI agents can reason and plan, but they can't spend money.",
		),
		build(
			"TollPay",
			"Toll is Stripe for MCP Servers. AI agents use MCP tools but can't pay for them. Toll adds per-call USDC micropayments.",
			true,
		),
		build(
			"Stripe for agents, unplaced",
			"Stripe-style payments for AI agents with USDC micropayments.",
		),
	];

	it("puts the prize winner first among builds covering the same concepts", () => {
		const out = searchHackathonBuilds(
			index,
			"payments for AI agents like Stripe for agents",
		);
		expect(out[0].b.name).toBe("TollPay");
		expect(out[0].matched).toEqual(
			expect.arrayContaining(["payments", "ai", "agents", "stripe"]),
		);
	});

	it("ranks coverage above the winner bonus", () => {
		const out = searchHackathonBuilds(
			[
				build("Escrow winner", "Escrow for freelancers on Soroban.", true),
				build(
					"Agent payments",
					"Payments for AI agents with Stripe-like checkout.",
				),
			],
			"stripe payments for ai agents",
		);
		expect(out[0].b.name).toBe("Agent payments");
	});

	it("does not count query filler or 'stellar' as a concept", () => {
		const out = searchHackathonBuilds(
			[
				build("Stellar Forge", "Token launcher."),
				build("Stellar Shield", "Wallet security for Stellar users."),
				build("Stellar Seal", "Document notarization on Stellar."),
			],
			"stellar forge",
		);
		expect(out.map((s) => s.b.name)).toEqual(["Stellar Forge"]);
	});

	it("matches a short term as a whole word only", () => {
		const out = searchHackathonBuilds(
			[
				build("Chain Explorer", "A blockchain explorer; fees are paid in XLM."),
				build("AI Copilot", "An AI assistant for Soroban developers."),
			],
			"ai",
		);
		expect(out.map((s) => s.b.name)).toEqual(["AI Copilot"]);
	});
});

describe("event naming", () => {
	const hack = (over: Partial<DoraHacksHackathon>): DoraHacksHackathon => ({
		id: 2068,
		title: "Stellar Hacks: Agents",
		uname: "stellar-agents-x402-stripe-mpp",
		start_time: 0,
		end_time: Date.UTC(2026, 3, 13) / 1000,
		bonus_price: 10000,
		hackers_count: 591,
		winner_announced: true,
		status: 2,
		source: "dorahacks",
		...over,
	});

	it("names an event by its DoraHacks uname, the slug getHackathon opens", () => {
		expect(doraEventRef(hack({}))).toEqual({
			title: "Stellar Hacks: Agents",
			slug: "stellar-agents-x402-stripe-mpp",
			endedAt: "2026-04-13",
		});
	});

	it("reads rosters only for ended DoraHacks events, newest first", () => {
		const out = endedDoraHacksEvents([
			hack({ id: 1, uname: "old", end_time: 100 }),
			hack({ id: 2, uname: "live", status: 1, winner_announced: false }),
			hack({ id: 3, uname: "curated", source: "curated" }),
			hack({ id: 4, uname: "new", end_time: 200 }),
		]);
		expect(out.map((h) => h.uname)).toEqual(["new", "old"]);
	});
});

describe("stored rows", () => {
	const row = (over: Partial<HackathonBuild>): HackathonBuild => ({
		id: "x",
		buildId: "dorahacks-buidl-42585",
		name: "TollPay",
		vision: "Toll is Stripe for MCP Servers.",
		hackathonSlug: "stellar-agents-x402-stripe-mpp",
		hackathonTitle: "Stellar Hacks: Agents",
		endedAt: "2026-04-13",
		placement: "5th Place",
		isWinner: true,
		url: "https://dorahacks.io/buidl/42585",
		githubUrl: "https://github.com/rajkaria/toll",
		firstSeenAt: "2026-10-05T00:00:00.000Z",
		lastSeenAt: "2026-10-05T00:00:00.000Z",
		updatedAt: "2026-10-05T00:00:00.000Z",
		createdAt: "2026-10-05T00:00:00.000Z",
		...over,
	});

	it("serves the stored event slug and the one-line summary as description", () => {
		const b = indexedFromStored(row({}));
		expect(b.hackathon.slug).toBe("stellar-agents-x402-stripe-mpp");
		expect(b.description).toBe("Toll is Stripe for MCP Servers.");
		expect(b.isWinner).toBe(true);
	});

	// Hack+ Alebrije: DoraHacks assigned no winners; BAF's newsletter names
	// GIBBOR (src/data/winner-overlay.ts).
	const BAF =
		"https://bafs-newsletter.beehiiv.com/p/b-news-from-mexico-city-to-lima-this-month-s-web3-route";
	const gibbor = row({
		buildId: "dorahacks-buidl-41502",
		name: "GIBBOR",
		hackathonSlug: "alebrije2026",
		hackathonTitle: "Hack+ Alebrije | CDMX 2026",
		endedAt: "2026-03-22",
		placement: null,
		isWinner: false,
		url: "https://dorahacks.io/buidl/41502",
	});

	it("serves a win named off DoraHacks on the stored row it names, by build id and event", () => {
		const b = indexedFromStored(gibbor);
		expect([b.isWinner, b.hackathonPlacement, b.winnerSource]).toEqual([
			true,
			"Winner",
			BAF,
		]);
		// The row's own link stays the DoraHacks page.
		expect(b.url).toBe("https://dorahacks.io/buidl/41502");
		// The same id in another event is not that win.
		const elsewhere = indexedFromStored({ ...gibbor, hackathonSlug: "other" });
		expect(elsewhere.isWinner).toBe(false);
		expect("winnerSource" in elsewhere).toBe(false);
		// A placement DoraHacks assigned replaces it.
		const placed = indexedFromStored({
			...gibbor,
			isWinner: true,
			placement: "1st Place",
		});
		expect(placed.hackathonPlacement).toBe("1st Place");
		expect("winnerSource" in placed).toBe(false);
		// A row no source names stays unplaced.
		const other = indexedFromStored({
			...gibbor,
			buildId: "dorahacks-buidl-1",
		});
		expect([other.isWinner, other.hackathonPlacement]).toEqual([false, null]);
	});

	it("the submission's detail serves that win too, its entry first, as declared", () => {
		// The same submission in a later event, unplaced: a later event leads
		// an unplaced submission, so only the win puts Alebrije first.
		const later = {
			...gibbor,
			id: "y",
			hackathonSlug: "later-event",
			hackathonTitle: "Later",
			endedAt: "2026-09-01",
		};
		const d = buildDetailFromStored([later, gibbor]);
		expect([d.hackathon.slug, d.isWinner, d.placement, d.winnerSource]).toEqual(
			["alebrije2026", true, "Winner", BAF],
		);
		expect(
			d.entries.map((e) => [e.hackathon.slug, e.isWinner, e.winnerSource]),
		).toEqual([
			["alebrije2026", true, BAF],
			["later-event", false, undefined],
		]);
		expect(
			undeclaredInServed(
				spec,
				responseSchema(spec, "/api/hackathons/builds/{id}"),
				{ build: d },
			),
		).toEqual([]);
	});

	it("keeps 'not checked' apart from 'no project'", () => {
		expect("project" in indexedFromStored(row({}))).toBe(false);
		expect(
			indexedFromStored(row({ linkCheckedAt: "2026-10-05T00:00:00.000Z" }))
				.project,
		).toBeNull();
		expect(
			indexedFromStored(
				row({
					linkCheckedAt: "2026-10-05T00:00:00.000Z",
					projectSlug: "tollpay",
					projectName: "TollPay",
				}),
			).project,
		).toEqual({ slug: "tollpay", name: "TollPay" });
	});
});

describe("repo to project links", () => {
	it("parses a repo URL and refuses an account or org URL", () => {
		expect(repoFullNameOf("https://github.com/RajKaria/Toll.git")).toBe(
			"rajkaria/toll",
		);
		expect(
			repoFullNameOf("https://github.com/rajkaria/toll/tree/main/src"),
		).toBe("rajkaria/toll");
		expect(repoFullNameOf("https://github.com/trustbridgecr")).toBeNull();
		expect(repoFullNameOf("https://gitlab.com/a/b")).toBeNull();
		expect(repoFullNameOf(null)).toBeNull();
	});

	it("links only a repo a project lists as its own", () => {
		const idx = indexProjectRepos([
			{
				slug: "tollpay",
				name: "TollPay",
				status: "Live",
				links: { github: "https://github.com/rajkaria/toll" },
			},
			{
				slug: "tansu",
				name: "Tansu",
				status: "Live",
				links: { github: "https://github.com/tupui" },
				github: { repos: [{ owner: "Consulting-Manao", name: "tansu" }] },
			},
		]);
		expect(idx.get("rajkaria/toll")).toEqual({
			slug: "tollpay",
			name: "TollPay",
		});
		expect(idx.get("consulting-manao/tansu")).toEqual({
			slug: "tansu",
			name: "Tansu",
		});
		// An account link is not a repo: the same builder's other repos never link.
		expect(idx.has("tupui/stellar-stratum")).toBe(false);
	});

	it("leaves a repo two projects list unlinked, resolves duplicates, skips drafts", () => {
		const idx = indexProjectRepos([
			{
				slug: "a",
				name: "A",
				status: "Live",
				github: { repos: [{ owner: "o", name: "shared" }] },
			},
			{
				slug: "b",
				name: "B",
				status: "Live",
				github: { repos: [{ owner: "o", name: "shared" }] },
			},
			{
				slug: "canon",
				name: "Canon",
				status: "Live",
				github: { repos: [{ owner: "o", name: "c" }] },
			},
			{
				slug: "old-name",
				name: "Old",
				status: "Draft",
				canonicalSlug: "canon",
				github: { repos: [{ owner: "o", name: "c" }] },
			},
			{
				slug: "hidden",
				name: "Hidden",
				status: "Draft",
				github: { repos: [{ owner: "o", name: "h" }] },
			},
		]);
		expect(idx.get("o/shared")).toBeNull();
		expect(idx.get("o/c")).toEqual({ slug: "canon", name: "Canon" });
		expect(idx.has("o/h")).toBe(false);
	});
});

describe("rarity and phrases", () => {
	// An agents hackathon: "agents" and "api" are everywhere, "x402" is not.
	const filler = Array.from({ length: 30 }, (_, i) =>
		build(`Agent tool ${i}`, "An API for AI agents.", false, `f${i}`),
	);

	it("weighs a rare word above common ones", () => {
		const out = searchHackathonBuilds(
			[
				...filler,
				build("Padded", "An agents API API agents for agents."),
				build("Paywall", "x402 paywall for agents."),
			],
			"x402 api for agents",
		);
		expect(out[0].b.name).toBe("Paywall");
	});

	it("counts a hyphenated phrase once and matches it spaced", () => {
		const out = searchHackathonBuilds(
			[
				build("Spaced", "Pay per call access to data."),
				build("Parts", "Pay once, then call anything."),
			],
			"pay-per-call",
		);
		expect(out[0].b.name).toBe("Spaced");
		expect(out[0].matched).toEqual(["pay-per-call"]);
		expect(out.map((s) => s.b.name)).not.toContain("Parts");
	});
});

describe("words no build uses", () => {
	const pool = [build("Agent Pay", "AI agents, payments at the café.")];

	it("reads a word with edge punctuation or an accent as a whole word", () => {
		expect(wordsNoBuildUses(pool, "agents, café")).toEqual({
			absent: [],
			concepts: 2,
		});
	});

	it("still counts a word found only inside a longer one as absent", () => {
		expect(wordsNoBuildUses(pool, "gents cafés agent")).toEqual({
			absent: ["gents"],
			concepts: 3,
		});
	});

	it("does not count a token with no letter or digit as a word", () => {
		expect(wordsNoBuildUses(pool, "agents !!! ???")).toEqual({
			absent: [],
			concepts: 1,
		});
	});

	// 140 labeled ideas, 2026-10-23: charities and family were called unused
	// beside charity and families, soroban-sdk beside 66% of read repos.
	it("reads charity for charities, a common library as used, and names a word bare", () => {
		const more = [
			build("Give", "A charity drive for families."),
			{ ...build("Vault", "A vault."), stack: ["soroban-sdk"] },
		];
		expect(
			wordsNoBuildUses(more, "charities family soroban-sdk (rosca,"),
		).toEqual({ absent: ["rosca"], concepts: 4 });
	});
});

describe("the warning names related forms submissions do use", () => {
	// The 12 words on 140 labeled ideas (2026-10-23) whose related form is
	// used, and look-alikes that are not related forms.
	const pool = [
		build("Cash", "Cash out, with cashback."),
		build("Mint", "Mint and minting tools."),
		build("Hedge", "Hedge positions."),
		build("Rent", "Rent, rental and rentals."),
		build("Cart", "A shopping cart."),
		build("Office", "Back office, backed by assets, background jobs."),
		build("Algo", "Trading algorithms."),
		build("Fees", "Cheap and cheaper fees."),
		build("Gen", "Generate a generation."),
		build("Votes", "Delegation and delegating."),
		build("Keys", "Revocable keys."),
		build("Misc", "Reliable, forever, vouch, sticker, traction."),
	];
	const line = (q: string) => unusedWordsWarning(pool, q, []) ?? "";

	it("names each related form that is used", () => {
		for (const [word, clause] of [
			["cashing", "cash for cashing"],
			["minted", "mint and minting for minted"],
			["minter", "mint and minting for minter"],
			["hedging", "hedge for hedging"],
			["renting", "rent, rental and rentals for renting"],
			["shops", "shopping for shops"],
			["backing", "back and backed for backing"],
			["algorithmic", "algorithms for algorithmic"],
			["cheapest", "cheap for cheapest"],
			["generator", "generate for generator"],
			["delegate", "delegating and delegation for delegate"],
		])
			expect(line(word), word).toContain(`used: ${clause}`);
	});

	it("claims no related form a shared prefix only looks like", () => {
		// revocable is related to revoke, but k to c is past the rule.
		for (const word of [
			"revoke",
			"relief",
			"forex",
			"vouchers",
			"stick",
			"tractor",
		])
			expect(line(word), word).not.toMatch(/related form/);
	});
});

describe("the warning names a spelling only when one is clear", () => {
	const remit = (n: number, typo: number) => [
		...Array.from({ length: n }, (_, i) =>
			build(`Remit ${i}`, "Remittance app."),
		),
		...Array.from({ length: typo }, (_, i) =>
			build(`Typo ${i}`, "Remmitance app."),
		),
	];
	const suggestion =
		"(remittance, used in submissions, is one edit from remitance)";

	it("names a word five times as used as any other one edit away", () => {
		expect(unusedWordsWarning(remit(5, 1), "remitance", [])).toContain(
			suggestion,
		);
	});

	it("names none when two are close in use", () => {
		expect(unusedWordsWarning(remit(5, 2), "remitance", [])).not.toContain(
			suggestion,
		);
	});
});

describe("a name alone does not list a build when most of q is in no build", () => {
	const pool = [
		build("Quantum Shield Exchange", "Post-quantum key custody."),
		build("MellaMate", "A companion app for daily habits."),
		build("Escrow Hub", "Escrow for freelancers on Soroban."),
		build("Café Pay", "Tap to pay at a café."),
	];
	const names = (q: string) =>
		searchHackathonBuilds(pool, q).map((s) => s.b.name);

	it("drops a build named for one word, or holding one inside its name", () => {
		expect(names("quantum llama sandwich")).toEqual([]);
	});

	it("keeps name matches when at most half of q is in no build", () => {
		expect(names("quantum escrow sandwich").sort()).toEqual([
			"Escrow Hub",
			"Quantum Shield Exchange",
		]);
		// An accented word is a word some build uses.
		expect(names("café sandwich")).toEqual(["Café Pay"]);
	});

	it("keeps a build that covers half of q, and every one-word match", () => {
		expect(names("escrow freelancers pogo stick")).toEqual(["Escrow Hub"]);
		expect(names("llama")).toEqual(["MellaMate"]);
	});
});

describe("brief picks winners first, then broadens", () => {
	it("puts covering winners first and leaves out a one-word winner", async () => {
		const { pickBriefBuilds } = await import("@/lib/hackathon-brief");
		// The brief takes the search's scored list (hybrid in production).
		const picks = pickBriefBuilds(
			searchHackathonBuilds(
				[
					build("Exact phrase", "x402 pay-per-call API for AI agents."),
					build(
						"RenderGate",
						"Pay-per-render browser API for agents with x402.",
						true,
					),
					build("Wallet winner", "A wallet.", true),
				],
				"x402 pay-per-call API for AI agents",
				{ perSubmission: true },
			),
		).map((s) => s.b.name);
		expect(picks[0]).toBe("RenderGate");
		expect(picks).toContain("Exact phrase");
		expect(picks).not.toContain("Wallet winner");
	});

	it("keeps winners-first on a hybrid list: share is keyword coverage", async () => {
		const { pickBriefBuilds } = await import("@/lib/hackathon-brief");
		const pool = [
			build("Keyword winner", "Multisig treasury wallet for teams.", true),
			build("Meaning-only winner", "Shared custody for group funds.", true),
			build("One-word winner", "A wallet for gamers.", true),
			build("Close match", "Multisig wallet for team treasuries."),
		];
		// Meaning scores as the vector search would give them (at or above the
		// floor); "Meaning-only winner" shares no word with the idea.
		const semantic = new Map(
			pool.map((b, i) => [b.id, [0.8, 0.79, 0.69, 0.78][i]] as const),
		);
		const scored = searchHackathonBuilds(
			pool,
			"multisig wallet team treasury",
			{
				perSubmission: true,
				mode: "hybrid",
				semantic,
			},
		);
		const meaningOnly = scored.find((s) => s.b.name === "Meaning-only winner");
		expect(meaningOnly?.share).toBe(0);
		const picks = pickBriefBuilds(scored).map((s) => s.b.name);
		expect(picks[0]).toBe("Keyword winner");
		// One word of four and a meaning score under 0.7: not prior art.
		expect(picks).not.toContain("One-word winner");
		// Found by meaning alone: not a winner-first slot, but listed on merit.
		expect(picks.indexOf("Meaning-only winner")).toBeGreaterThan(0);
	});

	it("holds winners to the evidence rule: half of a two-word idea is one word", async () => {
		const { pickBriefBuilds } = await import("@/lib/hackathon-brief");
		const pool = [
			build("Gamer wallet", "A wallet for gamers.", true),
			build("Team multisig", "Multisig wallet for teams."),
		];
		const semantic = new Map([
			[pool[0].id, 0.69],
			[pool[1].id, 0.8],
		]);
		const scored = searchHackathonBuilds(pool, "multisig wallet", {
			perSubmission: true,
			mode: "hybrid",
			semantic,
		});
		// One of two words is share 0.5, but one word and 0.69 is not prior art.
		expect(scored.find((s) => s.b.name === "Gamer wallet")?.share).toBe(0.5);
		expect(pickBriefBuilds(scored).map((s) => s.b.name)).toEqual([
			"Team multisig",
		]);
	});

	it("does not pull a winner that only mentions a one-word idea above the top five", async () => {
		const { pickBriefBuilds } = await import("@/lib/hackathon-brief");
		// Five builds about stablecoins, close in meaning, rank above a winner
		// that mentions the word once and has no meaning score.
		const pool = [
			...[1, 2, 3, 4, 5].map((i) =>
				build(`Peg ${i}`, "A stablecoin backed by treasuries."),
			),
			build("Tip jar", "Tips for streamers, with a stablecoin option.", true),
		];
		const semantic = new Map(pool.slice(0, 5).map((b) => [b.id, 0.8]));
		const scored = searchHackathonBuilds(pool, "stablecoin", {
			perSubmission: true,
			mode: "hybrid",
			semantic,
		});
		expect(scored.findIndex((s) => s.b.name === "Tip jar")).toBe(5);
		const picks = pickBriefBuilds(scored).map((s) => s.b.name);
		expect(picks).not.toContain("Tip jar");
		expect(picks).toHaveLength(5);
	});
});

describe("textShare reads the build's own words", () => {
	const withText = (
		name: string,
		description: string,
		extra: Partial<IndexedBuild> = {},
	): IndexedBuild => {
		const b = { ...build(name, description), ...extra };
		return {
			...b,
			haystack:
				`${b.name} ${b.description ?? ""} ${b.track ?? ""} ${b.award ?? ""}`.toLowerCase(),
		};
	};
	const textShares = (pool: IndexedBuild[], q: string) =>
		Object.fromEntries(
			searchHackathonBuilds(pool, q).map((s) => [s.b.name, s.textShare]),
		);

	it("counts the word in a name or description, not only in a track or award", () => {
		expect(
			textShares(
				[
					withText("Peg", "Stablecoins backed by treasuries."),
					withText("Swap", "A DEX.", {
						award: "Best Stablecoin Integration",
					}),
					withText("Rail", "Payroll.", { track: "Stablecoin track" }),
				],
				"stablecoin",
			),
		).toEqual({ Peg: 1, Swap: 0, Rail: 0 });
	});

	it("does not count a synonym as the idea's word", () => {
		// The search matches "usdc" for "stablecoin"; a build that only pays in
		// USDC is not a stablecoin build.
		expect(
			textShares(
				[withText("Toll", "Per-call USDC micropayments for MCP servers.")],
				"stablecoin",
			),
		).toEqual({ Toll: 0 });
	});
});

describe("one submission in full", () => {
	it("opens from the id, the bare number or the DoraHacks link", async () => {
		const { parseBuildId } = await import("@/lib/hackathon-build-links");
		expect(parseBuildId("dorahacks-buidl-42585")).toBe("dorahacks-buidl-42585");
		expect(parseBuildId(" 42585 ")).toBe("dorahacks-buidl-42585");
		expect(parseBuildId("https://dorahacks.io/buidl/42585")).toBe(
			"dorahacks-buidl-42585",
		);
		expect(parseBuildId("tollpay")).toBeNull();
		expect(parseBuildId("42585; drop")).toBeNull();
	});

	it("serves the write-up, the parsed prize and an unchecked link as absent", async () => {
		const { buildDetailFromStored } = await import("@/lib/hackathon-builds");
		const blend = {
			id: "x",
			buildId: "dorahacks-buidl-27438",
			name: "Blend Pool Creator",
			vision: "Launch custom lending pools.",
			description: "## Blend Pool Creator\nFull write-up.",
			selfTags: ["layer1:Stellar"],
			hackathonSlug: "stellar-hacks-blend",
			hackathonTitle: "Stellar Hacks: Blend",
			endedAt: "2025-07-07",
			placement: "1st Place - $3,000 in XLM",
			isWinner: true,
			url: "https://dorahacks.io/buidl/27438",
			githubUrl: "https://github.com/ELDEVODE/blend-pool-creator",
			repoFullName: "eldevode/blend-pool-creator",
			firstSeenAt: "2026-10-05T10:20:00.000Z",
			lastSeenAt: "2026-10-05T10:20:00.000Z",
			detailReadAt: "2026-10-05T10:20:00.000Z",
			updatedAt: "2026-10-05T10:20:00.000Z",
			createdAt: "2026-10-05T10:20:00.000Z",
		};
		const d = buildDetailFromStored([blend]);
		expect(d.writeUp).toBe("## Blend Pool Creator\nFull write-up.");
		expect(d.prizeUsd).toBe(3000);
		expect(d.hackathon.slug).toBe("stellar-hacks-blend");
		expect("project" in d).toBe(false);

		// sls-092: the same submission also entered a later event, unplaced.
		// Its placed entry leads; both events are listed.
		const palta = {
			...blend,
			id: "y",
			hackathonSlug: "stellar-hacks-paltalabs",
			hackathonTitle: "Stellar Hacks: PaltaLabs",
			endedAt: "2025-08-07",
			placement: null,
			isWinner: false,
		};
		const both = buildDetailFromStored([palta, blend]);
		expect(both.hackathon.slug).toBe("stellar-hacks-blend");
		expect(both.placement).toBe("1st Place - $3,000 in XLM");
		expect(
			both.entries.map((e) => [e.hackathon.slug, e.isWinner, e.prizeUsd]),
		).toEqual([
			["stellar-hacks-blend", true, 3000],
			["stellar-hacks-paltalabs", false, null],
		]);
		// A restored entry is a new row; the submission is not new.
		const restored = { ...blend, firstSeenAt: "2026-10-15T09:00:00.000Z" };
		const old = { ...palta, lastSeenAt: "2026-10-15T09:00:00.000Z" };
		const dated = buildDetailFromStored([old, restored]);
		expect(dated.firstSeenAt).toBe("2026-10-05T10:20:00.000Z");
		expect(dated.lastSeenAt).toBe("2026-10-15T09:00:00.000Z");
	});
});

describe("search by meaning", () => {
	const idx = [
		build(
			"Position Watch",
			"Telegram alerts when a position nears closing.",
			false,
			"a",
		),
		build("Lending Dashboard", "Lending pool analytics and alerts.", true, "b"),
		build("NFT Gallery", "Show your collectibles.", false, "c"),
	];
	// "warn borrowers before liquidation" shares no word with build a; its
	// meaning is close.
	const sem = new Map([
		["a", 0.82],
		["b", 0.74],
	]);

	it("meaning finds a build that shares no words with the query", () => {
		const out = searchHackathonBuilds(
			idx,
			"warn borrowers before liquidation",
			{
				mode: "meaning",
				semantic: sem,
			},
		);
		expect(out.map((s) => s.b.id)).toEqual(["a", "b"]);
		expect(out[0].similarity).toBe(0.82);
		expect(out[0].matched).toEqual([]);
	});

	it("hybrid keeps keyword matches and adds close-in-meaning builds", () => {
		const out = searchHackathonBuilds(idx, "lending alerts", {
			mode: "hybrid",
			semantic: sem,
		});
		const ids = out.map((s) => s.b.id);
		expect(ids[0]).toBe("b"); // both signals, and a winner
		expect(ids).toContain("a"); // joined on meaning
		expect(ids).not.toContain("c");
	});

	it("keyword mode ignores similarity entirely", () => {
		const out = searchHackathonBuilds(
			idx,
			"warn borrowers before liquidation",
			{
				mode: "keyword",
				semantic: sem,
			},
		);
		expect(out.every((s) => s.similarity === undefined)).toBe(true);
	});
});

describe("what a build's repo declares", () => {
	const stored = (over: Partial<HackathonBuild>): HackathonBuild => ({
		id: "x",
		buildId: "dorahacks-buidl-42585",
		name: "TollPay",
		hackathonSlug: "stellar-agents-x402-stripe-mpp",
		hackathonTitle: "Stellar Hacks: Agents",
		url: "https://dorahacks.io/buidl/42585",
		firstSeenAt: "2026-10-05T00:00:00.000Z",
		lastSeenAt: "2026-10-05T00:00:00.000Z",
		updatedAt: "2026-10-05T00:00:00.000Z",
		createdAt: "2026-10-05T00:00:00.000Z",
		...over,
	});

	it("keeps 'not read' apart from 'declares none'", async () => {
		const { buildDetailFromStored } = await import("@/lib/hackathon-builds");
		// A stack left over from an older read is not served without its date.
		expect("stack" in indexedFromStored(stored({ stack: ["x"] }))).toBe(false);
		expect(
			indexedFromStored(stored({ stackReadAt: "2026-10-05T00:00:00.000Z" }))
				.stack,
		).toEqual([]);
		const d = buildDetailFromStored([
			stored({ repoMissingAt: "2026-10-05T00:00:00.000Z" }),
		]);
		expect("stack" in d).toBe(false);
		expect(d.stackReadAt).toBeNull();
		expect(d.repoMissingAt).toBe("2026-10-05T00:00:00.000Z");
	});

	// The 2026-10-22 battery: q=passkey&winnersOnly=1 found no winner, though
	// Tukar's repo declares passkey-kit.
	it("matches a package the repo declares when asked, never as the build's own words", () => {
		const tukar = indexedFromStored(
			stored({
				name: "Tukar",
				vision: "Cross-border transfers in local currencies.",
				isWinner: true,
				stack: ["passkey-kit", "@blend-capital/blend-sdk", "soroban-sdk"],
				stackReadAt: "2026-10-05T00:00:00.000Z",
			}),
		);
		const out = searchHackathonBuilds([tukar], "passkey", {
			winnersOnly: true,
			packages: true,
		});
		expect(out.map((s) => [s.b.name, s.matched, s.textShare])).toEqual([
			["Tukar", ["passkey"], 0],
		]);
		expect(
			searchHackathonBuilds([tukar], "passkey-kit", { packages: true }),
		).toHaveLength(1);
		// Prior art and analyze do not ask: a package is not what a build does.
		expect(searchHackathonBuilds([tukar], "passkey")).toEqual([]);
	});

	it("leaves out the libraries most repos declare, and a stack not read", () => {
		const common = indexedFromStored(
			stored({
				vision: "Pay per call.",
				stack: [
					"@stellar/stellar-sdk",
					"soroban-sdk",
					"@stellar/freighter-api",
					"@creit.tech/stellar-wallets-kit",
					"@x402/fetch",
				],
				stackReadAt: "2026-10-05T00:00:00.000Z",
			}),
		);
		const unread = indexedFromStored(
			stored({ vision: "Pay per call.", stack: ["passkey-kit"] }),
		);
		for (const q of ["soroban", "freighter", "wallets", "x402", "sdk"])
			expect(searchHackathonBuilds([common], q, { packages: true })).toEqual(
				[],
			);
		expect(
			searchHackathonBuilds([unread], "passkey", { packages: true }),
		).toEqual([]);
	});
});

describe("package filter", () => {
	it("keeps only builds whose read repo declares the package", () => {
		const rows: IndexedBuild[] = [
			{ ...build("Passkey Wallet", "wallet", true), stack: ["passkey-kit"] },
			{ ...build("Plain Wallet", "wallet"), stack: [] },
			build("Unread Wallet", "wallet"),
		];
		const hit = searchHackathonBuilds(rows, "", { package: "Passkey-Kit" });
		expect(hit.map((s) => s.b.name)).toEqual(["Passkey Wallet"]);
	});
});

describe("links by owner and name", () => {
	const owners = async () => {
		const { indexProjectOwners } = await import("@/lib/hackathon-build-links");
		return indexProjectOwners([
			{
				slug: "neko",
				name: "Neko",
				links: { github: "https://github.com/Neko-Protocol" },
			},
			{
				slug: "sextant-agent",
				name: "Sextant Agent",
				github: { repos: [{ owner: "pedro-pelicioni", name: "sextant" }] },
			},
			{
				slug: "freighter",
				name: "Freighter",
				links: { github: "https://github.com/stellar/freighter" },
			},
			{
				slug: "sorobanhooks",
				name: "Sorobanhooks",
				links: { github: "https://github.com/sorobanhooks" },
			},
			{
				slug: "vaquita",
				name: "Vaquita",
				links: { github: "https://github.com/vaquita-fi" },
			},
			{
				slug: "vaquita-pools",
				name: "Vaquita Pools",
				links: { github: "https://github.com/vaquita-fi/pools" },
			},
			{
				slug: "ion",
				name: "Ion",
				links: { github: "https://github.com/ion-labs" },
			},
		]);
	};

	it("links a submission under the project's owner that carries its name", async () => {
		const { ownerAndNameLink } = await import("@/lib/hackathon-build-links");
		const o = await owners();
		expect(
			ownerAndNameLink(
				"https://github.com/Neko-Protocol/neko-dex",
				"Neko Protocol",
				o,
			),
		).toEqual({
			slug: "neko",
			name: "Neko",
			basis: "owner-and-name",
		});
		expect(
			ownerAndNameLink("https://github.com/sorobanhooks", "Sorobanhooks", o)
				?.slug,
		).toBe("sorobanhooks");
	});

	it("never takes a builder's other product, the examples repo or a team-named entry", async () => {
		const { ownerAndNameLink } = await import("@/lib/hackathon-build-links");
		const o = await owners();
		// The 2026-10-05 audit's two cases: same owner, other names.
		expect(
			ownerAndNameLink(
				"https://github.com/pedro-pelicioni/gift-pool-zk",
				"Gift Pool ZK",
				o,
			),
		).toBeNull();
		expect(
			ownerAndNameLink(
				"https://github.com/stellar/soroban-examples",
				"Qué es Stellar?",
				o,
			),
		).toBeNull();
		// Named for its team, not as the team's project.
		expect(
			ownerAndNameLink(
				"sorobanhooks/freighter",
				"x402 Smart Wallet - By Sorobanhooks",
				o,
			),
		).toBeNull();
	});

	it("refuses a name two projects under one owner both fit, and names too short", async () => {
		const { ownerAndNameLink, nameKeyOf } = await import(
			"@/lib/hackathon-build-links"
		);
		const o = await owners();
		expect(
			ownerAndNameLink(
				"https://github.com/vaquita-fi/pools-v2",
				"Vaquita Pools v2",
				o,
			),
		).toBeNull();
		expect(
			ownerAndNameLink(
				"https://github.com/vaquita-fi/boost",
				"Vaquita Boost",
				o,
			)?.slug,
		).toBe("vaquita");
		expect(
			ownerAndNameLink("https://github.com/ion-labs/ion", "Ion", o),
		).toBeNull();
		expect(nameKeyOf("Ion")).toBeNull();
		expect(nameKeyOf("Neko Protocol")).toBe("nekoprotocol");
	});

	it("reads the owner from an organization link too", async () => {
		const { githubOwnerOf } = await import("@/lib/hackathon-build-links");
		expect(githubOwnerOf("https://github.com/orgs/Orion-LB/repositories")).toBe(
			"orion-lb",
		);
		expect(githubOwnerOf("https://github.com/mpprouter")).toBe("mpprouter");
		expect(githubOwnerOf("https://github.com/a/b/tree/main")).toBe("a");
		expect(githubOwnerOf("https://gitlab.com/a/b")).toBeNull();
	});
});

describe("links by website", () => {
	it("compares hosts without www. or app., and never a shared platform", async () => {
		const { siteKeyOf } = await import("@/lib/hackathon-build-links");
		expect(siteKeyOf("https://www.tollpay.xyz/pricing")).toBe("tollpay.xyz");
		expect(siteKeyOf("https://app.tollpay.xyz")).toBe("tollpay.xyz");
		expect(siteKeyOf("https://rendergate.vercel.app/")).toBe(
			"rendergate.vercel.app",
		);
		expect(siteKeyOf("https://github.com/rajkaria/toll")).toBeNull();
		expect(siteKeyOf("https://someone.github.io/demo")).toBeNull();
		expect(siteKeyOf("https://youtu.be/abc")).toBeNull();
		expect(siteKeyOf("not a url")).toBeNull();
		expect(siteKeyOf("ftp://tollpay.xyz")).toBeNull();
	});

	it("links a site one project claims, and none that two projects share", async () => {
		const { indexProjectSites } = await import("@/lib/hackathon-build-links");
		const sites = indexProjectSites([
			{
				slug: "tollpay",
				name: "TollPay",
				links: { website: "https://tollpay.xyz" },
			},
			{ slug: "a", name: "A", links: { website: "https://shared.io" } },
			{ slug: "b", name: "B", links: { website: "https://www.shared.io" } },
			{
				slug: "draft",
				name: "Draft",
				status: "Draft",
				links: { website: "https://draft.dev" },
			},
		]);
		expect(sites.get("tollpay.xyz")).toEqual({
			slug: "tollpay",
			name: "TollPay",
		});
		expect(sites.get("shared.io")).toBeNull();
		expect(sites.has("draft.dev")).toBe(false);
	});

	it("serves the basis a link was made by", () => {
		const b = indexedFromStored({
			id: "x",
			buildId: "dorahacks-buidl-1",
			name: "X",
			hackathonSlug: "e",
			hackathonTitle: "E",
			url: "https://dorahacks.io/buidl/1",
			linkCheckedAt: "2026-10-05T00:00:00.000Z",
			projectSlug: "tollpay",
			projectName: "TollPay",
			projectLinkBasis: "website",
			firstSeenAt: "2026-10-05T00:00:00.000Z",
			lastSeenAt: "2026-10-05T00:00:00.000Z",
			updatedAt: "2026-10-05T00:00:00.000Z",
			createdAt: "2026-10-05T00:00:00.000Z",
		});
		expect(b.project).toEqual({
			slug: "tollpay",
			name: "TollPay",
			basis: "website",
		});
	});
});

describe("project facts on a link", () => {
	it("carries the project's status and funding when read, and leaves them out when not", () => {
		const row = {
			id: "x",
			buildId: "dorahacks-buidl-42585",
			name: "TollPay",
			hackathonSlug: "e",
			hackathonTitle: "E",
			url: "https://dorahacks.io/buidl/42585",
			linkCheckedAt: "2026-10-05T00:00:00.000Z",
			projectSlug: "tollpay",
			projectName: "TollPay",
			projectLinkBasis: "repo",
			firstSeenAt: "2026-10-05T00:00:00.000Z",
			lastSeenAt: "2026-10-05T00:00:00.000Z",
			updatedAt: "2026-10-05T00:00:00.000Z",
			createdAt: "2026-10-05T00:00:00.000Z",
		};
		expect(
			indexedFromStored(row, {
				status: "Live",
				scfAwarded: false,
				factsReadAt: "2026-10-05T17:00:00.000Z",
			}).project,
		).toEqual({
			slug: "tollpay",
			name: "TollPay",
			basis: "repo",
			status: "Live",
			scfAwarded: false,
			factsReadAt: "2026-10-05T17:00:00.000Z",
		});
		expect(indexedFromStored(row).project).toEqual({
			slug: "tollpay",
			name: "TollPay",
			basis: "repo",
		});
	});
});

// sls-092: Blend Pool Creator entered Stellar Hacks: Blend (1st place) and
// then PaltaLabs. The index dropped every row after a submission's first,
// so Blend served no first place and 35 of its 39 submissions.
describe("a submission entered in two events", () => {
	const inEvent = (slug: string, isWinner: boolean): IndexedBuild => ({
		...build(
			"Blend Pool Creator",
			"Launch custom lending pools.",
			isWinner,
			"dorahacks-buidl-27438",
		),
		hackathon: { title: slug, slug, endedAt: null },
	});
	const rows = [
		inEvent("stellar-hacks-paltalabs", false),
		inEvent("stellar-hacks-blend", true),
	];

	it("keeps one row per event, each with its own placement", () => {
		expect(
			dedupeBuilds(rows).map((b) => [b.hackathon.slug, b.isWinner]),
		).toEqual([
			["stellar-hacks-paltalabs", false],
			["stellar-hacks-blend", true],
		]);
		// The same event listing it twice is still one row.
		expect(dedupeBuilds([...rows, rows[1]])).toHaveLength(2);
	});

	it("an event filter serves that event's own row", () => {
		const hit = searchHackathonBuilds(rows, "", {
			hackathons: ["stellar-hacks-blend"],
		});
		expect(hit.map((s) => [s.b.hackathon.slug, s.b.isWinner])).toEqual([
			["stellar-hacks-blend", true],
		]);
	});

	it("across events it is one result, its placed entry", () => {
		for (const q of ["", "lending pools"]) {
			const hit = searchHackathonBuilds(rows, q, { perSubmission: true });
			expect(hit.map((s) => s.b.hackathon.slug)).toEqual([
				"stellar-hacks-blend",
			]);
		}
	});

	it("counting keeps every event entry (analyze counts once per event)", () => {
		expect(searchHackathonBuilds(rows, "")).toHaveLength(2);
	});

	it("an unplaced submission's best entry is its latest event", () => {
		const at = (slug: string, endedAt: string): IndexedBuild => ({
			...inEvent(slug, false),
			hackathon: { title: slug, slug, endedAt },
		});
		const pick = onePerSubmission([
			at("older", "2025-07-07"),
			at("newer", "2025-08-07"),
		]);
		expect(pick.map((b) => b.hackathon.slug)).toEqual(["newer"]);
	});
});
