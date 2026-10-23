import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IndexedBuild } from "@/lib/hackathon-builds";

vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));
vi.mock("@/lib/hackathon-build-semantic", () => ({
	BUILD_SEMANTIC_FLOOR: 0.68,
	semanticBuildScores: vi.fn(async () => null),
}));
const index: IndexedBuild[] = [];
vi.mock("@/lib/hackathon-builds", async (orig) => ({
	...(await orig<typeof import("@/lib/hackathon-builds")>()),
	getHackathonBuildsIndex: vi.fn(async () => index),
}));
const doraRows = [
	{
		uname: "kale",
		title: "KALE",
		start_time: 1,
		end_time: 2,
		bonus_price: 10_000,
		hackers_count: 50,
		source: "dorahacks",
	},
	{
		uname: "agents",
		title: "Agents",
		start_time: 1,
		end_time: 3,
		bonus_price: 20_000,
		hackers_count: 90,
		source: "dorahacks",
	},
	// Listed, with no stored submissions.
	{
		uname: "hackmeridian-2025",
		title: "HackMeridian 2025",
		start_time: 1,
		end_time: 2,
		bonus_price: 0,
		hackers_count: 0,
		source: "curated",
	},
];
// compare reads the plain list; the hackathon filter reads the checked one.
vi.mock("@/lib/integrations/dorahacks", async (orig) => ({
	...(await orig<typeof import("@/lib/integrations/dorahacks")>()),
	fetchAllDoraHacksHackathons: vi.fn(async () => doraRows),
	fetchAllDoraHacksHackathonsChecked: vi.fn(async () => ({
		hackathons: doraRows,
		complete: true,
	})),
}));
// No curated collection rows: compare falls through to DoraHacks.
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({
		find: async () => ({ docs: [], totalDocs: 0 }),
	})),
}));

const build = (
	id: string,
	event: string,
	endedAt: string,
	over: Partial<IndexedBuild> = {},
): IndexedBuild => ({
	id,
	name: id,
	description: `${id} builds payments`,
	githubUrl: null,
	demoUrl: null,
	videoUrl: null,
	track: null,
	hackathonPlacement: null,
	award: null,
	isWinner: false,
	voteCount: null,
	url: `https://dorahacks.io/buidl/${id}`,
	source: "dorahacks",
	hackathon: { title: event.toUpperCase(), slug: event, endedAt },
	haystack: `${id} builds payments`.toLowerCase(),
	...over,
});
const cat = (type: string) => [
	{ type, score: 0.8, precision: 0.82, recall: 0.83 },
];

beforeEach(() => {
	index.length = 0;
	index.push(
		build("k1", "kale", "2025-06-01", {
			categories: cat("DEX"),
			stack: ["soroban-sdk"],
		}),
		build("k2", "kale", "2025-06-01", {
			categories: cat("Payments"),
			stack: [],
		}),
		build("a1", "agents", "2026-04-13", {
			isWinner: true,
			categories: cat("Payments"),
			stack: ["@x402/stellar"],
		}),
		build("a2", "agents", "2026-04-13", { categories: cat("Payments") }),
		build("a3", "agents", "2026-04-13", { categories: cat("AI") }),
		build("a4", "agents", "2026-04-13"),
	);
});

const get = async (path: string, qs: string) => {
	const { GET } =
		path === "analyze"
			? await import("../route")
			: await import("../../compare/route");
	const res = await GET(
		new NextRequest(`https://x.test/api/hackathons/${path}?${qs}`),
	);
	return { status: res.status, body: await res.json() };
};

