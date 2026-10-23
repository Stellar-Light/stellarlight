import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CURATED_BUILDS } from "@/data/curated-builds";
import type { IndexedBuild } from "@/lib/hackathon-builds";
import { spec } from "@/lib/openapi-spec";
import {
	responseSchema,
	undeclaredInServed,
} from "../../../../../../scripts/contract/served-shape";

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
	// Curated events whose winners alone a test stores.
	{
		uname: "build-on-stellar-philippines-2026",
		title: "Build on Stellar Philippines Hackathon",
		start_time: 1,
		end_time: 2,
		bonus_price: 0,
		hackers_count: 165,
		source: "curated",
	},
	{
		uname: "apac-stellar-hackathon-2026",
		title: "APAC Stellar Hackathon",
		start_time: 1,
		end_time: 2,
		bonus_price: 60_000,
		hackers_count: 0,
		source: "curated",
	},
	{
		uname: "hackmeridian-2026",
		title: "HackMeridian 2026",
		start_time: 1,
		end_time: 2,
		bonus_price: 30_000,
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

// Live 1.9.97: the curated import stored only the winners of three events
// off DoraHacks, and compare served their winners as the whole field
// (submissionCount 6, 5 and 1, equal to winnerCount).
describe("events whose stored rows are their winners only", () => {
	const WINNERS_ONLY = [
		"hackmeridian-2025",
		"build-on-stellar-philippines-2026",
		"apac-stellar-hackathon-2026",
	];
	const ENDED: Record<string, string> = {
		"hackmeridian-2025": "2025-09-16",
		"build-on-stellar-philippines-2026": "2026-05-24",
		"apac-stellar-hackathon-2026": "2026-07-24",
	};
	/** The curated winners as the import stores them and the index reads them. */
	const storeCurated = async () => {
		const { indexedFromStored } = await import("@/lib/hackathon-builds");
		index.push(
			...CURATED_BUILDS.map((b) =>
				indexedFromStored({
					id: b.id,
					buildId: b.id,
					name: b.name,
					vision: b.description,
					hackathonSlug: b.hackathonSlug,
					hackathonTitle: b.hackathonSlug,
					endedAt: ENDED[b.hackathonSlug],
					url: b.url,
					isWinner: b.isWinner,
					track: b.track,
					placement: b.placement,
					githubUrl: b.githubUrl,
					demoUrl: b.demoUrl,
					categories: [
						{ type: "Payments", score: 0.8, precision: 0.82, recall: 0.83 },
					],
					categoriesAt: "2026-10-23T00:00:00.000Z",
					firstSeenAt: "2026-10-23T00:00:00.000Z",
					lastSeenAt: "2026-10-23T00:00:00.000Z",
					updatedAt: "2026-10-23T00:00:00.000Z",
					createdAt: "2026-10-23T00:00:00.000Z",
				}),
			),
		);
	};
	beforeEach(storeCurated);

	it("compare serves their submission counts as null, keeps the winners and says why", async () => {
		const { body } = await get("compare", `slugs=${WINNERS_ONLY.join(",")}`);
		const rows = body.hackathons as Array<Record<string, unknown>>;
		expect(
			rows.map((r) => [r.slug, r.submissionCount, r.winnerCount, r.coverage]),
		).toEqual([
			["hackmeridian-2025", null, 6, "winners-only"],
			["build-on-stellar-philippines-2026", null, 5, "winners-only"],
			["apac-stellar-hackathon-2026", null, 1, "winners-only"],
		]);
		// The registrations the event declares stay.
		expect(rows[1].hackersCount).toBe(165);
		for (const r of rows) {
			const p = r.profile as Record<string, unknown>;
			expect(p.coverage).toBe("winners-only");
			expect(p.submissions).toBeNull();
			expect(p.winners).toBe(r.winnerCount);
		}
		// No spread of winner counts read as submission counts.
		expect(body.deltas.submissionCount).toBeUndefined();
		const notes = body.deltas.notes as string[];
		expect(notes.some((n) => n.startsWith("submission count:"))).toBe(false);
		expect(notes).toContain(
			"hackmeridian-2025, build-on-stellar-philippines-2026, apac-stellar-hackathon-2026: only their winners are on record (coverage winners-only), so submissionCount is null, unknown, never the winner count; their profiles describe the winners only and they are left out of facetShifts",
		);
		// Their winners are stored: never "none of their submissions are stored".
		expect(notes.some((n) => n.includes("none of their submissions"))).toBe(
			false,
		);
		// A winners' mix is not the field's: no shift between them.
		expect(body.deltas.facetShifts).toBeUndefined();
		expect(
			undeclaredInServed(
				spec,
				responseSchema(spec, "/api/hackathons/compare"),
				body,
			),
		).toEqual([]);
	});

	it("benchmark: comparing HackMeridian 2025 with 2026 gives 2025 a null submission count", async () => {
		const { body } = await get(
			"compare",
			"slugs=hackmeridian-2025,hackmeridian-2026",
		);
		const [y2025, y2026] = body.hackathons;
		// The check: null or at least 100, never a fabricated small number.
		expect(y2025.submissionCount).toBeNull();
		expect(y2025.winnerCount).toBe(6);
		// 2026 has nothing stored yet: unknown, as before.
		expect(y2026.submissionCount).toBeNull();
		expect(y2026.coverage).toBeUndefined();
	});

	it("a full event beside one keeps its counts, profile and shape", async () => {
		const { body } = await get("compare", "slugs=kale,hackmeridian-2025");
		const [kale, meridian] = body.hackathons;
		expect(kale).toMatchObject({ submissionCount: 2, winnerCount: 0 });
		expect("coverage" in kale).toBe(false);
		expect("coverage" in kale.profile).toBe(false);
		expect(kale.profile.submissions).toBe(2);
		expect(meridian.coverage).toBe("winners-only");
	});

	it("analyze with a hackathon filter says its rows are its winners", async () => {
		const { body } = await get("analyze", "hackathon=hackmeridian-2025");
		expect(body.total.builds).toBe(6);
		expect(body.meta.warnings).toContain(
			"only the winners of hackmeridian-2025 are stored (6 rows, coverage winners-only); its other submissions are not, so counts from it describe its winners, not its field, whose size and mix are unknown",
		);
	});

	it("analyze per event marks each winners-only group and warns once", async () => {
		const byEvent = await get("analyze", "facet=category&by=event");
		const groups = byEvent.body.groups as Array<Record<string, unknown>>;
		expect(groups.map((g) => [g.value, g.coverage ?? null, g.field])).toEqual([
			["kale", null, 2],
			["hackmeridian-2025", "winners-only", 6],
			["agents", null, 4],
			["build-on-stellar-philippines-2026", "winners-only", 5],
			["apac-stellar-hackathon-2026", "winners-only", 1],
		]);
		const line =
			"only the winners of hackmeridian-2025 (6), build-on-stellar-philippines-2026 (5) and apac-stellar-hackathon-2026 (1) are stored (coverage winners-only); their other submissions are not, so counts from them describe their winners, not their fields, whose size and mix are unknown";
		expect(byEvent.body.meta.warnings).toEqual([line]);
		const facet = await get("analyze", "facet=event");
		expect(facet.body.meta.warnings).toEqual([line]);
		expect(
			undeclaredInServed(
				spec,
				responseSchema(spec, "/api/hackathons/analyze"),
				byEvent.body,
			),
		).toEqual([]);
		// Across every event without a per-event split: no line.
		const all = await get("analyze", "facet=placement");
		expect(all.body.meta.warnings).toBeUndefined();
	});
});
