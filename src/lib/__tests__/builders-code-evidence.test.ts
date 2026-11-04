import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

// GET /api/builders with q: codeEvidence is the indexed repos each returned
// builder OWNS that match the query, and [] claims "checked, none". The read
// was capped at 300 repos for the whole page, so a builder whose repos fell
// past the cut read [] without being checked; a failed read served [] too.
// The double applies limit and select the way Payload 3 does (limit 0 = every
// row) and sorts an unsorted read newest first, as Payload does.

vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));

type Doc = Record<string, unknown>;
const at = (h: number) =>
	new Date(Date.UTC(2026, 0, 1) + h * 3_600_000).toISOString();
const builders: Doc[] = ["alice", "bob", "carol"].map((login, i) => ({
	id: login,
	github_username: login,
	display_name: login,
	bio: "Soroban developer",
	visibility: "public",
	createdAt: at(i),
	projects: [],
	contributions: [],
}));
// alice owns 320 newer repos that do not match; bob's one matching repo is
// older than all of them, so a newest-first 300 never reaches it.
const repos: Doc[] = [
	...Array.from({ length: 320 }, (_, i) => ({
		owner: "alice",
		fullName: `alice/web-${i}`,
		description: "a web app",
		createdAt: at(1000 + i),
	})),
	{
		owner: "bob",
		fullName: "bob/soroban-vault",
		description: "a Soroban vault",
		primaryLanguage: "Rust",
		stars: 4,
		lastCommitAt: "2026-10-01T00:00:00Z",
		repoScore: 70,
		createdAt: at(10),
	},
].map((r, i) => ({
	id: `r${i}`,
	codeScanState: "scanned",
	tier: "core",
	...r,
}));

type Where = Record<string, unknown>;
const matches = (d: Doc, w: Where | undefined): boolean =>
	Object.entries(w ?? {}).every(([k, c]) => {
		if (k === "and") return (c as Where[]).every((x) => matches(d, x));
		if (k === "or") return (c as Where[]).some((x) => matches(d, x));
		const v = String(d[k] ?? "");
		const op = c as Record<string, unknown>;
		if ("equals" in op) return v === String(op.equals);
		if ("not_equals" in op) return v !== String(op.not_equals);
		if ("in" in op) return (op.in as unknown[]).map(String).includes(v);
		if ("like" in op)
			return v.toLowerCase().includes(String(op.like).toLowerCase());
		throw new Error(`unsupported where on ${k}: ${JSON.stringify(c)}`);
	});
const state = { failCodeEvidence: false };
const fakePayload = {
	find: async (args: {
		collection: string;
		where?: Where;
		limit?: number;
		page?: number;
		select?: Record<string, unknown>;
	}) => {
		// the code-evidence read is the only one that selects description
		if (state.failCodeEvidence && args.select?.description)
			throw new Error("socket hang up");
		const rows =
			args.collection === "builders"
				? builders
				: args.collection === "repos"
					? repos
					: [];
		const hit = rows
			.filter((d) => matches(d, args.where))
			.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
		const limit = args.limit ?? 10;
		const page = args.page ?? 1;
		const docs =
			limit === 0 ? hit : hit.slice((page - 1) * limit, page * limit);
		const select = args.select;
		return {
			docs: select
				? docs.map((d) =>
						Object.fromEntries(
							Object.entries(d).filter(([k]) => k === "id" || select[k]),
						),
					)
				: docs,
			totalDocs: hit.length,
			hasNextPage: limit !== 0 && page * limit < hit.length,
			page,
		};
	},
	count: async () => ({ totalDocs: builders.length }),
};
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => fakePayload),
}));

type Body = {
	meta: {
		counts: { total: number | null };
		partial: boolean;
		failedReads: Array<{ read: string }>;
	};
	builders: Array<{
		githubUsername: string;
		codeEvidence: Array<{ fullName: string }> | null;
	}>;
};
const evidence = async () => {
	const { GET } = await import("@/app/api/builders/route");
	const res = await GET(
		new NextRequest("https://x.test/api/builders?q=soroban&limit=50"),
	);
	expect(res.status).toBe(200);
	const body = (await res.json()) as Body;
	const by = Object.fromEntries(
		body.builders.map((b) => [b.githubUsername, b.codeEvidence]),
	);
	return { meta: body.meta, by };
};

describe("GET /api/builders codeEvidence never says none unchecked", () => {
	it("reads every repo the page owns, so a match past 300 repos is found", async () => {
		state.failCodeEvidence = false;
		const { by } = await evidence();
		expect(by.bob?.map((e) => e.fullName)).toEqual(["bob/soroban-vault"]);
		expect(by.alice).toEqual([]);
		expect(by.carol).toEqual([]);
	});

	it("leaves codeEvidence null, not [], when the read fails", async () => {
		state.failCodeEvidence = true;
		const { meta, by } = await evidence();
		state.failCodeEvidence = false;
		expect(by).toEqual({ alice: null, bob: null, carol: null });
		expect(meta.partial).toBe(true);
		expect(meta.failedReads.map((f) => f.read)).toEqual([
			"builders code evidence",
		]);
		// a decoration read: the page still knows its total
		expect(meta.counts.total).toBe(3);
	});
});