describe("GET /api/hackathons/analyze", () => {
	it("answers payments share event by event, oldest first, with known and unknown apart", async () => {
		const { status, body } = await get(
			"analyze",
			"facet=category&value=payments&by=event",
		);
		expect(status).toBe(200);
		expect(body.total).toMatchObject({
			field: 6,
			builds: 6,
			known: 5,
			unknown: 1,
		});
		expect(body.total.values).toEqual([
			{ value: "Payments", builds: 3, winners: 1, share: 0.6 },
		]);
		expect(
			body.groups.map(
				(g: {
					value: string;
					field: number;
					known: number;
					values: Array<{ builds: number }>;
				}) => [g.value, g.field, g.known, g.values[0].builds],
			),
		).toEqual([
			["kale", 2, 2, 1],
			["agents", 4, 3, 2],
		]);
		expect(body.meta.facet.unknownMeans).toBe("not categorized yet");
		expect(body.winnersVsOthers.values[0]).toMatchObject({
			value: "Payments",
			lift: 2,
		});
	});

	it("counts packages over the builds whose repo was read", async () => {
		const { body } = await get("analyze", "facet=package");
		expect(body.total).toMatchObject({ known: 3, unknown: 3 });
	});

	it("rejects what it cannot honour", async () => {
		expect((await get("analyze", "facet=vibes")).status).toBe(400);
		expect((await get("analyze", "by=category")).status).toBe(400);
		expect((await get("analyze", "category=defi")).status).toBe(400);
		expect((await get("analyze", "sort=new")).status).toBe(400);
	});

	it("splits a listed event with no stored submissions from a value that names none, and takes a title", async () => {
		const unstored = await get("analyze", "hackathon=hackmeridian-2025");
		expect(unstored.status).toBe(200);
		expect(unstored.body.total.builds).toBe(0);
		expect(unstored.body.meta.warnings).toContain(
			"no submissions are stored for hackmeridian-2025; 0 matched from it is not evidence that nothing was built",
		);

		const miss = await get("analyze", "hackathon=nope");
		expect(miss.status).toBe(400);
		expect(miss.body.error).toContain("'nope'");
		expect(miss.body.validHackathons).toEqual(["agents", "kale"]);

		index.push(
			build("z1", "x", "2026-04-13", {
				hackathon: {
					title: "Stellar Hacks: Agents",
					slug: "stellar-agents-x402-stripe-mpp",
					endedAt: "2026-04-13",
				},
			}),
		);
		const hit = await get(
			"analyze",
			"hackathon=stellar%20hacks:%20agents&facet=event",
		);
		expect(hit.status).toBe(200);
		expect(hit.body.meta.filters.hackathon).toEqual([
			"stellar-agents-x402-stripe-mpp",
		]);
		expect(hit.body.total.builds).toBe(1);
	});
});

describe("GET /api/hackathons/compare", () => {
	it("gives DoraHacks events their stored counts, a profile and the shifts between them", async () => {
		const { status, body } = await get("compare", "slugs=kale,agents");
		expect(status).toBe(200);
		const [kale, agents] = body.hackathons;
		expect(kale).toMatchObject({
			source: "dorahacks",
			submissionCount: 2,
			winnerCount: 0,
		});
		expect(agents).toMatchObject({
			submissionCount: 4,
			winnerCount: 1,
			prizePerWinnerUSD: 20_000,
		});
		expect(agents.profile.category.known).toBe(3);
		const dex = body.deltas.facetShifts.find(
			(s: { value: string }) => s.value === "DEX",
		);
		expect(dex.shares).toEqual([
			{ slug: "kale", share: 0.5 },
			{ slug: "agents", share: 0 },
		]);
	});
});

describe("a type the method never assigns", () => {
	it("is reported as unknown, not as a share of zero", async () => {
		const { body } = await get("analyze", "facet=category&value=Oracle");
		expect(body.total.values[0]).toMatchObject({ value: "Oracle", builds: 0 });
		expect(body.meta.warnings?.[0]).toMatch(/unknown, not zero/);
	});
});

describe("counting by meaning", () => {
	it("says the count is bounded and a neighbour is not proof of the topic", async () => {
		const sem = await import("@/lib/hackathon-build-semantic");
		vi.mocked(sem.semanticBuildScores).mockResolvedValueOnce(
			new Map([["a1", 0.8]]),
		);
		const { body } = await get(
			"analyze",
			"q=agent%20payments&mode=meaning&facet=event",
		);
		expect(body.meta.mode.served).toBe("meaning");
		expect(
			body.meta.warnings.some((w: string) => /at most the 300/.test(w)),
		).toBe(true);
		expect(
			vi.mocked(sem.semanticBuildScores).mock.calls.at(-1)?.[1],
		).toMatchObject({
			limit: 300,
		});
	});
});

