import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { REPO_COMPACT } from "@/lib/compact-view";

// view=compact (spec 1.9.98): opt-in compact rows; the default is unchanged.
const fullRow = (name: string, notes: number) => ({
	fullName: `org/${name}`,
	owner: "org",
	name,
	url: `https://github.com/org/${name}`,
	description: "A Soroban library.",
	topics: ["soroban"],
	primaryLanguage: "Rust",
	stars: 10,
	lastCommitAt: "2026-10-01T00:00:00.000Z",
	isArchived: false,
	activityState: "active",
	knowledgeNotes: Array.from({ length: notes }, (_, i) => ({ note: `n${i}` })),
	project: { slug: "p", name: "P" },
	hackathonWinner: false,
	scfAwarded: true,
	repoScore: 80,
	repoScoreLabel: "high",
	tier: "reference",
	score: 1,
	stellarEvidence: "code-verified",
	codeVerified: { stellarProof: "cargo-sdk", symbols: ["a", "b"] },
	kind: "library",
});
const rows = [fullRow("one", 2), fullRow("two", 0)];

vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({})),
}));
vi.mock("@/lib/repo-search", async (orig) => ({
	...(await orig<typeof import("@/lib/repo-search")>()),
	searchRepos: vi.fn(async () => ({
		repos: rows,
		total: 2,
		canonical: [],
		searched: { tokens: [], expandedTerms: [] },
		matchMode: "strict",
		matchModeLabel: "every query term matched",
		warnings: [],
	})),
}));

async function search(qs: string) {
	const { GET } = await import("../route");
	const res = await GET(
		new NextRequest(`https://x.test/api/repos/search?${qs}`),
	);
	return { status: res.status, text: await res.text() };
}
const strip = (t: string) => t.replace(/"generatedAt":"[^"]+"/, "");

describe("GET /api/repos/search view param", () => {
	it("default is unchanged: full rows, no meta.view, view=full identical", async () => {
		const plain = await search("q=soroban");
		const body = JSON.parse(plain.text);
		expect(body.meta.view).toBeUndefined();
		expect(body.meta.warnings).toBeUndefined();
		expect(body.repos).toEqual(rows);
		expect(strip((await search("q=soroban&view=full")).text)).toBe(
			strip(plain.text),
		);
	});

	it("view=compact serves compact rows, says so, and is not an unknown param", async () => {
		const { status, text } = await search("q=soroban&view=compact");
		expect(status).toBe(200);
		const body = JSON.parse(text);
		expect(Object.keys(body)).toEqual(["meta", "repos"]);
		expect(body.meta.warnings).toBeUndefined();
		expect(body.meta.view.mode).toBe("compact");
		expect(body.meta.view.rows.repos.detail).toMatch(/fields=/);
		const keys = [
			...Object.keys(REPO_COMPACT.keep),
			...Object.keys(REPO_COMPACT.counts),
		];
		for (const r of body.repos) expect(Object.keys(r)).toEqual(keys);
		expect(body.repos[0].knowledgeNotesCount).toBe(2);
		expect(body.repos[1].knowledgeNotesCount).toBe(0);
		expect(body.repos[0].codeVerified).toBeUndefined();
		expect(JSON.stringify(body.repos).length).toBeLessThan(
			JSON.stringify(rows).length,
		);
	});

	it("rejects an unknown view and view=compact with fields", async () => {
		expect((await search("q=soroban&view=tiny")).status).toBe(400);
		expect((await search("q=soroban&view=compact&fields=stars")).status).toBe(
			400,
		);
	});
});
