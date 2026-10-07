import { describe, expect, it } from "vitest";
import { indexProjectRepos, repoFullNameOf } from "@/lib/hackathon-build-links";
import {
	type IndexedBuild,
	indexedFromStored,
	searchHackathonBuilds,
} from "@/lib/hackathon-builds";
import {
	type DoraHacksHackathon,
	doraEventRef,
	endedDoraHacksEvents,
} from "@/lib/integrations/dorahacks";
import type { HackathonBuild } from "@/payload-types";

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

describe("brief picks winners first, then broadens", () => {
	it("puts covering winners first and leaves out a one-word winner", async () => {
		const { pickBriefBuilds } = await import("@/lib/hackathon-brief");
		const picks = pickBriefBuilds(
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
		).map((s) => s.b.name);
		expect(picks[0]).toBe("RenderGate");
		expect(picks).toContain("Exact phrase");
		expect(picks.indexOf("Wallet winner")).not.toBe(0);
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
		const d = buildDetailFromStored({
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
		});
		expect(d.writeUp).toBe("## Blend Pool Creator\nFull write-up.");
		expect(d.prizeUsd).toBe(3000);
		expect(d.hackathon.slug).toBe("stellar-hacks-blend");
		expect("project" in d).toBe(false);
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
		const d = buildDetailFromStored(
			stored({ repoMissingAt: "2026-10-05T00:00:00.000Z" }),
		);
		expect("stack" in d).toBe(false);
		expect(d.stackReadAt).toBeNull();
		expect(d.repoMissingAt).toBe("2026-10-05T00:00:00.000Z");
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
