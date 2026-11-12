/**
 * A project row's inline `repos` must not cite a repository GitHub 404s.
 *
 * Measured live 2026-11-12: searchProjects served 55 repos that GitHub answers
 * 404 on 37 project rows (Blockroll-Tech/blockroll, four Neko-Protocol repos,
 * three chainpatrol repos, ...). 12 of those 55 already sat at codeScanState
 * `gone`: searchRepos and codeReferences drop those, but the per-project join
 * only dropped the archive tier.
 *
 * A private or deleted repo is not proof the project stopped. So the gone row
 * leaves the cited list and keeps counting where it counted before: the
 * row's lastActivityAt and the audit-drift commit dates read the same rows as
 * they did before this change.
 *
 * The second half pins the gone-repos probe's pool. It read only rows at
 * error/gone, and 56 of the 82 project-linked 404s sat at `scanned`, so the
 * probe never asked about them. Every one of the 82 had a lastEnrichedAt the
 * weekly enrich pass had stopped refreshing.
 */
import { describe, expect, it } from "vitest";
import {
	ENRICH_STALE_DAYS,
	goneRepoCandidateQuery,
	groupProjectRepos,
} from "../project-repos";

const row = (
	slug: string,
	fullName: string,
	codeScanState: string,
	lastCommitAt: string | null,
	repoScore = 10,
) => ({
	projectSlug: slug,
	fullName,
	codeScanState,
	lastCommitAt,
	repoScore,
	url: `https://github.com/${fullName}`,
	stars: 0,
});

describe("per-project repos (searchProjects rows)", () => {
	it("a gone repo is not served as a code reference", () => {
		const g = groupProjectRepos([
			row("blockroll", "Blockroll-Tech/blockroll", "gone", "2023-03-14"),
			row("blockroll", "Blockroll-Tech/open-assets", "scanned", "2026-06-26"),
		]).get("blockroll");
		expect(g?.repos.map((r) => r.fullName)).toEqual([
			"Blockroll-Tech/open-assets",
		]);
	});

	it("a gone repo still counts toward activity: private is not dead", () => {
		const g = groupProjectRepos([
			row("neko", "Neko-Protocol/neko-backend", "gone", "2026-11-01T00:00:00Z"),
			row("neko", "Neko-Protocol/.github", "scanned", "2025-01-01T00:00:00Z"),
		]).get("neko");
		expect(g?.lastActivityAt).toBe("2026-11-01T00:00:00Z");
		expect(g?.activity.map((r) => r.fullName)).toContain(
			"Neko-Protocol/neko-backend",
		);
	});

	it("keeps the top five served, in the order given, and the activity set unchanged", () => {
		const rows = [
			row("p", "o/gone1", "gone", "2026-10-01T00:00:00Z"),
			...["a", "b", "c", "d", "e", "f"].map((n) =>
				row("p", `o/${n}`, "scanned", "2026-01-01T00:00:00Z"),
			),
		];
		const g = groupProjectRepos(rows).get("p");
		expect(g?.repos.map((r) => r.fullName)).toEqual([
			"o/a",
			"o/b",
			"o/c",
			"o/d",
			"o/e",
		]);
		// The activity set is what the row read before: the first five rows.
		expect(g?.activity.map((r) => r.fullName)).toEqual([
			"o/gone1",
			"o/a",
			"o/b",
			"o/c",
			"o/d",
		]);
	});

	it("a row with no codeScanState is served (absent is not gone)", () => {
		const g = groupProjectRepos([
			{ ...row("p", "o/x", "scanned", null), codeScanState: undefined },
		]).get("p");
		expect(g?.repos).toHaveLength(1);
		expect(g?.lastActivityAt).toBeNull();
	});
});

describe("the gone-repos probe's pool", () => {
	const now = new Date("2026-11-12T06:40:00Z");
	const q = new URLSearchParams(goneRepoCandidateQuery(now));

	it("still asks about every row at error or gone", () => {
		expect(q.get("where[or][0][codeScanState][equals]")).toBe("error");
		expect(q.get("where[or][1][codeScanState][equals]")).toBe("gone");
	});

	it("asks about a project-linked row the enrich pass stopped refreshing", () => {
		expect(q.get("where[or][2][and][0][projectSlug][exists]")).toBe("true");
		const cut = q.get("where[or][2][and][1][lastEnrichedAt][less_than]");
		expect(cut).toBe(
			new Date(now.getTime() - ENRICH_STALE_DAYS * 86_400_000).toISOString(),
		);
		// Blockroll-Tech/blockroll was last refreshed 2026-09-13 and is at
		// `scanned`: inside the pool now, outside it before.
		expect("2026-09-13T00:00:00.000Z" < String(cut)).toBe(true);
	});

	it("leaves out a row the weekly pass refreshed", () => {
		// enrich-repos runs at least weekly (Monday cron), so a row refreshed
		// within ENRICH_STALE_DAYS is one the pass still derives.
		expect(ENRICH_STALE_DAYS).toBeGreaterThan(7);
		const cut = String(
			q.get("where[or][2][and][1][lastEnrichedAt][less_than]"),
		);
		expect("2026-11-09T08:00:00.000Z" < cut).toBe(false);
	});
});
