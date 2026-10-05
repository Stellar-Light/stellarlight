import { describe, expect, it } from "vitest";
import {
	distribution,
	distributionBy,
	winnersVsOthers,
} from "@/lib/hackathon-analytics";
import { parseBuildFilters } from "@/lib/hackathon-build-query";
import type { IndexedBuild } from "@/lib/hackathon-builds";

const NOW = Date.parse("2026-10-05T00:00:00Z");

const build = (
	id: string,
	over: Partial<IndexedBuild> & { event?: string; endedAt?: string } = {},
): IndexedBuild => {
	const { event = "agents", endedAt = "2026-04-13", ...rest } = over;
	return {
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
		hackathon: { title: `Event ${event}`, slug: event, endedAt },
		haystack: id,
		...rest,
	};
};
const cat = (...types: string[]) => types.map((type) => ({ type, score: 0.8 }));

describe("distribution", () => {
	it("keeps unknown out of the denominator and counts multi-valued facets per build", () => {
		const d = distribution(
			[
				build("a", { isWinner: true, categories: cat("Payments", "AI") }),
				build("b", { categories: cat("Payments") }),
				build("c", { categories: cat("DEX") }),
				build("d"), // not categorized: unknown, not "none"
			],
			"category",
			{ now: NOW },
		);
		expect(d).toMatchObject({ builds: 4, known: 3, unknown: 1 });
		expect(d.values[0]).toEqual({
			value: "Payments",
			builds: 2,
			winners: 1,
			share: 0.667,
		});
	});

	it("reports an asked-for value even at zero, matched without case", () => {
		const d = distribution(
			[build("a", { stack: ["soroban-sdk"] })],
			"package",
			{
				value: "Passkey-Kit",
				now: NOW,
			},
		);
		expect(d.values).toEqual([
			{ value: "Passkey-Kit", builds: 0, winners: 0, share: 0 },
		]);
	});
});

describe("activity after the event", () => {
	const at = (lastCommitAt: string | null, endedAt = "2026-04-13") =>
		distribution(
			[build("x", { endedAt, activity: { lastCommitAt, archived: false } })],
			"activity",
			{ now: NOW },
		).values[0]?.value;

	it("tells building on from stopping, 90 days after the end", () => {
		expect(at("2026-08-01T00:00:00Z")).toBe("commits 90+ days after");
		expect(at("2026-05-01T00:00:00Z")).toBe("no commits 90+ days after");
	});

	it("does not call a recent event's team stopped", () => {
		const d = distribution(
			[
				build("x", {
					endedAt: "2026-09-01",
					activity: { lastCommitAt: "2026-09-02T00:00:00Z", archived: false },
				}),
			],
			"activity",
			{ now: NOW },
		);
		expect(d).toMatchObject({ known: 0, unknown: 1 });
	});

	it("says repo not found before anything else", () => {
		const d = distribution([build("x", { repoMissing: true })], "activity", {
			now: NOW,
		});
		expect(d.values[0].value).toBe("repo not found");
	});
});

describe("by event", () => {
	it("runs oldest first and keeps an event where nothing matched", () => {
		const field = [
			build("a", { event: "kale", endedAt: "2025-06-01", stack: [] }),
			build("b", { event: "agents", stack: ["@x402/stellar"] }),
			build("c", { event: "agents", stack: [] }),
		];
		const g = distributionBy([field[1]], field, "package", "event", {
			value: "@x402/stellar",
			now: NOW,
		});
		expect(g.map((x) => [x.value, x.field, x.builds])).toEqual([
			["kale", 1, 0],
			["agents", 2, 1],
		]);
		expect(g[0].values[0]).toMatchObject({ builds: 0, share: null });
	});
});

describe("winners against the rest", () => {
	it("gives lift as the ratio of the two shares", () => {
		const l = winnersVsOthers(
			[
				build("w1", { isWinner: true, stack: ["passkey-kit"] }),
				build("w2", { isWinner: true, stack: [] }),
				build("o1", { stack: ["passkey-kit"] }),
				build("o2", { stack: [] }),
				build("o3", { stack: [] }),
				build("o4", { stack: [] }),
			],
			"package",
			{ now: NOW },
		);
		expect(l?.values[0]).toEqual({
			value: "passkey-kit",
			winners: 1,
			others: 1,
			winnersShare: 0.5,
			othersShare: 0.25,
			lift: 2,
		});
	});

	it("is absent with no winners in the set", () => {
		expect(winnersVsOthers([build("o")], "package")).toBeNull();
	});
});

describe("shared filters", () => {
	const parse = (qs: string) => parseBuildFilters(new URLSearchParams(qs));

	it("spells a category the vocabulary's way and rejects unknown ones", () => {
		expect(parse("category=payments")).toMatchObject({
			filters: { category: "Payments" },
		});
		expect("error" in parse("category=defi")).toBe(true);
	});

	it("takes several events and never coerces a bad flag", () => {
		expect(parse("hackathon=a, B,a")).toMatchObject({
			filters: { hackathons: ["a", "b"] },
		});
		expect("error" in parse("winnersOnly=maybe")).toBe(true);
		expect("error" in parse("mode=fuzzy")).toBe(true);
	});
});

describe("shifts between events", () => {
	it("counts a value against each event's full set, not its top list", async () => {
		const { facetShifts } = await import("@/lib/hackathon-analytics");
		const kale = [
			build("k1", { event: "kale", categories: cat("DEX") }),
			build("k2", { event: "kale", categories: cat("Payments") }),
		];
		const agents = [
			build("a1", { categories: cat("Payments") }),
			build("a2", { categories: cat("Payments") }),
			build("a3", { categories: cat("AI") }),
			build("a4", { categories: cat("AI") }),
		];
		const shifts = facetShifts(
			new Map([
				["kale", kale],
				["agents", agents],
			]),
		);
		const dex = shifts.find((s) => s.value === "DEX");
		expect(dex?.shares).toEqual([
			{ slug: "kale", share: 0.5 },
			{ slug: "agents", share: 0 },
		]);
		expect(dex?.spread).toBe(0.5);
	});
});
