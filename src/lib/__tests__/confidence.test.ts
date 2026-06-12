import { describe, expect, it } from "vitest";
import {
	partnerTrust,
	projectConfidence,
	researchConfidence,
} from "../confidence";

// Fixed clock so freshness math is deterministic.
const NOW = Date.parse("2026-06-11T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

describe("researchConfidence", () => {
	it("rates a strong, canonical, evergreen hit as high", () => {
		const c = researchConfidence({
			score: 0.82,
			source: "sep",
			mode: "vector",
			maxScore: 0.82,
			now: NOW,
		});
		expect(c.label).toBe("high");
		expect(c.authority).toBe(1);
		expect(c.freshness).toBe(1); // SEPs don't decay
		expect(c.relevance).toBeGreaterThan(0.8);
		expect(c.score).toBeGreaterThan(0.8);
	});

	it("floors a barely-relevant chunk even from a top source", () => {
		const c = researchConfidence({
			score: 0.58, // just above the 0.55 vector floor → relevance ~0.1
			source: "sep",
			mode: "vector",
			maxScore: 0.85,
			now: NOW,
		});
		expect(c.relevance).toBeLessThan(0.2);
		expect(c.score).toBeLessThanOrEqual(0.4); // guardrail cap
		expect(c.label).not.toBe("high");
	});

	it("decays time-sensitive sources by age; evergreen ones do not", () => {
		const fresh = researchConfidence({
			score: 0.8,
			source: "sdf-blog",
			mode: "vector",
			maxScore: 0.8,
			publishedAt: daysAgo(30),
			now: NOW,
		});
		const stale = researchConfidence({
			score: 0.8,
			source: "sdf-blog",
			mode: "vector",
			maxScore: 0.8,
			publishedAt: daysAgo(1080), // ~3y → two half-lives → ~0.25
			now: NOW,
		});
		expect(fresh.freshness).toBeGreaterThan(0.9);
		expect(stale.freshness).toBeLessThan(0.3);
		expect(stale.score).toBeLessThan(fresh.score);
		expect(stale.ageDays).toBe(1080);
	});

	it("gives unknown sources the neutral default authority", () => {
		const c = researchConfidence({
			score: 0.8,
			source: "mystery-source",
			mode: "vector",
			maxScore: 0.8,
			now: NOW,
		});
		expect(c.authority).toBe(0.6);
	});

	it("normalizes keyword-mode relevance against the set max", () => {
		const top = researchConfidence({
			score: 10,
			source: "dev-docs",
			mode: "keyword",
			maxScore: 10,
			now: NOW,
		});
		const half = researchConfidence({
			score: 5,
			source: "dev-docs",
			mode: "keyword",
			maxScore: 10,
			now: NOW,
		});
		expect(top.relevance).toBe(1);
		expect(half.relevance).toBe(0.5);
	});

	it("treats unknown publishedAt on a time-sensitive source as neutral", () => {
		const c = researchConfidence({
			score: 0.8,
			source: "lumenloop-research",
			mode: "vector",
			maxScore: 0.8,
			now: NOW,
		});
		expect(c.freshness).toBe(0.6);
		expect(c.ageDays).toBeNull();
	});
});

describe("projectConfidence", () => {
	it("rates a top-relevance Live SCF-awarded project as high", () => {
		const c = projectConfidence({
			score: 3,
			maxScore: 3,
			status: "Live",
			scfAwarded: true,
			hackathonPlacement: "1st",
		});
		expect(c.relevance).toBe(1);
		expect(c.freshness).toBe(1); // Live
		expect(c.authority).toBeGreaterThanOrEqual(0.9); // SCF + placement
		expect(c.label).toBe("high");
	});

	it("ranks a weak-relevance early-stage project below a strong Live one", () => {
		const weak = projectConfidence({
			score: 1,
			maxScore: 3,
			status: "Development",
			scfAwarded: false,
		});
		const strong = projectConfidence({
			score: 3,
			maxScore: 3,
			status: "Live",
			scfAwarded: true,
		});
		expect(weak.score).toBeLessThan(strong.score);
	});
});

describe("partnerTrust", () => {
	it("rates a fresh, on-chain-active, SCF, committing partner as high", () => {
		const t = partnerTrust({
			freshnessStatus: "fresh",
			verified: {
				onchainActive: true,
				githubCommits90d: 42,
				scfInvolvement: "SCF #38 awardee",
			},
		});
		expect(t.freshness).toBe(1);
		expect(t.verification).toBe(1);
		expect(t.label).toBe("high");
	});

	it("rates a stale, unverified partner low", () => {
		const t = partnerTrust({
			freshnessStatus: "stale",
			verified: {
				onchainActive: false,
				githubCommits90d: 0,
				scfInvolvement: null,
			},
		});
		expect(t.freshness).toBe(0.3);
		expect(t.verification).toBeLessThan(0.5);
		expect(t.label).toBe("low");
	});

	it("defaults missing freshness to fresh and a base verification", () => {
		const t = partnerTrust({});
		expect(t.freshness).toBe(1);
		expect(t.verification).toBe(0.25);
	});
});