describe("category counts carry their measurement", () => {
	it("lists precision and recall for each reported type", async () => {
		const { body } = await get("analyze", "facet=category");
		expect(body.meta.facet.measured).toEqual(
			expect.arrayContaining([
				{ type: "Payments", precision: 0.82, recall: 0.83 },
			]),
		);
	});
});

describe("a value that names no stored value", () => {
	it("counts a package name asked of the library facet as its library", async () => {
		const pkg = await get("analyze", "facet=library&value=soroban-sdk");
		const label = await get(
			"analyze",
			"facet=library&value=Soroban%20Rust%20SDK",
		);
		expect(pkg.body.total.values).toEqual([
			{ value: "Soroban Rust SDK", builds: 1, winners: 0, share: 0.333 },
		]);
		expect(pkg.body.total.values).toEqual(label.body.total.values);
		expect(pkg.body.meta.warnings).toBeUndefined();
	});

	it("warns on every facet and names the values seen", async () => {
		for (const [facet, value] of [
			["package", "no-such-pkg"],
			["library", "no-such-lib"],
			["placement", "runner-up"],
			["event", "nope"],
		]) {
			const { body } = await get("analyze", `facet=${facet}&value=${value}`);
			expect(body.total.values[0]).toMatchObject({ value, builds: 0 });
			const w = (body.meta.warnings ?? []).join(" ");
			expect(w, facet).toContain(`'${value}'`);
		}
		const pkg = await get("analyze", "facet=package&value=no-such-pkg");
		expect(pkg.body.meta.warnings.join(" ")).toContain(
			"@x402/stellar, soroban-sdk",
		);
		const placed = await get("analyze", "facet=placement&value=runner-up");
		expect(placed.body.meta.warnings.join(" ")).toContain("winner");
	});
});

describe("compare: curated events and missing counts", () => {
	it("takes the source from the event row and says when a count is unavailable", async () => {
		const { body } = await get("compare", "slugs=kale,hackmeridian-2025");
		const [kale, meridian] = body.hackathons;
		expect(kale.source).toBe("dorahacks");
		expect(meridian.source).toBe("curated");
		expect(
			body.deltas.notes.some(
				(n: string) =>
					n.includes("hackmeridian-2025") && n.includes("not zero"),
			),
		).toBe(true);
	});

	// Live 1.9.93: hackmeridian-2025 served no submissionCount key at all
	// beside stellar-hacks-zk's 319; a missing key reads as zero or unknown.
	it("serves a count it could not read as null, so every row has the same keys", async () => {
		const { body } = await get("compare", "slugs=kale,hackmeridian-2025");
		const [kale, meridian] = body.hackathons;
		for (const key of [
			"submissionCount",
			"winnerCount",
			"prizePoolUSD",
			"hackersCount",
		]) {
			expect(meridian, key).toHaveProperty(key, null);
			expect(typeof kale[key], key).toBe("number");
		}
	});

	it("says so when the curated lookup fails instead of swallowing it", async () => {
		const pc = await import("@/lib/payload-client");
		const failing = {
			find: async () => {
				throw new Error("db down");
			},
		};
		vi.mocked(pc.getPayloadSafe).mockImplementation(
			async () => failing as never,
		);
		try {
			const { body } = await get("compare", "slugs=kale,agents");
			expect(body.hackathons[0].source).toBe("dorahacks");
			expect(
				body.deltas.notes.some(
					(n: string) => n.includes("kale") && /could not be read/.test(n),
				),
			).toBe(true);
		} finally {
			vi.mocked(pc.getPayloadSafe).mockImplementation(
				async () =>
					({
						find: async () => ({ docs: [], totalDocs: 0 }),
					}) as never,
			);
		}
	});
});
