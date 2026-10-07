/**
 * /api/builders `onStellar` block — the profile page's "On Stellar" card as
 * data, on every row. Pins two things:
 *   1. the attribution rule survives the shaping (a contributor's row never
 *      carries the org's total, "builds" ≠ "contributes to")
 *   2. topRepos ranks the person's OWN work first, not whatever they touched
 *      most recently (profiles buried a 240-commit repo at row 24 under
 *      repos touched twice — the API must not repeat that)
 * Plus the null-vs-empty distinction the route relies on.
 */
import { describe, expect, it } from "vitest";
import { emptyOnStellar, onStellarBlock } from "../builder-code-derived";

const repo = (
	fullName: string,
	via: "owner" | "declared" | "contributor",
	commits90d: number,
	myCommits12m?: number,
	projectSlug: string | null = null,
) => ({
	fullName,
	url: `https://github.com/${fullName}`,
	stars: 0,
	lastCommitAt: "2026-08-01T00:00:00.000Z",
	commits90d,
	projectSlug,
	via,
	myCommits12m,
});

describe("onStellarBlock", () => {
	it("keeps builds and contributes-to apart, and never credits the org's total", () => {
		const block = onStellarBlock({
			repos: [
				repo("me/klyra", "owner", 12, undefined, "klyra"),
				repo("boundlessfi/boundless", "contributor", 35, 412, "boundless"),
			],
			stars: 5,
			commits90d: 12, // own repos only (builder-code.ts rule)
			contributedCommits12m: 412,
			lastCommitAt: "2026-08-01T00:00:00.000Z",
			languages: ["TypeScript"],
			projects: new Map([["klyra", "Klyra"]]),
			contributesTo: new Map([["boundless", "Boundless"]]),
		});
		expect(block.builds).toEqual([{ slug: "klyra", name: "Klyra" }]);
		expect(block.contributesTo).toEqual([
			{ slug: "boundless", name: "Boundless" },
		]);
		expect(block.commits90d).toBe(12);
		expect(block.contributedCommits12m).toBe(412);
		expect(block.repoCount).toBe(2);
	});

	it("ranks topRepos: owned first, then by the person's own commits, then 90d activity", () => {
		const block = onStellarBlock({
			repos: [
				repo("org/touched-twice", "contributor", 90, 2),
				repo("org/their-main-work", "contributor", 40, 240),
				repo("me/side-project", "owner", 1),
				repo("org/declared-only", "declared", 500),
			],
			stars: 0,
			commits90d: 1,
			contributedCommits12m: 242,
			lastCommitAt: null,
			languages: [],
			projects: new Map(),
			contributesTo: new Map(),
		});
		expect(block.topRepos.map((r) => r.fullName)).toEqual([
			"me/side-project", // owner wins outright
			"org/their-main-work", // 240 own commits beats…
			"org/touched-twice", // …2 own commits, even though its 90d total is higher
			"org/declared-only", // no own-commit signal, ranked by 90d only
		]);
		expect(block.topRepos[1].myCommits12m).toBe(240);
		expect(block.topRepos[3].myCommits12m).toBeNull();
	});

	it("caps topRepos at 5 and falls back to slug when a project name is unknown", () => {
		const repos = Array.from({ length: 8 }, (_, i) =>
			repo(`me/r${i}`, "owner" as const, i),
		);
		const block = onStellarBlock({
			repos,
			stars: 0,
			commits90d: 28,
			contributedCommits12m: 0,
			lastCommitAt: null,
			languages: [],
			projects: new Map([["nameless", ""]]),
			contributesTo: new Map(),
		});
		expect(block.topRepos).toHaveLength(5);
		expect(block.builds).toEqual([{ slug: "nameless", name: "nameless" }]);
	});

	it("emptyOnStellar is a real zero, distinguishable from null (join failed)", () => {
		const e = emptyOnStellar();
		expect(e.repoCount).toBe(0);
		expect(e.topRepos).toEqual([]);
		expect(e).not.toBeNull();
	});
});
