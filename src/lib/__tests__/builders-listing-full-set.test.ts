import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

// #1915: GET /api/builders read at most 300 profiles, then counted and paged
// that capped array, so counts.total said 300 and "full set" while the
// oldest profiles were reachable only through a location filter. This drives
// the real handler over a collection larger than any fixed roster cap, with
// a Payload double that applies limit, page, select and where the way
// Payload 3 does (limit 0 = every row; a positive limit caps).

vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));

const ELIGIBLE = 1050;
// Private profiles: the field allows public and private, and a private one
// must never be listed, counted or searched.
const PRIVATE = 30;
type Doc = Record<string, unknown>;
const builders: Doc[] = Array.from({ length: ELIGIBLE + PRIVATE }, (_, i) => ({
	id: `b${i}`,
	github_username: i < ELIGIBLE ? `dev${i}` : `private${i}`,
	display_name: `Dev ${i}`,
	bio: "Soroban developer",
	role_title: "Engineer",
	// the 25 oldest profiles are the ones a newest-first cap drops
	location: i < 25 ? "Sao Paulo, Brazil" : "Lagos, Nigeria",
	is_featured: false,
	visibility: i < ELIGIBLE ? "public" : "private",
	createdAt: new Date(Date.UTC(2025, 0, 1) + i * 3_600_000).toISOString(),
	projects: [],
	contributions: [],
}));
// The oldest profile: a unique bio word, a declared repo and a contributor
// repo, so a row past the old cap must still carry its projects and its
// contributions (the onStellar join reads both).
Object.assign(builders[0], {
	bio: "Builds a zanzibarite vault",
	projects: [
		{
			name: "Vault",
			slug: "vault",
			short_description: "vault UI",
			status: "live",
			repos: [
				{
					full_name: "Org-X/Vault-UI",
					html_url: "https://github.com/Org-X/Vault-UI",
				},
			],
			heatmap: [],
		},
	],
	contributions: [{ fullName: "Org-X/Vault", commits12m: 7 }],
});
const repos: Doc[] = ["Vault", "Vault-UI"].map((name) => ({
	id: name,
	owner: "Org-X",
	fullName: `Org-X/${name}`,
	url: `https://github.com/Org-X/${name}`,
	stars: 1,
	lastCommitAt: "2026-10-01T00:00:00Z",
	codeScanState: "scanned",
	tier: "core",
	primaryLanguage: "Rust",
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
		if ("in" in op)
			return (op.in as unknown[]).some((x) =>
				x instanceof RegExp ? x.test(v) : String(x) === v,
			);
		if ("like" in op)
			return v.toLowerCase().includes(String(op.like).toLowerCase());
		throw new Error(`unsupported where on ${k}: ${JSON.stringify(c)}`);
	});
const project = (d: Doc, select?: Record<string, unknown>) =>
	select
		? Object.fromEntries(
				Object.entries(d).filter(([k]) => k === "id" || select[k]),
			)
		: d;
const fakePayload = {
	find: async (args: {
		collection: string;
		where?: Where;
		limit?: number;
		page?: number;
		select?: Record<string, unknown>;
	}) => {
		const rows =
			args.collection === "builders"
				? builders
				: args.collection === "repos"
					? repos
					: [];
		const hit = rows
			.filter((d) => matches(d, args.where))
			// "-is_featured" plus Payload's own "-createdAt" tiebreak
			.sort(
				(a, b) =>
					Number(!!b.is_featured) - Number(!!a.is_featured) ||
					String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")),
			);
		const limit = args.limit ?? 10;
		const page = args.page ?? 1;
		const docs =
			limit === 0 ? hit : hit.slice((page - 1) * limit, page * limit);
		return {
			docs: docs.map((d) => project(d, args.select)),
			totalDocs: hit.length,
			hasNextPage: limit !== 0 && page * limit < hit.length,
			page,
		};
	},
	count: async (args: { collection: string; where?: Where }) => ({
		totalDocs: (args.collection === "builders" ? builders : []).filter((d) =>
			matches(d, args.where),
		).length,
	}),
};
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => fakePayload),
}));

type Body = {
	meta: {
		matchModeLabel: string;
		advisory?: { summary: string };
		counts: { returned: number; total: number | null };
		partial: boolean;
	};
	builders: Array<{
		githubUsername: string;
		projects: Array<{ name: string }>;
		onStellar: {
			topRepos: Array<{
				fullName: string;
				via: string;
				myCommits12m: number | null;
			}>;
		} | null;
	}>;
};
const get = async (qs: string): Promise<Body> => {
	const { GET } = await import("@/app/api/builders/route");
	const res = await GET(new NextRequest(`https://x.test/api/builders?${qs}`));
	expect(res.status).toBe(200);
	return (await res.json()) as Body;
};
const unfilteredLogins = async () => {
	const seen = new Set<string>();
	for (let offset = 0; offset < ELIGIBLE + 400; offset += 200) {
		const page = await get(`limit=200&offset=${offset}`);
		expect(page.meta.partial).toBe(false);
		expect(page.meta.counts.total).toBe(ELIGIBLE);
		for (const b of page.builders) seen.add(b.githubUsername);
	}
	return seen;
};

describe("GET /api/builders lists the full eligible set (#1915)", () => {
	it("pages through every visible profile, and counts.total is that set", async () => {
		const seen = await unfilteredLogins();
		expect(seen.size).toBe(ELIGIBLE);
		expect([...seen].some((l) => l.startsWith("private"))).toBe(false);
		const first = await get("limit=1");
		expect(first.meta.matchModeLabel).toContain("full set");
	});

	it("serves no filtered row that the unfiltered pages cannot reach", async () => {
		const latam = await get("location=Latin%20America&limit=200");
		expect(latam.meta.counts.total).toBe(25);
		const seen = await unfilteredLogins();
		const unreachable = latam.builders
			.map((b) => b.githubUsername)
			.filter((l) => !seen.has(l));
		expect(unreachable).toEqual([]);
	});

	it("searches q over the whole set and keeps the fields its rows read", async () => {
		const all = await get("q=soroban&limit=1");
		expect(all.meta.counts.total).toBe(ELIGIBLE - 1);
		const { builders: rows } = await get("q=zanzibarite");
		expect(rows.map((b) => b.githubUsername)).toEqual(["dev0"]);
		expect(rows[0].projects.map((p) => p.name)).toEqual(["Vault"]);
		const via = Object.fromEntries(
			(rows[0].onStellar?.topRepos ?? []).map((r) => [r.fullName, r]),
		);
		expect(via["Org-X/Vault"]).toMatchObject({
			via: "contributor",
			myCommits12m: 7,
		});
		expect(via["Org-X/Vault-UI"]).toMatchObject({ via: "declared" });
	});

	it("never lists, counts or searches a private profile", async () => {
		const lagos = await get("location=Nigeria&limit=1");
		expect(lagos.meta.counts.total).toBe(ELIGIBLE - 25);
		const miss = await get(`q=private${ELIGIBLE}`);
		expect(miss.builders).toEqual([]);
		// the empty-result advisory states the public directory's size
		expect(miss.meta.advisory?.summary).toContain(
			`The directory has ${ELIGIBLE} builder profiles`,
		);
	});
});
