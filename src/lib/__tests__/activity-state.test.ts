/**
 * activityStateOf (repo-intel slice 1) — the honest-taxonomy contract:
 * archived is the owner's verdict and beats any commit date; dormant requires a
 * KNOWN old date; unknown is absence of evidence, never a death verdict.
 */
import { describe, expect, it } from "vitest";
import { activityStateOf } from "../repo-grade";
import { searchRepos } from "../repo-search";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

describe("activityStateOf", () => {
	it("classifies by known commit age", () => {
		expect(activityStateOf(daysAgo(3), false)).toBe("active");
		expect(activityStateOf(daysAgo(45), false)).toBe("active");
		expect(activityStateOf(daysAgo(46), false)).toBe("maintained");
		expect(activityStateOf(daysAgo(180), false)).toBe("maintained");
		expect(activityStateOf(daysAgo(181), false)).toBe("dormant");
		expect(activityStateOf(daysAgo(1500), false)).toBe("dormant");
	});

	it("archived is the owner's verdict and wins over any commit date", () => {
		expect(activityStateOf(daysAgo(1), true)).toBe("archived");
		expect(activityStateOf(null, true)).toBe("archived");
	});

	it("no or invalid date = unknown, never dormant", () => {
		expect(activityStateOf(null, false)).toBe("unknown");
		expect(activityStateOf(undefined, false)).toBe("unknown");
		expect(activityStateOf("not-a-date", false)).toBe("unknown");
	});
});

describe("searchRepos activity filter + row field", () => {
	const doc = (over: Record<string, unknown>) => ({
		fullName: "x/x",
		description: "a soroban wallet",
		primaryLanguage: "Rust",
		readmeExcerpt: "",
		topics: [],
		repoScore: 50,
		stars: 10,
		codeScanState: "scanned",
		stellarProof: "soroban-sdk",
		codeSymbols: [],
		...over,
	});
	// biome-ignore lint/suspicious/noExplicitAny: mock payload
	const mockPayload = (docs: any[]): any => ({
		find: async () => ({ docs, totalDocs: docs.length }),
	});

	it("rows carry activityState and ?activity= filters to it", async () => {
		const fresh = doc({ fullName: "live/wallet", lastCommitAt: daysAgo(5) });
		const old = doc({ fullName: "quiet/wallet", lastCommitAt: daysAgo(400) });
		const dead = doc({
			fullName: "gone/wallet",
			lastCommitAt: daysAgo(5),
			isArchived: true,
		});
		const all = await searchRepos(mockPayload([fresh, old, dead]), "wallet", {
			limit: 10,
		});
		const states = Object.fromEntries(
			all.repos.map((r) => [r.fullName, r.activityState]),
		);
		expect(states["live/wallet"]).toBe("active");
		expect(states["quiet/wallet"]).toBe("dormant");
		expect(states["gone/wallet"]).toBe("archived");

		const onlyActive = await searchRepos(
			mockPayload([fresh, old, dead]),
			"wallet",
			{ limit: 10, activity: "active" },
		);
		expect(onlyActive.repos.map((r) => r.fullName)).toEqual(["live/wallet"]);
	});
});
