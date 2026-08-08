/**
 * activityStateOf (repo-intel slice 1) — the honest-taxonomy contract:
 * archived is the owner's verdict and beats any commit date; dormant requires a
 * KNOWN old date; unknown is absence of evidence, never a death verdict.
 */
import { describe, expect, it } from "vitest";
import { activityStateOf, repoGrade } from "../repo-grade";
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

	it("activitySignals pass through when captured, null when absent (never zero)", async () => {
		const withSignals = doc({
			fullName: "busy/wallet",
			lastCommitAt: daysAgo(2),
			activitySignals: {
				commits90d: 41,
				lastReleaseAt: daysAgo(10),
				releaseTag: "v2.1.0",
				openPRs: 3,
				asOf: daysAgo(1),
			},
		});
		const without = doc({ fullName: "plain/wallet", lastCommitAt: daysAgo(2) });
		const { repos } = await searchRepos(
			mockPayload([withSignals, without]),
			"wallet",
			{ limit: 10 },
		);
		const by = Object.fromEntries(repos.map((r) => [r.fullName, r]));
		expect(by["busy/wallet"].activitySignals?.commits90d).toBe(41);
		expect(by["busy/wallet"].activitySignals?.releaseTag).toBe("v2.1.0");
		expect(by["plain/wallet"].activitySignals).toBeNull();
	});
});

describe("repoGrade velocity blend", () => {
	const base = {
		lastCommitAt: daysAgo(5),
		stargazerCount: 50,
		hasDescription: true,
		topicCount: 3,
		openIssues: 2,
	};

	it("higher commits90d outscores lower at equal everything else", () => {
		const busy = repoGrade({ ...base, commits90d: 60 });
		const quiet = repoGrade({ ...base, commits90d: 1 });
		expect(busy.score).toBeGreaterThan(quiet.score);
		// deliberately a tie-breaker, never a rank-upheaver
		expect(busy.score - quiet.score).toBeLessThanOrEqual(3);
	});

	it("null commits90d = no penalty (missing data is never punished)", () => {
		const unknown = repoGrade({ ...base, commits90d: null });
		const busy = repoGrade({ ...base, commits90d: 60 });
		expect(unknown.score).toBe(busy.score);
	});
});
