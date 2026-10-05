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
