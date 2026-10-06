import { describe, expect, it } from "vitest";
import type { BuildDetail, IndexedBuild } from "@/lib/hackathon-builds";
import { resolveReviewLink, reviewChecks } from "@/lib/hackathon-review";

const NOW = Date.parse("2026-10-05T00:00:00Z");

const row = (id: string, over: Partial<IndexedBuild> = {}): IndexedBuild => ({
	id,
	name: id,
	description: null,
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
	hackathon: { title: "E", slug: "e", endedAt: "2026-04-13" },
	haystack: id,
	...over,
});

describe("which submission a link names", () => {
	const index = [
		row("dorahacks-buidl-1", {
			githubUrl: "https://github.com/Raj/Toll",
			hackathon: { title: "Old", slug: "o", endedAt: "2025-01-01" },
		}),
		row("dorahacks-buidl-2", {
			githubUrl: "https://github.com/raj/toll",
			isWinner: true,
		}),
		row("dorahacks-buidl-3"),
	];

	it("opens a DoraHacks link or id directly", () => {
		expect(resolveReviewLink("https://dorahacks.io/buidl/3", index)).toEqual({
			buildId: "dorahacks-buidl-3",
			resolvedBy: "submission",
			others: 0,
		});
	});

	it("resolves a repo to its placed entry and counts the others", () => {
		for (const link of [
			"github.com/raj/toll",
			"https://github.com/RAJ/toll.git",
			"raj/toll",
		])
			expect(resolveReviewLink(link, index)).toEqual({
				buildId: "dorahacks-buidl-2",
				resolvedBy: "repo",
				others: 1,
			});
	});

	it("names nothing for an unknown link", () => {
		expect(resolveReviewLink("github.com/someone/else", index)).toBeNull();
		expect(resolveReviewLink("an idea about payments", index)).toBeNull();
	});
});

const detail = (over: Partial<BuildDetail> = {}): BuildDetail => ({
	id: "dorahacks-buidl-42585",
	name: "TollPay",
	summary: "Stripe for MCP servers.",
	writeUp: "x".repeat(3524),
	selfTags: [],
	hackathon: {
		title: "Stellar Hacks: Agents",
		slug: "agents",
		endedAt: "2026-04-13",
	},
	track: null,
	placement: "5th Place",
	award: null,
	prizeUsd: null,
	isWinner: true,
	links: {
		dorahacks: "https://dorahacks.io/buidl/42585",
		github: "https://github.com/rajkaria/toll",
		demo: "https://tollpay.xyz",
		video: null,
	},
	repo: "rajkaria/toll",
	project: {
		slug: "tollpay",
		name: "TollPay",
		basis: "repo",
		status: "Live",
		scfAwarded: false,
		factsReadAt: "2026-10-05T00:00:00Z",
	},
	stack: ["@stellar/stellar-sdk", "@x402/stellar"],
	stackReadAt: "2026-10-05T00:00:00Z",
	repoMissingAt: null,
	categoriesAt: null,
	categoriesMethod: null,
	activity: { lastCommitAt: "2026-04-18T10:54:40Z", archived: false },
	activityCheckedAt: "2026-10-05T00:00:00Z",
	firstSeenAt: "2026-10-05T00:00:00Z",
	lastSeenAt: "2026-10-05T00:00:00Z",
	writeUpReadAt: "2026-10-05T00:00:00Z",
	...over,
});

const byId = (checks: ReturnType<typeof reviewChecks>) =>
	Object.fromEntries(checks.map((c) => [c.id, c.ok]));

describe("checks", () => {
	it("reads TollPay's facts as facts: a live project whose hackathon repo went quiet", () => {
		expect(byId(reviewChecks(detail(), NOW))).toEqual({
			repo: true,
			activity: false,
			stack: true,
			directory: true,
			status: true,
			scf: false,
			writeUp: true,
			demo: true,
		});
	});

	it("never turns an unread fact into a no", () => {
		const c = byId(
			reviewChecks(
				detail({
					activity: undefined,
					stack: undefined,
					project: undefined,
					writeUpReadAt: null,
				}),
				NOW,
			),
		);
		expect(c).toMatchObject({
			activity: null,
			stack: null,
			directory: null,
			writeUp: null,
		});
		expect("scf" in c).toBe(false);
	});

	it("does not call a recent event's team stopped", () => {
		const c = byId(
			reviewChecks(
				detail({
					hackathon: { title: "New", slug: "n", endedAt: "2026-09-20" },
					activity: { lastCommitAt: "2026-09-21T00:00:00Z", archived: false },
				}),
				NOW,
			),
		);
		expect(c.activity).toBeNull();
	});
});

describe("the idea the pitch view runs on", () => {
	it("uses the summary, falls back to the write-up's opening, and stays within 200 characters", async () => {
		const { reviewIdea } = await import("@/lib/hackathon-review");
		expect(reviewIdea(detail())).toBe("TollPay. Stripe for MCP servers.");
		const noSummary = reviewIdea(
			detail({
				summary: null,
				writeUp:
					"## Toll\n\n**Toll** lets MCP servers charge per call in USDC.",
			}),
		);
		expect(noSummary).toBe(
			"TollPay. Toll Toll lets MCP servers charge per call in USDC.",
		);
		expect(reviewIdea(detail({ summary: "x".repeat(400) })).length).toBe(200);
	});
});
