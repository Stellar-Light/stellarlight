import { describe, expect, it } from "vitest";
import {
	codeDerivedBuilderRow,
	isHandleQuery,
} from "@/lib/builder-code-derived";

describe("isHandleQuery (P2 code-derived-builder gate)", () => {
	it("accepts login-shaped handles", () => {
		for (const q of ["kalepail", "allbridge-io", "progax01", "creit-tech"]) {
			expect(isHandleQuery(q)).toBe(true);
		}
	});

	it("rejects skill/vocabulary terms so topic queries never route here", () => {
		// SKILL_HINT + BUILDER_SYNONYMS keys must not be treated as handles
		for (const q of ["rust", "soroban", "developer", "wallet", "payments"]) {
			expect(isHandleQuery(q)).toBe(false);
		}
	});

	it("rejects multi-token queries and non-login charsets", () => {
		expect(isHandleQuery("tyler van der hoeven")).toBe(false); // person name → /api/people path
		expect(isHandleQuery("justin rice")).toBe(false);
		expect(isHandleQuery("a")).toBe(false); // too short
		expect(isHandleQuery("-leading-hyphen")).toBe(false);
		expect(isHandleQuery("has space")).toBe(false);
	});
});

describe("codeDerivedBuilderRow (P2 synthesis)", () => {
	// uncurated handle → the GENERIC synthesis path (bio null, displayName =
	// login). The curated-name overlay (kalepail → Tyler van der Hoeven) is
	// covered in data/__tests__/builder-name-overrides.test.ts.
	const repos = [
		{
			owner: "progax01",
			fullName: "progax01/passkey-kit",
			url: "https://github.com/progax01/passkey-kit",
			primaryLanguage: "TypeScript",
			stars: 200,
			lastCommitAt: "2026-07-01T00:00:00Z",
			repoScore: 88,
			projectName: "Passkey Kit",
			projectSlug: "passkey-kit",
		},
		{
			owner: "progax01",
			fullName: "progax01/kale-sc",
			url: "https://github.com/progax01/kale-sc",
			primaryLanguage: "Rust",
			stars: 120,
			lastCommitAt: "2026-06-01T00:00:00Z",
			repoScore: 95,
			projectName: "KALE",
			projectSlug: "kale",
		},
		// duplicate project + missing project (should dedupe / be skipped)
		{
			owner: "progax01",
			fullName: "progax01/kale-ui",
			repoScore: 40,
			projectName: "KALE",
			projectSlug: "kale",
		},
		{ owner: "progax01", fullName: "progax01/scratch", repoScore: 10 },
	];

	it("returns null for no repos", () => {
		expect(codeDerivedBuilderRow("progax01", [])).toBeNull();
	});

	it("builds a code-derived row: owner casing, repoScore order, deduped projects", () => {
		const row = codeDerivedBuilderRow("progax01", repos);
		expect(row).not.toBeNull();
		if (!row) return;
		// identity from repo ownership, not a Passport profile
		expect(row.githubUsername).toBe("progax01");
		expect(row.displayName).toBe("progax01"); // uncurated → login is the name
		expect(row.bio).toBeNull();
		expect(row.roleTitle).toBeNull();
		expect(row.url).toBe("https://github.com/progax01");
		expect(row.match?.basis).toBe("repo-owner");
		// codeEvidence ordered by repoScore desc, top-5, carries the repos
		expect(row.codeEvidence?.[0].fullName).toBe("progax01/kale-sc"); // score 95
		expect(row.codeEvidence?.map((c) => c.fullName)).toContain(
			"progax01/passkey-kit",
		);
		// projects deduped (KALE once), unnamed repo contributes none
		expect(row.projectCount).toBe(2);
		expect(row.projects.map((p) => p.name).sort()).toEqual([
			"KALE",
			"Passkey Kit",
		]);
	});
});
