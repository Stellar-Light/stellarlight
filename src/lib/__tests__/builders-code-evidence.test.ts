import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

// GET /api/builders with q: codeEvidence is the indexed repos each returned
// builder OWNS that match the query, and [] claims "checked, none". The read
// was capped at 300 repos for the whole page, so a builder whose repos fell
// past the cut read [] without being checked; a failed read served [] too.
// Owners match as GitHub logins do, case-insensitively. The double applies
// limit and select the way Payload 3 does (limit 0 = every row), sorts an
// unsorted read newest first, as Payload does, and matches an `in` pattern
// the way Mongo does.

vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));

type Doc = Record<string, unknown>;
const at = (h: number) =>
	new Date(Date.UTC(2026, 0, 1) + h * 3_600_000).toISOString();
const profile = (login: string, bio: string, i: number): Doc => ({
	id: login,
	github_username: login,
	display_name: login,
	bio,
	visibility: "public",
	createdAt: at(i),
	projects: [],
	contributions: [],
});
const builders: Doc[] = [
	...["alice", "bob", "carol"].map((l, i) =>
		profile(l, "Soroban developer", i),
	),
	// stored with a capital; GitHub and the repo index say "dana"
	profile("Dana", "Soroban developer", 3),
	// admitted only by an owned Rust repo: the profile never says the word
	profile("ferris", "payments", 4),
];
const repo = (r: Doc): Doc => ({
	codeScanState: "scanned",
	tier: "core",
	...r,
});
const repos: Doc[] = [
	// alice owns 320 newer repos that do not match; bob's one matching repo
	// is older than all of them, so a newest-first 300 never reaches it.
	...Array.from({ length: 320 }, (_, i) =>
		repo({
			owner: "alice",
			fullName: `alice/web-${i}`,
			description: "a web app",
			createdAt: at(1000 + i),
		}),
	),
	repo({
		owner: "bob",
		fullName: "bob/soroban-vault",
		description: "a Soroban vault",
		primaryLanguage: "Rust",
		stars: 4,
		lastCommitAt: "2026-10-01T00:00:00Z",
		repoScore: 70,
		createdAt: at(10),
	}),
	repo({
		owner: "dana",
		fullName: "dana/soroban-oracle",
		description: "a soroban oracle",
		createdAt: at(11),
	}),
	repo({
		owner: "ferris",
		fullName: "ferris/engine",
		description: "an engine",
		primaryLanguage: "Rust",
		createdAt: at(12),
	}),
	// no profile: 201 repos, the best-scored the oldest, so a newest-first
	// 200 drops it; a substring sibling owner must never be read as this one
	...Array.from({ length: 201 }, (_, i) =>
		repo({
			owner: "solo-dev",
			fullName: `solo-dev/r${i}`,
			repoScore: i === 0 ? 999 : i,
			createdAt: at(2000 + i),
		}),
	),
	repo({
		owner: "solo-dev-2",
		fullName: "solo-dev-2/x",
		repoScore: 5000,
		createdAt: at(1500),
	}),
].map((r, i) => ({ id: `r${i}`, ...r }));

type Where = Record<string, unknown>;
const matches = (d: Doc, w: Where | undefined): boolean =>
	Object.entries(w ?? {}).every(([k, c]) => {
		if (k === "and") return (c as Where[]).every((x) => matches(d, x));
		if (k === "or") return (c as Where[]).some((x) => matches(d, x));
		const v = String(d[k] ?? "");
		const op = c as Record<string, unknown>;
		if ("equals" in op) return v === String(op.equals);
		if ("not_equals" in op) return v !== String(op.not_equals);
		if ("in" in op)
			return (op.in as unknown[]).some((x) =>
				x instanceof RegExp ? x.test(v) : String(x) === v,
			);
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

type Row = {
	githubUsername: string;
	match: { basis: string } | null;
	codeEvidence: Array<{ fullName: string }> | null;
	onStellar: { repoCount: number } | null;
};
type Body = {
	meta: {
		counts: { total: number | null };
		partial: boolean;
		failedReads: Array<{ read: string }>;
	};
	builders: Row[];
};
const get = async (qs: string) => {
	const { GET } = await import("@/app/api/builders/route");
	const res = await GET(new NextRequest(`https://x.test/api/builders?${qs}`));
	expect(res.status).toBe(200);
	const body = (await res.json()) as Body;
	const row = Object.fromEntries(
		body.builders.map((b) => [b.githubUsername, b]),
	);
	const by = Object.fromEntries(
		body.builders.map((b) => [b.githubUsername, b.codeEvidence]),
	);
	return { meta: body.meta, rows: body.builders, row, by };
};
const names = (e: Array<{ fullName: string }> | null | undefined) =>
	e?.map((x) => x.fullName);

describe("GET /api/builders codeEvidence never says none unchecked", () => {
	it("reads every repo the page owns, so a match past 300 repos is found", async () => {
		const { by } = await get("q=soroban&limit=50");
		expect(names(by.bob)).toEqual(["bob/soroban-vault"]);
		expect(by.alice).toEqual([]);
		expect(by.carol).toEqual([]);
	});

	it("matches owners as GitHub logins, case-insensitively", async () => {
		const { by, row } = await get("q=soroban&limit=50");
		expect(names(by.Dana)).toEqual(["dana/soroban-oracle"]);
		expect(row.Dana.onStellar?.repoCount).toBe(1);
	});

	it("leaves codeEvidence null, not [], when the read fails", async () => {
		state.failCodeEvidence = true;
		const { meta, by } = await get("q=soroban&limit=50");
		state.failCodeEvidence = false;
		expect(by).toEqual({ alice: null, bob: null, carol: null, Dana: null });
		expect(meta.partial).toBe(true);
		expect(meta.failedReads.map((f) => f.read)).toEqual([
			"builders code evidence",
		]);
		// a decoration read: the page still knows its total
		expect(meta.counts.total).toBe(4);
	});

	it("leaves a code-language row null too when the read fails", async () => {
		const ok = await get("q=rust&limit=50");
		expect(ok.row.ferris.match?.basis).toBe("code-language");
		expect(names(ok.by.ferris)).toEqual(["ferris/engine"]);
		state.failCodeEvidence = true;
		const failed = await get("q=rust&limit=50");
		state.failCodeEvidence = false;
		expect(failed.row.ferris.match?.basis).toBe("code-language");
		expect(failed.by.ferris).toBeNull();
	});

	it("reads every repo a profile-less login owns, not a newest 200", async () => {
		const { rows } = await get("q=solo-dev");
		expect(rows.map((r) => [r.githubUsername, r.match?.basis])).toEqual([
			["solo-dev", "repo-owner"],
		]);
		expect(names(rows[0].codeEvidence)?.[0]).toBe("solo-dev/r0");
		expect(names(rows[0].codeEvidence)).not.toContain("solo-dev-2/x");
	});
});
